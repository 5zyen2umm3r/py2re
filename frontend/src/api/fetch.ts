/**
 * fetch wrapper。
 * QtWebEngineView経由で起動された場合はQtWebChannel経由でDjangoブリッジを呼ぶ。
 */

declare global {
  interface Window {
    qt?: { webChannelTransport: unknown };
    QWebChannel?: new (transport: unknown, cb: (ch: { objects: Record<string, QtBridge> }) => void) => void;
  }
}

interface QtBridge {
  fetch: (method: string, path: string, body: string, headers: string) => Promise<string>;
}

let qtBridge: QtBridge | null = null;

export async function initQtChannel(): Promise<void> {
  if (!window.qt || !window.QWebChannel) return;
  return new Promise((resolve) => {
    new window.QWebChannel!(window.qt!.webChannelTransport, (channel) => {
      const objectName = import.meta.env.VITE_QT_CHANNEL_OBJECT as string;
      qtBridge = channel.objects[objectName] as QtBridge;
      resolve();
    });
  });
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const body = options.body ? String(options.body) : "";
  const headers = JSON.stringify(options.headers ?? {});

  if (qtBridge) {
    const raw = await qtBridge.fetch(method, path, body, headers);
    return JSON.parse(raw) as T;
  }

  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
