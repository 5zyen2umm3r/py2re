/// <reference types="vite/client" />
interface ImportMetaEnv {
    readonly VITE_API_BASE: string;
    readonly VITE_QT_CHANNEL_OBJECT: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}