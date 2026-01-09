import { M8KeyMask } from '../connection/keys'

export const defaultInputMap = Object.freeze({
  ArrowUp: M8KeyMask.Up,
  ArrowDown: M8KeyMask.Down,
  ArrowLeft: M8KeyMask.Left,
  ArrowRight: M8KeyMask.Right,
  ShiftLeft: M8KeyMask.Shift,
  Space: M8KeyMask.Play,
  KeyZ: M8KeyMask.Opt,
  KeyX: M8KeyMask.Edit,

  Gamepad12: M8KeyMask.Up,
  Gamepad64: M8KeyMask.Up,
  Gamepad13: M8KeyMask.Down,
  Gamepad65: M8KeyMask.Down,
  Gamepad14: M8KeyMask.Left,
  Gamepad66: M8KeyMask.Left,
  Gamepad15: M8KeyMask.Right,
  Gamepad67: M8KeyMask.Right,
  Gamepad8: M8KeyMask.Shift,
  Gamepad2: M8KeyMask.Shift,
  Gamepad5: M8KeyMask.Shift,
  Gamepad9: M8KeyMask.Play,
  Gamepad3: M8KeyMask.Play,
  Gamepad1: M8KeyMask.Opt,
  Gamepad0: M8KeyMask.Edit,
})
