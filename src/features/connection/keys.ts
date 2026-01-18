export const M8KeyMask = {
    Left: 0b10000000,
    Up: 0b01000000,
    Down: 0b00100000,
    Shift: 0b00010000,
    Play: 0b00001000,
    Right: 0b00000100,
    Opt: 0b00000010,
    Edit: 0b00000001,
} as const

export const isLeft = (frame: number) => !!(frame & M8KeyMask.Left)
export const isUp = (frame: number) => !!(frame & M8KeyMask.Up)
export const isDown = (frame: number) => !!(frame & M8KeyMask.Down)
export const isShift = (frame: number) => !!(frame & M8KeyMask.Shift)
export const isPlay = (frame: number) => !!(frame & M8KeyMask.Play)
export const isRight = (frame: number) => !!(frame & M8KeyMask.Right)
export const isOpt = (frame: number) => !!(frame & M8KeyMask.Opt)
export const isEdit = (frame: number) => !!(frame & M8KeyMask.Edit)

export const pressKeys = ({
    left,
    right,
    up,
    down,
    shift,
    play,
    opt,
    edit,
}: {
    left?: boolean
    right?: boolean
    up?: boolean
    down?: boolean
    shift?: boolean
    play?: boolean
    opt?: boolean
    edit?: boolean
}) => {
    let state = 0x00
    if (left) {
        state |= M8KeyMask.Left
    }
    if (right) {
        state |= M8KeyMask.Right
    }
    if (up) {
        state |= M8KeyMask.Up
    }
    if (down) {
        state |= M8KeyMask.Down
    }
    if (shift) {
        state |= M8KeyMask.Shift
    }
    if (play) {
        state |= M8KeyMask.Play
    }
    if (opt) {
        state |= M8KeyMask.Opt
    }
    if (edit) {
        state |= M8KeyMask.Edit
    }
    return state
}
