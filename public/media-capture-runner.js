// Sets up a recording job's context on the M8 and puts the project back afterwards (MEDIA_GENERATION_PLAN.md 3.5,
// 3.6). No DOM: media-capture.html passes the SDK client and its own log / ask callbacks, so the same code can be
// driven from a test page.
//
//   const runner = createJobRunner({ client, log, ask, sleep, isStopped })   // isStopped: false, true or 'skipped'
//   const { baseline, recipe } = await runner.prepare(job, direction)   // before the recording
//   await runner.cleanup(job, baseline, after)                          // after it
//
// A job's context (built by m8-shortcuts/scripts/build-media-jobs.mjs):
//   route          [{ view }, { cursor: [x, y] }, { press: [...] }, { instrument }, { expect: [...] }]
//   context        { transport: 'stopped' | 'playing', play: { tracks, skip }, mute, presets, instrument, target: { zones, want, near, ... }, seek }
//   setup          [{ op: 'keys' | 'instrument' | 'target' | 'ask' | 'wait' | 'selectMode' | 'requireText', ... }]
//   restore.kind   'none' | 'value' | 'reload' | 'reload-if-changed'
//   mirror         'vertical' | 'horizontal' | 'both': flip the gesture when the value under the cursor is high

import * as core from './media-capture-core.js'

//export const DEMO_PROJECT = 'LAAMAA_SNOWYDAY'
export const DEMO_PROJECT = 'VIBETHEFUNK'
const DIALOG_RE = /lose|lost|discard|unsaved/i
const CONFIRM_RE = /^(yes|ok|load|continue|confirm|discard)$/i
const EXIT_UNSAVED_RE = /EXIT WITHOUT SAVING/i
const FILE_BROWSER_VIEWS = new Set(['loadproject', 'loadinstrument', 'loadsample', 'selectsavedirectory', 'createdirectory'])

// How long each SDK call may take. Older yam8d builds' navigateToView only resolved when the view changed, so it never
// answered once a dialog or the name keyboard showed (no view name): without a limit the whole batch would hang there.
const SDK_TIMEOUT_MS = {
    navigateToView: 20000,
    navigateTo: 12000,
    browseFile: 120000,
    setValueToHex: 20000,
    setValueToInt: 20000,
    setNote: 20000,
    setValueToString: 20000,
}
const DEFAULT_SDK_TIMEOUT_MS = 6000

/** The SDK client with every method call bounded by a timeout (it throws "<method> did not answer"). */
const boundedClient = (client) =>
    new Proxy(client, {
        get(target, prop) {
            const value = target[prop]
            if (typeof value !== 'function') return value
            return (...args) => {
                const ms = SDK_TIMEOUT_MS[prop] ?? DEFAULT_SDK_TIMEOUT_MS
                let timer
                const limit = new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${String(prop)} did not answer within ${ms / 1000} s`)), ms)
                })
                return Promise.race([value.apply(target, args), limit]).finally(() => clearTimeout(timer))
            }
        },
    })

export const createJobRunner = ({
    client: rawClient,
    log = () => {},
    ask,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    isStopped = () => false,
}) => {
    const client = boundedClient(rawClient)
    const snapshot = () => client.captureSnapshot()
    const checkStop = () => {
        const why = isStopped()
        if (why) throw new Error(typeof why === 'string' ? why : 'stopped')
    }

    /** A chord pressed like a person: modifiers first, then the key; released last-pressed first (the M8 cares). */
    const press = async (names, holdMs = 110) => {
        for (let i = 1; i <= names.length; i++) {
            await client.sendKeyDown(names.slice(0, i))
            await sleep(i < names.length ? 90 : holdMs)
        }
        for (let i = names.length - 1; i >= 1; i--) {
            await client.sendKeyDown(names.slice(0, i))
            await sleep(70)
        }
        await client.sendKeyUp()
        await sleep(170)
    }

    /** Plays [dt, mask] steps now, unrecorded. */
    const playSteps = async (steps) => {
        const t0 = performance.now()
        for (const [dt, mask] of steps) {
            const wait = t0 + dt - performance.now()
            if (wait > 0) await sleep(wait)
            await (mask ? client.sendKeyDown(core.maskToNames(mask)) : client.sendKeyUp())
        }
        await sleep(150)
    }

    // ---------- the M8's state ----------

    async function transport() {
        const a = await snapshot()
        await sleep(450)
        const b = await snapshot()
        return core.transportFrom(a.screen.lines, b.screen.lines)
    }

    /**
     * Leaves dialogs and sub-views (Option) until a view yam8d can navigate from. Leaving the Sample Editor after a
     * clip changed the sample asks "EXIT WITHOUT SAVING CHANGES? OK CANCEL" with OK selected: Edit confirms, which
     * also throws the clip's change away.
     */
    async function leaveSubViews() {
        for (let i = 0; i < 5; i++) {
            const snap = await snapshot()
            if (core.GRAPH_VIEWS.has(snap.state.viewName ?? '')) return snap
            if (EXIT_UNSAVED_RE.test(snap.screen.lines.join(' ')) && /^OK$/.test(snap.state.textUnderCursor?.trim() ?? '')) {
                log('leaving without saving (OK)')
                await press(['edit'])
            } else {
                log(`leaving "${snap.state.viewName ?? 'dialog'}" (Option)`)
                await press(['opt'])
            }
            await sleep(250)
        }
        return snapshot()
    }

    /**
     * Leaves Select Mode (Option copies the selection and leaves it). The flag comes from the cursor's shape and can
     * lag a redraw, so "off" must be read twice in a row; up to three tries. Returns true when it had to leave.
     */
    async function ensureNoSelection() {
        let left = false
        for (let i = 0; i < 3; i++) {
            if (!(await snapshot()).state.selectionMode) {
                await sleep(250)
                if (!(await snapshot()).state.selectionMode) return left
            }
            log('leaving Select Mode (Option)')
            await press(['opt'])
            await sleep(200)
            left = true
        }
        if ((await snapshot()).state.selectionMode) throw new Error('Select Mode is still on after three Option presses')
        return left
    }

    /**
     * Puts the M8 in a neutral state between jobs, whatever happened: keys released, no Select Mode, no sub-view or
     * dialog, playback stopped, no mute or solo. Best effort: a step that fails is logged and the next one still runs.
     */
    async function settle() {
        for (const [what, step] of [
            ['release keys', () => client.sendKeyUp()],
            ['leave Select Mode', ensureNoSelection],
            ['leave sub-views', leaveSubViews],
            ['leave Select Mode', ensureNoSelection],
            ['stop playback', stopPlayback],
            ['clear mute/solo', clearTrackFlags],
        ]) {
            try {
                await step()
            } catch (e) {
                log(`settle: ${what} failed (${e.message})`, 'warn')
            }
        }
    }

    async function stopPlayback() {
        for (let i = 0; i < 3; i++) {
            if ((await transport()) !== 'playing') return
            log('stopping playback (Play)')
            await press(['play'])
            await sleep(300)
        }
        throw new Error('playback did not stop')
    }

    /**
     * Starts the song from a Song row that has chains, so the clip has sound and moving play heads. With `play`
     * ({ tracks, skip }) the cursor goes on a sounding chain of those tracks first (the current track is the one a
     * mute or solo acts on); with none, or when no cell fits, on track 1 of the first row that has chains.
     */
    async function startPlayback(play) {
        await gotoView('song')
        const snap = await snapshot()
        const start = play ? core.songPlayStart(snap.screen.lines, play) : null
        if (play && !start) log(`no sounding chain on track ${(play.tracks ?? [3, 4]).join(' or ')} in the visible rows: starting on track 1`, 'warn')
        const row = start?.y ?? core.songRowWithChains(snap.screen.lines) ?? 7
        await client.navigateTo(start?.x ?? 4, row)
        await sleep(250)
        log(`starting playback from song row ${row - 6}${start ? `, track ${start.track} (chain ${start.text})` : ''} (Play)`)
        await press(['play'])
        await sleep(500)
        if ((await transport()) !== 'playing') throw new Error('playback did not start')
    }

    /** Mutes the current track and keeps it muted (Option down, Shift down, Option released first). */
    async function latchMute() {
        log('muting the current track (Opt+Shift, Option released first)')
        for (const keys of [['opt'], ['opt', 'shift'], ['shift']]) {
            await client.sendKeyDown(keys)
            await sleep(140)
        }
        await client.sendKeyUp()
        await sleep(250)
        if (!core.trackFlags((await snapshot()).screen.lines).includes('M')) throw new Error('the mute did not latch')
    }

    async function clearTrackFlags() {
        const snap = await snapshot()
        if (!core.trackFlags(snap.screen.lines).some(Boolean)) return
        log('clearing mutes and solos (Opt+Shift+Play)')
        await press(['opt', 'shift', 'play'])
    }

    async function gotoView(view) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await client.navigateToView(view)
            await sleep(350)
            const snap = await snapshot()
            if (snap.state.viewName === view) return snap
            log(`navigation to "${view}" landed on "${snap.state.viewName}" (attempt ${attempt})`)
        }
        throw new Error(`could not reach the ${view} view`)
    }

    /** Instrument view: pages with Opt+Right (then Opt+Left) to an instrument of the wanted type. */
    async function seekInstrument(want) {
        let snap = await snapshot()
        if (core.instrumentMatches(core.instrumentType(snap.screen.lines), want)) return snap
        for (const [dir, max] of [
            ['right', 32],
            ['left', 64],
        ]) {
            for (let i = 0; i < max; i++) {
                checkStop()
                await press(['opt', dir], 90)
                snap = await snapshot()
                const type = core.instrumentType(snap.screen.lines)
                if (core.instrumentMatches(type, want)) {
                    log(`instrument: ${snap.state.viewTitle?.trim()} (${type})`)
                    return snap
                }
            }
        }
        throw new Error(`no ${want} instrument in this song`)
    }

    /** Tries the cells of the current screen that fit `target`; returns the snapshot once the cursor sits on one. */
    async function tryHere(target, how) {
        const snap = await snapshot()
        for (const cell of core.findCandidates(snap.screen.lines, target).slice(0, 5)) {
            await client.navigateTo(cell.x, cell.y)
            await sleep(200)
            const at = await snapshot()
            if (core.cursorFits(at, target)) {
                log(
                    `cursor on (${at.state.cursorPos.x}, ${at.state.cursorPos.y}) "${at.state.textUnderCursor?.trim()}"${how ? ` (${how}: ${at.state.viewTitle?.trim()})` : ''}`,
                )
                return at
            }
        }
        return null
    }

    /**
     * Puts the cursor on a cell that fits `target`. When this screen has none, `seek` shows other content: a list of
     * pager keys (Opt+Right through the tables), or { kind: 'song', hops, inChain }: from each Song cell holding a
     * chain, Shift+Right `hops` times (chain, then its first phrase), then Opt+Down `inChain` times.
     */
    async function placeTarget(target, seek) {
        const found = await tryHere(target)
        if (found || !seek) return found
        if (Array.isArray(seek)) {
            for (const pager of seek) {
                checkStop()
                await press(pager, 90)
                const at = await tryHere(target, 'after paging')
                if (at) return at
            }
            return null
        }
        if (seek.kind === 'song') {
            const view = (await snapshot()).state.viewName
            const cells = core.songCells((await gotoView('song')).screen.lines)
            for (const cell of cells.slice(0, 64)) {
                checkStop()
                if ((await snapshot()).state.viewName !== 'song') await gotoView('song')
                await client.navigateTo(cell.x, cell.y)
                await sleep(200)
                for (let h = 0; h < seek.hops; h++) await press(['shift', 'right'])
                if ((await snapshot()).state.viewName !== view) continue
                const how = `from song cell (${cell.x}, ${cell.y})`
                let at = await tryHere(target, how)
                for (let i = 0; !at && i < (seek.inChain ?? 0); i++) {
                    await press(['opt', 'down'], 90)
                    at = await tryHere(target, how)
                }
                if (at) return at
            }
            await gotoView(view)
        }
        return null
    }

    async function reachScreen(job) {
        const here = await snapshot()
        if (job.views?.includes(here.state.viewName)) return here
        await leaveSubViews()
        for (const step of job.route ?? []) {
            checkStop()
            if (step.view) await gotoView(step.view)
            else if (step.cursor) {
                await client.navigateTo(step.cursor[0], step.cursor[1])
                await sleep(250)
            } else if (step.press) {
                await press(step.press)
                await sleep(300)
            } else if (step.instrument) await seekInstrument(step.instrument)
            else if (step.expect) {
                const snap = await snapshot()
                if (!step.expect.includes(snap.state.viewName))
                    throw new Error(`expected the ${step.expect.join(' / ')} view, the M8 shows "${snap.state.viewName}"`)
            }
        }
        return snapshot()
    }

    async function runSetup(job) {
        for (const op of job.setup ?? []) {
            checkStop()
            log(`${job.id}: setup ${op.op}${op.label ? ` - ${op.label}` : ''}`)
            if (op.op === 'keys') await press(op.combo ?? [])
            else if (op.op === 'steps') await playSteps(op.steps)
            else if (op.op === 'instrument') await seekInstrument(op.want)
            else if (op.op === 'target') {
                if (!(await placeTarget(op.target))) throw new Error(`setup: no cell for "${op.label}"`)
            } else if (op.op === 'wait') await sleep(op.ms)
            else if (op.op === 'selectMode') {
                if (!(await snapshot()).state.selectionMode) await press(['shift', 'opt'])
                if (!(await snapshot()).state.selectionMode) throw new Error('Select Mode did not turn on after Shift+Opt')
            } else if (op.op === 'requireText') {
                const snap = await snapshot()
                if (snap.state.textUnderCursor?.trim() !== op.text)
                    await ask(
                        `${op.hint} (cursor text is "${snap.state.textUnderCursor}", expected "${op.text}"). Fix it on the M8, then click Run.`,
                        'warn',
                    )
            } else if (op.op === 'ask') await ask(op.text)
            else throw new Error(`unknown setup op ${op.op}`)
        }
    }

    /**
     * Before the recording: a clean M8 (no selection, sub-view, playback, mute or solo left by the last job), then
     * the job's play state, screen, instrument, cursor cell and setup steps. Returns the loop baseline and the
     * recipe to play (mirrored when the value under the cursor would clamp). `manual`: the person plays the clip,
     * so there is no recipe and nothing to try first.
     */
    async function prepare(job, direction, { manual = false } = {}) {
        await client.sendKeyUp()
        await leaveSubViews()
        await ensureNoSelection()
        await stopPlayback()
        await clearTrackFlags()
        const ctx = job.context ?? {}
        if (ctx.transport === 'playing') await startPlayback(ctx.play)
        if (ctx.mute === 'latched') await latchMute()
        for (const preset of ctx.presets ?? []) {
            await gotoView(preset.view)
            await client.navigateTo(preset.cell[0], preset.cell[1])
            await sleep(250)
        }
        checkStop()
        await reachScreen(job)
        if (ctx.instrument && (await snapshot()).state.viewName === 'inst') await seekInstrument(ctx.instrument)
        if (ctx.target && !(await placeTarget(ctx.target, ctx.seek))) {
            throw new Error(`no cell on this screen fits the job (${ctx.target.want}${ctx.target.cmd ? `, command ${ctx.target.cmd}` : ''})`)
        }
        await runSetup(job)
        let recipe = manual ? null : core.resolveRecipe(job, direction)
        let mirrored = false
        if (recipe && job.mirror && (core.shouldMirror((await snapshot()).state.textUnderCursor) || (await clampsFirst(recipe)))) {
            recipe = core.mirrorSteps(recipe, job.mirror)
            mirrored = true
            log(`${job.id}: the value would clamp, so the gesture goes the other way first`)
        }
        const baseline = await snapshot()
        return { baseline, recipe, mirrored }
    }

    /**
     * Presses `dir` with `mods` held up to `count` times, unrecorded, and undoes what moved. Returns how many
     * presses changed the value (fewer than `count`: the value is at the end of its range in that direction).
     */
    async function probeMoves(mods, dir, count) {
        const back = core.OPPOSITE[dir]
        let last = (await snapshot()).state.textUnderCursor
        let moved = 0
        await client.sendKeyDown(mods)
        await sleep(120)
        for (let i = 0; i < count; i++) {
            await client.sendKeyDown([...mods, dir])
            await sleep(110)
            await client.sendKeyDown(mods)
            await sleep(160)
            const now = (await snapshot()).state.textUnderCursor
            if (now === last) break
            moved++
            last = now
        }
        for (let i = 0; i < moved; i++) {
            await client.sendKeyDown([...mods, back])
            await sleep(110)
            await client.sendKeyDown(mods)
            await sleep(160)
        }
        await client.sendKeyUp()
        await sleep(200)
        return moved
    }

    /**
     * Tries the gesture's first moves unrecorded (Edit held + the first arrow, as many times as the gesture does)
     * and undoes them. True when they run into the end of the value's range (the last FM algorithm, the first scale
     * key, a short list...) and the other direction goes further: the gesture must go the other way first. A value
     * that clamps both ways keeps the gesture as it is.
     */
    async function clampsFirst(recipe) {
        const first = core.firstMoves(recipe)
        if (!first) return false
        const mods = core.maskToNames(first.mods)
        const [dir] = core.maskToNames(first.dir)
        const before = (await snapshot()).state.textUnderCursor
        const forward = await probeMoves(mods, dir, first.count)
        const flip = forward < first.count && (await probeMoves(mods, core.OPPOSITE[dir], first.count)) > forward
        const after = (await snapshot()).state.textUnderCursor
        if (after !== before) log(`trying the first moves left "${after}" instead of "${before}"`, 'warn')
        return flip
    }

    // ---------- after the recording ----------

    /**
     * Loading a changed project makes the M8 ask to confirm that changes will be lost. The wording and the default
     * option are not known, so this looks for the dialog text, then finds the confirming option by the text under
     * the cursor. Returns true when it confirmed, false when no dialog was showing.
     */
    async function confirmLoseChangesDialog(when) {
        let snap = await snapshot()
        if (!DIALOG_RE.test(snap.screen.lines.join(' '))) return false
        log(
            `${when}: the M8 shows a "changes will be lost" dialog: ${snap.screen.lines
                .filter((l) => l.trim())
                .join(' | ')
                .slice(0, 200)}`,
            'warn',
        )
        const onConfirm = (sn) => CONFIRM_RE.test((sn.state.textUnderCursor ?? '').trim())
        for (const moves of [[], ['right'], ['left', 'left']]) {
            for (const dir of moves) {
                await press([dir])
                await sleep(100)
            }
            snap = await snapshot()
            if (onConfirm(snap)) {
                await press(['edit'])
                await sleep(900)
                log(`${when}: confirmed "${snap.state.textUnderCursor}"`, 'ok')
                return true
            }
        }
        await ask(
            'The M8 shows a "changes will be lost" dialog and the runner could not find the confirming option. Confirm it on the M8, then click Run.',
            'warn',
        )
        return true
    }

    async function reloadProject() {
        log(`reloading the demo project ${DEMO_PROJECT}`, 'warn')
        await client.sendKeyUp()
        await leaveSubViews()
        await ensureNoSelection()
        await gotoView('project')
        await client.navigateTo(14, 14) // the Load action
        await sleep(400)
        await press(['edit'])
        await sleep(900)
        await confirmLoseChangesDialog('after Load')
        const found = await client.browseFile(DEMO_PROJECT)
        await sleep(1000)
        await confirmLoseChangesDialog('after choosing the file')
        await sleep(1500)
        const snap = await snapshot()
        if (!found || FILE_BROWSER_VIEWS.has(snap.state.viewName ?? '')) {
            await ask(
                `The project reload did not finish by itself (view: ${snap.state.viewName}). Load ${DEMO_PROJECT} on the M8, then click Run.`,
                'warn',
            )
        }
        log('project reload done', 'ok')
    }

    /** Puts the value under the cursor back with the SDK editors; false when only a reload is safe. */
    async function restoreValue(baseline, after) {
        const text = baseline.state.textUnderCursor?.trim()
        if (!text || baseline.state.viewName !== after.state.viewName) return false
        const y = baseline.state.cursorPos?.y
        if (core.diffRows(baseline.screen.lines, after.screen.lines).some((r) => r !== y && r >= 3 && r <= 22)) return false
        if (baseline.state.cursorPos) await client.navigateTo(baseline.state.cursorPos.x, baseline.state.cursorPos.y)
        let ok = false
        if (/^[0-9A-F]{2}$/.test(text)) ok = await client.setValueToHex(parseInt(text, 16))
        else if (/^\d{1,3}$/.test(text)) ok = await client.setValueToInt(Number(text))
        else if (core.NOTE_RE.test(text)) ok = await client.setNote(text)
        else ok = await client.setValueToString(text, true, true)
        await sleep(300)
        return ok && !core.dataChanged(baseline, await snapshot())
    }

    /**
     * After the recording: release everything, leave Select Mode, sub-views and dialogs, stop playback, clear
     * mute/solo, then put the project back as the job says. Returns what was done.
     */
    async function cleanup(job, baseline, after) {
        const done = []
        await client.sendKeyUp()
        await ensureNoSelection()
        const changed = core.dataChanged(baseline, after)
        const kind = job.restore?.kind ?? 'none'
        let reload = kind === 'reload' || (kind === 'reload-if-changed' && changed)
        if (kind === 'value' && changed) {
            if (await restoreValue(baseline, after)) done.push('value put back')
            else reload = true
        }
        await leaveSubViews()
        await stopPlayback()
        await clearTrackFlags()
        if (reload) {
            await reloadProject()
            done.push('project reloaded')
        }
        // The next job must never start in Select Mode: check once more after everything above.
        if (await ensureNoSelection()) done.push('left Select Mode')
        return { changed, done }
    }

    return {
        prepare,
        cleanup,
        settle,
        reloadProject,
        transport,
        stopPlayback,
        startPlayback,
        seekInstrument,
        placeTarget,
        reachScreen,
        playSteps,
        press,
    }
}
