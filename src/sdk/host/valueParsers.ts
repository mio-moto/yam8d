// Pure text parsers for values rendered on the M8 screen (hex, int, float, note).

// Parse hex value from text (handles formats like "3F", "0x3F", "3f", "--")
// Returns 0 for '--' which represents 00 in the M8 UI
export const parseHexValue = (text: string | null): number | null => {
    if (!text) return null
    const cleaned = text.trim()
    // Handle '--' as 00
    if (cleaned === '--') return 0
    const hexCleaned = cleaned.replace(/^0x/i, '')
    const match = hexCleaned.match(/^[0-9A-Fa-f]+/)
    if (!match) return null
    const parsed = parseInt(match[0], 16)
    return Number.isNaN(parsed) ? null : parsed
}

// Parse integer value from text (handles formats like "123", "-12", "+7", "--")
// Returns 0 for '--' which is commonly used as an empty numeric placeholder in M8 UI
export const parseIntValue = (text: string | null): number | null => {
    if (!text) return null
    const cleaned = text.trim()
    if (cleaned === '--') return 0
    const match = cleaned.match(/^[+-]?\d+/)
    if (!match) return null
    const parsed = Number.parseInt(match[0], 10)
    return Number.isNaN(parsed) ? null : parsed
}

// Parse every float value token from a full line. M8 float parameters are rendered
// as two linked groups separated by a dot, e.g. "TUNE 440.00 G" or "C ON-10.69 7 ---".
// The cursor can rest either on the integer part ("440") or the decimal part ("00"),
// and changing the decimal part past its bounds carries into the integer part
// (e.g. 1.99 -> 2.00), so the whole signed token behaves like a single number.
const FLOAT_TOKEN_REGEX = /[+-]?\d+\.\d+/g

export type ParsedFloatToken = {
    // Full token as displayed, e.g. "-10.69"
    raw: string
    negative: boolean
    intDigits: string
    decDigits: string
    // 10 ** decDigits.length (100 for two displayed decimals)
    decScale: number
    // Smallest displayable step expressed in hundredths (1 for two decimals, 10 for one)
    tickHundredths: number
    // Signed value measured in tick steps: (-10.69 with two decimals) => -1069
    ticks: number
}

export const parseFloatTokens = (line: string | null): ParsedFloatToken[] => {
    if (!line) return []
    const tokens: ParsedFloatToken[] = []

    FLOAT_TOKEN_REGEX.lastIndex = 0
    let match: RegExpExecArray | null = FLOAT_TOKEN_REGEX.exec(line)
    while (match !== null) {
        const raw = match[0]
        const negative = raw.startsWith('-')
        const unsigned = negative || raw.startsWith('+') ? raw.slice(1) : raw
        const dotIndex = unsigned.indexOf('.')
        const intDigits = unsigned.slice(0, dotIndex)
        const decDigits = unsigned.slice(dotIndex + 1)
        const intValue = Number.parseInt(intDigits || '0', 10)
        const decValue = Number.parseInt(decDigits || '0', 10)
        const decScale = 10 ** decDigits.length
        const tickHundredths = decScale > 0 ? 100 / decScale : 1
        const valueHundredths = intValue * 100 + (decValue * 100) / decScale

        if (!Number.isNaN(intValue) && !Number.isNaN(decValue)) {
            tokens.push({
                raw,
                negative,
                intDigits,
                decDigits,
                decScale,
                tickHundredths,
                ticks: (negative ? -1 : 1) * Math.round(valueHundredths / tickHundredths),
            })
        }

        match = FLOAT_TOKEN_REGEX.exec(line)
    }

    return tokens
}

// When several float tokens exist on a line, prefer the one the cursor is on,
// deduced from the highlighted text. The highlight can be the whole float —
// possibly WITHOUT its sign ("19.75" for a "-19.75" field) — or just one digit
// group ("440", "00", "-10"...).
export const pickFloatTokenIndex = (tokens: ParsedFloatToken[], hintText: string | null): number => {
    if (tokens.length <= 1) return 0
    const hint = hintText?.trim() ?? ''
    if (!hint) return 0

    const index = tokens.findIndex(token => (
        token.raw === hint
        || token.raw.replace(/^[+-]/, '') === hint
        || `${token.negative ? '-' : ''}${token.intDigits}` === hint
        || token.intDigits === hint
        || token.decDigits === hint
    ))
    return index >= 0 ? index : 0
}

// What the cursor currently highlights on a float field:
// - 'full': the whole float, e.g. "19.75" (the sign may be excluded from the highlight)
// - 'int' / 'dec': only one digit group ("440" / "00")
// Returns null when the hint cannot be attributed confidently; callers must cope
// with that instead of assuming.
export type FloatCursorFocus = 'full' | 'int' | 'dec'

export const detectFloatCursorFocus = (token: ParsedFloatToken | null, hintText: string | null): FloatCursorFocus | null => {
    if (!token) return null
    const hint = hintText?.trim() ?? ''
    if (!hint) return null

    const unsignedRaw = token.raw.replace(/^[+-]/, '')
    if (token.raw === hint || unsignedRaw === hint) return 'full'

    const signedIntGroup = `${token.negative ? '-' : ''}${token.intDigits}`
    if (signedIntGroup === hint || token.intDigits === hint) return 'int'
    if (token.decDigits === hint) return 'dec'

    // Single-digit highlight: attribute it only when the digit belongs to exactly one group.
    if (hint.length === 1) {
        const inIntPart = token.intDigits.includes(hint)
        const inDecPart = token.decDigits.includes(hint)
        if (inIntPart && !inDecPart) return 'int'
        if (inDecPart && !inIntPart) return 'dec'
    }

    return null
}

// Does a highlighted text match one token (whole float, with or without sign, or
// a whole digit group)? Single-character hints are only trusted for full-token
// matches because a lone digit is too ambiguous.
const floatHintMatchesToken = (token: ParsedFloatToken, hint: string): boolean => {
    if (hint.length === 1) {
        return token.raw === hint || token.raw.replace(/^[+-]/, '') === hint
    }
    return token.raw === hint
        || token.raw.replace(/^[+-]/, '') === hint
        || `${token.negative ? '-' : ''}${token.intDigits}` === hint
        || token.intDigits === hint
        || token.decDigits === hint
}

// Detect whether the highlighted text now belongs to a DIFFERENT float token on
// the same line (the cursor drifted to another field mid-run). The hint must not
// match the edited token at all while matching another one, so ambiguous cases
// never trigger a false positive.
export const isCursorOnForeignFloat = (tokens: ParsedFloatToken[], ownIndex: number, hintText: string | null): boolean => {
    const hint = hintText?.trim() ?? ''
    if (!hint || !tokens[ownIndex]) return false
    if (floatHintMatchesToken(tokens[ownIndex], hint)) return false
    return tokens.some((token, index) => (
        index !== ownIndex && floatHintMatchesToken(token, hint)
    ))
}

// Pretty-print a parsed token value for logs, e.g. ticks=-1069 with 2 decimals => "-10.69"
export const formatFloatFromTicks = (ticks: number, tickHundredths: number): string => {
    const hundredths = Math.round(ticks * tickHundredths)
    const sign = hundredths < 0 ? '-' : ''
    const absolute = Math.abs(hundredths)
    const intPart = Math.floor(absolute / 100)
    const fracPart = absolute - intPart * 100
    return `${sign}${intPart}.${fracPart.toString().padStart(2, '0')}`
}

const NOTE_ORDER = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'] as const

export type ParsedNote = {
    label: string
    noteName: string
    octave: number
    semitoneIndex: number
}

export const parseNoteValue = (text: string | null): ParsedNote | null => {
    if (!text) return null
    const match = text.trim().toUpperCase().match(/([A-G][#-][0-9A-F])/)
    if (!match) return null

    const label = match[1]
    const noteName = label.slice(0, 2)
    const octave = Number.parseInt(label.slice(2, 3), 16)
    const noteOffset = NOTE_ORDER.indexOf(noteName as (typeof NOTE_ORDER)[number])

    if (noteOffset < 0 || Number.isNaN(octave)) {
        return null
    }

    return {
        label,
        noteName,
        octave,
        semitoneIndex: octave * 12 + noteOffset,
    }
}
