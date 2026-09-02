/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API mode switch (D-007): 'mock' (default) | 'real'. */
  readonly VITE_API_MODE?: 'mock' | 'real'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
