import type { BzsAtom, BzsParseError, BzsSeqItem } from './BzsParser.js'

export type TimeSignatureInfo = {
  numerator: number
  denominator: number
  measureBeats: number
  raw: string
}

// BZS 当前时间模型：1 beat = 四分音符
export function parseTimeSignature(raw: BzsAtom | undefined): TimeSignatureInfo {
  const s = String(raw ?? '4/4').trim()
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  const numerator = m ? Number(m[1]) : 4
  const denominator = m ? Number(m[2]) : 4
  const n = Number.isFinite(numerator) && numerator > 0 ? Math.floor(numerator) : 4
  const d = Number.isFinite(denominator) && denominator > 0 ? Math.floor(denominator) : 4
  const measureBeats = n * (4 / d)
  return { numerator: n, denominator: d, measureBeats, raw: s }
}

export function collectBarlineAlignmentWarnings(args: {
  trackName: string
  expandedItems: BzsSeqItem[]
  timeSignatureRaw: BzsAtom | undefined
  // 允许上层按需提供更严格的阈值（例如基于 ticks_per_beat）
  epsilon?: number
}): BzsParseError[] {
  const { trackName, expandedItems } = args
  const eps = args.epsilon ?? 1e-6

  const ts = parseTimeSignature(args.timeSignatureRaw)
  const measureBeats = ts.measureBeats

  const warnings: BzsParseError[] = []
  if (!Number.isFinite(measureBeats) || measureBeats <= 0) {
    warnings.push({
      message: `time_signature=${ts.raw} 非法（将忽略小节线对齐检查）`,
    })
    return warnings
  }

  let curBeats = 0
  let barIndex = 0
  for (const it of expandedItems) {
    if (it.kind === 'bar') {
      barIndex++
      const k = Math.round(curBeats / measureBeats)
      const nearest = k * measureBeats
      const delta = curBeats - nearest
      if (Math.abs(delta) > eps) {
        warnings.push({
          message: `轨道 ${trackName}：第 ${barIndex} 个小节线 '|' 未对齐（time_signature=${ts.numerator}/${ts.denominator}，当前累计 ${curBeats} beats，偏差 ${delta} beats）`,
        })
      }
      continue
    }
    if (it.kind === 'note' || it.kind === 'rest' || it.kind === 'chord') {
      // 与 BuzzerPlayer.ts 保持一致：beats = 4/denom * dotFactor
      const base = 4 / it.len.denom
      const factor = it.len.dots === 2 ? 1.75 : it.len.dots === 1 ? 1.5 : 1
      curBeats += base * factor
      continue
    }
    // cmd/call/loop 在这里不应该出现（应已展开），但即使出现也不改变 beat 计数
  }

  return warnings
}

