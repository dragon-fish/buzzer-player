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
