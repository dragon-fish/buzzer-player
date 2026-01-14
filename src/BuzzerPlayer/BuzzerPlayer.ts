import {
  BzsParser,
  type BzsAtom,
  type BzsKeyValue,
  type BzsParseError,
  type BzsPitch,
  type BzsProgram,
  type BzsSeqItem,
} from './BzsParser.js'
import { collectBarlineAlignmentWarnings } from './diagnostics.js'

export class BuzzerPlayer {
  private ctx = new (window.AudioContext ||
    (window as any).webkitAudioContext)()
  readonly options: Required<BuzzerPlayerOptions>
  private scheduled: AudioNode[] = []
  private playing = false
  private preparing = false
  private _startTime = 0
  private _duration = 0
  private _program: BzsProgram | null = null
  private _timeline: TimelineEvent[] = []
  readonly bzs = new BzsParser()
  private pulseWaveCache = new Map<number, PeriodicWave>()
  private noiseBuffer: AudioBuffer | null = null

  constructor(opts: BuzzerPlayerOptions = {}) {
    this.options = {
      tempo: opts.tempo ?? 120,
      ticksPerBeat: opts.ticksPerBeat ?? 96,
      masterVolume: opts.masterVolume ?? 0.2,
      defaultWaveform: opts.defaultWaveform ?? 'pulse',
      maxScheduleSec: opts.maxScheduleSec ?? 60,
    }
  }

  /*──────────────────────────────────────────────────────────────────────────*/
  /*  Public API                                                             */
  /*──────────────────────────────────────────────────────────────────────────*/

  get state(): 'playing' | 'paused' | 'stopped' | 'preparing' {
    if (this.preparing) return 'preparing'
    if (this.ctx.state === 'suspended') return 'paused'
    return this.playing ? 'playing' : 'stopped'
  }

  get currentTime(): number {
    if (this.state === 'stopped' || this.state === 'preparing') return 0
    return this.ctx.currentTime - this._startTime
  }

  get duration(): number {
    return this._duration
  }

  get program(): BzsProgram | null {
    return this._program
  }

  get timeline(): TimelineEvent[] {
    return this._timeline
  }

  async load(script: string): Promise<BzsProgram> {
    const program = await this.bzs.parse(script)
    this._program = program
    this._timeline = this.compile(program)
    const last = this._timeline[this._timeline.length - 1]
    this._duration = last ? last.endSec ?? last.startSec + last.durSec : 0
    return program
  }

  async playScript(script: string, fromTime = 0): Promise<void> {
    if (this.playing) await this.stop()
    this.preparing = true

    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume()

      const program = await this.load(script)

      if (program.errors.length) {
        throw new BzsRuntimeError('BZS 解析失败', program.errors)
      }

      if (!this._timeline.length) {
        this.preparing = false
        return
      }

      // Calculate start time offset for seeking
      const offset = Math.max(0, Math.min(fromTime, this._duration))
      this._startTime = this.ctx.currentTime + 0.05 - offset
      const startAt = this._startTime

      this.playing = true
      this.preparing = false

      for (const ev of this._timeline) {
        if (ev.kind === 'rest') continue
        // Skip events that have already ended
        if (ev.endSec! <= offset) continue
        this.scheduleVoice(ev, startAt)
      }

      // 返回播放进度的 Promise
      return new Promise<void>((resolve) => {
        const checkEnd = () => {
          if (!this.playing) {
            resolve()
            return
          }
          if (this.ctx.currentTime >= startAt + this._duration) {
            this.playing = false
            resolve()
          } else {
            setTimeout(checkEnd, 100)
          }
        }
        checkEnd()
      })
    } catch (e) {
      this.preparing = false
      this.playing = false
      throw e
    }
  }

  async pause(): Promise<void> {
    if (this.ctx.state === 'running') {
      await this.ctx.suspend()
    }
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
  }

  async stop(): Promise<void> {
    for (const n of this.scheduled) {
      try {
        ;(n as any).stop?.()
        n.disconnect()
      } catch (_) {}
    }
    this.scheduled = []
    this.playing = false
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  async seek(targetTime: number): Promise<void> {
    if (!this._timeline.length || !this._program) return

    const wasPlaying = this.playing
    const wasPaused = this.ctx.state === 'suspended'

    // Stop all currently scheduled audio
    for (const n of this.scheduled) {
      try {
        ;(n as any).stop?.()
        n.disconnect()
      } catch (_) {}
    }
    this.scheduled = []

    if (!wasPlaying) {
      // If not playing, just update internal state for visual feedback
      this._startTime = this.ctx.currentTime - targetTime
      return
    }

    // If paused, just update position without resuming
    if (wasPaused) {
      // Need to temporarily resume to get accurate currentTime, then pause again
      await this.ctx.resume()
      const newStartTime = this.ctx.currentTime - targetTime
      this._startTime = newStartTime

      // Reschedule events for when playback resumes
      for (const ev of this._timeline) {
        if (ev.kind === 'rest') continue
        if (ev.endSec! <= targetTime) continue
        this.scheduleVoice(ev, newStartTime)
      }

      // Pause again
      await this.ctx.suspend()
      return
    }

    // Reschedule from new position (playing state)
    const newStartTime = this.ctx.currentTime - targetTime
    this._startTime = newStartTime

    // Schedule all events that haven't finished yet
    for (const ev of this._timeline) {
      if (ev.kind === 'rest') continue
      if (ev.endSec! <= targetTime) continue // Already passed
      this.scheduleVoice(ev, newStartTime)
    }
  }

  async destroy(): Promise<void> {
    await this.stop()
    await this.ctx.close()
  }

  /*──────────────────────────────────────────────────────────────────────────*/
  /*  Compile: BZS Program -> Timeline                                        */
  /*──────────────────────────────────────────────────────────────────────────*/

  private compile(program: BzsProgram): TimelineEvent[] {
    const getNum = (key: string, fallback: number) => {
      const v = program.directives[key]
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : fallback
    }

    const baseTempo = getNum('tempo', this.options.tempo)
    const ticksPerBeat = getNum('ticks_per_beat', this.options.ticksPerBeat)
    // 兼容 demos：若没写 master_volume，允许用旧的 volume 作为全局 master
    const masterVolume = clamp(
      getNum('master_volume', getNum('volume', this.options.masterVolume)),
      0,
      1
    )
    const defaultWaveform = String(
      program.directives['waveform'] ?? this.options.defaultWaveform
    ).toLowerCase()
    const timeSignatureRaw = program.directives['time_signature']

    const patterns = program.patterns
    const allEvents: TimelineEvent[] = []

    for (const tr of program.tracks) {
      const initTempo = baseTempo
      const beatSec0 = 60 / initTempo
      const trackOffsetSec = (tr.params.delay ?? 0) * beatSec0

      const waveform = normalizeWaveform(tr.params.waveform ?? defaultWaveform)
      const duty = tr.params.duty ?? 50
      const baseVol = clamp(tr.params.volume ?? 1.0, 0, 1)
      const pan = tr.params.pan

      const expanded = this.expandSequence(
        tr.items,
        patterns,
        this.options.maxScheduleSec,
        initTempo
      )
      // 方案 A：拍号仅用于可读性/对齐检查（不影响播放）
      program.warnings?.push(
        ...collectBarlineAlignmentWarnings({
          trackName: tr.name,
          expandedItems: expanded,
          timeSignatureRaw,
        })
      )

      const state: TrackState = {
        tempo: initTempo,
        ticksPerBeat,
        gate: 1,
        volMul: 1,
        env: null,
        arp: null,
        vib: null,
        slide: null,
        lastFreq: null,
        noise: {},
      }

      let curSec = 0
      for (const it of expanded) {
        if (it.kind === 'cmd') {
          this.applyCommand(it, state)
          continue
        }
        if (it.kind === 'bar') continue
        if (it.kind === 'rest') {
          const beatSec = 60 / state.tempo
          const durSec = lenToBeats(it.len) * beatSec
          const startSec = trackOffsetSec + curSec
          allEvents.push({ kind: 'rest', startSec, durSec })
          curSec += durSec
          continue
        }

        if (it.kind === 'note') {
          const beatSec = 60 / state.tempo
          const durSec = lenToBeats(it.len) * beatSec
          const startSec = trackOffsetSec + curSec
          const freq = pitchToFreq(it.pitch)
          allEvents.push({
            kind: 'tone',
            startSec,
            durSec,
            freq,
            pitch: it.pitch,
            waveform,
            duty,
            volume: masterVolume * baseVol * state.volMul,
            gate: clamp(state.gate, 0, 1),
            env: state.env,
            vib: state.vib,
            arp: state.arp,
            slide: state.slide,
            lastFreq: state.lastFreq,
            ticksPerBeat: state.ticksPerBeat,
            tempo: state.tempo,
            pan,
          })
          state.lastFreq = freq
          curSec += durSec
          continue
        }

        if (it.kind === 'chord') {
          const beatSec = 60 / state.tempo
          const durSec = lenToBeats(it.len) * beatSec
          const startSec = trackOffsetSec + curSec
          const freqs = it.pitches.map(pitchToFreq)
          allEvents.push({
            kind: 'chord',
            startSec,
            durSec,
            freqs,
            pitches: it.pitches,
            waveform,
            duty,
            volume: masterVolume * baseVol * state.volMul,
            gate: clamp(state.gate, 0, 1),
            env: state.env,
            vib: state.vib,
            slide: state.slide,
            ticksPerBeat: state.ticksPerBeat,
            tempo: state.tempo,
            pan,
          })
          state.lastFreq = freqs[0] ?? state.lastFreq
          curSec += durSec
          continue
        }
      }
    }

    allEvents.sort((a, b) => a.startSec - b.startSec)
    // 额外填充一个 endSec，方便 playScript 等待
    const out: TimelineEvent[] = allEvents.map((e) => ({
      ...e,
      endSec: e.startSec + e.durSec,
    }))
    return out
  }

  private expandSequence(
    items: BzsSeqItem[],
    patterns: Record<string, { name: string; items: BzsSeqItem[] }>,
    maxScheduleSec: number,
    initTempo: number,
    depth = 0
  ): BzsSeqItem[] {
    if (depth > 16) throw new Error('pattern 递归过深')

    const out: BzsSeqItem[] = []
    const beatSec0 = 60 / initTempo
    const maxBeats = maxScheduleSec / beatSec0

    let beatsAcc = 0
    const pushItem = (it: BzsSeqItem) => {
      out.push(it)
      if (it.kind === 'note' || it.kind === 'rest' || it.kind === 'chord') {
        beatsAcc += lenToBeats(it.len)
      }
    }

    for (const it of items) {
      if (beatsAcc >= maxBeats) break

      if (it.kind === 'call') {
        const p = patterns[it.name]
        if (!p) throw new Error(`未知 pattern: ${it.name}`)
        const expanded = this.expandSequence(
          p.items,
          patterns,
          maxScheduleSec,
          initTempo,
          depth + 1
        )
        for (const x of expanded) pushItem(x)
        continue
      }
      if (it.kind === 'loop') {
        if (it.count === 'inf') {
          while (beatsAcc < maxBeats) {
            const expanded = this.expandSequence(
              it.body,
              patterns,
              maxScheduleSec,
              initTempo,
              depth + 1
            )
            for (const x of expanded) pushItem(x)
            // 如果 body 没有任何耗时事件，避免死循环
            if (
              !expanded.some(
                (x) =>
                  x.kind === 'note' || x.kind === 'rest' || x.kind === 'chord'
              )
            )
              break
          }
        } else {
          const n = Math.max(0, Math.floor(it.count))
          for (let i = 0; i < n && beatsAcc < maxBeats; i++) {
            const expanded = this.expandSequence(
              it.body,
              patterns,
              maxScheduleSec,
              initTempo,
              depth + 1
            )
            for (const x of expanded) pushItem(x)
          }
        }
        continue
      }
      pushItem(it)
    }

    return out
  }

  private applyCommand(
    cmd: Extract<BzsSeqItem, { kind: 'cmd' }>,
    state: TrackState
  ) {
    const a0 = cmd.args[0]
    const kv = (k: string): BzsAtom | undefined => {
      for (const a of cmd.args) {
        if (typeof a === 'object' && a && (a as BzsKeyValue).kind === 'kv') {
          const kv = a as BzsKeyValue
          if (kv.key === k) return kv.value
        }
      }
      return undefined
    }

    switch (cmd.name) {
      case 'gate': {
        if (typeof a0 === 'string' && a0.toLowerCase() === 'off') state.gate = 1
        else state.gate = clamp(Number(a0), 0, 1)
        break
      }
      case 'vol': {
        state.volMul = clamp(Number(a0), 0, 1)
        break
      }
      case 'tempo': {
        const t = Number(a0)
        if (Number.isFinite(t) && t > 0) state.tempo = t
        break
      }
      case 'env': {
        if (typeof a0 === 'string') {
          state.env = { kind: 'preset', name: a0.toLowerCase() }
          break
        }
        const a = Number(kv('a') ?? 0)
        const d = Number(kv('d') ?? 0)
        const s = clamp(Number(kv('s') ?? 1), 0, 1)
        const r = Number(kv('r') ?? 0)
        state.env = { kind: 'adsr', a, d, s, r }
        break
      }
      case 'arp': {
        if (typeof a0 === 'string' && a0.toLowerCase() === 'off') {
          state.arp = null
          break
        }
        const positional = cmd.args.filter((a) => !isKv(a)) as BzsAtom[]
        const mode = String(positional[0] ?? 'semi').toLowerCase()
        const rate = Number(kv('rate') ?? 6)
        const x = positional[1]
        const y = positional[2]
        state.arp = {
          mode: mode === 'note' ? 'note' : 'semi',
          x: x ?? 0,
          y: y ?? 0,
          rate: Number.isFinite(rate) && rate > 0 ? rate : 6,
        }
        break
      }
      case 'vib': {
        if (typeof a0 === 'string' && a0.toLowerCase() === 'off') {
          state.vib = null
          break
        }
        const depth = Number(kv('depth') ?? 0)
        const rate = Number(kv('rate') ?? 8)
        state.vib = {
          depth: Number.isFinite(depth) ? depth : 0,
          rate: Number.isFinite(rate) && rate > 0 ? rate : 8,
        }
        break
      }
      case 'slide': {
        if (typeof a0 === 'string' && a0.toLowerCase() === 'off') {
          state.slide = null
          break
        }
        const time = kv('time')
        const speed = kv('speed')
        if (time != null) {
          const t = Number(time)
          state.slide = { mode: 'time', time: Number.isFinite(t) ? t : 0 }
        } else if (speed != null) {
          const s = Number(speed)
          state.slide = { mode: 'speed', speed: Number.isFinite(s) ? s : 0 }
        }
        break
      }
      case 'noise': {
        const mode = kv('mode')
        const pitch = kv('pitch')
        if (mode != null) state.noise.mode = String(mode)
        if (pitch != null) state.noise.pitch = Number(pitch)
        break
      }
      default:
        // 未知命令：先忽略（后续可加 validator 强制报错）
        break
    }
  }

  /*──────────────────────────────────────────────────────────────────────────*/
  /*  Scheduling                                                             */
  /*──────────────────────────────────────────────────────────────────────────*/

  private scheduleVoice(
    ev: Exclude<TimelineEvent, { kind: 'rest' }>,
    startAt: number
  ) {
    const when = startAt + ev.startSec
    const beatSec = 60 / ev.tempo
    const tickSec = beatSec / ev.ticksPerBeat
    const soundDur = ev.durSec * clamp(ev.gate ?? 1, 0, 1)
    const releaseSec = this.envReleaseSec(ev.env, tickSec)
    const stopAt = when + soundDur + releaseSec + 0.02

    const dst = this.ctx.destination
    const gain = this.ctx.createGain()
    gain.gain.value = 0

    let outNode: AudioNode = gain
    if (
      typeof ev.pan === 'number' &&
      Number.isFinite(ev.pan) &&
      (this.ctx as any).createStereoPanner
    ) {
      const panner = (this.ctx as any).createStereoPanner() as StereoPannerNode
      panner.pan.value = clamp(ev.pan, -1, 1)
      gain.connect(panner)
      outNode = panner
    }
    outNode.connect(dst)

    if (ev.kind === 'tone') {
      if (ev.waveform === 'noise') {
        const { src, filter } = this.createNoiseSource(when, ev.freq)
        src.connect(filter)
        filter.connect(gain)
        this.applyEnvelope(
          gain.gain,
          when,
          ev.volume,
          soundDur,
          tickSec,
          ev.env
        )
        src.start(when)
        src.stop(stopAt)
        this.scheduled.push(src, filter, gain, outNode)
        return
      }

      const osc = this.createSourceOsc(ev.waveform, ev.duty)
      this.applyPitchAutomation(osc, ev, when, tickSec, soundDur)
      this.applyVibrato(osc, ev, when, stopAt, tickSec)
      osc.connect(gain)
      this.applyEnvelope(gain.gain, when, ev.volume, soundDur, tickSec, ev.env)
      osc.start(when)
      osc.stop(stopAt)
      this.scheduled.push(osc, gain, outNode)
      return
    }

    if (ev.kind === 'chord') {
      if (ev.waveform === 'noise') {
        const center = ev.freqs[0] ?? 440
        const { src, filter } = this.createNoiseSource(when, center)
        src.connect(filter)
        filter.connect(gain)
        this.applyEnvelope(
          gain.gain,
          when,
          ev.volume,
          soundDur,
          tickSec,
          ev.env
        )
        src.start(when)
        src.stop(stopAt)
        this.scheduled.push(src, filter, gain, outNode)
        return
      }

      // 简单多振荡器叠加
      for (const f of ev.freqs) {
        const osc = this.createSourceOsc(ev.waveform, ev.duty)
        osc.frequency.setValueAtTime(f, when)
        this.applyVibrato(osc, ev, when, stopAt, tickSec)
        osc.connect(gain)
        osc.start(when)
        osc.stop(stopAt)
        this.scheduled.push(osc)
      }
      this.applyEnvelope(gain.gain, when, ev.volume, soundDur, tickSec, ev.env)
      this.scheduled.push(gain, outNode)
      return
    }
  }

  private createSourceOsc(
    waveform: Exclude<BzsWaveform, 'noise'>,
    duty: number
  ): OscillatorNode {
    const osc = this.ctx.createOscillator()
    if (waveform === 'pulse') {
      const wave = this.getPulseWave(duty)
      osc.setPeriodicWave(wave)
      return osc
    }
    osc.type = waveform
    return osc
  }

  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const sr = this.ctx.sampleRate
    const len = sr // 1s
    const buf = this.ctx.createBuffer(1, len, sr)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf
    return buf
  }

  private createNoiseSource(
    when: number,
    centerFreq: number
  ): { src: AudioBufferSourceNode; filter: BiquadFilterNode } {
    const src = this.ctx.createBufferSource()
    src.buffer = this.getNoiseBuffer()
    src.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(clamp(centerFreq, 40, 12000), when)
    filter.Q.setValueAtTime(2, when)

    return { src, filter }
  }

  private getPulseWave(dutyPercent: number): PeriodicWave {
    const d =
      dutyPercent === 12
        ? 12
        : dutyPercent === 25
        ? 25
        : dutyPercent === 75
        ? 75
        : 50
    const cached = this.pulseWaveCache.get(d)
    if (cached) return cached

    const duty = d / 100
    const harmonics = 64
    const real = new Float32Array(harmonics + 1)
    const imag = new Float32Array(harmonics + 1)
    for (let n = 1; n <= harmonics; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
      real[n] = 0
    }
    const wave = this.ctx.createPeriodicWave(real, imag, {
      disableNormalization: false,
    })
    this.pulseWaveCache.set(d, wave)
    return wave
  }

  private applyEnvelope(
    param: AudioParam,
    when: number,
    peak: number,
    sustainDur: number,
    tickSec: number,
    env: EnvState | null
  ) {
    const peakGain = clamp(peak, 0, 1)
    const { aSec, dSec, sLevel, rSec } = this.resolveEnv(env, tickSec)

    param.cancelScheduledValues(when)
    param.setValueAtTime(0, when)

    const attackEnd = when + aSec
    const decayEnd = attackEnd + dSec
    const noteOff = when + sustainDur

    if (aSec > 0) param.linearRampToValueAtTime(peakGain, attackEnd)
    else param.setValueAtTime(peakGain, when)

    const sustainGain = peakGain * sLevel
    if (dSec > 0) param.linearRampToValueAtTime(sustainGain, decayEnd)
    else param.setValueAtTime(sustainGain, attackEnd)

    // sustain
    param.setValueAtTime(sustainGain, Math.max(decayEnd, noteOff))
    // release
    param.linearRampToValueAtTime(0, noteOff + rSec)
  }

  private envReleaseSec(env: EnvState | null, tickSec: number): number {
    const { rSec } = this.resolveEnv(env, tickSec)
    return rSec
  }

  private resolveEnv(
    env: EnvState | null,
    tickSec: number
  ): { aSec: number; dSec: number; sLevel: number; rSec: number } {
    if (!env) {
      return { aSec: 0.002, dSec: 0.01, sLevel: 1, rSec: 0.01 }
    }
    if (env.kind === 'preset') {
      switch (env.name) {
        case 'pluck':
          return { aSec: 0, dSec: 12 * tickSec, sLevel: 0.2, rSec: 8 * tickSec }
        case 'lead':
          return {
            aSec: 2 * tickSec,
            dSec: 8 * tickSec,
            sLevel: 0.7,
            rSec: 8 * tickSec,
          }
        case 'pad':
          return {
            aSec: 12 * tickSec,
            dSec: 12 * tickSec,
            sLevel: 0.8,
            rSec: 16 * tickSec,
          }
        case 'perc':
          return { aSec: 0, dSec: 6 * tickSec, sLevel: 0, rSec: 6 * tickSec }
        default:
          return { aSec: 0.002, dSec: 0.01, sLevel: 1, rSec: 0.01 }
      }
    }
    return {
      aSec: Math.max(0, env.a) * tickSec,
      dSec: Math.max(0, env.d) * tickSec,
      sLevel: clamp(env.s, 0, 1),
      rSec: Math.max(0, env.r) * tickSec,
    }
  }

  private applyPitchAutomation(
    osc: OscillatorNode,
    ev: Extract<TimelineEvent, { kind: 'tone' }>,
    when: number,
    tickSec: number,
    soundDur: number
  ) {
    const target = ev.freq
    // slide
    if (ev.slide && ev.lastFreq && Number.isFinite(ev.lastFreq)) {
      osc.frequency.setValueAtTime(ev.lastFreq, when)
      if (ev.slide.mode === 'time') {
        const t = Math.max(0, ev.slide.time) * tickSec
        osc.frequency.linearRampToValueAtTime(
          target,
          when + Math.min(t, soundDur)
        )
      } else if (ev.slide.mode === 'speed') {
        const semi = freqToSemitoneDelta(ev.lastFreq, target)
        const t = (Math.abs(semi) / Math.max(1e-6, ev.slide.speed)) * tickSec
        osc.frequency.linearRampToValueAtTime(
          target,
          when + Math.min(t, soundDur)
        )
      } else {
        osc.frequency.setValueAtTime(target, when)
      }
    } else {
      osc.frequency.setValueAtTime(target, when)
    }

    // arp（在 slide 之后覆盖频率序列）
    if (ev.arp && ev.arp.rate > 0) {
      const rateSec = ev.arp.rate * tickSec
      const seqFreqs = this.resolveArpFreqs(ev)
      if (seqFreqs.length) {
        let t = when
        let i = 0
        while (t < when + soundDur - 1e-6) {
          osc.frequency.setValueAtTime(seqFreqs[i % seqFreqs.length], t)
          t += rateSec
          i++
        }
      }
    }
  }

  private resolveArpFreqs(
    ev: Extract<TimelineEvent, { kind: 'tone' }>
  ): number[] {
    const arp = ev.arp
    if (!arp) return []
    if (arp.mode === 'semi') {
      const x = Number(arp.x) || 0
      const y = Number(arp.y) || 0
      return [ev.freq, semitoneShift(ev.freq, x), semitoneShift(ev.freq, y)]
    }
    // note 模式：x/y 给绝对音高（如 E4 G4）
    const xPitch = typeof arp.x === 'string' ? parsePitchLiteral(arp.x) : null
    const yPitch = typeof arp.y === 'string' ? parsePitchLiteral(arp.y) : null
    const out = [ev.freq]
    if (xPitch) out.push(pitchToFreq(xPitch))
    if (yPitch) out.push(pitchToFreq(yPitch))
    return out
  }

  private applyVibrato(
    osc: OscillatorNode,
    ev: Extract<TimelineEvent, { kind: 'tone' | 'chord' }>,
    when: number,
    stopAt: number,
    tickSec: number
  ) {
    if (!ev.vib) return
    const depthCents = ev.vib.depth * 100
    if (!Number.isFinite(depthCents) || depthCents === 0) return
    const lfoHz = 1 / (Math.max(1e-6, ev.vib.rate) * tickSec)

    const lfo = this.ctx.createOscillator()
    const lfoGain = this.ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.value = lfoHz
    lfoGain.gain.value = depthCents
    lfo.connect(lfoGain)
    lfoGain.connect(osc.detune)
    lfo.start(when)
    lfo.stop(stopAt)
    this.scheduled.push(lfo, lfoGain)
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

  static noteToFreq(sym: NoteSymbol, octave: number): number {
    sym = sym.replace(/[A-G]B/g, (m) => m[0] + 'b') as NoteSymbol
    const semi = this.SEMITONE_MAP[sym]
    return 440 * Math.pow(2, (semi + 12 * (octave - 4)) / 12)
  }
}

export interface BuzzerPlayerOptions {
  tempo?: number
  ticksPerBeat?: number
  masterVolume?: number
  defaultWaveform?: BzsWaveform | string
  maxScheduleSec?: number
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

export class BzsRuntimeError extends Error {
  errors: BzsParseError[]
  constructor(message: string, errors: BzsParseError[]) {
    super(message)
    this.name = 'BzsRuntimeError'
    this.errors = errors
  }
}

export type BzsWaveform = OscillatorType | 'pulse' | 'noise'

type TrackState = {
  tempo: number
  ticksPerBeat: number
  gate: number
  volMul: number
  env: EnvState | null
  arp: ArpState | null
  vib: VibState | null
  slide: SlideState | null
  lastFreq: number | null
  noise: { mode?: string; pitch?: number }
}

export type EnvState =
  | { kind: 'preset'; name: string }
  | { kind: 'adsr'; a: number; d: number; s: number; r: number }

export type ArpState = {
  mode: 'semi' | 'note'
  x: BzsAtom
  y: BzsAtom
  rate: number
}

export type VibState = { depth: number; rate: number }

export type SlideState =
  | { mode: 'time'; time: number }
  | { mode: 'speed'; speed: number }

export type TimelineEvent =
  | { kind: 'rest'; startSec: number; durSec: number; endSec?: number }
  | {
      kind: 'tone'
      startSec: number
      durSec: number
      endSec?: number
      freq: number
      pitch?: BzsPitch
      waveform: BzsWaveform
      duty: number
      volume: number
      gate: number
      env: EnvState | null
      vib: VibState | null
      arp: ArpState | null
      slide: SlideState | null
      lastFreq: number | null
      ticksPerBeat: number
      tempo: number
      pan?: number
    }
  | {
      kind: 'chord'
      startSec: number
      durSec: number
      endSec?: number
      freqs: number[]
      pitches?: BzsPitch[]
      waveform: BzsWaveform
      duty: number
      volume: number
      gate: number
      env: EnvState | null
      vib: VibState | null
      slide: SlideState | null
      ticksPerBeat: number
      tempo: number
      pan?: number
    }

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function isKv(v: unknown): v is BzsKeyValue {
  return typeof v === 'object' && !!v && (v as any).kind === 'kv'
}

function normalizeWaveform(w: string): BzsWaveform {
  const x = String(w ?? '').toLowerCase()
  if (x === 'square') return 'pulse'
  if (x === 'saw') return 'sawtooth'
  if (x === 'pulse' || x === 'noise') return x
  if (x === 'sine' || x === 'triangle' || x === 'sawtooth') return x
  return 'pulse'
}

function lenToBeats(len: { denom: number; dots: 0 | 1 | 2 }) {
  const base = 4 / len.denom
  const factor = len.dots === 2 ? 1.75 : len.dots === 1 ? 1.5 : 1
  return base * factor
}

function pitchToFreq(p: BzsPitch): number {
  const sym = (p.accidental ? `${p.note}${p.accidental}` : p.note) as NoteSymbol
  return BuzzerPlayer.noteToFreq(sym, p.octave)
}

function semitoneShift(freq: number, semis: number): number {
  return freq * Math.pow(2, semis / 12)
}

function freqToSemitoneDelta(from: number, to: number): number {
  return 12 * Math.log2(to / from)
}

function parsePitchLiteral(s: string): BzsPitch | null {
  const m = String(s).match(/^([A-Ga-g])(#|b)?([0-9]+)$/)
  if (!m) return null
  return {
    note: m[1].toUpperCase(),
    accidental: (m[2] as any) ?? null,
    octave: Number(m[3]),
  }
}
