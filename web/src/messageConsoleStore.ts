/**
 * IDE 風メッセージコンソール用の簡易ストア。
 *
 * 各エントリの表示契約（仕様書「GUI メッセージコンソール」も参照）:
 * - level … 区分。画面上は エラー / 注意 / 情報 / 完了
 * - title … 一行の見出し（折りたたみバーでも使用）
 * - detail … 任意の詳細本文（複数行可）。行位置は「N行目: …」
 * - at … 記録時刻（Unix ミリ秒）。画面上は HH:mm:ss
 *
 * メイン窓とコンソール子窓は BroadcastChannel でエントリを共有する。
 */

export type ConsoleLevel = "error" | "warning" | "info" | "success";

export type ConsoleEntry = {
  id: string;
  level: ConsoleLevel;
  title: string;
  detail?: string;
  at: number;
};

const MAX_ENTRIES = 200;
const SYNC_CHANNEL = "ohyna-console-store-v1";

/** 静的解析ゲート用の固定 ID（差し替え更新） */
export const ANALYSIS_CONSOLE_ID = "ohyna-analysis";

let entries: ConsoleEntry[] = [];
const listeners = new Set<() => void>();
let seq = 0;
let suppressBroadcast = false;
let bc: BroadcastChannel | null = null;

type SyncMessage =
  | { type: "entries"; entries: ConsoleEntry[]; seq: number }
  | { type: "request" };

function ensureBc(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (bc) return bc;
  bc = new BroadcastChannel(SYNC_CHANNEL);
  bc.addEventListener("message", (ev: MessageEvent<SyncMessage>) => {
    const data = ev.data;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    if (data.type === "request") {
      broadcastSnapshot();
      return;
    }
    if (data.type !== "entries" || !Array.isArray(data.entries)) return;
    suppressBroadcast = true;
    entries = data.entries.slice(0, MAX_ENTRIES);
    if (typeof data.seq === "number") seq = Math.max(seq, data.seq);
    for (const fn of listeners) fn();
    suppressBroadcast = false;
  });
  return bc;
}

function broadcastSnapshot() {
  try {
    ensureBc()?.postMessage({
      type: "entries",
      entries,
      seq,
    } satisfies SyncMessage);
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const fn of listeners) fn();
  if (!suppressBroadcast) broadcastSnapshot();
}

/** 子窓起動時など、最新スナップショットを要求する */
export function requestConsoleSync(): void {
  try {
    ensureBc()?.postMessage({ type: "request" } satisfies SyncMessage);
  } catch {
    /* ignore */
  }
}

export function getConsoleEntries(): ConsoleEntry[] {
  return entries;
}

export function subscribeConsole(listener: () => void): () => void {
  ensureBc();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function appendConsoleEntry(input: {
  level: ConsoleLevel;
  title: string;
  detail?: string;
}): ConsoleEntry {
  const entry: ConsoleEntry = {
    id: `msg-${Date.now()}-${seq++}`,
    level: input.level,
    title: input.title.trim() || "メッセージ",
    detail: input.detail?.trim() || undefined,
    at: Date.now(),
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
  return entry;
}

/** 同一 id を更新（解析結果の差し替え用。先頭へ上げる） */
export function upsertConsoleEntry(input: {
  id: string;
  level: ConsoleLevel;
  title: string;
  detail?: string;
}): ConsoleEntry {
  const entry: ConsoleEntry = {
    id: input.id,
    level: input.level,
    title: input.title.trim() || "メッセージ",
    detail: input.detail?.trim() || undefined,
    at: Date.now(),
  };
  entries = [entry, ...entries.filter((e) => e.id !== input.id)].slice(
    0,
    MAX_ENTRIES
  );
  emit();
  return entry;
}

export function removeConsoleEntry(id: string): void {
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return;
  entries = next;
  emit();
}

export function clearConsoleEntries(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

export function consoleCounts(list: ConsoleEntry[] = entries): {
  error: number;
  warning: number;
  info: number;
  success: number;
} {
  const out = { error: 0, warning: 0, info: 0, success: 0 };
  for (const e of list) out[e.level] += 1;
  return out;
}
