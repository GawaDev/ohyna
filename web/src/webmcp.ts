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
      description:
        "Ohyna（おひな）の概要と、このタブで使える WebMCP ツール一覧を返す。最初に呼ぶとよい。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => ({
        app: "Ohyna",
        role: "Markdown 編集・検査・プレビュー・PDF 作成（確認 UI）",
        page: "/gui/",
        notes: [
          "プレビューは見た目確認のみ（リンクジャンプ・折りたたみ操作は不可）",
          "PDF のディスク保存と印刷ダイアログはユーザ操作が必要な場合がある",
        ],
        tools: [...WEBMCP_TOOL_NAMES],
      }),
    },
    {
      name: "ohyna_get_status",
      description:
        "ドキュメント名、未保存か、設定完了、検査ゲート、PDF 生成中などの状態を返す。",
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
      description:
        "エディタの Markdown 全文を指定文字列で置き換える。未保存扱いになりうる。",
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
      description:
        "編集中の Markdown を静的解析し、問題一覧を返す（サーバ POST /analyze）。",
      inputSchema: EMPTY_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: async () => handlers.analyze(),
    },
    {
      name: "ohyna_refresh_preview",
      description:
        "検査通過後にプレビュー HTML を再取得する。error がある場合は失敗しうる。",
      inputSchema: EMPTY_SCHEMA,
      execute: async () => {
        await handlers.refreshPreview();
        return "プレビューを更新しました。";
      },
    },
    {
      name: "ohyna_prepare_pdf",
      description:
        "検査通過後に PDF を生成し、確認 UI を開く。ファイル保存は「PDFを保存」、印刷は ohyna_print_pdf。",
      inputSchema: EMPTY_SCHEMA,
      execute: async () => handlers.preparePdf(),
    },
    {
      name: "ohyna_print_pdf",
      description:
        "生成済み PDF を OS の印刷ダイアログへ渡す。未生成なら先に生成して確認 UI を開いてから印刷する。",
      inputSchema: EMPTY_SCHEMA,
      execute: async () => handlers.printPdf(),
    },
  ];

  if (handlers.openHelp) {
    const openHelp = handlers.openHelp;
    tools.push({
      name: "ohyna_open_help",
      description:
        "画面内ヘルプを開く。docId があればその文書を表示する（例: manual/01-intro.md）。",
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
