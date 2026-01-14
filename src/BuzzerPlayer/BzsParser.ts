/**
 * BZS (Buzzer Script) v0.3.0 parser.
 *
 * - 使用 Langium（不再直接依赖 Chevrotain）
 * - 语法见 `bzs.langium`（通过 Vite `?raw` 作为字符串加载）
 * - 解析结果会先得到 “扁平元素流”，再做一次语义组装：
 *   - directives（globals）
 *   - patterns（@pattern ... @end）
 *   - tracks（@track ...）
 *   - loop（:loop/:endloop）结构化并可展开
 *   - call（:call）保留为节点，供上层展开/编译
 */

import { createServicesForGrammar } from 'langium/grammar'
import { URI } from 'langium'
import bzsGrammar from './bzs.langium?raw'

export type BzsNumber = number
export type BzsAtom = string | number

export type BzsDirectiveMap = Record<string, BzsAtom>

export type BzsLen = { denom: number; dots: 0 | 1 | 2 }
export type BzsPitch = { note: string; accidental: '#' | 'b' | null; octave: number }

export type BzsKeyValue = { kind: 'kv'; key: string; value: BzsAtom }

export type BzsSeqItem =
  | { kind: 'note'; pitch: BzsPitch; len: BzsLen }
  | { kind: 'rest'; len: BzsLen }
  | { kind: 'chord'; pitches: BzsPitch[]; len: BzsLen }
  | { kind: 'bar' }
  | { kind: 'cmd'; name: string; args: (BzsAtom | BzsKeyValue)[] }
  | { kind: 'call'; name: string }
  | { kind: 'loop'; count: number | 'inf'; body: BzsSeqItem[] }

export type BzsPattern = { name: string; items: BzsSeqItem[] }

export type BzsTrackParams = {
  delay: number
  waveform?: string
  volume?: number
  pan?: number
  channel?: number
  duty?: 12 | 25 | 50 | 75
  sample_bank?: string
  sample_rate?: number
}

export type BzsTrack = { name: string; params: BzsTrackParams; items: BzsSeqItem[] }

export type BzsProgram = {
  directives: BzsDirectiveMap
  patterns: Record<string, BzsPattern>
  tracks: BzsTrack[]
  errors: BzsParseError[]
  warnings: BzsParseError[]
}

export type BzsParseError = {
  message: string
  line?: number
  column?: number
}

type LangiumModel = {
  elements?: any[]
}

export class BzsParser {
  private servicesPromise = createServicesForGrammar({
    grammar: bzsGrammar,
    languageMetaData: {
      caseInsensitive: true,
      fileExtensions: ['.bzs'],
      languageId: 'bzs',
      mode: 'development',
    },
  })

  async parse(text: string): Promise<BzsProgram> {
    const services = await this.servicesPromise
    const uri = URI.parse('memory:/input.bzs')
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(text, uri)

    // 仅单文件：不需要 build workspace；parseResult 已经存在
    const model = doc.parseResult.value as LangiumModel

    const errors: BzsParseError[] = []
    for (const e of doc.parseResult.parserErrors ?? []) {
      errors.push({
        message: e.message ?? String(e),
        line: (e as any).token?.startLine,
        column: (e as any).token?.startColumn,
      })
    }

    const directives: BzsDirectiveMap = {}
    const patterns: Record<string, BzsPattern> = {}
    const tracks: BzsTrack[] = []
    const warnings: BzsParseError[] = []

    let currentTrack: BzsTrack | null = null
    let currentPattern: BzsPattern | null = null

    const flushTrack = () => {
      if (currentTrack) tracks.push(currentTrack)
      currentTrack = null
    }
    const flushPattern = () => {
      if (currentPattern) patterns[currentPattern.name] = currentPattern
      currentPattern = null
    }

    for (const el of model.elements ?? []) {
      const t = el?.$type as string | undefined
      if (!t) continue

      switch (t) {
        case 'Directive': {
          const key = String(el.key ?? '')
            .toLowerCase()
          if (!key) break
          directives[key] = this.readAtom(el.value)
          break
        }
        case 'PatternHeader': {
          flushPattern()
          const name = String(el.name ?? '')
          currentPattern = { name, items: [] }
          break
        }
        case 'PatternEnd': {
          flushPattern()
          break
        }
        case 'TrackHeader': {
          flushPattern()
          flushTrack()
          const name = String(el.name ?? 'main')
          currentTrack = {
            name,
            params: this.readTrackParams(el.params ?? [], errors),
            items: [],
          }
          break
        }
        default: {
          const item = this.readSeqItem(el, errors)
          if (!item) break
          if (currentPattern) currentPattern.items.push(item)
          else {
            if (!currentTrack) {
              // 不写 @track：允许落在隐式 main（虽然你说不需要向前兼容，但这样更好用）
              currentTrack = {
                name: 'main',
                params: this.readTrackParams([], errors),
                items: [],
              }
            }
            currentTrack.items.push(item)
          }
        }
      }
    }

    flushPattern()
    flushTrack()

    // 结构化 loop（把 :loop/:endloop token 转成嵌套节点）
    for (const p of Object.values(patterns)) {
      p.items = this.structurizeLoops(p.items, errors)
    }
    for (const tr of tracks) {
      tr.items = this.structurizeLoops(tr.items, errors)
    }

    return { directives, patterns, tracks, errors, warnings }
  }

  private readAtom(v: any): BzsAtom {
    if (v == null) return ''
    if (typeof v === 'number') return v
    const s = String(v)
    const n = Number(s)
    return Number.isFinite(n) && s.trim() !== '' ? n : s
  }

  private readLen(el: any, errors: BzsParseError[]): BzsLen | null {
    const denom = Number(el?.denom)
    if (!Number.isFinite(denom) || denom <= 0 || !Number.isInteger(denom)) {
      errors.push({ message: `非法 LEN denom: ${String(el?.denom)}` })
      return null
    }
    const dotsRaw = String(el?.dots ?? '')
    const dots = dotsRaw === '..' ? 2 : dotsRaw === '.' ? 1 : 0
    return { denom, dots }
  }

  private readPitch(el: any, errors: BzsParseError[]): BzsPitch | null {
    const raw =
      typeof el === 'string' ? el : typeof el?.value === 'string' ? el.value : String(el ?? '')
    const m = raw.match(/^([A-Ga-g])(#|b)?([0-9]+)$/)
    if (!m) {
      errors.push({ message: `非法音符: ${raw}` })
      return null
    }
    const note = m[1].toUpperCase()
    const accidental = (m[2] as '#' | 'b' | undefined) ?? null
    const octave = Number(m[3])
    if (!Number.isFinite(octave) || !Number.isInteger(octave)) {
      errors.push({ message: `音符 octave 非整数: ${raw}` })
      return null
    }
    return { note, accidental, octave }
  }

  private readTrackParams(params: any[], errors: BzsParseError[]): BzsTrackParams {
    const out: BzsTrackParams = { delay: 0 }
    for (const p of params ?? []) {
      const key = String(p?.key ?? '')
        .toLowerCase()
      const value = this.readAtom(p?.value)
      switch (key) {
        case 'delay':
          out.delay = Number(value) || 0
          break
        case 'waveform':
          out.waveform = String(value).toLowerCase()
          break
        case 'volume':
          out.volume = Number(value)
          break
        case 'pan':
          out.pan = Number(value)
          break
        case 'channel':
          out.channel = Number(value)
          break
        case 'duty': {
          const d = Number(value)
          if (d === 12 || d === 25 || d === 50 || d === 75) out.duty = d
          else errors.push({ message: `duty 仅支持 12/25/50/75，收到: ${String(value)}` })
          break
        }
        case 'sample_bank':
          out.sample_bank = String(value)
          break
        case 'sample_rate':
          out.sample_rate = Number(value)
          break
        default:
          // 允许扩展参数：忽略
          break
      }
    }
    return out
  }

  private readCommandArg(arg: any): BzsAtom | BzsKeyValue | null {
    if (arg == null) return null
    if (typeof arg === 'string' || typeof arg === 'number') return this.readAtom(arg)

    const t = arg?.$type as string | undefined
    if (t === 'CommandArgNode') {
      if (arg.kvKey != null) {
        return {
          kind: 'kv',
          key: String(arg.kvKey ?? '')
            .replace(/=$/, '')
            .toLowerCase(),
          value: this.readAtom(arg.kvValue),
        }
      }
      if (arg.value != null) return this.readAtom(arg.value)
    }
    // 兜底：尽量当作原子值
    return this.readAtom(arg)
  }

  private readSeqItem(el: any, errors: BzsParseError[]): BzsSeqItem | null {
    const t = el?.$type as string | undefined
    if (!t) return null

    switch (t) {
      case 'NoteEvent': {
        const pitch = this.readPitch(el.pitch, errors)
        const len = this.readLen(el.len, errors)
        if (!pitch || !len) return null
        return { kind: 'note', pitch, len }
      }
      case 'RestEvent': {
        const len = this.readLen(el.len, errors)
        if (!len) return null
        return { kind: 'rest', len }
      }
      case 'ChordEvent': {
        const pitches = (el.pitches ?? [])
          .map((p: any) => this.readPitch(p, errors))
          .filter(Boolean) as BzsPitch[]
        const len = this.readLen(el.len, errors)
        if (!len || pitches.length === 0) return null
        return { kind: 'chord', pitches, len }
      }
      case 'StateCommand': {
        const name = String(el.name ?? '').toLowerCase()
        const args = (el.args ?? [])
          .map((a: any) => this.readCommandArg(a))
          .filter(Boolean) as (BzsAtom | BzsKeyValue)[]
        return { kind: 'cmd', name, args }
      }
      case 'CallCommand': {
        const name = String(el.name ?? '')
        return { kind: 'call', name }
      }
      case 'LoopStart': {
        const c = el?.count
        const raw = typeof c === 'string' || typeof c === 'number' ? c : String(c ?? '')
        const count = raw === 'inf' ? 'inf' : Number(raw)
        return { kind: 'loop', count: count === 'inf' ? 'inf' : (count || 0), body: [] }
      }
      case 'LoopEnd': {
        // 作为 token 进入 loop 结构化流程
        return { kind: 'cmd', name: '__endloop__', args: [] }
      }
      case 'BarLine':
        return { kind: 'bar' }
      default:
        return null
    }
  }

  private structurizeLoops(items: BzsSeqItem[], errors: BzsParseError[]): BzsSeqItem[] {
    type Frame = { count: number | 'inf'; body: BzsSeqItem[] }
    const stack: Frame[] = []
    const out: BzsSeqItem[] = []

    const pushItem = (it: BzsSeqItem) => {
      const target = stack.length ? stack[stack.length - 1].body : out
      target.push(it)
    }

    for (const it of items) {
      if (it.kind === 'loop') {
        stack.push({ count: it.count, body: [] })
        continue
      }
      if (it.kind === 'cmd' && it.name === '__endloop__') {
        const frame = stack.pop()
        if (!frame) {
          errors.push({ message: `:endloop 不匹配（缺少 :loop）` })
          continue
        }
        pushItem({ kind: 'loop', count: frame.count, body: frame.body })
        continue
      }
      pushItem(it)
    }

    while (stack.length) {
      stack.pop()
      errors.push({ message: `:loop 不匹配（缺少 :endloop）` })
    }

    return out
  }
}
