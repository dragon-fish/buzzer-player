# Buzzer Player

> **Lightweight WebAudio library for browser‑side “buzzer” melodies**

![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat)
![TypeScript](https://img.shields.io/badge/built_with-TypeScript-blue?style=flat)

Buzzer Player turns your browser into a retro buzzer: feed it a terse

**Buzzer Script (BZS)** text file and it schedules precise, sample‑accurate

notes via the Web Audio API.

Now supports **multi‑track canons** with per‑voice delay, waveform & volume! 🎶

## ✨ Features

- 🎼 Easy text notation (`C4 4`, `R 2`, directives)
- 🎛 Per‑track `@track` blocks – polyphony & canons
- ⏱ Accurate timing using future `osc.start()` scheduling
- 🔊 Global / local `waveform`, `volume`, `tempo`
- 🛑 `stop()` & `destroy()` for leak‑free cleanup
- 🟥 Tiny footprint, no deps, TypeScript types included

## 🚀 Install

```bash
npm i buzzer-player
```

Or drop the transpiled `dist/BuzzerPlayer.js` in a `<script type="module">` tag.

## 🔧 Quick Start

```ts
import { BuzzerPlayer } from 'buzzer-player'

const jingle = `
# Power‑up
tempo=140
C5 8 E5 8 G5 8 C6 4 R 8
`

const player = new BuzzerPlayer()
playBtn.onclick = () => player.playScript(jingle)
stopBtn.onclick = () => player.stop()
```

> **Note:** Browsers require a user gesture (click/touch) before audio can play.

---

More examples in the [./public/demos](./public/demos) folder.

---

## 📚 API

```ts
const player = new BuzzerPlayer(options) // See BuzzerPlayerOptions

player.playScript(script: string): Promise<void>
player.stop(): Promise<void>
player.destroy(): Promise<void>
```

`playScript` resolves when playback ends (or immediately if script is empty).

---

## 🧠 BZS Language Server (Langium LSP)

This repo includes a **BZS Node LSP server (stdio)** powered by Langium.
The grammar source is `src/BuzzerPlayer/bzs.langium`.

### Run

```bash
pnpm lsp:bzs
```

### Hook it up in your editor

- **Neovim (nvim-lspconfig)**: configure the server command as `pnpm lsp:bzs`, and associate `*.bzs` with a `bzs` filetype
- **VS Code**: you need a client (an extension) to spawn `pnpm lsp:bzs` and communicate via stdio. If you want, I can add a minimal VS Code extension into this repo as well.

---

## 🗺 Roadmap

- Polyphonic chords in one track (`[C4 E4 G4] 4` syntax)
- ADSR envelopes & simple effects
- Import helpers (ABC / MIDI → BZS)

PRs & ideas welcome on GitHub!

---

## 📝 License

MIT © 2025 @dragon-fish

- 0.2.1 Co-developed with ChatGPT-o3 & Claude 3.7
- 0.3.0 Co-developed with ChatGPT-5.2, Claude 4.5 Opus, Gemini 3.0 and DeepSeek v3.2
