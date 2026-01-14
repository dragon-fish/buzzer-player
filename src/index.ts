/**
 * Buzzer Player - 一个用于播放蜂鸣器脚本的库
 * @packageDocumentation
 */

// 导出主类
export { BuzzerPlayer, BzsRuntimeError } from './BuzzerPlayer/BuzzerPlayer.js'

// 导出解析器和类型
export {
  BzsParser,
  type BzsAtom,
  type BzsNumber,
  type BzsDirectiveMap,
  type BzsLen,
  type BzsPitch,
  type BzsKeyValue,
  type BzsSeqItem,
  type BzsPattern,
  type BzsTrackParams,
  type BzsTrack,
  type BzsProgram,
  type BzsParseError,
} from './BuzzerPlayer/BzsParser.js'

// 导出诊断工具
export {
  collectBarlineAlignmentWarnings,
  parseTimeSignature,
  type TimeSignatureInfo,
} from './BuzzerPlayer/diagnostics.js'

// 导出播放器相关类型
export type {
  BuzzerPlayerOptions,
  NoteSymbol,
  TimelineEvent,
  BzsWaveform,
  EnvState,
  ArpState,
  VibState,
  SlideState,
} from './BuzzerPlayer/BuzzerPlayer.js'
