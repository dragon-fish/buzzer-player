import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import dts from 'unplugin-dts/vite'

// 库模式构建配置
export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve(import.meta.dirname, 'tsconfig.lib.json'),
      bundleTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'BuzzerPlayer',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
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
