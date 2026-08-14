/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Workspace version tag, injected by Vite's `define` (see version.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Release tag of the deployed build; set by the Deploy workflow. */
  readonly VITE_APP_VERSION?: string;
  /** Base URL of the shared realtime-infra server. */
  readonly VITE_BACKGAMMON_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
