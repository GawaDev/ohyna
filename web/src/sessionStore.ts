/**
 * 起動時の前回ファイル復元用。
 * FileSystemFileHandle と「一度でも開く／保存したか」を IndexedDB に持つ。
 */

import { normalizeMarkdownText, type TextFileHandle } from "./fileIo";

const DB_NAME = "ohyna-session";
const DB_VERSION = 1;
const STORE = "kv";
const KEY_SESSION = "session";

export type SessionRecord = {
  /** 一度でもファイルを開く／保存／新規したか（初回サンプル判定） */
  everUsedFiles: boolean;
  /** 前回の Markdown ファイル（FSA 対応時のみ） */
  fileHandle?: TextFileHandle;
};

const EMPTY_SESSION: SessionRecord = { everUsedFiles: false };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function idbGet(): Promise<SessionRecord> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY_SESSION);
      req.onerror = () => reject(req.error ?? new Error("idb get failed"));
      req.onsuccess = () => {
        const v = req.result as SessionRecord | undefined;
        resolve(v && typeof v === "object" ? v : { ...EMPTY_SESSION });
      };
    });
  } catch {
    return { ...EMPTY_SESSION };
  }
}

async function idbPut(record: SessionRecord): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb put failed"));
      tx.objectStore(STORE).put(record, KEY_SESSION);
    });
  } catch {
    /* 永続化失敗は黙って続行 */
  }
}

export async function loadSession(): Promise<SessionRecord> {
  return idbGet();
}

/** ハンドルを覚え、everUsedFiles を立てる */
export async function persistSessionHandle(
  handle: TextFileHandle
): Promise<void> {
  await idbPut({ everUsedFiles: true, fileHandle: handle });
}

/** ハンドルを消しつつ「もう初回ではない」にする（新規・復元失敗など） */
export async function clearSessionHandle(markUsed = true): Promise<void> {
  const cur = await idbGet();
  await idbPut({
    everUsedFiles: markUsed ? true : cur.everUsedFiles,
  });
}

/** 開く／保存成功時（ハンドル無しのレガシー保存も含む） */
export async function markSessionFileUsed(
  handle?: TextFileHandle | null
): Promise<void> {
  if (handle) {
    await persistSessionHandle(handle);
    return;
  }
  const cur = await idbGet();
  await idbPut({
    everUsedFiles: true,
    ...(cur.fileHandle ? { fileHandle: cur.fileHandle } : {}),
  });
}

export type ReadHandleResult =
  | { ok: true; text: string; name: string }
  | {
      ok: false;
      /** permission: 未許可（起動時は request しない）。unavailable: 削除・破損など */
      reason: "permission" | "unavailable";
      name: string;
    };

/**
 * ハンドルから本文を読む。
 * - interactive:true（既定）… 未許可なら requestPermission（ユーザー操作内で呼ぶ）
 * - interactive:false … 起動復元用。既に granted のときだけ読む（プロンプトを出さない）
 */
export async function readMarkdownFromHandle(
  handle: TextFileHandle,
  opts?: { interactive?: boolean }
): Promise<ReadHandleResult> {
  const interactive = opts?.interactive ?? true;
  const name =
    typeof handle.name === "string" && handle.name.trim()
      ? handle.name
      : "前回のファイル";
  try {
    if (typeof handle.queryPermission === "function") {
      let perm = await handle.queryPermission({ mode: "readwrite" });
      if (
        perm !== "granted" &&
        interactive &&
        typeof handle.requestPermission === "function"
      ) {
        perm = await handle.requestPermission({ mode: "readwrite" });
      }
      if (perm !== "granted") {
        let readPerm = await handle.queryPermission({ mode: "read" });
        if (
          readPerm !== "granted" &&
          interactive &&
          typeof handle.requestPermission === "function"
        ) {
          readPerm = await handle.requestPermission({ mode: "read" });
        }
        if (readPerm !== "granted") {
          return { ok: false, reason: "permission", name };
        }
      }
    }
    const file = await handle.getFile();
    return {
      ok: true,
      text: normalizeMarkdownText(await file.text()),
      name: file.name || name,
    };
  } catch {
    return { ok: false, reason: "unavailable", name };
  }
}

/**
 * 空の新規文書。
 * 必須のドキュメント設定だけ入れ、検査エラーにならない状態で始める。
 */
export const EMPTY_MARKDOWN = `---
ohyna:
  title: 無題
  style: blue
  font: noto
  lang: ja
---

`;
