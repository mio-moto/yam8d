/**
 * fxCommands.ts
 *
 * Lookup of FX commands (the 3-letter names in the FX columns) with what is known
 * about them: description, whether they are relative, and which instrument types
 * offer them. Data lives in m8-view-context.json (`fxCommands`, `instrumentFx`).
 */

import schema from './m8-view-context.json'

export type FxCategory = 'sequencer' | 'instrument' | 'mixer' | 'modulation'

export interface M8FxCommandInfo {
  description: string
  category: FxCategory
  /**
   * Relative instrument commands add to the parameter's current value (01-7F add,
   * 80-FF subtract) and accumulate until a note is triggered with RET or with an
   * instrument number in the I column.
   */
  relative: boolean
  /**
   * Instrument types that offer the command, when it is not offered by all of them
   * (`null` = every type, or not an instrument command). Only types whose command
   * list was read from a device are considered.
   */
  instrumentTypes: string[] | null
  /** Modulator slot 1-4 for envelope/LFO commands (EA1, LF3…). */
  slot: number | null
}

interface FxEntry {
  description: string
  relative?: boolean
}

type FxCommandMap = Record<string, FxEntry>

const fxCommands = schema.fxCommands as unknown as Record<FxCategory, FxCommandMap>
const instrumentTypes = schema.instrumentFx.types as Record<string, { verified: boolean; commands: string[] }>

const VERIFIED_TYPES = Object.entries(instrumentTypes)
  .filter(([, t]) => t.verified)
  .map(([name]) => name)

/** Verified instrument types that offer `cmd`, or null when all of them do (or none does). */
function typesOffering(cmd: string): string[] | null {
  const offering = VERIFIED_TYPES.filter((t) => instrumentTypes[t].commands.includes(cmd))
  return offering.length === 0 || offering.length === VERIFIED_TYPES.length ? null : offering
}

/**
 * Look up a 3-character FX command name. Modulator commands carry their slot
 * number as the third character (EA1, LF3…). Returns undefined for unknown commands.
 */
export function lookupFxCommand(cmd: string): M8FxCommandInfo | undefined {
  const upper = cmd.toUpperCase()

  for (const category of ['sequencer', 'instrument', 'mixer'] as const) {
    const entry = fxCommands[category][upper]
    if (entry) {
      return {
        description: entry.description,
        category,
        relative: entry.relative === true,
        instrumentTypes: category === 'instrument' ? typesOffering(upper) : null,
        slot: null,
      }
    }
  }

  const mod = /^([A-Z]{2})([1-4])$/.exec(upper)
  const entry = mod ? fxCommands.modulation[mod[1]] : undefined
  if (mod && entry) {
    return {
      description: entry.description.replace('modulator N', `modulator ${mod[2]}`),
      category: 'modulation',
      relative: entry.relative === true,
      instrumentTypes: null,
      slot: Number(mod[2]),
    }
  }
  return undefined
}

/**
 * True for relative instrument commands: values 01-7F add to the parameter, 80-FF
 * subtract (see "Relative and Absolute FX Commands" in the manual).
 */
export function isRelativeFx(cmd: string): boolean {
  return lookupFxCommand(cmd)?.relative === true
}

export interface M8InstrumentFxList {
  /** Type key as used in the schema: sampler, macrosynth, fmsynth, hypersynth, midiout. */
  type: string
  /** Read from a real device (false = taken from documentation). */
  verified: boolean
  commands: string[]
}

/** Instrument command names offered for an instrument type, or null when unknown. */
export function getInstrumentFxCommands(type: string): M8InstrumentFxList | null {
  const t = instrumentTypes[type.toLowerCase()]
  return t ? { type: type.toLowerCase(), verified: t.verified, commands: [...t.commands] } : null
}

/** What the manual says about relative commands (for tooltips and descriptions). */
export const RELATIVE_FX_RULE: string = schema.instrumentFx.relativeCommands.description
