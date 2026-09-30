/**
 * scaleInsight.ts
 *
 * Interprets the Scale View: which of the 12 note intervals are enabled, what
 * well-known scale that shape spells, and what a given row means musically.
 */

/** Interval row labels in screen order. */
export const SCALE_INTERVALS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export interface M8ScaleNote {
  /** Row label, e.g. 'D#'. */
  interval: string
  /** Semitones above the first row ('C'), 0-11. */
  semitone: number
  /** true = ON, false = OFF, null = unset ('--'). */
  enabled: boolean | null
  /** Detune in semitones (-24..+24), null when unreadable. */
  offset: number | null
}

export interface M8ScaleInfo {
  /** The 12 rows, in screen order. */
  notes: M8ScaleNote[]
  /** Labels of the enabled intervals, e.g. ['C', 'D', 'E', …]. */
  enabled: string[]
  /** Well-known scales this set of notes spells, most natural reading first. */
  shapes: string[]
  /** Intervals carrying a non-zero detune. */
  detuned: { interval: string; offset: number }[]
  /** One-line summary, e.g. "C D E F G A B — Major (Ionian)". */
  summary: string
}

const SCALES: { name: string; steps: number[] }[] = [
  { name: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Natural minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Melodic minor', steps: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] },
  { name: 'Phrygian dominant', steps: [0, 1, 4, 5, 7, 8, 10] },
  { name: 'Double harmonic', steps: [0, 1, 4, 5, 7, 8, 11] },
  { name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  { name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10] },
  { name: 'Diminished (whole-half)', steps: [0, 2, 3, 5, 6, 8, 9, 11] },
  { name: 'Diminished (half-whole)', steps: [0, 1, 3, 4, 6, 7, 9, 10] },
  { name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
]

const INTERVAL_NAMES = [
  'the root',
  'a minor 2nd',
  'a major 2nd',
  'a minor 3rd',
  'a major 3rd',
  'a perfect 4th',
  'a tritone',
  'a perfect 5th',
  'a minor 6th',
  'a major 6th',
  'a minor 7th',
  'a major 7th',
]

/** 'C-' → 'C', 'C#' → 'C#'. Returns null when the text is not an interval label. */
export function normalizeInterval(raw: string): string | null {
  const s = raw.replace(/[-\s]/g, '').toUpperCase()
  return (SCALE_INTERVALS as readonly string[]).includes(s) ? s : null
}

/** "a major 3rd (+4 semitones above C)" for a given interval label. */
export function describeInterval(interval: string): string {
  const semitone = (SCALE_INTERVALS as readonly string[]).indexOf(interval)
  if (semitone <= 0) return semitone === 0 ? 'the first row (the scale root)' : interval
  return `${INTERVAL_NAMES[semitone]} (+${semitone} semitones above C)`
}

/** Names of well-known scales whose notes equal the enabled set, C-rooted reading first. */
export function matchScaleShapes(enabledSemitones: number[]): string[] {
  const set = new Set(enabledSemitones)
  if (set.size === 0) return []
  const hits: { root: number; name: string }[] = []
  for (const scale of SCALES) {
    if (scale.steps.length !== set.size) continue
    for (let root = 0; root < 12; root += 1) {
      if (scale.steps.every((s) => set.has((s + root) % 12))) hits.push({ root, name: scale.name })
    }
  }
  // Tonic on the first row ('C') is the natural reading; the rest are modes of the same notes.
  hits.sort((a, b) => a.root - b.root)
  return hits.map((h) => (h.root === 0 ? h.name : `${h.name} from ${SCALE_INTERVALS[h.root]}`))
}

export function analyzeScale(notes: M8ScaleNote[]): M8ScaleInfo {
  const enabledNotes = notes.filter((n) => n.enabled === true)
  const enabled = enabledNotes.map((n) => n.interval)
  const shapes = matchScaleShapes(enabledNotes.map((n) => n.semitone))
  const detuned = notes
    .filter((n) => n.enabled === true && n.offset != null && n.offset !== 0)
    .map((n) => ({ interval: n.interval, offset: n.offset as number }))

  const summary = scaleSummaryParts({ enabled, shapes, detuned }).join(' — ')
  return { notes, enabled, shapes, detuned, summary }
}

/**
 * The two halves of the summary: the enabled notes ("C D E F G A B"), then the scale
 * they spell with any detune ("Major (Ionian); detuned: E −0.50 st"), when notes are enabled.
 */
export function scaleSummaryParts(info: Pick<M8ScaleInfo, 'enabled' | 'shapes' | 'detuned'>): string[] {
  const { enabled, shapes, detuned } = info
  if (!enabled.length) return ['no notes enabled']
  let shape = shapes[0] ?? `${enabled.length} notes, custom scale`
  if (detuned.length) shape += `; detuned: ${detuned.map((d) => `${d.interval} ${formatOffset(d.offset)}`).join(', ')}`
  return [enabled.join(' '), shape]
}

/** '+0.50 st' style detune text. */
export function formatOffset(offset: number): string {
  const sign = offset > 0 ? '+' : offset < 0 ? '−' : ''
  return `${sign}${Math.abs(offset).toFixed(2)} st`
}
