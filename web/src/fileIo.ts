/**
 * ネイティブアプリ相当のファイル読み書き。
 * Chromium 系では File System Access API、未対応環境では従来のファイル選択／保存ダイアログにフォールバックする。
 *
 * 重要: showOpenFilePicker / showSaveFilePicker は「ユーザー操作の同一同期スタック」で
 * 呼び始めること。await や setState の後だと SecurityError / 無反応になる。
 */

export type TextFileHandle = FileSystemFileHandle;

/**
 * 編集画面（CodeMirror）は LF に揃える。
 * ディスクの CRLF / 古い Mac CR / UTF-8 BOM を残すと、開く・保存の直後から「未保存」になる。
 */
export function normalizeMarkdownText(text: string): string {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** ブラウザが前回のフォルダを覚えるためのピッカー ID */
const MD_PICKER_ID = "ohyna-markdown";
const PDF_PICKER_ID = "ohyna-pdf";

const MD_TYPES: FilePickerAcceptType[] = [
  {
    description: "Markdown",
    accept: {
      "text/markdown": [".md", ".markdown"],
      "text/plain": [".md", ".txt"],
    },
  },
];

const PDF_TYPES: FilePickerAcceptType[] = [
  {
    description: "PDF",
    accept: { "application/pdf": [".pdf"] },
  },
];

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

/**
 * Markdown を開く。
 * File System Access 利用時は、この関数の先頭でピッカーを同期的に開始する。
 */
export async function openMarkdownFile(): Promise<{
  text: string;
  name: string;
  handle: TextFileHandle | null;
} | null> {
  if (supportsFileSystemAccess()) {
    // await より前に呼ぶ（ユーザーアクティベーション維持）
    let pickerPromise: ReturnType<NonNullable<Window["showOpenFilePicker"]>>;
    try {
      pickerPromise = window.showOpenFilePicker!({
        id: MD_PICKER_ID,
        multiple: false,
        excludeAcceptAllOption: false,
        types: MD_TYPES,
      });
    } catch (e) {
      if (isAbortError(e)) return null;
      throw e;
    }
    try {
      const [handle] = await pickerPromise;
      const file = await handle.getFile();
      const text = normalizeMarkdownText(await file.text());
      return { text, name: file.name, handle };
    } catch (e) {
      if (isAbortError(e)) return null;
      throw e;
    }
  }

  const file = await pickFileLegacy(".md,text/markdown,text/plain");
  if (!file) return null;
  return {
    text: normalizeMarkdownText(await file.text()),
    name: file.name,
    handle: null,
  };
}

/** ドロップ／File オブジェクトから Markdown を読む */
export async function readMarkdownFromFile(file: File): Promise<{
  text: string;
  name: string;
  handle: TextFileHandle | null;
}> {
  return {
    text: normalizeMarkdownText(await file.text()),
    name: file.name,
    handle: null,
  };
}

/**
 * ドラッグ＆ドロップから開く。
 * Chromium では DataTransferItem.getAsFileSystemHandle で上書き保存用ハンドルも取る。
 */
export async function openMarkdownFromDataTransfer(
  dt: DataTransfer
): Promise<{
  text: string;
  name: string;
  handle: TextFileHandle | null;
} | null> {
  const item = dt.items?.[0];
  if (
    item &&
    item.kind === "file" &&
    typeof (
      item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle>;
      }
    ).getAsFileSystemHandle === "function"
  ) {
    try {
      const handle = await (
        item as DataTransferItem & {
          getAsFileSystemHandle: () => Promise<FileSystemHandle>;
        }
      ).getAsFileSystemHandle();
      if (handle && handle.kind === "file") {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        if (!isMarkdownFilename(file.name)) return null;
        return {
          text: normalizeMarkdownText(await file.text()),
          name: file.name,
          handle: fileHandle,
        };
      }
    } catch {
      /* 権限や非対応時は File にフォールバック */
    }
  }

  const file = dt.files?.[0];
  if (!file || !isMarkdownFilename(file.name)) return null;
  return readMarkdownFromFile(file);
}

export function isMarkdownFilename(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".md") || n.endsWith(".markdown") || n.endsWith(".txt");
}

type FileSystemHandle = {
  readonly kind: "file" | "directory";
};

/** 既存ハンドルへ上書き。権限が無ければ false。 */
export async function writeTextToHandle(
  handle: TextFileHandle,
  text: string
): Promise<boolean> {
  const payload = normalizeMarkdownText(text);
  try {
    // showSaveFilePicker / 開いた直後は、そのまま createWritable できることが多い。
    // queryPermission が "prompt" のままで弾くと保存成功なのにアプリ側が未採用になる。
    try {
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      return true;
    } catch (first) {
      if (isAbortError(first)) return false;
      if (
        typeof handle.queryPermission !== "function" ||
        typeof handle.requestPermission !== "function"
      ) {
        throw first;
      }
      let perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        perm = await handle.requestPermission({ mode: "readwrite" });
      }
      if (perm !== "granted") return false;
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      return true;
    }
  } catch (e) {
    if (isAbortError(e)) return false;
    throw e;
  }
}

async function resolveHandleFileName(
  handle: TextFileHandle,
  fallback: string
): Promise<string> {
  try {
    const file = await handle.getFile();
    const fromFile = (file.name || "").trim();
    if (fromFile) return fromFile;
  } catch {
    /* getFile 失敗時は handle.name へ */
  }
  const fromHandle = (handle.name || "").trim();
  return fromHandle || fallback;
}

export async function saveMarkdownAs(
  text: string,
  suggestedName: string
): Promise<{ name: string; handle: TextFileHandle | null } | null> {
  const fallbackName = ensureExt(suggestedName, ".md");
  const payload = normalizeMarkdownText(text);
  if (supportsFileSystemAccess()) {
    let pickerPromise: ReturnType<NonNullable<Window["showSaveFilePicker"]>>;
    try {
      // await より前に呼ぶ（ユーザーアクティベーション維持）
      pickerPromise = window.showSaveFilePicker!({
        id: MD_PICKER_ID,
        suggestedName: fallbackName,
        types: MD_TYPES,
      });
    } catch (e) {
      if (isAbortError(e)) return null;
      throw e;
    }
    try {
      const handle = await pickerPromise;
      const ok = await writeTextToHandle(handle, payload);
      if (!ok) return null;
      const savedName = await resolveHandleFileName(handle, fallbackName);
      return { name: savedName, handle };
    } catch (e) {
      if (isAbortError(e)) return null;
      throw e;
    }
  }
  legacyDownload(
    new Blob([payload], { type: "text/markdown;charset=utf-8" }),
    fallbackName
  );
  return { name: fallbackName, handle: null };
}

export async function savePdfAs(
  blob: Blob,
  suggestedName: string
): Promise<{ name: string } | null> {
  const name = ensureExt(suggestedName, ".pdf");
  if (supportsFileSystemAccess()) {
    let pickerPromise: ReturnType<NonNullable<Window["showSaveFilePicker"]>>;
    try {
      pickerPromise = window.showSaveFilePicker!({
        id: PDF_PICKER_ID,
        suggestedName: name,
        types: PDF_TYPES,
      });
    } catch (e) {
      if (isAbortError(e)) return null;
      throw e;
    }
    try {
      const handle = await pickerPromise;
      if (
        typeof handle.queryPermission === "function" &&
        typeof handle.requestPermission === "function"
      ) {
        let perm = await handle.queryPermission({ mode: "readwrite" });
        if (perm !== "granted") {
          perm = await handle.requestPermission({ mode: "readwrite" });
        }
        if (perm !== "granted") return null;
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { name: handle.name || name };
    } catch (e) {
      if (isAbortError(e)) return null;
      throw e;
    }
  }
  legacyDownload(blob, name);
  return { name };
}

/**
 * 生成済み PDF を OS の印刷ダイアログへ渡す。
 * ブラウザ内蔵 PDF ビューア経由（非表示 iframe）。ポップアップブロックの影響を受けにくい。
 */
export function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "PDF印刷");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  const cleanup = () => {
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 120_000);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve();
      cleanup();
    };

    iframe.addEventListener("load", () => {
      window.setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            fail(new Error("印刷用フレームを開けませんでした"));
            return;
          }
          win.focus();
          win.print();
          ok();
        } catch (e) {
          fail(e);
        }
      }, 250);
    });
    iframe.addEventListener("error", () => {
      fail(new Error("PDF の読み込みに失敗しました"));
    });

    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

function ensureExt(name: string, ext: string): string {
  const base = (name || "document").trim() || "document";
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

function isAbortError(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "name" in e &&
    (e as { name: string }).name === "AbortError"
  );
}

function legacyDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickFileLegacy(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });
    // キャンセル検知は不完全だが、フォーカス復帰で null にする
    window.addEventListener(
      "focus",
      () => {
        window.setTimeout(() => {
          if (!input.files?.length) finish(null);
        }, 400);
      },
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}

/* ---- File System Access API 型（DOM lib に無い環境向け） ---- */

type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type WellKnownDirectory =
  | "desktop"
  | "documents"
  | "downloads"
  | "music"
  | "pictures"
  | "videos";

type FileSystemWritableFileStream = {
  write(data: FileSystemWriteChunkType): Promise<void>;
  close(): Promise<void>;
};

type FileSystemWriteChunkType = BufferSource | Blob | string;

type FileSystemFileHandle = {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
  queryPermission?(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission?(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
};

declare global {
  interface Window {
    showOpenFilePicker?: (options?: {
      id?: string;
      startIn?: WellKnownDirectory | FileSystemFileHandle;
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
      types?: FilePickerAcceptType[];
    }) => Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?: (options?: {
      id?: string;
      startIn?: WellKnownDirectory | FileSystemFileHandle;
      suggestedName?: string;
      types?: FilePickerAcceptType[];
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle>;
  }
}
