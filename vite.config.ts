import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// 库模式构建配置
export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'BuzzerPlayer',
      formats: ['es', 'cjs'],
      fileName: (format) => `buzzer-player.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      // 确保外部化不应该打包到库中的依赖
      external: [],
      output: {
        // 在 UMD 构建模式下为这些外部化的依赖提供一个全局变量
        globals: {},
      },
    },
    sourcemap: true,
    // 清空输出目录
    emptyOutDir: true,
  },
})
