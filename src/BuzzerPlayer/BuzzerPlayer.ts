import { BzsParser } from './BzsParser.js'

/**
 * BuzzerPlayer.ts
 *
 * A simple buzzer player for the web, using the Web Audio API.
 * It can play buzzer scripts with multiple tracks, volume control, and
 * different waveforms.
 *
 * @license MIT
 * @author dragon-fish <dragon-fish@qq.com>
 * @author ChatGPT-o3 BzsParser
 * @author Claude-3.7 Debugging
 */

export class BuzzerPlayer {
  private ctx = new (window.AudioContext ||
    (window as any).webkitAudioContext)()
  private options: Required<BuzzerPlayerOptions>
  private scheduled: { osc: OscillatorNode; gain: GainNode }[] = []
  private playing = false
  readonly bzs = new BzsParser()

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
      // 改进休止符处理：检查频率是否为 null 或 NaN
      if (ev.freq === null) continue // 跳过休止符或无效频率

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
   *   Db4 8   → D‑flat octave 4, eighth‑note
   *   R 4     → rest, quarter‑note
   *
   *   NEW in 0.2.1: Parser tolerates barlines "|" and ignores stray tokens, so
   *   lines like "C4 4 D4 4 | E4 4 F4 4" now work correctly.
   * ```
   */
  parseScript(src: string): RawEvent[] {
    const ast = this.bzs.parse(src)

    const globalTempo = ast.globals.tempo ?? this.options.tempo
    const gWave = ast.globals.waveform ?? this.options.waveform
    const gVolume = ast.globals.volume ?? this.options.volume
    
    const events: RawEvent[] = []

    for (const track of ast.tracks) {
      const waveform = (track.waveform ?? gWave) as OscillatorType
      const volume = track.volume ?? gVolume
      const tempo = track.tempo ?? globalTempo  // 使用轨道特定的tempo或全局tempo
      const beatSec = 60 / tempo                // 基于轨道tempo计算节拍时长
      const offset = track.delay * beatSec

      let curSec = 0
      for (const tok of track.tokens) {
        const durSec = (4 / tok.duration) * beatSec // denom → seconds

        if (tok.note === 'R') {
          // rest
          events.push({
            freq: null,
            start: offset + curSec,
            dur: durSec,
            waveform,
            volume,
          })
        } else {
          const sym = tok.accidental
            ? (`${tok.note}${tok.accidental}` as NoteSymbol)
            : (tok.note as NoteSymbol)
          const octave = tok.octave ?? 4
          const freq = BuzzerPlayer.noteToFreq(sym, octave)

          events.push({
            freq,
            start: offset + curSec,
            dur: durSec,
            waveform,
            volume,
          })
        }
        curSec += durSec
      }
    }

    events.sort((a, b) => a.start - b.start)
    console.info('parseScript(result)', {
      ast,
      tempo: globalTempo,
      waveform: gWave,
      volume: gVolume,
      events,
    })
    return events
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
