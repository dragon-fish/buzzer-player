# Changelog

## [0.3.0] - 2026-01-14

### 重大变更 (Breaking Changes)

- **项目结构重组**: 项目现在支持作为 npm 库分发
  - 核心库代码保留在 `src/BuzzerPlayer/` 目录
  - Web UI 移至 `examples/web/` 目录
  - 添加了库入口文件 `src/index.ts`

### 新增 (Added)

- ✨ **库模式支持**: 现在可以通过 npm 安装并在项目中使用
  - ES Module 格式: `dist/buzzer-player.mjs`
  - CommonJS 格式: `dist/buzzer-player.cjs`
  - TypeScript 类型声明文件
- 📦 **导出配置**: 完整的 package.json exports 配置
- 📝 **API 文档**: 添加了详细的使用示例 (`examples/basic-usage.md`)
- 🔧 **构建配置**:
  - `vite.config.ts` - 库模式构建
  - `vite.config.web.ts` - Web UI 构建
  - `tsconfig.lib.json` - TypeScript 类型声明生成

### 改进 (Changed)

- 📚 **更新文档**: README 现在包含库使用指南
- 🏗 **构建脚本**:
  - `pnpm build` - 构建库文件
  - `pnpm build:web` - 构建 Web UI
  - `pnpm dev` - 开发 Web UI

### 导出的 API

#### 主类

- `BuzzerPlayer` - 蜂鸣器播放器主类
- `BzsParser` - BZS 脚本解析器
- `BzsRuntimeError` - 运行时错误类

#### 类型定义

- `BuzzerPlayerOptions` - 播放器配置选项
- `TimelineEvent` - 时间线事件
- `BzsProgram` - 解析后的程序结构
- `BzsPitch`, `BzsSeqItem`, `BzsPattern`, `BzsTrack` 等 BZS 语法类型
- `EnvState`, `ArpState`, `VibState`, `SlideState` - 音效状态类型
- `NoteSymbol` - 音符符号类型
- `BzsWaveform` - 波形类型

#### 工具函数

- `collectBarlineAlignmentWarnings` - 收集小节线对齐警告
- `parseTimeSignature` - 解析拍号

---

## [0.2.x] - 之前版本

详见 git 提交历史。
