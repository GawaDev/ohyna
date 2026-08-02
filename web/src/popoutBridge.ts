/** メイン窓（エディタ）↔ 子窓（プレビュー）の同期（同一オリジン BroadcastChannel） */

export type PopoutMessage =
  | { type: "hello" }
  | { type: "bye" }
  | { type: "request-state" }
  | {
      type: "state";
      previewHtml: string | null;
      settingsMissing: boolean;
      previewState: string;
      errorMessage: string;
      diagramErrorCount: number;
      diagramErrorHint: string;
    }
  | {
      type: "preview";
      html: string | null;
      settingsMissing: boolean;
      previewState: string;
      errorMessage: string;
      diagramErrorCount: number;
      diagramErrorHint: string;
    }
  | { type: "dock" };

const CHANNEL = "ohyna-popout-v2";

export function isPreviewPopout(
  search = typeof window !== "undefined" ? window.location.search : ""
): boolean {
  return new URLSearchParams(search).get("popout") === "preview";
}

export function previewPopoutUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("popout", "preview");
  return url.toString();
}

export function openPreviewPopout(): Window | null {
  return window.open(
    previewPopoutUrl(),
    "ohyna-preview-popout",
    "popup=yes,width=1100,height=880,menubar=no,toolbar=no,status=no"
  );
}

export function createPopoutChannel(
  onMessage: (msg: PopoutMessage) => void
): {
  post: (msg: PopoutMessage) => void;
  close: () => void;
} {
  const bc = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent<PopoutMessage>) => {
    if (!ev.data || typeof ev.data !== "object" || !("type" in ev.data)) return;
    onMessage(ev.data);
  };
  bc.addEventListener("message", handler);
  return {
    post: (msg) => {
      try {
        bc.postMessage(msg);
      } catch {
        /* ignore quota / closed */
      }
    },
    close: () => {
      bc.removeEventListener("message", handler);
      bc.close();
    },
  };
}
