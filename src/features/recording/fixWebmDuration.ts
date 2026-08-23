/**
 * Fixes WebM container metadata so that the Duration element is present.
 *
 * Chrome's MediaRecorder does not write the Duration element when using
 * timeslices (`start(ms)`), which results in files that players can't
 * seek or report total duration for.
 *
 * This is a self-contained EBML binary patcher — no external dependencies.
 * It locates the Segment → Info element, inserts (or updates) the Duration
 * float element, and adjusts the Info/Segment size fields accordingly.
 *
 * If anything goes wrong the original blob is returned unchanged so
 * recording is never lost.
 */

// EBML Element IDs used by WebM
const SEGMENT_ID = 0x18538067
const INFO_ID = 0x1549a966
const DURATION_ID = 0x4489
const TIMECODE_SCALE_ID = 0x2ad7b1

/** Reads an EBML element ID at `offset`. Returns the id value + bytes consumed. */
const readElementId = (data: Uint8Array, offset: number): { id: number; length: number } | null => {
    if (offset >= data.length) return null
    const firstByte = data[offset]
    if (firstByte === 0) return null

    let length = 1
    let mask = 0x80
    while (length <= 4 && (firstByte & mask) === 0) {
        length++
        mask >>= 1
    }
    if (length > 4 || offset + length > data.length) return null

    let id = 0
    for (let i = 0; i < length; i++) {
        id = id * 256 + data[offset + i]
    }
    return { id, length }
}

/**
 * Reads an EBML data-size at `offset`.
 * Returns the size value + bytes consumed. A size of -1 means "unknown".
 */
const readDataSize = (data: Uint8Array, offset: number): { size: number; length: number } | null => {
    if (offset >= data.length) return null
    const firstByte = data[offset]
    if (firstByte === 0) return null

    let length = 1
    let mask = 0x80
    while (length <= 8 && (firstByte & mask) === 0) {
        length++
        mask >>= 1
    }
    if (length > 8 || offset + length > data.length) return null

    let size = firstByte & (mask - 1)
    let allOnes = size === mask - 1
    for (let i = 1; i < length; i++) {
        size = size * 256 + data[offset + i]
        if (data[offset + i] !== 0xff) allOnes = false
    }
    if (allOnes) return { size: -1, length }
    return { size, length }
}

/** Encodes a size value as an EBML variable-length integer (minimum bytes). */
const encodeDataSize = (size: number): Uint8Array => {
    for (let length = 1; length <= 8; length++) {
        const maxValue = 2 ** (7 * length) - 2
        if (size <= maxValue) {
            const bytes = new Uint8Array(length)
            let remaining = size
            for (let i = length - 1; i >= 0; i--) {
                bytes[i] = remaining & 0xff
                remaining = Math.floor(remaining / 256)
            }
            bytes[0] |= 0x80 >> (length - 1)
            return bytes
        }
    }
    const bytes = new Uint8Array(8)
    let remaining = size
    for (let i = 7; i >= 0; i--) {
        bytes[i] = remaining & 0xff
        remaining = Math.floor(remaining / 256)
    }
    bytes[0] |= 0x01
    return bytes
}

/** Builds a Duration EBML element: ID 0x4489, 8-byte float64 big-endian. */
const createDurationElement = (durationValue: number): Uint8Array => {
    const el = new Uint8Array(2 + 1 + 8)
    el[0] = 0x44
    el[1] = 0x89
    el[2] = 0x88 // 1-byte size field, value = 8
    new DataView(el.buffer, 3, 8).setFloat64(0, durationValue, false)
    return el
}

export const fixWebmDuration = async (blob: Blob, durationMs: number): Promise<Blob> => {
    if (!blob || blob.size === 0) return blob

    try {
        const buffer = await blob.arrayBuffer()
        const data = new Uint8Array(buffer)

        // --- Skip EBML header ---
        let offset = 0
        const headerId = readElementId(data, offset)
        if (!headerId) return blob
        offset += headerId.length
        const headerSize = readDataSize(data, offset)
        if (!headerSize) return blob
        offset += headerSize.length + headerSize.size

        // --- Segment element ---
        const segmentId = readElementId(data, offset)
        if (!segmentId || segmentId.id !== SEGMENT_ID) return blob
        offset += segmentId.length
        const segmentSize = readDataSize(data, offset)
        if (!segmentSize) return blob
        const segmentSizeOffset = offset
        offset += segmentSize.length
        const segmentDataStart = offset

        // --- Walk top-level children of Segment to find Info ---
        const segmentEnd = segmentSize.size === -1 ? data.length : segmentDataStart + segmentSize.size
        let scanOffset = segmentDataStart

        while (scanOffset < segmentEnd) {
            const elemId = readElementId(data, scanOffset)
            if (!elemId) break
            scanOffset += elemId.length

            const elemSize = readDataSize(data, scanOffset)
            if (!elemSize) break
            const elemSizeOffset = scanOffset
            scanOffset += elemSize.length

            if (elemId.id === INFO_ID) {
                if (elemSize.size === -1) return blob
                const infoSize = elemSize.size
                const infoDataStart = scanOffset

                // Scan inside Info for TimecodeScale and Duration
                let timecodeScale = 1_000_000
                let hasDuration = false
                let innerOffset = infoDataStart
                const infoEnd = infoDataStart + infoSize

                while (innerOffset < infoEnd) {
                    const innerId = readElementId(data, innerOffset)
                    if (!innerId) break
                    innerOffset += innerId.length
                    const innerSize = readDataSize(data, innerOffset)
                    if (!innerSize) break
                    innerOffset += innerSize.length

                    if (innerId.id === TIMECODE_SCALE_ID) {
                        let v = 0
                        for (let i = 0; i < innerSize.size; i++) v = v * 256 + data[innerOffset + i]
                        timecodeScale = v
                    } else if (innerId.id === DURATION_ID) {
                        hasDuration = true
                        // Update the existing Duration value in place
                        const durationValue = (durationMs * 1_000_000) / timecodeScale
                        if (innerSize.size === 8) {
                            new DataView(data.buffer, innerOffset, 8).setFloat64(0, durationValue, false)
                        } else if (innerSize.size === 4) {
                            new DataView(data.buffer, innerOffset, 4).setFloat32(0, durationValue, false)
                        }
                        return new Blob([data.slice().buffer], { type: blob.type || 'video/webm' })
                    }
                    if (innerSize.size === -1) break
                    innerOffset += innerSize.size
                }

                if (hasDuration) return new Blob([data.slice().buffer], { type: blob.type || 'video/webm' })

                // --- Insert a Duration element at the end of Info ---
                const durationValue = (durationMs * 1_000_000) / timecodeScale
                const durationEl = createDurationElement(durationValue)
                const insertPoint = infoDataStart + infoSize

                const newData = new Uint8Array(data.length + durationEl.length)
                newData.set(data.subarray(0, insertPoint), 0)
                newData.set(durationEl, insertPoint)
                newData.set(data.subarray(insertPoint), insertPoint + durationEl.length)

                // Update Info size field
                const newInfoSize = infoSize + durationEl.length
                const newInfoSizeBytes = encodeDataSize(newInfoSize)
                const oldInfoSizeBytes = readDataSize(data, elemSizeOffset)
                if (!oldInfoSizeBytes) return blob

                let result: Uint8Array
                if (newInfoSizeBytes.length === oldInfoSizeBytes.length) {
                    newData.set(newInfoSizeBytes, elemSizeOffset)
                    result = newData
                } else {
                    // Size field grew/shrank — shift everything after it
                    const sizeDiff = newInfoSizeBytes.length - oldInfoSizeBytes.length
                    const shifted = new Uint8Array(newData.length + sizeDiff)
                    shifted.set(newData.subarray(0, elemSizeOffset), 0)
                    shifted.set(newInfoSizeBytes, elemSizeOffset)
                    shifted.set(
                        newData.subarray(elemSizeOffset + oldInfoSizeBytes.length),
                        elemSizeOffset + newInfoSizeBytes.length,
                    )
                    result = shifted
                }

                // Update Segment size if it is a fixed (known) size
                if (segmentSize.size !== -1) {
                    const totalAdded = durationEl.length + (newInfoSizeBytes.length - oldInfoSizeBytes.length)
                    const newSegSize = segmentSize.size + totalAdded
                    const newSegSizeBytes = encodeDataSize(newSegSize)
                    const oldSegSizeBytes = readDataSize(data, segmentSizeOffset)
                    if (oldSegSizeBytes && newSegSizeBytes.length === oldSegSizeBytes.length) {
                        result.set(newSegSizeBytes, segmentSizeOffset)
                    }
                }

                return new Blob([result.slice().buffer], { type: blob.type || 'video/webm' })
            }

            if (elemSize.size === -1) break
            scanOffset += elemSize.size
        }

        return blob
    } catch (error) {
        console.warn('Failed to fix WebM duration metadata:', error)
        return blob
    }
}