# 🎹 Buzzer Script (BZS) v0.3.0 规范草案

## 0. 设计目标

1. **易解析**：行式文本；少量关键字；尽量“key=value”；事件从左到右。
2. **人类可读**：接近简谱/tracker 的写法；支持小节线 `|`；注释清晰。
3. **8bit 常用能力**：

   - 多轨（track）+ 延迟进入（delay）
   - 波形/音色：`pulse / triangle / noise / sample`（保持与 8bit 风格一致）
   - 音量与简单包络（ADSR 的简化版）
   - 常用表现：**琶音(arpeggio)**、**颤音(vibrato)**、**滑音(slide)**、**门限/断音(gate)**、**速度变化(tempo)**、**循环(loop)**、**pattern/片段复用**

4. **不追求超复杂合成**：重点是“像 NES/GB 那样写得出来”，不引入过多 DSP 细节。

## 1. 文件结构

一个 BZS 文件由以下部分组成（顺序不限，但推荐先全局后轨道）：

1. **注释与空行**
2. **全局指令（Directives）**：形如 `tempo=120`
3. **片段定义（pattern / macro，可选）**
4. **轨道块（@track ...）**：轨道参数 + 事件序列

---

## 2. 词法规则（Lexer）

### 2.1 字符集与大小写

- 关键字不区分大小写（建议 parser 内部统一 lower）。
- 音名建议大小写都接受，但输出规范用大写音名：`C D E F G A B`。

### 2.2 空白

- 空格/制表符均作为分隔符。
- 行首行尾空白忽略。

### 2.3 注释

- 仅 `//` 开始直到行末为注释。
- 注释可独占一行或出现在行尾。

> 备注：`#` 仅用于音符升/降号（如 `C#4`），因此不再作为注释前缀。

### 2.4 小节线

- `|` 作为视觉分隔符，**语义上忽略**（不影响时长累计）。

---

## 3. 时间与长度模型

### 3.1 Beat 与 Denominator

- BZS 以“拍（beat）”为抽象单位：默认 1 拍 = 四分音符。
- 事件时值用分母表示：
  `1=全音符, 2=二分, 4=四分, 8=八分, 16=十六分, ...`
- 时值换算：`duration_beats = 4 / denominator`

例：
`C4 8` 表示时值 = `4/8 = 0.5` 拍。

### 3.2 点音符（可选但建议支持）

为保持可读且易解析，点音符用**附加标记**而不是复杂表达式：

- `denom.` 表示附点一次（×1.5）
- `denom..` 表示附点两次（×1.75）

例：`C4 8.` = 0.75 拍

> parser 做法：读到 `8.` 就解析成 denom=8, dots=1。

### 3.3 连音（Tuplet）——v0.3.0 仍保持简单

为避免复杂语法，**不引入**通用 tuplet。
需要三连音的常见场景可用更高分辨率 + tempo 或 pattern 解决。
（如果你强烈需要，可在 v0.3.1 再加 `tuplet=3:2` 这种行内状态。）

---

## 4. 全局指令（Directives）

语法：一行一个 `key=value`。

### 4.1 必选/常用指令

- `tempo=<number>`：BPM（每分钟多少拍）
- `ticks_per_beat=<int>`：每拍的“内部 tick”分辨率（用于 vibrato/slide/gate 的细粒度计算）

  - 默认：`ticks_per_beat=96`（足够细且好算）

- `master_volume=<0..1>`：整体音量（默认 0.2）

### 4.2 拍号（仅用于可读性/小节线对齐）

- `time_signature=<numerator>/<denominator>`

  - 默认 `4/4`
  - **不改变**时值计算，只用于你将来可做“警告：小节未对齐”。

### 4.3 调式/转调（仅注释级别，可选）

- `key=<C|G|F|...>`：不参与音高计算，仅用于人类阅读/工具显示。

---

## 5. 轨道（Track Block）

### 5.1 轨道块定义

语法：

```
@track <name> [param=value ...]
<events...>
```

- `<name>`：标识符（字母数字下划线），如 `lead` `bass_1`
- 直到下一个 `@track` 或文件结尾为该轨道事件。

### 5.2 轨道参数（建议支持）

- `delay=<beats>`：从脚本开始延迟多少拍进入（可为小数，如 `8` 或 `0.5`）
- `waveform=<pulse|triangle|noise|sample|sine|saw|square>`

  - 为 8bit 核心：`pulse/triangle/noise/sample`
  - 兼容旧版：`square` 视为 `pulse duty=50` 或直接映射 `pulse`

- `volume=<0..1>`：轨道基础音量
- `pan=<-1..1>`：可选（不做也行；对“8bit”非必须）
- `channel=<int>`：可选，用于映射硬件声道（如 NES：2 pulse + triangle + noise + dpcm）

### 5.3 pulse 特有参数（8bit 常见）

- `duty=<12|25|50|75>`：脉冲占空比（百分比整数）

  - 默认 `50`

### 5.4 sample 特有参数

- `sample_bank=<id>`：采样库 ID（实现层自定义）
- `sample_rate=<int>`：播放采样用（可选）

---

## 6. 事件（Events）

事件是按时间顺序排列的 token 序列。每个事件至少消耗一个“时值”（beats），除非它是“状态事件”（见 6.4）。

### 6.1 音符事件 Note

基本形式：

```
<NOTE><ACC?><OCT> <LEN>
```

- NOTE：`A B C D E F G`
- ACC：`#` 或 `b`（可无）
- OCT：整数（推荐 0~8，可实现层限制）
- LEN：分母或带点分母：`4`, `8.`, `16..`

例：

- `C4 8`
- `F#3 16`
- `Bb5 4.`

### 6.2 休止事件 Rest

```
R <LEN>
```

### 6.3 和弦（Chord）——“8bit 友好”但保持简单

8bit 硬件往往单声部，但你可能想在“一个 track 内写和弦再由引擎拆分/或用于非硬件模式”。
提供一种**易解析**写法：

```
[ C4 E4 G4 ] <LEN>
```

- 方括号内是若干音符（都不带 LEN）
- 方括号后给统一 LEN
- 对严格 8bit 模式：可在编译阶段报错或自动做快速琶音（可选策略）

### 6.4 状态事件（State Event，不消耗时值或可选消耗）

为了易写 parser，所有“效果/参数变化”统一用：

```
:command [arg...]
```

- 以冒号开头，表示改变后续事件的状态。
- 默认**不消耗时间**（即时生效）。
- 若你需要“效果事件也占时值”，可以引入 `:wait <LEN>` 或直接用 `R <LEN>`。

常见命令见第 7 节。

---

## 7. 8bit 常用效果命令（Commands）

### 7.1 Gate（门限/断音）

让每个音符只发声其时值的一部分，其余为静音（经典 chiptune staccato）。

- 设置门限比例（0~1）：

  ```
  :gate 0.75
  ```

  表示每个音符只响 75% 的时长，剩余 25% 静音。

- 关闭 gate（恢复 1.0）：

  ```
  :gate off
  ```

> 实现建议：gate 作为轨道状态，应用于后续“音符/和弦事件”。

---

### 7.2 Volume / Velocity（轨道音量变化）

- 立即设置轨道音量（0..1）：

  ```
  :vol 0.12
  ```

- 可选：音符力度（更 tracker 风格，但会增加语法）

  - v0.3.0 建议先不做每音符 velocity，保持简单。

---

### 7.3 ADSR-lite 包络（适配 8bit 的简化）

为保持简洁，提供两种方式：

#### A) 预设包络（推荐，最易用）

```
:env <name>
```

内置建议至少这些名字（实现可以更多）：

- `pluck`（短音，快衰减）
- `lead`（中等起音，平稳）
- `pad`（慢起音慢释音）
- `perc`（打击，极短）

#### B) 显式参数（仍保持简单）

```
:env a=<ticks> d=<ticks> s=<0..1> r=<ticks>
```

- `a/d/r` 用 tick 表示（基于 `ticks_per_beat`）
- `s` 为 sustain 电平

例：

```
:env a=0 d=12 s=0.6 r=8
```

> 8bit 常见做法是“音量步进”，你可以把 ticks 映射成每 tick 改变一次音量。

---

### 7.4 Arpeggio（琶音）

chiptune 里最常见的和弦模拟方式。定义为“在一个音持续期间，按固定步进快速切换音高”。

命令：

```
:arp <mode> <x> <y> [rate=<ticks>]
```

- `mode`：

  - `semi`：半音偏移（常用）
  - `note`：直接给音名（更可读但更长）

- `x/y`：两个偏移或音名（形成三音循环：基音、基音+x、基音+y）
- `rate`：每次切换的 tick 间隔，默认 `rate=6`

例（半音偏移：大三和弦 0, +4, +7）：

```
:arp semi 4 7 rate=6
C4 4
```

关闭：

```
:arp off
```

---

### 7.5 Vibrato（颤音）

```
:vib depth=<semitones> rate=<ticks>
```

- `depth`：最大偏移（半音，可用小数，如 0.3）
- `rate`：每次 LFO 采样间隔 ticks（或你定义为周期 ticks，都可以，规范只要求一致）

关闭：

```
:vib off
```

---

### 7.6 Slide / Portamento（滑音）

让一个音在开始时从上一个音高滑到目标音高（或按固定速度滑）。

两种模式（都易解析）：

1. 固定时长滑到目标：

```
:slide time=<ticks>
```

2. 固定速度（每 tick 减少/增加多少半音）：

```
:slide speed=<semitones_per_tick>
```

关闭：

```
:slide off
```

> 规则建议：slide 只对“音符事件”的起音阶段生效；从“上一发声音高”滑到当前音高。

---

### 7.7 Noise（噪声）常用参数（可选）

噪声轨道常用于鼓点。可提供“噪声音高/模式”的抽象：

- 设置噪声模式：

  ```
  :noise mode=short
  :noise mode=long
  ```

- 设置噪声“音高”（实现层映射到 LFSR 分频）：

  ```
  :noise pitch=8
  ```

---

### 7.8 Tempo Change（速度变化）

全局或轨道内都可写：

```
:tempo 140
```

语义：从此刻起 tempo 改变（影响后续时间到秒的映射，但不改变 beats 结构）。

---

## 8. 结构复用：Pattern 与 Loop

### 8.1 Pattern 定义与引用（推荐）

定义：

```
@pattern <name>
<events...>
@end
```

引用：

```
:call <name>
```

- `:call` 不消耗时值，等价于把 pattern 的事件序列内联展开。
- pattern 内允许再 `:call` 其他 pattern（实现可限制递归深度）。

### 8.2 循环（Loop）

为简单与可读，循环采用显式块：

```
:loop <count>
  <events...>
:endloop
```

- `<count>`：正整数；也可支持 `inf`（无限循环，适合 bgm）
- 解析时把块内容复制 `<count>` 次（或保持 AST 节点让播放端循环）

> 建议：禁止跨轨道的 loop end 匹配；必须在同一轨道文本块内配对。

---

## 9. 错误处理（建议）

建议 parser / 编译器至少给出以下错误：

1. 未知命令：`:foo`
2. 音符格式错误：`H4 8`、`C# 8`（缺 octave）
3. LEN 非法：`C4 x`
4. `@track` 未给 name
5. `:loop`/`:endloop` 不匹配
6. `@pattern`/`@end` 不匹配
7. 递归 pattern 过深 / 循环 `inf` 出现在不允许的导出模式（可选）

---

## 10. 与 v0.2.1 的兼容规则（建议）

为平滑升级：

- 旧的全局指令仍保留：`tempo=`, `waveform=`, `volume=`
- 未写 `@track` 的内容属于隐式 `main` 轨道（与 v0.2.1 一致）
- `square` 波形别名：映射到 `pulse duty=50`
- 小节线 `|` 继续忽略
- 允许旧写法 `@track violin delay=8 waveform=triangle volume=0.15` 无变化

---

# 11. 完整示例：典型 8bit 编曲片段

```text
// BZS 0.3.0 demo – 8bit-ish
tempo=150
ticks_per_beat=96
master_volume=0.25
time_signature=4/4

@pattern riff_a
:gate 0.75
:env pluck
:arp semi 4 7 rate=6
C5 8  R 16  C5 16  | D5 8  R 16  D5 16 |
E5 8  R 16  E5 16  | G5 8  R 16  G5 16 |
:arp off
@end

@track pulse1 delay=0 waveform=pulse duty=25 volume=0.18
:call riff_a
:call riff_a
:loop 2
  :vib depth=0.25 rate=8
  A4 4 | G4 4 | E4 4 | D4 4 |
:endloop
:vib off

@track tri delay=0 waveform=triangle volume=0.12
:env lead
:gate off
C3 4 C3 4 | G2 4 G2 4 |
A2 4 A2 4 | F2 4 G2 4 |

@track noise delay=0 waveform=noise volume=0.10
:env perc
:noise mode=short
:loop 4
  R 8  C2 16 R 16  C2 16 R 16 |  // 这里的 C2 仅作为“触发噪声”的占位音高
:endloop
```

> 说明：噪声轨里用 `C2` 当作触发事件（你也可以规定 noise 轨道的 Note 音高被映射为噪声“pitch”）。

---

# 附录 A：默认值与初始状态（实现建议）

> 本附录为**实现建议**：你也可以选择对缺失项报错，但建议至少在工具链内部有一套统一默认值。

## A.1 全局指令默认值

| 指令             | 类型   | 建议默认值 | 说明                                             |
| ---------------- | ------ | ---------- | ------------------------------------------------ |
| `tempo`          | number | `120`      | 若缺失：建议默认 120 BPM（或对“可播放模式”报错） |
| `ticks_per_beat` | int    | `96`       | 影响 gate/env/vib/slide/arp 等的 tick 级计算     |
| `master_volume`  | 0..1   | `0.2`      | 最终输出音量仍可由实现做额外限制/压缩            |
| `time_signature` | n/d    | `4/4`      | 仅用于可读性/对齐检查，不影响时值换算            |
| `key`            | string | （无）     | 仅展示用途，不参与音高计算                       |

## A.2 轨道参数默认值

| 参数                    | 类型          | 建议默认值 | 说明                                          |
| ----------------------- | ------------- | ---------- | --------------------------------------------- |
| `delay`                 | beats(number) | `0`        | 可为小数（例如 `0.5`）                        |
| `waveform`              | enum          | `pulse`    | 兼容：`square` 视为 `pulse`（见第 10 节）     |
| `volume`                | 0..1          | `1.0`      | 作为轨道“基准音量”，再与 `master_volume` 相乘 |
| `pan`                   | -1..1         | `0`        | 可选实现；缺失时居中                          |
| `channel`               | int           | （无）     | 缺失表示由实现自动分配                        |
| `duty`（pulse）         | 12/25/50/75   | `50`       | 仅对 `waveform=pulse` 生效                    |
| `sample_bank`（sample） | id            | （无）     | 实现层自定义                                  |
| `sample_rate`（sample） | int           | （无）     | 可选                                          |

## A.3 状态命令初始状态（每轨道独立）

| 状态                  | 初始值            | 影响范围                          |
| --------------------- | ----------------- | --------------------------------- |
| `gate`                | `1.0`（等价 off） | 影响后续 note/chord 的“发声占比”  |
| `env`                 | （无）            | 影响后续 note/chord 的音量包络    |
| `arp`                 | off               | 影响后续 note 的音高切换          |
| `vib`                 | off               | 影响后续 note 的音高 LFO          |
| `slide`               | off               | 影响后续 note 的起音过渡          |
| `noise`（mode/pitch） | （无）            | 仅对 noise 轨或实现选择的轨道生效 |

## A.4 同一时间点的顺序规则（强烈建议）

- `:command` 默认不消耗时值；当同一“拍位置”出现多个 `:command` 时，按文本出现顺序应用。
- `|` 仅为视觉分隔，解析时忽略。

---

# 附录 B：规范化输出（Canonical Formatting）

## B.1 大小写与符号

- 关键字与命令名：输出统一小写（例如 `tempo=`, `@track`, `:gate`）。
- 音名：输出统一大写 `A B C D E F G`。
- 变音记号：使用 `#` 或 `b`（不引入 `♯/♭`）。
- 休止：使用大写 `R`。

## B.2 空白与分隔

- token 之间使用**单个空格**分隔；不使用 tab。
- 行首行尾不输出多余空格。
- 小节线 `|` 两侧各留一个空格（例如 `A4 4 | G4 4`）。
- 和弦括号：推荐输出为 `[ C4 E4 G4 ] 8`（括号内外各一个空格）。

## B.3 数字格式（建议约束）

- 小数使用十进制表示，推荐 `0.5` 而不是 `.5`。
- 不输出多余的尾随 0（例如 `0.50` 规范化为 `0.5`）。
- 建议最多保留 6 位小数（超出则四舍五入），避免长小数污染 diff。

## B.4 LEN（时值）规范化

- LEN 仅使用分母形式：`1 2 4 8 16 32 ...`，点音符用 `8.` / `16..`。
- 不使用表达式（例如不输出 `3/8` 或 `0.375`）。

## B.5 注释规范化（可选）

- 建议统一使用 `//` 作为注释前缀。
- 行内注释前至少留两个空格：`A4 4  // comment`。

## B.6 参数顺序（可选但推荐）

- `@track` 头部参数建议按：`delay waveform duty volume pan channel sample_bank sample_rate` 输出（缺失项跳过）。
- 对命令：若命令包含多个 `key=value`，建议按规范示例的顺序输出（例如 `:vib depth=... rate=...`）。

---

# 附录 C：参考语法（EBNF，覆盖 v0.3.0 核心）

> 说明：BZS 的“事件”本质更像 token 流而非严格逐行语法；以下 EBNF 以“实现可落地”为目标，允许同一行出现多个事件/命令。
> 词法层建议：先移除注释，再把 `|` 当作普通分隔符丢弃。

```ebnf
file            = { line } ;

line            = wsp?, ( statement | empty ), wsp?, comment? , eol ;
empty           = /* 空行 */ ;

comment         = "//", { any_char_except_eol } ;

statement       = directive
                | track_header
                | pattern_header
                | pattern_end
                | token_stream ;

directive       = key, "=", value ;
key             = ident ;
value           = { value_char } ;

track_header    = "@track", wsp, ident, { wsp, param } ;
pattern_header  = "@pattern", wsp, ident ;
pattern_end     = "@end" ;

param           = ident, "=", value_atom ;
value_atom      = number | ident ;

token_stream    = token, { sep, token } ;
sep             = wsp | bar ;
bar             = "|" ;

token           = event | state_command ;

event           = note_event
                | rest_event
                | chord_event ;

note_event      = pitch, wsp, len ;
rest_event      = "R", wsp, len ;
chord_event     = "[", wsp?, pitch, { wsp, pitch }, wsp?, "]", wsp, len ;

pitch           = note_letter, accidental?, octave ;
note_letter     = "A"|"B"|"C"|"D"|"E"|"F"|"G"
                | "a"|"b"|"c"|"d"|"e"|"f"|"g" ;
accidental      = "#" | "b" ;
octave          = int ;

len             = denom, dots? ;
denom           = int ;
dots            = "." | ".." ;

state_command   = ":", command_name, { wsp, command_arg } ;
command_name    = ident ;
command_arg     = key_value | value_atom ;
key_value       = ident, "=", value_atom ;

ident           = ident_start, { ident_continue } ;
ident_start     = letter | "_" ;
ident_continue  = letter | digit | "_" ;

number          = int | float ;
int             = sign?, digit, { digit } ;
float           = sign?, digit, { digit }, ".", digit, { digit } ;
sign            = "+" | "-" ;
digit           = "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9" ;
letter          = "A".."Z" | "a".."z" ;

wsp             = " " | "\\t" ;
eol             = "\\n" | "\\r\\n" ;
```

## C.1 语义级约束（与正文一致）

- 音符必须包含 octave（因此 `C# 8` 属于错误输入，见第 9 节）。
- `:loop <count> ... :endloop` 与 `@pattern ... @end` 必须在同一块内配对。
- `:command` 默认不消耗时值；播放器在同一拍位置按文本顺序应用多个命令。

## C.2 时间离散化建议（实现提示）

- 若实现需要把 beats 映射到整数 tick：建议以 `ticks_per_beat` 为基准，令 `duration_ticks = round(duration_beats * ticks_per_beat)`。
- 点音符（1~2 点）在 beats 层面是有理数（例如 `8.` = 3/4 拍），用 tick 离散化时建议采用四舍五入；需要严格可复现时，可在 pattern/小节边界做误差归零（实现自定）。

---

## 结尾汇总表（v0.3.0 关键能力清单）

| 类别     | v0.3.0 提供的语法                            | 用途（8bit 常见）   | 解析难度 |
| -------- | -------------------------------------------- | ------------------- | :------: |
| 全局     | `tempo=`, `ticks_per_beat=`                  | 速度与细分控制      |    低    |
| 轨道     | `@track name delay= waveform= volume= duty=` | 多声部 + 脉冲占空比 |    低    |
| 基本事件 | `C#4 8`, `R 16`, `[ C4 E4 G4 ] 8`            | 写旋律/节奏         |    低    |
| 状态命令 | `:gate`, `:vol`, `:tempo`                    | 断音、动态、变速    |    低    |
| 琶音     | `:arp semi 4 7 rate=6`                       | 伪和弦（最 8bit）   |    中    |
| 颤音     | `:vib depth= rate=`                          | 旋律抖动/电音味     |    中    |
| 滑音     | `:slide time=` / `speed=`                    | portamento/音高过渡 |    中    |
| 复用     | `@pattern/:call`, `:loop/:endloop`           | tracker 风格编曲    |    中    |

---
