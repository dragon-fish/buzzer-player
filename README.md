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

## 🎹 Buzzer Script (BZS) v0.2.1

### 1  Directives

```text
tempo    = 120    # BPM (global, can change mid‑script)
waveform = square # sine | square | sawtooth | triangle
volume   = 0.2    # 0‑1 linear gain
```

### 2  Track Blocks

```
@track violin delay=8 waveform=triangle volume=0.15
C4 4 D4 4 | E4 4 F4 4
```

- `delay` — beats to wait **from script start** before this track begins.
- You can declare as many `@track` blocks as you like; otherwise everything
  belongs to implicit track **main**.

### 3  Notes & Rests

```
<Note><Octave?> <Denominator>
C#4 8   # C‑sharp, octave 4, eighth‑note
Cb4 8   # C‑flat, octave 4, eighth‑note
R   4   # rest, quarter‑note
```

- Denominator: `1=whole`, `2=half`, `4=quarter`, `8=eighth`, …
- Lines may include `|` barlines—they’re ignored by parser.

---

## 🎼 Example: Two‑bar Canon in D

```text
# Canon in D – demo
tempo=100

@track lead delay=0
D4 4 E4 4 F#4 4 G4 4 | A4 4 B4 4 C#5 4 D5 4 |
D4 4 E4 4 F#4 4 G4 4 | A4 4 B4 4 C#5 4 D5 4 |

@track follow delay=16 waveform=triangle
D4 4 E4 4 F#4 4 G4 4 | A4 4 B4 4 C#5 4 D5 4 |
D4 4 E4 4 F#4 4 G4 4 | A4 4 B4 4 C#5 4 D5 4 |
```

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

## 🗺 Roadmap

- Polyphonic chords in one track (`[C4 E4 G4] 4` syntax)
- ADSR envelopes & simple effects
- Import helpers (ABC / MIDI → BZS)

PRs & ideas welcome on GitHub!

---

## 📝 License

MIT © 2025 @dragon-fish

Co-developed with ChatGPT o-3
