/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly TONGTIANLU_API_BASE?: string;
  readonly TONGTIANLU_JWT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
