# Buzzer Player

> **Lightweight WebAudio library for browser‑side "buzzer" melodies**

![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat)
![TypeScript](https://img.shields.io/badge/built_with-TypeScript-blue?style=flat)

Buzzer Player turns your browser into a retro buzzer: feed it a terse **Buzzer Script (BZS)** text file and it schedules precise, sample‑accurate notes via the Web Audio API.

Now supports **multi‑track canons** with per‑voice delay, waveform & volume! 🎶

## 🎮 在线演示 | Online Demo

**[https://dragon-fish.github.io/buzzer-player/](https://dragon-fish.github.io/buzzer-player/)**

体验完整的在线编辑器，内置项目管理、实时预览和多个示例乐谱。

## ✨ 核心功能 | Core Features

### 播放器引擎

- 🎼 简洁的文本记谱法 (`C4 4`, `R 2`, 指令)
- 🎛 多轨道支持 – `@track` 块实现复调与卡农
- ⏱ 精确定时 – 使用 Web Audio API 的 future scheduling
- 🔊 全局/局部的 `waveform`、`volume`、`tempo` 控制
- 🎚 ADSR 包络、琶音、颤音、滑音等音效
- 🛑 `stop()` & `destroy()` 无内存泄漏
- 🟥 轻量级 – 无依赖，包含 TypeScript 类型

### Web 应用 (v0.3)

- 📁 **项目管理系统** – LocalStorage 自动保存
  - 新建、重命名、复制、删除工程
  - 工程使用唯一 ID，支持重名
  - 内置只读示例乐谱（可复制为新工程）
- 📥📤 **导入/导出** – `.bzs` 文件格式
- ⚙️ **实时设置** – 音量、BPM、波形调整
- 🎹 **实时预览** – 编辑即显示音符时间线和 AST
- 🎨 **现代化 UI** – 深色/浅色主题自适应

## 🚀 安装 | Install

### 作为 npm 包使用

```bash
npm install buzzer-player
```

或使用 yarn / pnpm：

```bash
yarn add buzzer-player
pnpm add buzzer-player
```

### TypeScript 支持

Buzzer Player 完全使用 TypeScript 编写，自带类型声明文件，无需额外安装 `@types` 包。

## 🔧 快速开始 | Quick Start

### 基础使用

```ts
import { BuzzerPlayer } from 'buzzer-player'

const jingle = `
// Power‑up
tempo    = 140
waveform = square
volume   = 0.3

:gate 0.8
C5 8 E5 8 G5 8 C6 4 R 8
`

const player = new BuzzerPlayer()
playBtn.onclick = () => player.playScript(jingle)
stopBtn.onclick = () => player.stop()
```

### 导入类型

```ts
import { 
  BuzzerPlayer, 
  BzsParser,
  type BzsProgram,
  type TimelineEvent,
  type BuzzerPlayerOptions 
} from 'buzzer-player'

// 自定义播放器选项
const player = new BuzzerPlayer({
  tempo: 120,
  ticksPerBeat: 96,
  masterVolume: 0.2,
  defaultWaveform: 'pulse'
})

// 解析 BZS 脚本
const parser = new BzsParser()
const program: BzsProgram = await parser.parse(script)

// 加载并播放
await player.load(script)
await player.play()
```

### CommonJS 支持

```js
const { BuzzerPlayer } = require('buzzer-player')

const player = new BuzzerPlayer()
// ... 使用方法相同
```

> **注意:** 浏览器需要用户手势（点击/触摸）才能播放音频。

## 📖 BZS 语法速览 | BZS Syntax

### 全局指令

```bzs
// 使用 key=value 格式
tempo           = 120       // BPM
master_volume   = 0.5       // 主音量 (0-1)
waveform        = sine      // 默认波形: sine | triangle | sawtooth | pulse | noise
ticks_per_beat  = 96        // 时间精度
time_signature  = 4/4       // 拍号（用于对齐检查）
```

### 轨道

```bzs
@track melody delay=0 waveform=sine volume=0.8
C4 4 D4 4 | E4 4 F4 4 |

@track bass delay=8 waveform=triangle volume=0.6
C2 2 G2 2 |
```

- `delay` – 延迟开始的拍数
- 支持多轨道复调和卡农

### 音符与休止符

```bzs
C#4 8     // C升，八分音符
Db4 8.    // D降，附点八分音符
R 4       // 四分休止符
[ C4 E4 G4 ] 2   // 和弦（二分音符）
```

**格式**: `<音名><升降号?><八度> <分母><点?>`

- 分母：`1`=全音符, `2`=二分, `4`=四分, `8`=八分, `16`=十六分
- 点音符：`8.` = 附点一次(×1.5), `8..` = 附点两次(×1.75)

### 命令

```bzs
:tempo 140        // 改变速度
:gate 0.8         // 音符长度比例 (0-1)
:vol 0.5          // 音量倍数
:env pluck        // 包络预设: pluck | lead | pad | perc
:env a=2 d=8 s=0.7 r=8  // ADSR 包络 (单位: ticks)
:arp semi 4 7 rate=6     // 琶音 (半音)
:vib depth=0.5 rate=8    // 颤音
:slide time=12    // 滑音（时间）
:slide speed=4    // 滑音（速度）
```

**关闭效果**: `:gate off`, `:arp off`, `:vib off`, `:slide off`

### 模式与循环

```bzs
@pattern intro
C4 4 E4 4 G4 4 C5 4
@end

@track melody
:call intro           // 调用模式
:loop 2               // 循环 2 次
  C4 8 D4 8 E4 8 F4 8
:endloop
```

### 完整示例：《生日快乐》

```bzs
// Happy Birthday
tempo    = 160
waveform = square
volume   = 0.25

:gate 0.75

// Happy birthday to you
C4 8 C4 8 D4 4 C4 4 | F4 4 E4 4 R 4 |

// Happy birthday to you
C4 8 C4 8 D4 4 C4 4 | G4 4 F4 4 R 4 |

// Happy birthday dear [name]
C4 8 C4 8 C5 4 A4 4 | F4 4 E4 4 D4 4 |

// Happy birthday to you
Bb4 8 Bb4 8 A4 4 F4 4 | G4 4 F4 4 R 4 |
```

更多示例见 [./public/demos](./public/demos) 文件夹，包括贝多芬第五交响曲、俄罗斯方块主题曲等。

---

## 📚 API 文档

```ts
const player = new BuzzerPlayer(options?: BuzzerPlayerOptions)

// 加载并解析脚本
await player.load(script: string): Promise<BzsProgram>

// 播放脚本
await player.playScript(script: string, fromTime?: number): Promise<void>

// 控制播放
await player.pause(): Promise<void>
await player.resume(): Promise<void>
await player.stop(): Promise<void>
await player.seek(time: number): Promise<void>

// 销毁实例
await player.destroy(): Promise<void>

// 状态查询
player.state: 'playing' | 'paused' | 'stopped' | 'preparing'
player.currentTime: number
player.duration: number
player.program: BzsProgram | null
player.timeline: TimelineEvent[]
```

### BuzzerPlayerOptions

```ts
interface BuzzerPlayerOptions {
  tempo?: number // 默认 BPM (默认: 120)
  ticksPerBeat?: number // 每拍 ticks (默认: 96)
  masterVolume?: number // 主音量 0-1 (默认: 0.2)
  defaultWaveform?: string // 默认波形 (默认: 'pulse')
  maxScheduleSec?: number // 最大调度时间 (默认: 60)
}
```

### 更多示例

查看 [examples/basic-usage.md](./examples/basic-usage.md) 了解更多使用示例，包括：
- 解析 BZS 脚本
- 监听播放状态
- 多轨道播放
- 使用音效
- 错误处理
- 资源清理

---

## 🛠 开发指南 | Development Guide

### 项目结构

```
buzzer-player/
├── src/
│   ├── BuzzerPlayer/     # 核心库代码
│   │   ├── BuzzerPlayer.ts
│   │   ├── BzsParser.ts
│   │   ├── bzs.langium
│   │   └── diagnostics.ts
│   └── index.ts          # 库入口文件
├── examples/
│   └── web/              # Web UI 示例应用
│       ├── main.tsx
│       ├── style.css
│       └── index.html
├── dist/                 # 库构建输出
└── dist-web/             # Web UI 构建输出
```

### 库开发

#### 安装依赖

```bash
pnpm install
```

#### 构建库文件

```bash
pnpm build
```

这将生成：
- `dist/buzzer-player.mjs` - ES Module 格式
- `dist/buzzer-player.cjs` - CommonJS 格式
- `dist/**/*.d.ts` - TypeScript 类型声明文件

#### 发布到 npm

```bash
npm publish
```

### Web UI 开发

#### 本地开发

```bash
pnpm dev
```

访问 `http://localhost:5173/` 查看开发版本。

#### 构建 Web UI

```bash
pnpm build:web
```

生成的文件在 `dist-web/` 目录，可直接部署到静态网站托管服务。

---

## 🗺 开发路线图 | Roadmap

- [x] 多轨道支持
- [x] 和弦语法 `[C4 E4 G4]`
- [x] ADSR 包络与音效（琶音、颤音、滑音）
- [x] Web 应用：项目管理、导入/导出
- [ ] MIDI 文件导入转换
- [ ] ABC 记谱法转换
- [ ] 更多音效（混响、滤波器等）
- [ ] VS Code 扩展
- [ ] 移动端优化

欢迎在 GitHub 提交 PR 和 Issue！

---

## 📝 开源协议 | License

MIT © 2025 [@dragon-fish](https://github.com/dragon-fish)

### 开发致谢

- **v0.2.1**: Co-developed with ChatGPT-o3 & Claude 3.7
- **v0.3.0**: Co-developed with ChatGPT-5.2, Claude 4.5 Sonnet, Gemini 3.0 and DeepSeek v3.2

---

## 🔗 相关链接 | Links

- [在线演示](https://dragon-fish.github.io/buzzer-player/)
- [GitHub 仓库](https://github.com/dragon-fish/buzzer-player)
- [BZS 语法文档 v0.3.0](./docs/buzzer-script.spec.0.3.0.md)
- [问题反馈](https://github.com/dragon-fish/buzzer-player/issues)

---

<p align="center">
  <sub>如果这个项目对你有帮助，欢迎 ⭐ Star 支持一下！</sub>
</p>
