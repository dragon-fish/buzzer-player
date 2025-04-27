/**
 * BuzzerPlayer.ts
 *
 * A simple buzzer player for the web, using the Web Audio API.
 * It can play buzzer scripts with multiple tracks, volume control, and
 * different waveforms.
 *
 * @license MIT
 * @author ChatGPT-o3
 * @author dragon-fish <dragon-fish@qq.com>
 */
export class BuzzerPlayer {
  private ctx = new (window.AudioContext ||
    (window as any).webkitAudioContext)()
  private options: Required<BuzzerPlayerOptions>
  private scheduled: { osc: OscillatorNode; gain: GainNode }[] = []
  private playing = false

  constructor(opts: BuzzerPlayerOptions = {}) {
    this.options = {
      volume: opts.volume ?? 0.2,
      waveform: opts.waveform ?? 'square',
      tempo: opts.tempo ?? 120,
    }
  }

  /*──────────────────────────────────────────────────────────────────────────*/
  /*  Public API                                                             */
  /*──────────────────────────────────────────────────────────────────────────*/

  async playScript(script: string): Promise<void> {
    if (this.playing) await this.stop()
    const events = this.parseScript(script)
    if (!events.length) return

    const startAt = this.ctx.currentTime + 0.05

    for (const ev of events) {
      const when = startAt + ev.start
      if (ev.freq == null) continue // rest
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = ev.waveform
      osc.frequency.value = ev.freq
      gain.gain.value = ev.volume
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(when)
      osc.stop(when + ev.dur)
      this.scheduled.push({ osc, gain })
    }
    this.playing = true
    const last = events[events.length - 1]
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.playing = false
        resolve()
      }, (last.start + last.dur) * 1000 + 100)
    })
  }

  async stop(): Promise<void> {
    for (const { osc, gain } of this.scheduled) {
      try {
        osc.stop()
        osc.disconnect()
        gain.disconnect()
      } catch (_) {}
    }
    this.scheduled = []
    this.playing = false
  }

  async destroy(): Promise<void> {
    await this.stop()
    await this.ctx.close()
  }

  /*──────────────────────────────────────────────────────────────────────────*/
  /*  Parser                                                                 */
  /*──────────────────────────────────────────────────────────────────────────*/

  /**
   * Buzzer Script 0.2 (BZS)
   *
   * ```
   * GLOBAL DIRECTIVES (key = value)
   *   tempo    BPM                     (default 120)
   *   waveform sine|square|sawtooth…   (default square)
   *   volume   0–1                     (default 0.2)
   *
   * TRACK BLOCKS
   *   @track <name> [delay=<beats>] [waveform=<type>] [volume=<num>]
   *   …note‑duration pairs… (can span multiple lines)
   *   Next @track or EOF ends the block.
   *   If no @track is present, everything belongs to an implicit track "main".
   *
   * NOTE TOKEN PAIRS
   *   <note><oct?> <denom>
   *   C#4 8   → C‑sharp octave 4, eighth‑note
   *   R 4     → rest, quarter‑note
   *
   *   NEW in 0.2.1: Parser tolerates barlines "|" and ignores stray tokens, so
   *   lines like "C4 4 D4 4 | E4 4 F4 4" now work correctly.
   * ```
   */
  parseScript(src: string): RawEvent[] {
    const lines = src.split(/\r?\n/)
    const tracks: TrackMeta[] = []

    let cur: TrackMeta = {
      offsetSec: 0,
      waveform: this.options.waveform,
      volume: this.options.volume,
      curSec: 0,
      events: [],
    }

    let tempo = this.options.tempo
    const noteRe = /^([A-GR](?:#|b)?)(\d?)$/i

    const pushTrack = () => {
      if (cur.events.length) tracks.push(cur)
    }

    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue

      // Track declaration
      if (line.startsWith('@track')) {
        pushTrack()
        const parts = line.split(/\s+/)
        let delayBeats = 0
        let wv = cur.waveform
        let vol = cur.volume
        for (const p of parts.slice(2)) {
          const [k, v] = p.split('=')
          if (k === 'delay') delayBeats = Number(v) || 0
          if (k === 'waveform' && v) wv = v as OscillatorType
          if (k === 'volume' && v) vol = Math.max(0, Math.min(1, Number(v)))
        }
        cur = {
          offsetSec: (60 / tempo) * delayBeats,
          waveform: wv,
          volume: vol,
          curSec: 0,
          events: [],
        }
        continue
      }

      // Global directive
      const kv = line.match(/^([a-zA-Z]+)\s*=\s*(.+)$/)
      if (kv) {
        const [, k, v] = kv
        switch (k.toLowerCase()) {
          case 'tempo':
            tempo = Number(v) || tempo
            break
          case 'waveform':
            cur.waveform = v as OscillatorType
            break
          case 'volume':
            cur.volume = Math.max(0, Math.min(1, Number(v)))
            break
        }
        continue
      }

      // Token stream parser (stateful) — handles barlines "|"
      const tokens = line.split(/\s+/).filter(Boolean)
      let pendingNote: string | null = null
      for (const tok of tokens) {
        if (/^\|+$/.test(tok)) continue // ignore barlines
        if (noteRe.test(tok)) {
          // note symbol
          pendingNote = tok
          continue
        }
        if (/^\d+$/.test(tok) && pendingNote) {
          // duration
          const denom = Number(tok)
          if (!denom) {
            pendingNote = null
            continue
          }
          const durSec = (4 / denom) * (60 / tempo)
          const [, noteSym, octStr] = pendingNote.match(
            noteRe
          ) as RegExpMatchArray
          if (noteSym.toUpperCase() === 'R') {
            cur.events.push({
              freq: null,
              start: cur.offsetSec + cur.curSec,
              dur: durSec,
              waveform: cur.waveform,
              volume: cur.volume,
            })
          } else {
            const oct = octStr ? Number(octStr) : 4
            const freq = BuzzerPlayer.noteToFreq(
              `${noteSym[0].toUpperCase()}${noteSym.slice(1)}` as NoteSymbol,
              oct
            )
            cur.events.push({
              freq,
              start: cur.offsetSec + cur.curSec,
              dur: durSec,
              waveform: cur.waveform,
              volume: cur.volume,
            })
          }
          cur.curSec += durSec
          pendingNote = null
          continue
        }
        // unrecognised token — reset state
        pendingNote = null
      }
    }
    pushTrack()

    const all = tracks.flatMap((t) => t.events)
    all.sort((a, b) => a.start - b.start)

    console.info('parseScript', {
      tempo,
      waveform: this.options.waveform,
      volume: this.options.volume,
      tracks: all.length,
      events: all,
    })
    return all
  }

  /*──────────────────────────────────────────────────────────────────────────*/
  /*  Utility                                                                */
  /*──────────────────────────────────────────────────────────────────────────*/

  private static SEMITONE_MAP: Record<NoteSymbol, number> = {
    C: -9,
    'C#': -8,
    Db: -8,
    D: -7,
    'D#': -6,
    Eb: -6,
    E: -5,
    F: -4,
    'F#': -3,
    Gb: -3,
    G: -2,
    'G#': -1,
    Ab: -1,
    A: 0,
    'A#': 1,
    Bb: 1,
    B: 2,
  }

  private static noteToFreq(sym: NoteSymbol, octave: number): number {
    sym = sym.replace(/[A-G]B/g, (m) => m[0] + 'b') as NoteSymbol
    const semi = this.SEMITONE_MAP[sym]
    return 440 * Math.pow(2, (semi + 12 * (octave - 4)) / 12)
  }
}

export interface BuzzerPlayerOptions {
  volume?: number
  waveform?: OscillatorType
  tempo?: number
}

export interface RawEvent {
  freq: number | null
  start: number
  dur: number
  waveform: OscillatorType
  volume: number
}

export interface TrackMeta {
  offsetSec: number
  waveform: OscillatorType
  volume: number
  curSec: number
  events: RawEvent[]
}

export type NoteSymbol =
  | 'C'
  | 'C#'
  | 'Db'
  | 'D'
  | 'D#'
  | 'Eb'
  | 'E'
  | 'F'
  | 'F#'
  | 'Gb'
  | 'G'
  | 'G#'
  | 'Ab'
  | 'A'
  | 'A#'
  | 'Bb'
  | 'B'
