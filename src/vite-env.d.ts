/// <reference types="vite/client" />

// 声明 CSS 模块导入
declare module '*.css' {
  const content: string;
  export default content;
}

// 扩展 ImportMetaEnv 接口
interface ImportMetaEnv {
  readonly VITE_IS_TAURI: boolean;
  // 其他环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}