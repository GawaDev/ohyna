/** メイン窓 ↔ コンソール子窓（BroadcastChannel） */

import type { MdDiagnostic } from "./mdAnalysis";
import type { ConsolePreviewState } from "./MessageConsole";

export type ConsolePopoutAnalysis = {
  pending: boolean;
  diagnostics: MdDiagnostic[];
};

export type ConsolePopoutPreview = {
  state: ConsolePreviewState;
  analyzePending?: boolean;
  message?: string;
  diagramErrorCount?: number;
  diagramErrorHint?: string;
};

export type ConsolePopoutMessage =
  | { type: "hello" }
  | { type: "bye" }
  | { type: "request-state" }
  | { type: "dock" }
  | {
      type: "state";
      analysis: ConsolePopoutAnalysis;
      preview: ConsolePopoutPreview;
    }
  | { type: "jump-line"; line: number };

const CHANNEL = "ohyna-console-popout-v1";

export function isConsolePopout(
  search = typeof window !== "undefined" ? window.location.search : ""
): boolean {
  return new URLSearchParams(search).get("popout") === "console";
}

export function consolePopoutUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("popout", "console");
  return url.toString();
}

export function openConsolePopout(): Window | null {
  return window.open(
    consolePopoutUrl(),
    "ohyna-console-popout",
    "popup=yes,width=720,height=480,menubar=no,toolbar=no,status=no"
  );
}

export function createConsolePopoutChannel(
  onMessage: (msg: ConsolePopoutMessage) => void
): {
  post: (msg: ConsolePopoutMessage) => void;
  close: () => void;
} {
  const bc = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent<ConsolePopoutMessage>) => {
    if (!ev.data || typeof ev.data !== "object" || !("type" in ev.data)) return;
    onMessage(ev.data);
  };
  bc.addEventListener("message", handler);
  return {
    post: (msg) => {
      try {
        bc.postMessage(msg);
      } catch {
        /* ignore */
      }
    },
    close: () => {
      bc.removeEventListener("message", handler);
      bc.close();
    },
  };
}
