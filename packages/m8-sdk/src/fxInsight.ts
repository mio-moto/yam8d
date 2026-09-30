/**
 * fxInsight.ts
 *
 * Explains what an FX value does and follows FX "lanes" (FX1/FX2/FX3 columns)
 * down a phrase, so a REP command - or an empty cell sitting under one - can be
 * described in terms of the command it is repeating.
 *
 * Purely structural: works on already-parsed cells, no dependency on viewContext.
 */

import { isRelativeFx } from './fxCommands'

export { isRelativeFx }

/** The subset of a parsed cell this module needs. */
export interface FxCell {
  rawValue: string
  hexValue: number | null
  isEmpty: boolean
}

/** One phrase step, indexed by column key ('note', 'fx1cmd', 'fx1val', …). */
export interface FxStepRow {
  fields: Record<string, FxCell | undefined>
}

export type FxLaneEvent =
  /** Nothing FX-related happens in this lane at this step. */
  | 'none'
  /** A regular command starts a new base value; any REP ends. */
  | 'set'
  /** A regular command replaces a REP that was running. */
  | 'replace'
  /** REP XX (XX>0) starts repeating. */
  | 'rep'
  /** REP XX while another REP was already running (new increment). */
  | 'repChange'
  /** REP 00 stops the repeat. */
  | 'repStop'
  /** REP with no earlier command in this lane and none carried over. */
  | 'orphan'
  /** RTO sets the limit for the running REP. */
  | 'rto'
  /** Empty cell while a REP is active: the repeated command fires again. */
  | 'continue'

export interface M8FxLaneTrace {
  /** FX lane, 1-3. */
  lane: number
  /** Phrase step this trace was computed for. */
  step: number
  event: FxLaneEvent
  /** Last regular command in the lane at or before `step`. */
  source: { cmd: string; value: number | null; step: number } | null
  /** True when a REP is running after this step. */
  active: boolean
  /** Per-step increment of the running REP (0x01-0xFF, 0x80+ = negative). */
  increment: number | null
  /** Value set with RTO, if any. */
  limit: number | null
  /** Value the repeated command has at this step (null when unknown). */
  value: number | null
  /** True when `value` was clamped by the RTO limit. */
  atLimit: boolean
  /** Step where the running REP began. */
  repStartStep: number | null
  /** True when a REP from a previous phrase is running here (value unknown). */
  carried: boolean
}

//  formatting helpers 

export const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0')
const signed8 = (n: number): number => (n > 0x7f ? n - 0x100 : n)
const fmtSigned = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`

/** Hex text of a value, with its signed reading when the command is relative and negative. */
export function formatFxValue(cmd: string, value: number): string {
  if (isRelativeFx(cmd) && value > 0x7f) return `${hex2(value)} (${signed8(value)})`
  return hex2(value)
}

/** REP increment as shown to the user: +05, −03 (for FD). */
function formatIncrement(inc: number): string {
  return inc > 0x7f ? `−${hex2(0x100 - inc)}` : `+${hex2(inc)}`
}

//  notes (for ARP) 

const PITCH_CLASSES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-']

function noteToIndex(note: string | null | undefined): number | null {
  const m = /^([A-G])([#-])(\d)$/.exec((note ?? '').trim().toUpperCase())
  if (!m) return null
  const pc = PITCH_CLASSES.indexOf(`${m[1]}${m[2]}`)
  return pc < 0 ? null : Number(m[3]) * 12 + pc
}

function indexToNote(i: number): string {
  return `${PITCH_CLASSES[((i % 12) + 12) % 12]}${Math.floor(i / 12)}`
}

//  value interpretation 

export interface FxValueContext {
  /** Note on the same step (used by ARP to spell out the notes). */
  note?: string | null
  /** Table view: HOP and CHA mean something different there. */
  inTable?: boolean
}

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Short explanation of what `value` does for `cmd` (phrase view), or null when
 * the command has no interpretation worth adding beyond its name.
 */
export function describeFxValue(cmd: string, value: number, ctx: FxValueContext = {}): string | null {
  const c = cmd.toUpperCase()
  const x = value >> 4
  const y = value & 0xf
  const ticks = (n: number) => `${n} tick${n === 1 ? '' : 's'}`

  switch (c) {
    case 'ARP': {
      const base = noteToIndex(ctx.note)
      const semis = `+${x} and +${y} semitones`
      if (base == null) return `plays the note, then ${semis}`
      return `${semis}: ${indexToNote(base)} ${indexToNote(base + x)} ${indexToNote(base + y)}`
    }
    case 'ARC':
      return `arp mode ${x}, speed ${ticks(y)}`
    case 'CHA':
      if (ctx.inTable) return `everything left of it plays with probability ${value}/255 (00 never, FF always)`
      return `${x}/15 chance for what is left of it, ${y}/15 for what is right (0 never, F always)`
    case 'DEL':
      return `delays this row by ${ticks(value)}`
    case 'KIL':
      return `stops the note after ${ticks(value)}`
    case 'OFF':
      return `note off after ${ticks(value)}`
    case 'PSL':
      return `portamento over ${ticks(value)}`
    case 'GRV':
      return `track uses groove ${hex2(value)}`
    case 'GGR':
      return `all tracks use groove ${hex2(value)}`
    case 'INS':
      return `switches to instrument ${hex2(value)}`
    case 'TBL':
      return `instrument uses table ${hex2(value)}`
    case 'TBX':
      return value === 0 ? 'stops the auxiliary table' : `plays table ${hex2(value)} alongside the instrument table`
    case 'THO':
      return `table jumps to position ${y.toString(16).toUpperCase()}`
    case 'HOP':
      if (ctx.inTable) return `jumps to row ${y.toString(16).toUpperCase()}, ${x} time${x === 1 ? '' : 's'}`
      return value === 0xff ? 'stops this track' : `jumps to row ${y.toString(16).toUpperCase()} of the next phrase`
    case 'RND':
      return `randomises the previous FX: left range ${x}, right range ${y} (0 none, F full)`
    case 'RNL':
      return `randomises the FX to its left: left range ${x}, right range ${y} (0 none, F full)`
    case 'RET':
      if (y === 0) return `single retrig after ${ticks(x)}`
      return `retrigs every ${ticks(y)}, volume ${x < 8 ? 'falls' : 'rises'} on each retrig (ramp ${x})`
    case 'PVB':
    case 'PVX':
      return `vibrato speed ${x}, depth ${y}`
    case 'PBN':
      return value < 0x80 ? `pitch slides up by ${value}` : `pitch slides down by ${0x100 - value}`
    case 'SCA':
    case 'SCG': {
      const key = KEY_NAMES[x]
      return `${c === 'SCA' ? 'track' : 'song'} scale ${y.toString(16).toUpperCase()}${key ? `, key ${key}` : ''}`
    }
    case 'SNG':
      return `moves the song position by ${fmtSigned(signed8(value))} row(s)`
    case 'SED':
      return `random seed ${hex2(value)}`
    case 'NXT':
      return `plays instrument ${hex2(value)} on the next track`
    case 'MTT': {
      const eighths = signed8(value)
      return eighths === 0 ? 'no timing shift' : `shifts the row by ${fmtSigned(eighths)}/8 tick`
    }
    case 'TPO':
      return `${value} BPM`
    case 'TSP':
      return `transposes the song by ${fmtSigned(signed8(value))} semitones`
    case 'TIC':
      if (value === 0) return 'table advances on each instrument trigger'
      if (value <= 0xfb) return `table advances every ${ticks(value)}`
      return (
        { 0xfc: 'octave map: playing octave picks the table row', 0xfd: 'velocity map', 0xfe: 'note map', 0xff: 'table advances at 200 Hz' } as Record<
          number,
          string
        >
      )[value] ?? null
    case 'XRZ':
      return value > 0 ? 'reverb freeze on' : 'reverb freeze off'
    default:
      break
  }

  if (isRelativeFx(c)) {
    const s = signed8(value)
    if (c === 'PIT') return s === 0 ? 'no change' : `${fmtSigned(s)} semitones`
    return s === 0 ? 'no change' : fmtSigned(s)
  }
  return null
}

//  FX lane tracing (REP / RTO) 

function advance(running: number, inc: number, limit: number | null): { value: number; atLimit: boolean } {
  let next = (running + inc) & 0xff
  if (limit != null) {
    const rising = inc < 0x80
    // Past the limit, or wrapped around 8 bits on the way there → hold at the limit.
    if (rising ? next < running || next > limit : next > running || next < limit) next = limit
  }
  return { value: next, atLimit: limit != null && next === limit }
}

/**
 * Walks FX lane `lane` (1-3) from step 0 to `step` and reports what is in effect
 * there. `rows` must hold every step of the phrase, index = step.
 *
 * Model (manual: "Repeat"): REP XX repeats the lane's last command with its value
 * bumped by XX on each step, keeps going through empty cells, and stops on a new
 * command or REP00. RTO XX in the same lane sets the value REP stops at.
 * `carriedIn` says a REP from a previous phrase is running (the '^^' marker).
 */
export function analyzeFxLane(rows: FxStepRow[], lane: number, step: number, carriedIn = false): M8FxLaneTrace {
  let source: M8FxLaneTrace['source'] = null
  let running: number | null = null
  let inc: number | null = null
  let limit: number | null = null
  let active = carriedIn
  let atLimit = false
  let repStart: number | null = null
  let event: FxLaneEvent = 'none'

  const last = Math.min(step, rows.length - 1)
  for (let i = 0; i <= last; i += 1) {
    const cmdCell = rows[i].fields[`fx${lane}cmd`]
    const valCell = rows[i].fields[`fx${lane}val`]
    event = 'none'

    if (cmdCell && !cmdCell.isEmpty) {
      const cmd = cmdCell.rawValue.toUpperCase()
      const val = valCell && !valCell.isEmpty ? valCell.hexValue : null

      if (cmd === 'REP') {
        if (!val) {
          event = 'repStop'
          active = false
          inc = null
          atLimit = false
        } else if (!source && !carriedIn) {
          event = 'orphan'
        } else {
          event = active ? 'repChange' : 'rep'
          if (!active) repStart = i
          active = true
          inc = val
          if (running != null) ({ value: running, atLimit } = advance(running, inc, limit))
        }
      } else if (cmd === 'RTO') {
        event = 'rto'
        limit = val
      } else {
        event = active ? 'replace' : 'set'
        source = { cmd, value: val, step: i }
        running = val
        active = false
        inc = null
        limit = null
        atLimit = false
        repStart = null
      }
    } else if (active) {
      event = 'continue'
      if (running != null && inc != null) ({ value: running, atLimit } = advance(running, inc, limit))
    }
  }

  return {
    lane,
    step,
    event,
    source,
    active,
    increment: inc,
    limit,
    value: active ? running : null,
    atLimit,
    repStartStep: repStart,
    carried: active && !source,
  }
}

/**
 * One-sentence explanation of a lane trace, or null when the lane has nothing to
 * say at this step. Meant to be appended to the cell description.
 */
export function describeFxLane(t: M8FxLaneTrace): string | null {
  const src = t.source
  const val = (v: number | null) => (v == null ? '??' : src ? formatFxValue(src.cmd, v) : hex2(v))
  const inc = t.increment != null ? formatIncrement(t.increment) : ''
  const at = t.atLimit && t.limit != null ? `, held at the RTO limit ${hex2(t.limit)}` : ''

  switch (t.event) {
    case 'rep':
    case 'repChange': {
      if (t.carried) return `REP ${inc} per step continues the repeat from the previous phrase`
      const verb = t.event === 'rep' ? 'repeats' : 'now repeats'
      return `${verb} ${src?.cmd} from ${val(src?.value ?? null)} (step ${src?.step.toString(16).toUpperCase()}), ${inc} per step → ${val(t.value)} on this step${at}`
    }
    case 'continue':
      if (t.carried) return 'REP from a previous phrase is still active in this lane (^^)'
      return `REP still active: ${src?.cmd} reaches ${val(t.value)} on this step (${inc} per step since step ${t.repStartStep?.toString(16).toUpperCase()})${at}`
    case 'repStop':
      return src ? `REP00 stops the repeat of ${src.cmd}` : 'REP00 stops the repeat'
    case 'orphan':
      return 'REP has no earlier command in this lane of the phrase to repeat'
    case 'rto':
      return t.active && t.limit != null ? `sets the value the running REP stops at (${hex2(t.limit)})` : 'sets the stop value for a REP'
    case 'replace':
      return src ? `replaces the running REP (${src.cmd} is no longer repeated)` : null
    default:
      return null
  }
}

//  relative commands 

/**
 * What a relative instrument command (VOL, CUT, PIT…) has done to its parameter
 * since the last note trigger.
 */
export interface M8RelativeFxState {
  cmd: string
  /** Net change applied to the parameter (signed; the device clamps to the parameter's range). */
  total: number
  /** Times the command was applied (REP-driven repeats included). */
  count: number
  /** Step of the last trigger that reset it, or null when none happened in this phrase. */
  resetStep: number | null
  /** What reset it: a row with an instrument number in the I column, or a RET command. */
  resetBy: 'instrument' | 'ret' | null
  /** True when some of the applications came from a running REP. */
  viaRep: boolean
}

/**
 * What makes step `row` trigger the instrument again, which resets every relative change:
 * an instrument number in the I column, a RET command, or nothing (null).
 */
export function relativeResetBy(row: FxStepRow): M8RelativeFxState['resetBy'] {
  const inst = row.fields.inst
  if (inst && !inst.isEmpty) return 'instrument'
  const retriggers = [1, 2, 3].some((lane) => {
    const c = row.fields[`fx${lane}cmd`]
    return c != null && !c.isEmpty && c.rawValue.toUpperCase() === 'RET'
  })
  return retriggers ? 'ret' : null
}

/**
 * Follows every relative instrument command through the phrase up to `step` (inclusive).
 *
 * Model (manual: "Relative and Absolute FX Commands"): a relative command adds its
 * value (01-7F) or subtracts it (80-FF) from the instrument's parameter, and the change
 * stays until a note is triggered with a RET command or with an instrument number in
 * the I column, which puts every parameter back to the instrument's assigned value.
 * A row that triggers resets first, then applies its own commands. State from a
 * previous phrase isn't visible, so totals only cover this phrase.
 */
export function analyzeRelativeFx(
  rows: FxStepRow[],
  step: number,
  carriedLane: number | null = null,
): Record<string, M8RelativeFxState> {
  const states: Record<string, M8RelativeFxState> = {}
  let resetStep: number | null = null
  let resetBy: M8RelativeFxState['resetBy'] = null

  const last = Math.min(step, rows.length - 1)
  for (let i = 0; i <= last; i += 1) {
    const trigger = relativeResetBy(rows[i])
    if (trigger) {
      for (const k of Object.keys(states)) delete states[k]
      resetStep = i
      resetBy = trigger
    }

    for (const lane of [1, 2, 3]) {
      const trace = analyzeFxLane(rows, lane, i, carriedLane === lane)
      const src = trace.source
      if (!src || trace.carried || !isRelativeFx(src.cmd)) continue

      let applied: number | null = null
      let viaRep = false
      if (trace.event === 'set' || trace.event === 'replace') applied = src.value
      else if (trace.event === 'rep' || trace.event === 'repChange' || trace.event === 'continue') {
        applied = trace.value
        viaRep = true
      }
      if (applied == null) continue

      const st = (states[src.cmd] ??= { cmd: src.cmd, total: 0, count: 0, resetStep, resetBy, viaRep: false })
      st.total += signed8(applied)
      st.count += 1
      st.viaRep ||= viaRep
    }
  }
  return states
}

/** "+0A", "−1F" — the net change of a relative command, in hex like the values on screen. */
const fmtOffset = (n: number): string => (n === 0 ? '±00' : `${n > 0 ? '+' : '−'}${hex2(Math.abs(n))}`)

/** Where the accumulation started, for messages. */
function sinceText(s: M8RelativeFxState): string {
  if (s.resetStep == null) return 'the start of this phrase (earlier state unknown)'
  const at = s.resetStep.toString(16).toUpperCase()
  return s.resetBy === 'ret' ? `the RET on step ${at}` : `the instrument number on step ${at}`
}

const RESET_HINT = 'stays until a note with an instrument number (I) or a RET resets it'

/** Sentence about a relative command's accumulated effect, for the cell that applies it. */
export function describeRelativeFx(s: M8RelativeFxState | null | undefined): string {
  if (!s || s.count <= 1) return `relative: ${RESET_HINT}`
  const rep = s.viaRep ? ', including REP repeats' : ''
  const moved = s.total === 0 ? `has had no net effect` : `has moved by ${fmtOffset(s.total)}`
  return `relative: ${s.cmd} ${moved} over ${s.count} steps since ${sinceText(s)}${rep}; ${RESET_HINT}`
}

/**
 * For an instrument number typed on a step: which relative changes are still in force
 * and will be wiped by the note it triggers. Null when nothing relative is active.
 */
export function describeRelativeReset(active: Record<string, M8RelativeFxState>): string | null {
  const list = Object.values(active).filter((s) => s.total !== 0)
  if (!list.length) return null
  return `triggers the instrument again: resets the relative changes still in force (${list.map((s) => `${s.cmd} ${fmtOffset(s.total)}`).join(', ')})`
}
