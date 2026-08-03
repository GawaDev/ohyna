/**
 * Ohyna WebMCP — ブラウザタブ上のエージェント向けツール登録。
 *
 * 解決順:
 * 1. `navigator.modelContext`（Chrome 先行実装）
 * 2. `document.modelContext`（現行ドラフト／Chrome ドキュメント）
 *
 * 既定 ON。無効化: localStorage.setItem("ohyna-webmcp", "0") のうえ再読込。
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @see https://developer.chrome.com/docs/ai/webmcp/imperative-api
 * @see /webmcp.json （ツール一覧の静的カタログ）
 */

import { APP_DEMO_ORIGIN, APP_REPO_URL } from "./appIdentity";
import { APP_VERSION } from "./appVersion";

type JsonSchema = Record<string, unknown>;

type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

type ToolExecuteCallback = (
  input: Record<string, unknown>
) => Promise<unknown> | unknown;

type ModelContextTool = {
  name: string;
  description: string;
  inputSchema?: JsonSchema;
  execute: ToolExecuteCallback;
  annotations?: ToolAnnotations;
};

type ModelContextRegisterToolOptions = {
  signal?: AbortSignal;
  exposedTo?: string[];
};

type ModelContextLike = {
  registerTool: (
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions
  ) => Promise<void> | void;
};

const EMPTY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {},
};

/** エージェント向け公開ツール名（/webmcp.json と一致させる） */
export const WEBMCP_TOOL_NAMES = [
  "ohyna_describe",
  "ohyna_get_status",
  "ohyna_get_markdown",
  "ohyna_set_markdown",
  "ohyna_get_document_settings",
  "ohyna_analyze",
  "ohyna_refresh_preview",
  "ohyna_prepare_pdf",
  "ohyna_print_pdf",
  "ohyna_open_help",
] as const;

export type WebMcpHandlers = {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  getDocumentSettings: () => Record<string, unknown>;
  getStatus: () => Record<string, unknown>;
  analyze: () => Promise<unknown>;
  refreshPreview: () => Promise<void>;
  /** PDF を生成し確認 UI を開く（ディスク保存はユーザ操作） */
  preparePdf: () => Promise<Record<string, unknown>>;
  /** 生成済み PDF を OS 印刷ダイアログへ（未生成なら作成してから） */
  printPdf: () => Promise<Record<string, unknown>>;
  openHelp?: (docId?: string) => void;
};

export type RegisterWebMcpOptions = {
  signal?: AbortSignal;
};

function modelContext(): ModelContextLike | null {
  const hasRegister = (ctx: unknown): ctx is ModelContextLike =>
    !!ctx &&
    typeof (ctx as ModelContextLike).registerTool === "function";

  try {
    const nav = navigator as Navigator & { modelContext?: ModelContextLike };
    if (hasRegister(nav.modelContext)) return nav.modelContext;
  } catch {
    /* SecureContext 外など */
  }

  try {
    const doc = document as Document & { modelContext?: ModelContextLike };
    if (hasRegister(doc.modelContext)) return doc.modelContext;
  } catch {
    /* SecureContext 外など */
  }

  return null;
}

function enabledByFlag(): boolean {
  try {
    return window.localStorage.getItem("ohyna-webmcp") !== "0";
  } catch {
    return true;
  }
}

async function register(
  ctx: ModelContextLike,
  tool: ModelContextTool,
  options?: ModelContextRegisterToolOptions
): Promise<void> {
  if (options && (options.signal || options.exposedTo)) {
    try {
      await Promise.resolve(ctx.registerTool(tool, options));
      return;
    } catch {
      /* fall through: tool-only */
    }
  }
  await Promise.resolve(ctx.registerTool(tool));
}

function buildTools(handlers: WebMcpHandlers): ModelContextTool[] {
  const tools: ModelContextTool[] = [
    {
      name: "ohyna_describe",
      description: "製品概要と、このタブで利用できる WebMCP ツール一覧を返す。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => ({
        app: "Ohyna",
        version: APP_VERSION,
        role: "Markdown の編集、プレビュー、PDF の作成",
        page: "/gui/",
        repository: APP_REPO_URL,
        homepage: `${APP_DEMO_ORIGIN}/`,
        notes: [
          "プレビューは体裁確認用です",
          "PDF の保存と印刷は利用者の操作が必要な場合があります",
        ],
        tools: [...WEBMCP_TOOL_NAMES],
      }),
    },
    {
      name: "ohyna_get_status",
      description: "文書名、未保存状態、設定、検査結果、PDF 生成状態を返す。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => handlers.getStatus(),
    },
    {
      name: "ohyna_get_markdown",
      description:
        "メインウィンドウのエディタに表示されている Markdown 全文を返す。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => ({ markdown: handlers.getMarkdown() }),
    },
    {
      name: "ohyna_set_markdown",
      description: "エディタの Markdown 全文を指定文字列で置き換える。",
      inputSchema: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description: "置き換え後の Markdown 全文",
          },
        },
        required: ["markdown"],
      },
      annotations: { untrustedContentHint: true },
      execute: async ({ markdown }) => {
        if (typeof markdown !== "string") {
          throw new TypeError("markdown は文字列である必要があります");
        }
        handlers.setMarkdown(markdown);
        return `Markdown を ${markdown.length} 文字で更新しました。`;
      },
    },
    {
      name: "ohyna_get_document_settings",
      description:
        "編集中ドキュメント先頭の ohyna: 設定（表紙・色・フォント等）の要約を返す。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => ({ settings: handlers.getDocumentSettings() }),
    },
    {
      name: "ohyna_analyze",
      description: "編集中の Markdown を検査し、問題一覧を返す。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => handlers.analyze(),
    },
    {
      name: "ohyna_refresh_preview",
      description: "プレビューを再取得する。問題がある場合は失敗します。",
      inputSchema: EMPTY_SCHEMA,
      execute: async () => {
        await handlers.refreshPreview();
        return "プレビューを更新しました。";
      },
    },
    {
      name: "ohyna_prepare_pdf",
      description: "PDF を生成し、確認画面を開く。保存は画面の「PDFを保存」、印刷は ohyna_print_pdf。",
      inputSchema: EMPTY_SCHEMA,
      execute: async () => handlers.preparePdf(),
    },
    {
      name: "ohyna_print_pdf",
      description: "生成済み PDF を OS の印刷ダイアログへ渡す。未生成の場合は先に生成します。",
      inputSchema: EMPTY_SCHEMA,
      execute: async () => handlers.printPdf(),
    },
  ];

  if (handlers.openHelp) {
    const openHelp = handlers.openHelp;
    tools.push({
      name: "ohyna_open_help",
      description: "画面内ヘルプを開く。docId を指定すると該当文書を表示する。",
      inputSchema: {
        type: "object",
        properties: {
          docId: {
            type: "string",
            description: "ヘルプ文書 ID（省略可）",
          },
        },
      },
      execute: async ({ docId }) => {
        const id = typeof docId === "string" ? docId : undefined;
        openHelp(id);
        return id ? `ヘルプを開きました: ${id}` : "ヘルプを開きました。";
      },
    });
  }

  return tools;
}

/** 対応ブラウザかつフラグ ON のときツールを登録する。 */
export async function tryRegisterWebMcpTools(
  handlers: WebMcpHandlers,
  options: RegisterWebMcpOptions = {}
): Promise<boolean> {
  if (!enabledByFlag()) return false;
  if (options.signal?.aborted) return false;
  const ctx = modelContext();
  if (!ctx) return false;

  const regOpts: ModelContextRegisterToolOptions = {
    signal: options.signal,
  };

  try {
    for (const tool of buildTools(handlers)) {
      if (options.signal?.aborted) return false;
      await register(ctx, tool, regOpts);
    }
  } catch (err) {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[ohyna] WebMCP register skipped:", err);
    }
    return false;
  }

  if (typeof console !== "undefined" && console.info) {
    console.info(
      "[ohyna] WebMCP tools registered:",
      WEBMCP_TOOL_NAMES.join(", ")
    );
  }
  return !options.signal?.aborted;
}

/** 実行時に WebMCP API が使えるか（フラグは見ない） */
export function isWebMcpAvailable(): boolean {
  return modelContext() !== null;
}
