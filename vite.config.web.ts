import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Web UI 构建配置
export default defineConfig({
  root: 'web',
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
