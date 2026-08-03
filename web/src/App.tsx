import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Overlay,
  Paper,
  SegmentedControl,
  Splitter,
  Stack,
  Text,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconArrowBackUp,
  IconDeviceFloppy,
  IconFileExport,
  IconFileOff,
  IconFilePlus,
  IconFileTypePdf,
  IconFolderOpen,
  IconHelp,
  IconNotebook,
  IconRefresh,
  IconSettings,
  IconWindowMaximize,
  IconX,
} from "@tabler/icons-react";
import type { EditorView } from "@codemirror/view";
import {
  applyEditorDiagnostics,
  jumpToDiagnosticLine,
} from "./editorDiagnostics";
import { ColorSchemeToggle } from "./ColorSchemeToggle";
import { getEditorExtensions } from "./editorTheme";
import { EditorToolbar } from "./EditorToolbar";
import {
  normalizeMarkdownText,
  openMarkdownFile,
  openMarkdownFromDataTransfer,
  saveMarkdownAs,
  printPdfBlob,
  savePdfAs,
  writeTextToHandle,
  type TextFileHandle,
} from "./fileIo";
import {
  applySettingsToMarkdown,
  frontmatterBlock,
  hasDocumentSettings,
  REQUIRED_SETTINGS,
  settingsFromMarkdown,
  validateDocumentSettings,
  type DocumentSettings,
} from "./frontmatter";
import { APP_MARK_SRC, APP_NAME, APP_NAME_FULL, APP_VERSION } from "./brand";
import { APP_COLOR_NAME } from "./brandColors";
import { tryRegisterWebMcpTools } from "./webmcp";
import { HtmlPreview } from "./HtmlPreview";
import {
  analyzeMarkdown,
  type MdDiagnostic,
} from "./mdAnalysis";
import {
  MessageConsole,
  MESSAGE_CONSOLE_COLLAPSED,
  MESSAGE_CONSOLE_COLLAPSED_TOUCH,
  MESSAGE_CONSOLE_EXPANDED,
} from "./MessageConsole";
import {
  CornerResizeHandle,
  type CornerResizeDelta,
} from "./CornerResizeHandle";
import { formatDiagItem, formatDiagSummary } from "./diagFormat";
import {
  ANALYSIS_CONSOLE_ID,
  getConsoleEntries,
  removeConsoleEntry,
  subscribeConsole,
  upsertConsoleEntry,
} from "./messageConsoleStore";
import { notify } from "./notify";
import {
  createConsolePopoutChannel,
  openConsolePopout,
  type ConsolePopoutMessage,
} from "./consolePopoutBridge";
import {
  createPopoutChannel,
  openPreviewPopout,
  type PopoutMessage,
} from "./popoutBridge";
import type { SplitterPaneSize } from "@mantine/hooks";
import { SAMPLE_MARKDOWN } from "./sample";
import {
  clearSessionHandle,
  EMPTY_MARKDOWN,
  loadSession,
  markSessionFileUsed,
  persistSessionHandle,
  readMarkdownFromHandle,
} from "./sessionStore";
import { chord } from "./platform";
import {
  navToUnsavedAction,
  type DocumentNav,
  type OpenedDocument,
} from "./documentNav";
import { UnsavedChangesModal } from "./UnsavedChangesModal";
import { MarkdownEditor } from "./MarkdownEditor";

const HelpModal = lazy(() =>
  import("./HelpModal").then((m) => ({ default: m.HelpModal }))
);
const SettingsModal = lazy(() =>
  import("./SettingsModal").then((m) => ({ default: m.SettingsModal }))
);
const PdfConfirmModal = lazy(() =>
  import("./PdfConfirmModal").then((m) => ({ default: m.PdfConfirmModal }))
);

type PreviewState = "idle" | "loading" | "ready" | "error" | "blocked";
function analysisBlockMessage(diagnostics: MdDiagnostic[]): string {
  return formatDiagSummary(
    diagnostics.filter((d) => d.severity === "error")
  );
}

async function fetchAnalyze(
  source: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; diagnostics: MdDiagnostic[]; error?: string }> {
  const res = await fetch("/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ markdown: source }),
    signal,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    ok?: boolean;
    diagnostics?: MdDiagnostic[];
  };
  const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
  const ok =
    typeof data.ok === "boolean"
      ? data.ok
      : diagnostics.every((d) => d.severity !== "error");
  return { ok, diagnostics };
}

function slugName(markdown: string): string {
  const t = settingsFromMarkdown(markdown).title.trim() || "document";
  return t.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}

function suggestedMdName(markdown: string, currentName: string | null): string {
  if (currentName?.trim()) return currentName;
  return `${slugName(markdown)}.md`;
}

export default function App() {
  const computedColorScheme = useComputedColorScheme("light");
  /** タブレット相当: 編集／プレビューを縦分割 */
  const isNarrow = useMediaQuery("(max-width: 768px)");
  /** スマホ相当: 編集／プレビューを切替表示 */
  const isPhone = useMediaQuery("(max-width: 560px)");
  /** タッチ向け: ヘッダ／コンソール／ボタンを大きくする */
  const touchUi = !!isNarrow;
  const consoleCollapsed = touchUi
    ? MESSAGE_CONSOLE_COLLAPSED_TOUCH
    : MESSAGE_CONSOLE_COLLAPSED;
  const headerHeight = isPhone ? 46 : touchUi ? 44 : 40;
  const chromeIconSize = touchUi ? "md" : "sm";
  const chromeIconPx = touchUi ? 18 : 16;
  const chromeBtnSize = touchUi ? "compact-sm" : "compact-xs";
  const brandMarkPx = touchUi ? 24 : 22;
  const [mobilePane, setMobilePane] = useState<"edit" | "preview" | "console">(
    "edit"
  );
  const isPhoneRef = useRef(false);
  const editorExtensions = useMemo(
    () => getEditorExtensions(computedColorScheme),
    [computedColorScheme]
  );
  const [sessionReady, setSessionReady] = useState(false);
  const [markdown, setMarkdown] = useState(EMPTY_MARKDOWN);
  /** 最後に開く／保存した内容（これと異なれば未保存） */
  const [savedContent, setSavedContent] = useState(EMPTY_MARKDOWN);
  const [docName, setDocName] = useState<string | null>(null);
  const fileHandleRef = useRef<TextFileHandle | null>(null);
  /** 入出力は常に normalize 済みなので文字列比較だけでよい */
  const dirty =
    sessionReady &&
    normalizeMarkdownText(markdown) !== normalizeMarkdownText(savedContent);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const onEditorChange = useCallback((value: string) => {
    setMarkdown(normalizeMarkdownText(value));
  }, []);
  const [debouncedMarkdown] = useDebouncedValue(markdown, 480);
  const localDiagnostics = useMemo(
    () => analyzeMarkdown(debouncedMarkdown),
    [debouncedMarkdown]
  );
  const [serverDiagnostics, setServerDiagnostics] = useState<MdDiagnostic[] | null>(
    null
  );
  const [analyzePending, setAnalyzePending] = useState(false);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  /** 直近の解析結果（この source についてのみプレビュー／PDF を進める） */
  const [analyzeGate, setAnalyzeGate] = useState<{
    source: string;
    ok: boolean;
    diagnostics: MdDiagnostic[];
  } | null>(null);
  const mdDiagnostics = serverDiagnostics ?? localDiagnostics;
  const mdDiagnosticsRef = useRef(mdDiagnostics);
  mdDiagnosticsRef.current = mdDiagnostics;
  const analysisHasErrors = mdDiagnostics.some((d) => d.severity === "error");
  const analysisErrorCount = mdDiagnostics.filter(
    (d) => d.severity === "error"
  ).length;
  isPhoneRef.current = !!isPhone;
  const jumpToProblem = useCallback((line: number) => {
    if (isPhoneRef.current) setMobilePane("edit");
    jumpToDiagnosticLine(editorViewRef.current, line);
  }, []);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [diagramErrorCount, setDiagramErrorCount] = useState(0);
  const [diagramErrorHint, setDiagramErrorHint] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSource, setPdfSource] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const lastPreviewKeyRef = useRef<string>("");
  const hasPreviewHtmlRef = useRef(false);
  /** 手動「プレビューを更新」中は debounce 側の自動更新を抑止 */
  const suppressAutoPreviewRef = useRef(false);
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;
  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    applyEditorDiagnostics(editorViewRef.current, mdDiagnostics);
  }, [mdDiagnostics]);

  const [previewPopped, setPreviewPopped] = useState(false);
  /** Splitter ドラッグ中（iframe がポインタを奪うのを防ぐ） */
  const [splitterResizing, setSplitterResizing] = useState(false);
  const previewWinRef = useRef<Window | null>(null);
  const popoutChannelRef = useRef<ReturnType<
    typeof createPopoutChannel
  > | null>(null);
  const consoleWinRef = useRef<Window | null>(null);
  const consolePopoutChannelRef = useRef<ReturnType<
    typeof createConsolePopoutChannel
  > | null>(null);
  const [settingsOpened, settingsHandlers] = useDisclosure(false);
  const [pdfConfirmOpened, pdfConfirmHandlers] = useDisclosure(false);
  const [helpOpened, helpHandlers] = useDisclosure(false);
  const [helpDocId, setHelpDocId] = useState<string | undefined>(undefined);
  /** 初回オープン以降はマウント維持（開閉トランジション用。初回のみ lazy 読込） */
  const [settingsMounted, setSettingsMounted] = useState(false);
  const [helpMounted, setHelpMounted] = useState(false);
  const [pdfConfirmMounted, setPdfConfirmMounted] = useState(false);
  useEffect(() => {
    if (settingsOpened) setSettingsMounted(true);
  }, [settingsOpened]);
  useEffect(() => {
    if (helpOpened) setHelpMounted(true);
  }, [helpOpened]);
  useEffect(() => {
    if (pdfConfirmOpened) setPdfConfirmMounted(true);
  }, [pdfConfirmOpened]);
  /** 本文打鍵では再計算しない（設定適用直後にプレビューが消えるのを防ぐ） */
  const frontmatterKey = useMemo(
    () => frontmatterBlock(markdown),
    [markdown]
  );
  const settingsMissing = useMemo(
    () => !hasDocumentSettings(markdown),
    // frontmatterKey が変わったときだけ。markdown はクロージャで最新を読む
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [frontmatterKey]
  );
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consolePopped, setConsolePopped] = useState(false);
  /** 起動時: 権限再許可が必要な前回ファイル */
  const [restoreHandle, setRestoreHandle] = useState<TextFileHandle | null>(
    null
  );
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [shellSizes, setShellSizes] = useState<SplitterPaneSize[]>([
    100,
    `${MESSAGE_CONSOLE_COLLAPSED}px`,
  ]);
  const consoleCollapsedRef = useRef(consoleCollapsed);
  consoleCollapsedRef.current = consoleCollapsed;
  const [shellResizing, setShellResizing] = useState(false);
  const [workspaceSizes, setWorkspaceSizes] = useState<SplitterPaneSize[]>([
    50, 50,
  ]);
  const [cornerResizing, setCornerResizing] = useState(false);

  const workspaceLeftPercent = (() => {
    const left = workspaceSizes[0];
    if (typeof left === "number") return left;
    if (typeof left === "string" && left.endsWith("%")) return parseFloat(left);
    return 50;
  })();

  const consoleHeightPx = (() => {
    const bottom = shellSizes[1];
    if (typeof bottom === "string" && bottom.endsWith("px")) {
      return parseFloat(bottom);
    }
    return consoleCollapsed;
  })();

  useEffect(() => {
    if (consoleOpen) return;
    setShellSizes([100, `${consoleCollapsed}px`]);
  }, [consoleCollapsed, consoleOpen]);

  const onCornerResize = useCallback((delta: CornerResizeDelta) => {
    const left =
      Math.round(Math.min(78, Math.max(22, delta.xRatio * 100)) * 10) / 10;
    setWorkspaceSizes([left, 100 - left]);
    const minH = consoleCollapsedRef.current;
    const h = Math.max(minH, Math.round(delta.consoleHeightPx));
    setShellSizes([100, `${h}px`]);
    setConsoleOpen(h > minH + 8);
  }, []);

  const onCornerResizeStart = useCallback(() => {
    setCornerResizing(true);
    setSplitterResizing(true);
    setShellResizing(true);
  }, []);

  const onCornerResizeEnd = useCallback(() => {
    setCornerResizing(false);
    setSplitterResizing(false);
    setShellResizing(false);
    setPreviewLayoutTick((n) => n + 1);
  }, []);

  const onCornerReset = useCallback(() => {
    setWorkspaceSizes([50, 50]);
    setShellSizes([100, `${MESSAGE_CONSOLE_EXPANDED}px`]);
    setConsoleOpen(true);
    setPreviewLayoutTick((n) => n + 1);
  }, []);

  const openConsolePane = useCallback(() => {
    if (isPhoneRef.current) {
      setMobilePane("console");
      setConsoleOpen(true);
      return;
    }
    setConsoleOpen(true);
    setShellSizes([100, `${MESSAGE_CONSOLE_EXPANDED}px`]);
  }, []);

  const toggleConsolePane = useCallback(() => {
    setConsoleOpen((open) => {
      const next = !open;
      setShellSizes(
        next
          ? [100, `${MESSAGE_CONSOLE_EXPANDED}px`]
          : [100, `${consoleCollapsedRef.current}px`]
      );
      return next;
    });
  }, []);

  /** ハンドルへ pointer capture。マウスがペイン上に出てもドラッグが切れないようにする */
  useEffect(() => {
    if (!sessionReady) return;
    const roots = document.querySelectorAll(
      ".ohyna-workspace, .ohyna-shell-split"
    );
    if (roots.length === 0) return;
    const onPointerDown = (event: Event) => {
      const pe = event as PointerEvent;
      if (pe.button !== 0) return;
      const handle = (pe.target as Element | null)?.closest?.(
        ".mantine-Splitter-handle"
      );
      if (!(handle instanceof HTMLElement)) return;
      try {
        handle.setPointerCapture(pe.pointerId);
      } catch {
        /* ignore */
      }
    };
    roots.forEach((root) =>
      root.addEventListener("pointerdown", onPointerDown, true)
    );
    return () =>
      roots.forEach((root) =>
        root.removeEventListener("pointerdown", onPointerDown, true)
      );
  }, [sessionReady, previewPopped, consolePopped]);

  /** 新しい操作エラーが来たらメッセージコンソールを開く（解析の差し替えは除く） */
  const lastConsoleErrorIdRef = useRef<string | null>(null);
  useEffect(() => {
    return subscribeConsole(() => {
      const latest = getConsoleEntries()[0];
      if (
        latest?.level === "error" &&
        latest.id !== ANALYSIS_CONSOLE_ID &&
        latest.id !== lastConsoleErrorIdRef.current
      ) {
        lastConsoleErrorIdRef.current = latest.id;
        if (!consolePopped) openConsolePane();
      }
    });
  }, [consolePopped, openConsolePane]);

  /** 起動: 前回ファイル → 権限待ち／失敗時は空／初回はサンプル */
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const session = await loadSession();
      if (cancelled) return;

      if (session.fileHandle) {
        // 起動時は requestPermission しない（ユーザー操作外だと毎回失敗しハンドルを消してしまう）
        const read = await readMarkdownFromHandle(session.fileHandle, {
          interactive: false,
        });
        if (cancelled) return;
        if (read.ok) {
          fileHandleRef.current = session.fileHandle;
          setRestoreHandle(null);
          setDocName(read.name);
          setMarkdown(read.text);
          setSavedContent(read.text);
          setSessionReady(true);
          return;
        }
        if (read.reason === "permission") {
          // ハンドルは残し、ユーザー操作で再開できるようにする
          fileHandleRef.current = null;
          setRestoreHandle(session.fileHandle);
          setDocName(read.name);
          setMarkdown(EMPTY_MARKDOWN);
          setSavedContent(EMPTY_MARKDOWN);
          setSessionReady(true);
          return;
        }
        await clearSessionHandle(true);
        if (cancelled) return;
        fileHandleRef.current = null;
        setRestoreHandle(null);
        setDocName(null);
        setMarkdown(EMPTY_MARKDOWN);
        setSavedContent(EMPTY_MARKDOWN);
        notify({
          color: "orange",
          title: "前回のファイルを開けませんでした",
          message: "ファイルが移動または削除された可能性があります",
          autoClose: 3500,
        });
        setSessionReady(true);
        return;
      }

      if (!session.everUsedFiles) {
        const sample = normalizeMarkdownText(SAMPLE_MARKDOWN);
        setDocName(null);
        setMarkdown(sample);
        setSavedContent(sample);
      } else {
        fileHandleRef.current = null;
        setDocName(null);
        setMarkdown(EMPTY_MARKDOWN);
        setSavedContent(EMPTY_MARKDOWN);
      }
      setRestoreHandle(null);
      setSessionReady(true);
    };
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const restorePreviousFile = async () => {
    if (!restoreHandle || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const read = await readMarkdownFromHandle(restoreHandle, {
        interactive: true,
      });
      if (read.ok) {
        fileHandleRef.current = restoreHandle;
        setRestoreHandle(null);
        setDocName(read.name);
        setMarkdown(read.text);
        setSavedContent(read.text);
        void persistSessionHandle(restoreHandle);
        notify({
          color: "teal",
          title: "前回のファイルを開きました",
          message: read.name,
          autoClose: 2500,
        });
        return;
      }
      if (read.reason === "permission") {
        notify({
          color: "orange",
          title: "ファイルへのアクセスが許可されませんでした",
          message: "もう一度試すか、ファイルメニューから開いてください",
          autoClose: 4000,
        });
        return;
      }
      await clearSessionHandle(true);
      fileHandleRef.current = null;
      setRestoreHandle(null);
      setDocName(null);
      setMarkdown(EMPTY_MARKDOWN);
      setSavedContent(EMPTY_MARKDOWN);
      notify({
        color: "orange",
        title: "前回のファイルを開けませんでした",
        message: "ファイルが移動または削除された可能性があります",
        autoClose: 3500,
      });
    } finally {
      setRestoreBusy(false);
    }
  };

  const dismissRestorePrevious = () => {
    void clearSessionHandle(true);
    setRestoreHandle(null);
    setDocName(null);
  };

  useEffect(() => {
    if (!sessionReady) return;
    analyzeAbortRef.current?.abort();
    // 新しい debounce 源へ移るとき、遅い旧プレビューが後から勝たないように中断
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setBusy(false);
    setPreviewState((s) => {
      if (s !== "loading") return s;
      return hasPreviewHtmlRef.current ? "ready" : "idle";
    });

    const ac = new AbortController();
    analyzeAbortRef.current = ac;
    setAnalyzePending(true);
    setServerDiagnostics(null);
    setAnalyzeGate(null);
    const source = debouncedMarkdown;

    const run = async () => {
      try {
        const result = await fetchAnalyze(source, ac.signal);
        if (ac.signal.aborted || analyzeAbortRef.current !== ac) return;
        setServerDiagnostics(result.diagnostics);
        setAnalyzeGate({
          source,
          ok: result.ok,
          diagnostics: result.diagnostics,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (ac.signal.aborted || analyzeAbortRef.current !== ac) return;
        // サーバ未到達時はローカル即時チェックでゲート
        const local = analyzeMarkdown(source);
        setServerDiagnostics(null);
        setAnalyzeGate({
          source,
          ok: local.every((d) => d.severity !== "error"),
          diagnostics: local,
        });
      } finally {
        if (analyzeAbortRef.current === ac) {
          setAnalyzePending(false);
        }
      }
    };
    void run();
    return () => {
      ac.abort();
    };
  }, [debouncedMarkdown, sessionReady]);

  /**
   * ドキュメント設定不足をコンソールへ出す（モーダルは開かない）。
   * PDFを作成は IDE のデバッグ実行に相当し、結果はメッセージ欄で確認する。
   */
  const reportSettingsRequired = useCallback(
    (actionLabel: string, source: string) => {
      const issues = validateDocumentSettings(settingsFromMarkdown(source));
      const detail =
        issues.length > 0
          ? issues
              .map((i) => {
                const label =
                  REQUIRED_SETTINGS.find((r) => r.field === i.field)?.label ||
                  i.field;
                return `${label}: ${i.message}`;
              })
              .join("\n")
          : "ドキュメント設定（タイトル・色テーマ・フォント・言語）を整えてください。";
      notify({
        color: "red",
        level: "error",
        title: `${actionLabel}できません`,
        message: "ドキュメント設定が未完了です",
        detail,
        autoClose: 5000,
      });
    },
    []
  );

  const openSettingsEdit = () => {
    settingsHandlers.open();
  };

  const closeSettings = () => {
    const resume = resumeNavRef.current;
    if (resume) {
      // 設定を後回し → 未保存確認に戻す
      resumeNavRef.current = null;
      setPendingNav(resume);
    }
    settingsHandlers.close();
  };

  const postPopoutState = useCallback(() => {
    // hello 受信時は previewPopped 反映前でも送る（子窓の初回同期）
    popoutChannelRef.current?.post({
      type: "state",
      previewHtml,
      settingsMissing,
      previewState,
      errorMessage,
      diagramErrorCount,
      diagramErrorHint,
    });
  }, [
    previewHtml,
    settingsMissing,
    previewState,
    errorMessage,
    diagramErrorCount,
    diagramErrorHint,
  ]);

  const postPopoutStateRef = useRef(postPopoutState);
  postPopoutStateRef.current = postPopoutState;

  const postPopoutPreview = useCallback(() => {
    if (!previewPopped) return;
    popoutChannelRef.current?.post({
      type: "preview",
      html: previewHtml,
      settingsMissing,
      previewState,
      errorMessage,
      diagramErrorCount,
      diagramErrorHint,
    });
  }, [
    previewPopped,
    previewHtml,
    settingsMissing,
    previewState,
    errorMessage,
    diagramErrorCount,
    diagramErrorHint,
  ]);

  useEffect(() => {
    const ch = createPopoutChannel((msg: PopoutMessage) => {
      if (msg.type === "hello" || msg.type === "request-state") {
        postPopoutStateRef.current();
        return;
      }
      if (msg.type === "bye" || msg.type === "dock") {
        try {
          previewWinRef.current?.close();
        } catch {
          /* ignore */
        }
        previewWinRef.current = null;
        setPreviewPopped(false);
      }
    });
    popoutChannelRef.current = ch;
    return () => {
      ch.close();
      popoutChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    postPopoutPreview();
  }, [postPopoutPreview]);

  useEffect(() => {
    if (!previewPopped) return;
    const id = window.setInterval(() => {
      if (previewWinRef.current?.closed) {
        previewWinRef.current = null;
        setPreviewPopped(false);
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [previewPopped]);

  useEffect(() => {
    const onUnload = () => {
      try {
        previewWinRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        consoleWinRef.current?.close();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const openPreviewWindow = () => {
    const w = openPreviewPopout();
    if (!w) {
      notify({
        color: "orange",
        title: "別ウィンドウを開けませんでした",
        message: "ポップアップブロックを許可してください。",
      });
      return;
    }
    previewWinRef.current = w;
    setPreviewPopped(true);
    window.setTimeout(() => postPopoutStateRef.current(), 120);
  };

  const focusPreviewWindow = () => {
    try {
      if (previewWinRef.current && !previewWinRef.current.closed) {
        previewWinRef.current.focus();
        return;
      }
    } catch {
      /* reopen */
    }
    openPreviewWindow();
  };

  const dockPreviewWindow = () => {
    popoutChannelRef.current?.post({ type: "dock" });
    try {
      previewWinRef.current?.close();
    } catch {
      /* ignore */
    }
    previewWinRef.current = null;
    setPreviewPopped(false);
  };

  const postConsolePopoutState = useCallback(() => {
    consolePopoutChannelRef.current?.post({
      type: "state",
      analysis: {
        pending: analyzePending && serverDiagnostics == null,
        diagnostics: mdDiagnostics,
      },
      preview: {
        state: previewState,
        message: errorMessage,
        diagramErrorCount,
        diagramErrorHint,
        analyzePending:
          analyzePending &&
          (analyzeGate == null ||
            analyzeGate.source !== debouncedMarkdown),
      },
    });
  }, [
    analyzePending,
    serverDiagnostics,
    mdDiagnostics,
    previewState,
    errorMessage,
    diagramErrorCount,
    diagramErrorHint,
    analyzeGate,
    debouncedMarkdown,
  ]);

  const postConsolePopoutStateRef = useRef(postConsolePopoutState);
  postConsolePopoutStateRef.current = postConsolePopoutState;

  useEffect(() => {
    const ch = createConsolePopoutChannel((msg: ConsolePopoutMessage) => {
      if (msg.type === "hello" || msg.type === "request-state") {
        postConsolePopoutStateRef.current();
        return;
      }
      if (msg.type === "jump-line" && msg.line > 0) {
        jumpToProblem(msg.line);
        try {
          window.focus();
        } catch {
          /* ignore */
        }
        return;
      }
      if (msg.type === "bye" || msg.type === "dock") {
        try {
          consoleWinRef.current?.close();
        } catch {
          /* ignore */
        }
        consoleWinRef.current = null;
        setConsolePopped(false);
        openConsolePane();
      }
    });
    consolePopoutChannelRef.current = ch;
    return () => {
      ch.close();
      consolePopoutChannelRef.current = null;
    };
  }, [jumpToProblem, openConsolePane]);

  useEffect(() => {
    if (!consolePopped) return;
    postConsolePopoutState();
  }, [consolePopped, postConsolePopoutState]);

  useEffect(() => {
    if (!consolePopped) return;
    const id = window.setInterval(() => {
      if (consoleWinRef.current?.closed) {
        consoleWinRef.current = null;
        setConsolePopped(false);
        openConsolePane();
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [consolePopped, openConsolePane]);

  const openConsoleWindow = () => {
    const w = openConsolePopout();
    if (!w) {
      notify({
        color: "orange",
        title: "別ウィンドウを開けませんでした",
        message: "ポップアップブロックを許可してください。",
      });
      return;
    }
    consoleWinRef.current = w;
    setConsolePopped(true);
    setConsoleOpen(false);
    window.setTimeout(() => postConsolePopoutStateRef.current(), 120);
  };

  const focusConsoleWindow = () => {
    try {
      if (consoleWinRef.current && !consoleWinRef.current.closed) {
        consoleWinRef.current.focus();
        return;
      }
    } catch {
      /* reopen */
    }
    openConsoleWindow();
  };

  const dockConsoleWindow = () => {
    consolePopoutChannelRef.current?.post({ type: "dock" });
    try {
      consoleWinRef.current?.close();
    } catch {
      /* ignore */
    }
    consoleWinRef.current = null;
    setConsolePopped(false);
    openConsolePane();
  };

  /** Splitter 終了時にプレビュー幅フィットを再計測（内容の再取得はしない） */
  const [previewLayoutTick, setPreviewLayoutTick] = useState(0);

  useEffect(() => {
    setPreviewLayoutTick((n) => n + 1);
  }, [isNarrow, isPhone, mobilePane]);

  const onPreviewDiagramStatus = useCallback(
    (status: { errorCount: number; errors: string[] }) => {
      setDiagramErrorCount(status.errorCount);
      setDiagramErrorHint(
        status.errorCount > 0
          ? [
              `Mermaid ダイアグラム ${status.errorCount} 件の描画に失敗しました。`,
              status.errors[0] || "",
              "プレビュー内の赤い枠を確認してください。",
            ]
              .filter(Boolean)
              .join("\n")
          : ""
      );
    },
    []
  );

  const refreshPreview = useCallback(
    async (source: string, opts?: { force?: boolean }) => {
      previewAbortRef.current?.abort();
      if (!source.trim()) {
        lastPreviewKeyRef.current = "";
        hasPreviewHtmlRef.current = false;
        setPreviewHtml(null);
        setPreviewState("idle");
        setErrorMessage("");
        setDiagramErrorCount(0);
        setDiagramErrorHint("");
        setBusy(false);
        return;
      }
      if (!hasDocumentSettings(source)) {
        lastPreviewKeyRef.current = "";
        hasPreviewHtmlRef.current = false;
        setPreviewHtml(null);
        setPreviewState("idle");
        setErrorMessage("ドキュメント設定が未完了のためプレビューできません");
        setDiagramErrorCount(0);
        setDiagramErrorHint("");
        setBusy(false);
        return;
      }
      if (
        !opts?.force &&
        source === lastPreviewKeyRef.current &&
        hasPreviewHtmlRef.current
      ) {
        setPreviewState("ready");
        return;
      }
      const ac = new AbortController();
      previewAbortRef.current = ac;
      const stillCurrent = () =>
        !ac.signal.aborted && previewAbortRef.current === ac;
      setBusy(true);
      setPreviewState("loading");
      setErrorMessage("");
      setDiagramErrorCount(0);
      setDiagramErrorHint("");
      try {
        const res = await fetch("/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ markdown: source }),
          signal: ac.signal,
        });
        if (!stillCurrent()) return;
        if (!res.ok) {
          let msg = res.statusText;
          let diagnostics: MdDiagnostic[] | undefined;
          try {
            const err = await res.json();
            msg = err.error || msg;
            if (Array.isArray(err.diagnostics)) {
              diagnostics = err.diagnostics;
            }
          } catch {
            /* ignore */
          }
          if (!stillCurrent()) return;
          if (res.status === 422 && diagnostics) {
            setServerDiagnostics(diagnostics);
            setAnalyzeGate({ source, ok: false, diagnostics });
            const blockMsg = analysisBlockMessage(diagnostics);
            if (hasPreviewHtmlRef.current) {
              setPreviewState("blocked");
              setErrorMessage(blockMsg);
            } else {
              setPreviewHtml(null);
              setPreviewState("blocked");
              setErrorMessage(blockMsg);
            }
            return;
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as { html?: string };
        if (!stillCurrent()) return;
        if (!data.html) throw new Error("プレビュー HTML が空です");
        lastPreviewKeyRef.current = source;
        hasPreviewHtmlRef.current = true;
        setPreviewHtml(data.html);
        setPreviewState("ready");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!stillCurrent()) return;
        const msg = e instanceof Error ? e.message : String(e);
        setPreviewState("error");
        setErrorMessage(msg);
        notify({
          color: "red",
          title: "プレビューエラー",
          message: msg,
        });
      } finally {
        if (previewAbortRef.current === ac) {
          setBusy(false);
        }
      }
    },
    []
  );

  const blockPreviewForAnalysis = useCallback((diagnostics: MdDiagnostic[]) => {
    previewAbortRef.current?.abort();
    setBusy(false);
    const msg = analysisBlockMessage(diagnostics);
    if (hasPreviewHtmlRef.current) {
      setPreviewState("blocked");
      setErrorMessage(msg);
    } else {
      lastPreviewKeyRef.current = "";
      setPreviewHtml(null);
      setPreviewState("blocked");
      setErrorMessage(msg);
    }
  }, []);

  useEffect(() => {
    if (!analyzeGate || analyzeGate.source !== debouncedMarkdown) {
      return;
    }
    if (suppressAutoPreviewRef.current) {
      return;
    }
    // 入力で本文が先に進んでいるときは、古いゲートでプレビューしない
    if (analyzeGate.source !== markdownRef.current) {
      return;
    }
    if (!analyzeGate.ok) {
      blockPreviewForAnalysis(analyzeGate.diagnostics);
      const errors = analyzeGate.diagnostics.filter(
        (d) => d.severity === "error"
      );
      const detail = errors
        .map((d) => formatDiagItem(d.line, d.message))
        .join("\n");
      upsertConsoleEntry({
        id: ANALYSIS_CONSOLE_ID,
        level: "error",
        title: `問題 ${errors.length} 件のためプレビューを更新できません`,
        detail,
      });
      return;
    }
    removeConsoleEntry(ANALYSIS_CONSOLE_ID);
    void refreshPreview(debouncedMarkdown);
  }, [
    analyzeGate,
    debouncedMarkdown,
    refreshPreview,
    blockPreviewForAnalysis,
  ]);

  const forceRefreshGenRef = useRef(0);
  const forceRefreshPreview = async () => {
    const source = markdown;
    const gen = ++forceRefreshGenRef.current;
    // 手動更新中は debounce 解析を差し替え、自動プレビュー二重起動を抑止
    analyzeAbortRef.current?.abort();
    const ac = new AbortController();
    analyzeAbortRef.current = ac;
    suppressAutoPreviewRef.current = true;
    setAnalyzePending(true);
    try {
      const result = await fetchAnalyze(source, ac.signal);
      if (gen !== forceRefreshGenRef.current || ac.signal.aborted) return;
      if (markdownRef.current !== source) return;
      setServerDiagnostics(result.diagnostics);
      setAnalyzeGate({
        source,
        ok: result.ok,
        diagnostics: result.diagnostics,
      });
      if (!result.ok) {
        blockPreviewForAnalysis(result.diagnostics);
        notify({
          color: "orange",
          title: "プレビューを更新できませんでした",
          message: analysisBlockMessage(result.diagnostics),
        });
        return;
      }
      await refreshPreview(source, { force: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (gen !== forceRefreshGenRef.current || ac.signal.aborted) return;
      if (markdownRef.current !== source) return;
      const local = analyzeMarkdown(source);
      setServerDiagnostics(null);
      const ok = local.every((d) => d.severity !== "error");
      setAnalyzeGate({ source, ok, diagnostics: local });
      if (!ok) {
        blockPreviewForAnalysis(local);
        notify({
          color: "orange",
          title: "プレビューを更新できませんでした",
          message: analysisBlockMessage(local),
        });
        return;
      }
      await refreshPreview(source, { force: true });
    } finally {
      if (gen === forceRefreshGenRef.current) {
        suppressAutoPreviewRef.current = false;
        if (analyzeAbortRef.current === ac) {
          setAnalyzePending(false);
        }
      }
    }
  };
  const forceRefreshPreviewRef = useRef(forceRefreshPreview);
  forceRefreshPreviewRef.current = forceRefreshPreview;
  const generatePdfRef = useRef<() => Promise<void>>(async () => {});
  const printPdfRef = useRef<() => Promise<Record<string, unknown>>>(async () => ({
    ok: false,
    reason: "not-ready",
  }));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const docNameRef = useRef(docName);
  docNameRef.current = docName;
  const analyzeGateRef = useRef(analyzeGate);
  analyzeGateRef.current = analyzeGate;
  const pdfBusyRef = useRef(pdfBusy);
  pdfBusyRef.current = pdfBusy;
  const analyzePendingRef = useRef(analyzePending);
  analyzePendingRef.current = analyzePending;
  const setMarkdownRef = useRef(setMarkdown);
  setMarkdownRef.current = setMarkdown;

  useEffect(() => {
    if (!sessionReady) return;
    const ac = new AbortController();
    void tryRegisterWebMcpTools(
      {
        getMarkdown: () => markdownRef.current,
        setMarkdown: (text) => {
          setMarkdownRef.current(normalizeMarkdownText(text));
        },
        getDocumentSettings: () => {
          const s = settingsFromMarkdown(markdownRef.current);
          const issues = validateDocumentSettings(s);
          return {
            ...s,
            valid: issues.length === 0,
            issues,
          };
        },
        getStatus: () => {
          const gate = analyzeGateRef.current;
          const source = markdownRef.current;
          return {
            docName: docNameRef.current,
            dirty: dirtyRef.current,
            settingsComplete: hasDocumentSettings(source),
            analyzeOk: gate?.source === source ? gate.ok : null,
            analyzePending: analyzePendingRef.current,
            pdfBusy: pdfBusyRef.current,
            markdownLength: source.length,
          };
        },
        analyze: async () => {
          const result = await fetchAnalyze(markdownRef.current);
          setServerDiagnostics(result.diagnostics);
          setAnalyzeGate({
            source: markdownRef.current,
            ok: result.ok,
            diagnostics: result.diagnostics,
          });
          return result;
        },
        refreshPreview: () => forceRefreshPreviewRef.current(),
        preparePdf: async () => {
          if (pdfBusyRef.current) {
            return { ok: false, reason: "busy" };
          }
          await generatePdfRef.current();
          return { ok: true, confirmUiOpened: true };
        },
        printPdf: () => printPdfRef.current(),
        openHelp: (docId) => {
          setHelpDocId(docId);
          helpHandlers.open();
        },
      },
      { signal: ac.signal }
    );
    return () => ac.abort();
    // helpHandlers.open は安定参照とみなす（再登録ループを避ける）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per session
  }, [sessionReady]);

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort();
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  /** Markdown が変わったら PDF キャッシュを無効化 */
  useEffect(() => {
    if (pdfSource !== null && pdfSource !== markdown) {
      setPdfSource(null);
    }
  }, [markdown, pdfSource]);

  const [pendingNav, setPendingNav] = useState<DocumentNav | null>(null);
  const [navSaving, setNavSaving] = useState(false);
  /** 未保存確認の「保存」中に設定が必要になったとき、適用後に続行する */
  const resumeNavRef = useRef<DocumentNav | null>(null);

  const adoptOpenedMarkdown = (
    result: OpenedDocument,
    opts?: { silent?: boolean }
  ) => {
    const text = normalizeMarkdownText(result.text);
    fileHandleRef.current = result.handle;
    setRestoreHandle(null);
    setDocName(result.name);
    setMarkdown(text);
    setSavedContent(text);
    if (result.handle) {
      void persistSessionHandle(result.handle);
    } else {
      void markSessionFileUsed(null);
    }
    if (!opts?.silent) {
      notify({
        color: APP_COLOR_NAME,
        title: "開きました",
        message: result.name,
        autoClose: 2000,
      });
    }
  };

  /** Create / Close の実体（未保存ゲート通過後） */
  const commitNewOrClose = (nav: Extract<DocumentNav, { type: "new" | "close" }>) => {
    fileHandleRef.current = null;
    setRestoreHandle(null);
    setDocName(null);
    const content = normalizeMarkdownText(
      nav.type === "new" && nav.template === "sample"
        ? SAMPLE_MARKDOWN
        : EMPTY_MARKDOWN
    );
    setMarkdown(content);
    setSavedContent(content);
    void clearSessionHandle(true);
    setFileMenuOpen(false);
    if (nav.type === "close") {
      notify({
        color: APP_COLOR_NAME,
        title: "閉じました",
        message: "編集中のドキュメントを終えました",
        autoClose: 2000,
      });
    } else if (nav.template === "sample") {
      notify({
        color: APP_COLOR_NAME,
        title: "サンプルを開きました",
        autoClose: 2000,
      });
    } else {
      notify({
        color: APP_COLOR_NAME,
        title: "新しいドキュメント",
        autoClose: 2000,
      });
    }
  };

  const commitNav = (nav: DocumentNav) => {
    if (nav.type === "open") {
      adoptOpenedMarkdown(nav.document);
      return;
    }
    commitNewOrClose(nav);
  };

  /** 未保存なら確認モーダル、なければすぐ実行 */
  const requestNav = (nav: DocumentNav) => {
    if (!dirty) {
      commitNav(nav);
      return;
    }
    setPendingNav(nav);
  };

  const newDocument = (kind: "empty" | "sample") => {
    setFileMenuOpen(false);
    requestNav({ type: "new", template: kind });
  };

  const closeDocument = () => {
    setFileMenuOpen(false);
    // すでに空の無題かつ保存済みなら何もしない
    if (
      !dirty &&
      !docName &&
      !fileHandleRef.current &&
      normalizeMarkdownText(markdown) === normalizeMarkdownText(EMPTY_MARKDOWN)
    ) {
      return;
    }
    requestNav({ type: "close" });
  };

  const openDocument = async () => {
    // showOpenFilePicker はユーザー操作の同一同期スタックで開始する。
    // 未保存確認はピッカー後（選択結果を保留してモーダル）にする。
    try {
      const result = await openMarkdownFile();
      setFileMenuOpen(false);
      if (!result) return;
      requestNav({ type: "open", document: result });
    } catch (e) {
      setFileMenuOpen(false);
      const msg = e instanceof Error ? e.message : String(e);
      notify({ color: "red", title: "開けませんでした", message: msg });
    }
  };

  const onAppDragOver = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onAppDrop = async (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    if (busy || pdfBusy) return;
    try {
      const result = await openMarkdownFromDataTransfer(e.dataTransfer);
      if (!result) {
        notify({
          color: "orange",
          title: "開けませんでした",
          message: "Markdown ファイル（.md）をドロップしてください",
          autoClose: 2500,
        });
        return;
      }
      requestNav({ type: "open", document: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify({ color: "red", title: "開けませんでした", message: msg });
    }
  };

  /** 保存成功後: 書き込んだ本文を基準に編集中ドキュメントとして採用する */
  const adoptSavedMarkdown = (
    name: string,
    handle: TextFileHandle | null,
    savedText: string,
    opts?: { silent?: boolean }
  ) => {
    const text = normalizeMarkdownText(savedText);
    const savedName = name.trim() || suggestedMdName(text, docName);
    fileHandleRef.current = handle;
    setDocName(savedName);
    // 参照が同じなら CM の onChange エコーで再び dirty になるのを避ける
    setMarkdown((cur) =>
      normalizeMarkdownText(cur) === text ? cur : text
    );
    setSavedContent(text);
    if (handle) void persistSessionHandle(handle);
    else void markSessionFileUsed(null);
    setFileMenuOpen(false);
    if (!opts?.silent) {
      notify({
        color: "teal",
        title: "保存しました",
        message: savedName,
        autoClose: 2000,
      });
    }
  };

  const saveDocumentAs = async (
    sourceText?: string,
    opts?: { quietSettings?: boolean }
  ): Promise<boolean> => {
    const text = normalizeMarkdownText(sourceText ?? markdown);
    if (!hasDocumentSettings(text)) {
      setFileMenuOpen(false);
      if (!opts?.quietSettings) {
        reportSettingsRequired("保存", text);
      }
      return false;
    }
    try {
      const result = await saveMarkdownAs(
        text,
        suggestedMdName(text, docName)
      );
      setFileMenuOpen(false);
      if (!result) return false;
      adoptSavedMarkdown(result.name, result.handle, text);
      return true;
    } catch (e) {
      setFileMenuOpen(false);
      const msg = e instanceof Error ? e.message : String(e);
      notify({ color: "red", title: "保存できませんでした", message: msg });
      return false;
    }
  };

  const saveDocument = async (
    sourceText?: string,
    opts?: { quietSettings?: boolean }
  ): Promise<boolean> => {
    const text = normalizeMarkdownText(sourceText ?? markdown);
    if (!hasDocumentSettings(text)) {
      setFileMenuOpen(false);
      if (!opts?.quietSettings) {
        reportSettingsRequired("保存", text);
      }
      return false;
    }
    const handle = fileHandleRef.current;
    if (handle) {
      try {
        const ok = await writeTextToHandle(handle, text);
        if (!ok) {
          return await saveDocumentAs(text, opts);
        }
        const savedName =
          (handle.name || "").trim() || suggestedMdName(text, docName);
        adoptSavedMarkdown(savedName, handle, text);
        return true;
      } catch (e) {
        setFileMenuOpen(false);
        const msg = e instanceof Error ? e.message : String(e);
        notify({
          color: "red",
          title: "保存できませんでした",
          message: msg,
        });
        return false;
      }
    }
    return await saveDocumentAs(text, opts);
  };

  const applySettings = (settings: DocumentSettings) => {
    const next = normalizeMarkdownText(
      applySettingsToMarkdown(markdown, settings)
    );
    setMarkdown(next);

    const resume = resumeNavRef.current;
    if (resume) {
      resumeNavRef.current = null;
      void (async () => {
        setNavSaving(true);
        try {
          const ok = await saveDocument(next, { quietSettings: true });
          if (ok) {
            commitNav(resume);
            return;
          }
          setPendingNav(resume);
          notify({
            color: "orange",
            title: "保存を完了してください",
            message: "設定は適用済みです。確認ダイアログから保存を続けられます。",
            autoClose: 4000,
          });
        } finally {
          setNavSaving(false);
        }
      })();
      return;
    }

    notify({
      color: "teal",
      title: "ドキュメント設定を適用しました",
      message: "ファイルへ書き込むには「保存」してください",
      autoClose: 2500,
    });
  };

  const cancelPendingNav = () => {
    if (navSaving) return;
    resumeNavRef.current = null;
    setPendingNav(null);
  };

  const discardPendingNav = () => {
    if (!pendingNav || navSaving) return;
    const nav = pendingNav;
    resumeNavRef.current = null;
    setPendingNav(null);
    commitNav(nav);
  };

  const saveThenPendingNav = async () => {
    if (!pendingNav || navSaving) return;
    const nav = pendingNav;
    const text = normalizeMarkdownText(markdown);
    if (!hasDocumentSettings(text)) {
      reportSettingsRequired("保存", text);
      // 未保存確認は残し、利用者が設定を直してから再度「保存」できる
      return;
    }
    setNavSaving(true);
    try {
      const ok = await saveDocument(text, { quietSettings: true });
      if (!ok) {
        // 名前を付けて保存のキャンセルなど → 確認を戻す
        setPendingNav(nav);
        return;
      }
      setPendingNav(null);
      commitNav(nav);
    } finally {
      setNavSaving(false);
    }
  };

  const revokePdfUrl = () => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    pdfBlobRef.current = null;
    setPdfUrl(null);
  };

  /** PDF を生成し、完了後に確認モーダルを開く */
  const generatePdf = async () => {
    if (!hasDocumentSettings(markdown)) {
      reportSettingsRequired("PDFを作成", markdown);
      return;
    }
    if (pdfUrl && pdfBlobRef.current && pdfSource === markdown) {
      pdfConfirmHandlers.open();
      return;
    }
    setPdfBusy(true);
    try {
      let diagnostics = mdDiagnostics;
      let ok = !analysisHasErrors;
      // 編集直後でも最新 Markdown で再検証
      try {
        const result = await fetchAnalyze(markdown);
        diagnostics = result.diagnostics;
        ok = result.ok;
        setServerDiagnostics(result.diagnostics);
        setAnalyzeGate({
          source: markdown,
          ok: result.ok,
          diagnostics: result.diagnostics,
        });
      } catch {
        diagnostics = analyzeMarkdown(markdown);
        ok = diagnostics.every((d) => d.severity !== "error");
        setServerDiagnostics(null);
        setAnalyzeGate({ source: markdown, ok, diagnostics });
      }
      if (!ok) {
        notify({
          color: "orange",
          title: "PDF を作成できませんでした",
          message: analysisBlockMessage(diagnostics),
        });
        return;
      }
      const res = await fetch("/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const err = await res.json();
          msg = err.error || msg;
          if (Array.isArray(err.diagnostics)) {
            setServerDiagnostics(err.diagnostics);
            setAnalyzeGate({
              source: markdown,
              ok: false,
              diagnostics: err.diagnostics,
            });
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      revokePdfUrl();
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      pdfBlobRef.current = blob;
      setPdfUrl(url);
      setPdfSource(markdown);
      pdfConfirmHandlers.open();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify({ color: "red", title: "PDF を作成できませんでした", message: msg });
    } finally {
      setPdfBusy(false);
    }
  };
  generatePdfRef.current = generatePdf;

  const savePdfDocument = async () => {
    const blob = pdfBlobRef.current;
    if (!blob || pdfSource !== markdown) {
      void generatePdf();
      return;
    }
    try {
      const result = await savePdfAs(blob, `${slugName(markdown)}.pdf`);
      if (!result) return;
      notify({
        color: "teal",
        title: "保存しました",
        message: result.name,
        autoClose: 2000,
      });
      pdfConfirmHandlers.close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify({ color: "red", title: "保存できませんでした", message: msg });
    }
  };

  const printPdfDocument = async (): Promise<Record<string, unknown>> => {
    const blob = pdfBlobRef.current;
    if (!blob || pdfSource !== markdown) {
      if (pdfBusyRef.current) {
        return { ok: false, reason: "busy" };
      }
      await generatePdf();
      const ready = pdfBlobRef.current;
      if (!ready) {
        return { ok: false, reason: "pdf-not-ready" };
      }
      try {
        await printPdfBlob(ready);
        return { ok: true, generated: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify({ color: "red", title: "印刷を開始できませんでした", message: msg });
        return { ok: false, reason: "print-failed", message: msg };
      }
    }
    try {
      await printPdfBlob(blob);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify({ color: "red", title: "印刷を開始できませんでした", message: msg });
      return { ok: false, reason: "print-failed", message: msg };
    }
  };
  printPdfRef.current = printPdfDocument;

  const openDocumentRef = useRef(openDocument);
  const saveDocumentRef = useRef(saveDocument);
  const saveDocumentAsRef = useRef(saveDocumentAs);
  openDocumentRef.current = openDocument;
  saveDocumentRef.current = saveDocument;
  saveDocumentAsRef.current = saveDocumentAs;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s" && e.shiftKey) {
        e.preventDefault();
        if (!busy && !pdfBusy) void saveDocumentAsRef.current();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        if (!busy && !pdfBusy) void saveDocumentRef.current();
        return;
      }
      if (key === "o") {
        e.preventDefault();
        if (!busy && !pdfBusy) void openDocumentRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, pdfBusy]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const base = docName || "無題";
    document.title = `${dirty ? "● " : ""}${base} — ${APP_NAME}`;
  }, [docName, dirty]);

  return (
    <AppShell
      className={dirty ? "ohyna-app ohyna-app--dirty" : "ohyna-app"}
      mode="static"
      header={{ height: headerHeight }}
      footer={
        consolePopped ? { height: consoleCollapsed } : undefined
      }
      padding={0}
      onDragOver={onAppDragOver}
      onDrop={(e) => void onAppDrop(e)}
    >
      <AppShell.Header px="sm" className="ohyna-app-header">
        <Group h="100%" justify="space-between" wrap="nowrap" gap={touchUi ? "xs" : "sm"}>
          <Group gap={touchUi ? 6 : 8} wrap="nowrap" style={{ minWidth: 0 }}>
            <Tooltip label={`${APP_NAME_FULL} ${APP_VERSION}`} withArrow>
              <a
                className="ohyna-brand"
                href="/"
                aria-label={`${APP_NAME_FULL} ${APP_VERSION}`}
                onClick={(e) => e.preventDefault()}
              >
                <img
                  className="ohyna-brand-mark"
                  src={APP_MARK_SRC}
                  width={brandMarkPx}
                  height={brandMarkPx}
                  alt=""
                  aria-hidden
                />
                <Text
                  size="sm"
                  fw={700}
                  className="ohyna-brand-title"
                  component="span"
                >
                  {APP_NAME}
                </Text>
                <Text
                  size="xs"
                  c="dimmed"
                  className="ohyna-brand-version"
                  component="span"
                >
                  {APP_VERSION}
                </Text>
              </a>
            </Tooltip>
            <Tooltip
              label={dirty ? "未保存の変更があります" : "保存済み"}
              disabled={!sessionReady || !!restoreHandle}
              withArrow
            >
              <div
                className={
                  dirty ? "ohyna-doc-chip ohyna-doc-chip--dirty" : "ohyna-doc-chip"
                }
                aria-label={
                  restoreHandle
                    ? `${docName || "前回のファイル"}（復元待ち）`
                    : dirty
                      ? `${docName || "無題"}（未保存）`
                      : docName || "無題"
                }
              >
                {dirty ? <span className="ohyna-dirty-dot" aria-hidden /> : null}
                <Text
                  size="xs"
                  c={dirty ? undefined : "dimmed"}
                  lineClamp={1}
                  className="ohyna-doc-chip__name"
                >
                  {docName || "無題"}
                </Text>
                {dirty ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="orange"
                    style={{ flexShrink: 0, textTransform: "none" }}
                  >
                    未保存
                  </Badge>
                ) : null}
              </div>
            </Tooltip>
            {restoreHandle ? (
              <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Button
                  size={chromeBtnSize}
                  loading={restoreBusy}
                  onClick={() => void restorePreviousFile()}
                >
                  {isPhone ? "前回を開く" : "前回のファイルを開く"}
                </Button>
                <Tooltip label="復元しない" withArrow>
                  <ActionIcon
                    size={chromeIconSize}
                    variant="subtle"
                    color="gray"
                    aria-label="前回のファイルを復元しない"
                    disabled={restoreBusy}
                    onClick={dismissRestorePrevious}
                  >
                    <IconX size={chromeIconPx - 2} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ) : null}
          </Group>

          <Group gap={touchUi ? 4 : 6} wrap="nowrap" className="ohyna-header-actions">
            <Group gap={2} wrap="nowrap" className="ohyna-header-view">
              <ColorSchemeToggle size={chromeIconSize} iconSize={chromeIconPx} />
              <Tooltip label="ヘルプ" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={chromeIconSize}
                  aria-label="ヘルプ"
                  onClick={() => {
                    setHelpDocId(undefined);
                    helpHandlers.open();
                  }}
                >
                  <IconHelp size={chromeIconPx} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Tooltip.Group openDelay={350} closeDelay={80}>
              <ActionIcon.Group>
                <Menu
                  shadow="md"
                  width={240}
                  position="bottom-end"
                  opened={fileMenuOpen}
                  onChange={setFileMenuOpen}
                >
                  <Menu.Target>
                    <Tooltip
                      label={dirty ? "ファイル（未保存の変更あり）" : "ファイル"}
                      withArrow
                    >
                      <ActionIcon
                        variant={dirty ? "light" : "default"}
                        color={dirty ? "orange" : undefined}
                        size={chromeIconSize}
                        aria-label={
                          dirty ? "ファイルメニュー（未保存）" : "ファイルメニュー"
                        }
                      >
                        <IconFolderOpen size={chromeIconPx} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>作成</Menu.Label>
                    <Menu.Item
                      leftSection={<IconFilePlus size={16} />}
                      disabled={pdfBusy || !sessionReady}
                      onClick={() => newDocument("empty")}
                    >
                      空のドキュメント
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconNotebook size={16} />}
                      disabled={pdfBusy || !sessionReady}
                      onClick={() => newDocument("sample")}
                    >
                      サンプルから作成
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Label>読み込み</Menu.Label>
                    <Menu.Item
                      leftSection={<IconFolderOpen size={16} />}
                      disabled={pdfBusy || !sessionReady}
                      closeMenuOnClick={false}
                      onClick={() => void openDocument()}
                      rightSection={
                        <Text size="xs" c="dimmed">
                          {chord("O")}
                        </Text>
                      }
                    >
                      開く…
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Label>書き込み</Menu.Label>
                    <Menu.Item
                      leftSection={
                        <IconDeviceFloppy
                          size={16}
                          color={dirty ? "var(--mantine-color-orange-6)" : undefined}
                        />
                      }
                      disabled={pdfBusy || !sessionReady}
                      onClick={() => void saveDocument()}
                      color={dirty ? "orange" : undefined}
                      rightSection={
                        <Text size="xs" c="dimmed">
                          {chord("S")}
                        </Text>
                      }
                    >
                      保存
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconFileExport size={16} />}
                      disabled={pdfBusy || !sessionReady}
                      closeMenuOnClick={false}
                      onClick={() => void saveDocumentAs()}
                      rightSection={
                        <Text size="xs" c="dimmed">
                          {chord("Shift", "S")}
                        </Text>
                      }
                    >
                      名前を付けて保存…
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Label>終了</Menu.Label>
                    <Menu.Item
                      leftSection={<IconFileOff size={16} />}
                      disabled={pdfBusy || !sessionReady}
                      onClick={closeDocument}
                    >
                      閉じる
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>

                <Tooltip
                  label={
                    analysisHasErrors
                      ? "問題を直すと更新できます"
                      : analyzePending
                        ? "確認が終わるまでお待ちください"
                        : "プレビューを更新"
                  }
                  withArrow
                >
                  <ActionIcon
                    variant="default"
                    size={chromeIconSize}
                    aria-label="プレビューを更新"
                    disabled={busy || analyzePending || analysisHasErrors}
                    onClick={() => void forceRefreshPreview()}
                  >
                    <IconRefresh size={chromeIconPx} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            </Tooltip.Group>

            <Tooltip
              label={
                analysisHasErrors
                  ? "問題を直すと PDF を作成できます"
                  : analyzePending
                    ? "確認が終わるまでお待ちください"
                    : "PDF を作成"
              }
              withArrow
            >
              <Button
                size={chromeBtnSize}
                leftSection={
                  <IconFileTypePdf size={touchUi ? 18 : 14} stroke={1.5} />
                }
                disabled={pdfBusy || analysisHasErrors || analyzePending}
                loading={pdfBusy}
                onClick={() => void generatePdf()}
              >
                PDFを作成
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {!sessionReady ? (
          <Center h="100%">
            <Group gap="sm">
              <Loader size="sm" type="dots" />
              <Text c="dimmed" size="sm">
                読み込み中
              </Text>
            </Group>
          </Center>
        ) : (
          (() => {
            const workspace = previewPopped ? (
          <Box className="ohyna-pane" h="100%" mih={0}>
            <Group
              className="ohyna-pane-head"
              px="sm"
              justify="space-between"
              wrap="nowrap"
              gap="xs"
            >
              <Text size={touchUi ? "sm" : "xs"} fw={700} c="dimmed" lh={1}>
                Markdown
              </Text>
              <Group gap={6} wrap="nowrap">
                <Button
                  size={chromeBtnSize}
                  variant={settingsMissing ? "filled" : "subtle"}
                  color={settingsMissing ? "orange" : "gray"}
                  leftSection={
                    <IconSettings size={touchUi ? 16 : 14} stroke={1.5} />
                  }
                  onClick={openSettingsEdit}
                >
                  {settingsMissing ? "ドキュメント設定が必要" : "ドキュメント設定"}
                </Button>
                <Tooltip label="プレビューを前面へ">
                  <ActionIcon
                    size={chromeIconSize}
                    variant="light"
                    aria-label="プレビューを前面へ"
                    onClick={focusPreviewWindow}
                  >
                    <IconWindowMaximize size={chromeIconPx - 2} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="プレビューを戻す">
                  <ActionIcon
                    size={chromeIconSize}
                    variant="default"
                    aria-label="プレビューを戻す"
                    onClick={dockPreviewWindow}
                  >
                    <IconArrowBackUp size={chromeIconPx - 2} stroke={1.5} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <EditorToolbar getView={() => editorViewRef.current} />
                <Box className="ohyna-editor-wrap" mih={0}>
              <MarkdownEditor
                value={markdown}
                extensions={editorExtensions}
                onChange={onEditorChange}
                viewRef={editorViewRef}
                diagnosticsRef={mdDiagnosticsRef}
              />
            </Box>
          </Box>
        ) : (
          <Box className="ohyna-workspace-host" h="100%" mih={0}>
            {isPhone ? (
              <SegmentedControl
                className="ohyna-mobile-pane-switch"
                size="sm"
                fullWidth
                value={mobilePane}
                onChange={(v) =>
                  setMobilePane(v as "edit" | "preview" | "console")
                }
                data={[
                  { label: "編集", value: "edit" },
                  { label: "プレビュー", value: "preview" },
                  {
                    value: "console",
                    label:
                      analysisErrorCount > 0 ? (
                        <Group gap={6} wrap="nowrap" justify="center">
                          <span>コンソール</span>
                          <Badge size="xs" color="red" variant="filled">
                            {analysisErrorCount}
                          </Badge>
                        </Group>
                      ) : (
                        "コンソール"
                      ),
                  },
                ]}
                aria-label="編集・プレビュー・コンソールの切替"
              />
            ) : null}
            {isPhone && mobilePane === "console" ? (
              <Box className="ohyna-mobile-console" mih={0}>
                <MessageConsole
                  fill
                  expanded
                  windowMode
                  analysis={{
                    pending: analyzePending && serverDiagnostics == null,
                    diagnostics: mdDiagnostics,
                  }}
                  preview={{
                    state: previewState,
                    message: errorMessage,
                    diagramErrorCount,
                    diagramErrorHint,
                    analyzePending:
                      analyzePending &&
                      (analyzeGate == null ||
                        analyzeGate.source !== debouncedMarkdown),
                  }}
                  onJumpLine={jumpToProblem}
                  onPopOut={openConsoleWindow}
                />
              </Box>
            ) : (
          <Splitter
            className={[
              "ohyna-workspace",
              splitterResizing || cornerResizing
                ? "ohyna-workspace--resizing"
                : "",
              isNarrow ? "ohyna-workspace--narrow" : "",
              isPhone && mobilePane !== "console"
                ? `ohyna-workspace--mobile-pane-${mobilePane}`
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            orientation={isNarrow ? "vertical" : "horizontal"}
            h="100%"
            mah="100%"
            sizes={workspaceSizes}
            onSizeChange={setWorkspaceSizes}
            resetOnDoubleClick
            lineSize={1}
            handleColor={
              computedColorScheme === "dark" ? "dark.4" : "gray.4"
            }
            onResizeStart={() => setSplitterResizing(true)}
            onResizeEnd={() => {
              setSplitterResizing(false);
              setPreviewLayoutTick((n) => n + 1);
            }}
          >
            <Splitter.Pane
              defaultSize={50}
              min={isPhone ? 0 : 22}
              max={isPhone ? 100 : 78}
            >
              <Box className="ohyna-pane" h="100%" mih={0}>
                <Group
                  className="ohyna-pane-head"
                  px="sm"
                  justify="space-between"
                  wrap="nowrap"
                  gap="xs"
                >
                  <Text size={touchUi ? "sm" : "xs"} fw={700} c="dimmed" lh={1}>
                    Markdown
                  </Text>
                  <Group gap={6} wrap="nowrap">
                    <Button
                      size={chromeBtnSize}
                      variant={settingsMissing ? "filled" : "subtle"}
                      color={settingsMissing ? "orange" : "gray"}
                      leftSection={
                        <IconSettings size={touchUi ? 16 : 14} stroke={1.5} />
                      }
                      onClick={openSettingsEdit}
                    >
                      {isPhone
                        ? settingsMissing
                          ? "設定が必要"
                          : "設定"
                        : settingsMissing
                          ? "ドキュメント設定が必要"
                          : "ドキュメント設定"}
                    </Button>
                  </Group>
                </Group>
                <EditorToolbar getView={() => editorViewRef.current} />
                <Box className="ohyna-editor-wrap" mih={0}>
                  <MarkdownEditor
                    value={markdown}
                    extensions={editorExtensions}
                    onChange={onEditorChange}
                    viewRef={editorViewRef}
                    diagnosticsRef={mdDiagnosticsRef}
                  />
                </Box>
              </Box>
            </Splitter.Pane>

            <Splitter.Pane
              defaultSize={50}
              min={isPhone ? 0 : 22}
              max={isPhone ? 100 : 78}
            >
              <Box className="ohyna-pane" h="100%" mih={0}>
                <Group
                  className="ohyna-pane-head"
                  px="sm"
                  justify="space-between"
                  wrap="nowrap"
                  gap="xs"
                >
                  <Text size={touchUi ? "sm" : "xs"} fw={700} c="dimmed" lh={1}>
                    プレビュー
                  </Text>
                  <Group gap={6} wrap="nowrap">
                    <Tooltip label="別ウィンドウで表示">
                      <ActionIcon
                        size={chromeIconSize}
                        variant="subtle"
                        color="gray"
                        aria-label="別ウィンドウで表示"
                        onClick={openPreviewWindow}
                      >
                        <IconWindowMaximize size={chromeIconPx - 2} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
                <Box className="ohyna-preview-stage" mih={0}>
                  {settingsMissing ? (
                    <Center h="100%" px="md">
                      <Stack gap="sm" align="center" maw={280}>
                        <Text size="sm" c="dimmed" ta="center">
                          ドキュメント設定（タイトル・色テーマ・フォント・言語）を完了するとプレビューを表示します。
                        </Text>
                        <Button
                          size="xs"
                          color="orange"
                          leftSection={<IconSettings size={14} stroke={1.5} />}
                          onClick={openSettingsEdit}
                        >
                          ドキュメント設定を開く
                        </Button>
                      </Stack>
                    </Center>
                  ) : !previewHtml &&
                    (previewState === "blocked" || previewState === "error") ? (
                    <Center h="100%" px="md">
                      <Stack gap="xs" align="center" maw={360}>
                        <IconAlertCircle
                          size={28}
                          stroke={1.5}
                          color="var(--mantine-color-orange-6)"
                        />
                        <Text size="sm" fw={600} ta="center">
                          {previewState === "blocked"
                            ? "プレビューを表示できません"
                            : "プレビューに失敗しました"}
                        </Text>
                        <Text size="xs" c="dimmed" ta="center">
                          {errorMessage ||
                            "コンソールの「問題」または「出力」を確認してください。"}
                        </Text>
                      </Stack>
                    </Center>
                  ) : (
                    <>
                      <HtmlPreview
                        html={previewHtml}
                        layoutTick={previewLayoutTick}
                        onDiagramStatus={onPreviewDiagramStatus}
                      />
                      {previewState === "loading" && previewHtml && (
                        <Overlay
                          className="ohyna-preview-loading-overlay"
                          backgroundOpacity={0.18}
                          color="#000"
                          center
                        >
                          <Paper
                            className="ohyna-preview-loading-chip"
                            shadow="sm"
                            px="md"
                            py="xs"
                            radius="md"
                            withBorder
                          >
                            <Group gap={8} wrap="nowrap">
                              <Loader size={14} type="dots" />
                              <Text size="xs" c="dimmed">
                                プレビュー更新中
                              </Text>
                            </Group>
                          </Paper>
                        </Overlay>
                      )}
                    </>
                  )}
                </Box>
              </Box>
            </Splitter.Pane>
          </Splitter>
            )}
          </Box>
            );
            if (consolePopped || isPhone) return workspace;
            const showCorner =
              !isNarrow && !isPhone && !previewPopped;
            return (
              <Box className="ohyna-shell-host" h="100%" mih={0}>
                <Splitter
                  className={
                    shellResizing || cornerResizing
                      ? "ohyna-shell-split ohyna-shell-split--resizing"
                      : "ohyna-shell-split"
                  }
                  orientation="vertical"
                  h="100%"
                  mah="100%"
                  sizes={shellSizes}
                  onSizeChange={(sizes) => {
                    setShellSizes(sizes);
                    const bottom = sizes[1];
                    if (typeof bottom === "string" && bottom.endsWith("px")) {
                      setConsoleOpen(parseFloat(bottom) > consoleCollapsed + 6);
                    } else if (typeof bottom === "number") {
                      setConsoleOpen(bottom > 6);
                    }
                  }}
                  onResizeStart={() => setShellResizing(true)}
                  onResizeEnd={() => {
                    setShellResizing(false);
                    setPreviewLayoutTick((n) => n + 1);
                  }}
                  resetOnDoubleClick
                  lineSize={1}
                  handleColor={
                    computedColorScheme === "dark" ? "dark.4" : "gray.4"
                  }
                >
                  <Splitter.Pane defaultSize={100} min={20}>
                    {workspace}
                  </Splitter.Pane>
                  <Splitter.Pane
                    defaultSize={`${consoleCollapsed}px`}
                    min={`${consoleCollapsed}px`}
                    max="70%"
                  >
                    <MessageConsole
                      fill
                      expanded={consoleOpen}
                      onToggle={toggleConsolePane}
                      analysis={{
                        pending: analyzePending && serverDiagnostics == null,
                        diagnostics: mdDiagnostics,
                      }}
                      preview={{
                        state: previewState,
                        message: errorMessage,
                        diagramErrorCount,
                        diagramErrorHint,
                        analyzePending:
                          analyzePending &&
                          (analyzeGate == null ||
                            analyzeGate.source !== debouncedMarkdown),
                      }}
                      onJumpLine={jumpToProblem}
                      onPopOut={openConsoleWindow}
                    />
                  </Splitter.Pane>
                </Splitter>
                {showCorner ? (
                  <CornerResizeHandle
                    leftPercent={workspaceLeftPercent}
                    consoleHeightPx={consoleHeightPx}
                    onResizeStart={onCornerResizeStart}
                    onResize={onCornerResize}
                    onResizeEnd={onCornerResizeEnd}
                    onReset={onCornerReset}
                  />
                ) : null}
              </Box>
            );
          })()
        )}
      </AppShell.Main>

      <Suspense fallback={null}>
        {settingsMounted ? (
          <SettingsModal
            opened={settingsOpened}
            markdown={markdown}
            onClose={closeSettings}
            onApply={applySettings}
          />
        ) : null}
        {helpMounted ? (
          <HelpModal
            opened={helpOpened}
            onClose={() => {
              helpHandlers.close();
              setHelpDocId(undefined);
            }}
            initialDocId={helpDocId}
          />
        ) : null}
        {pdfConfirmMounted ? (
          <PdfConfirmModal
            opened={pdfConfirmOpened}
            url={pdfUrl}
            filename={`${slugName(markdown)}.pdf`}
            onClose={pdfConfirmHandlers.close}
            onSave={() => void savePdfDocument()}
            onPrint={() => void printPdfDocument()}
          />
        ) : null}
      </Suspense>

      <UnsavedChangesModal
        opened={pendingNav != null}
        action={pendingNav ? navToUnsavedAction(pendingNav) : null}
        docLabel={docName || "無題"}
        saving={navSaving}
        onCancel={cancelPendingNav}
        onDiscard={discardPendingNav}
        onSave={() => void saveThenPendingNav()}
      />

      {consolePopped ? (
        <AppShell.Footer p={0}>
          <MessageConsole
            expanded={false}
            poppedOut
            analysis={{
              pending: analyzePending && serverDiagnostics == null,
              diagnostics: mdDiagnostics,
            }}
            preview={{
              state: previewState,
              message: errorMessage,
              diagramErrorCount,
              diagramErrorHint,
              analyzePending:
                analyzePending &&
                (analyzeGate == null ||
                  analyzeGate.source !== debouncedMarkdown),
            }}
            onFocusPopOut={focusConsoleWindow}
            onDockPopOut={dockConsoleWindow}
          />
        </AppShell.Footer>
      ) : null}
    </AppShell>
  );
}
