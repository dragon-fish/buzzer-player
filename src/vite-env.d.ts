/// <reference types="vite/client" />

// 为 ?raw 导入添加类型支持
declare module '*.langium?raw' {
  const content: string
  export default content
}
