import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ActionIcon,
  Center,
  Group,
  Loader,
  Paper,
  Text,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconMinus,
  IconPlus,
  IconArrowAutofitWidth,
  IconArrowAutofitHeight,
  IconArrowsMaximize,
} from "@tabler/icons-react";
import { notify } from "./notify";
import { modScrollLabel } from "./platform";
import { useCtrlWheelZoom } from "./useCtrlWheelZoom";

export type DiagramStatus = {
  errorCount: number;
  errors: string[];
};

type Props = {
  html: string | null;
  layoutTick?: number;
  onDiagramStatus?: (status: DiagramStatus) => void;
};

type FitMode = "contain" | "width" | "height" | "manual";

/** A4 @ 96dpi（プレビュー HTML 内の用紙サイズと一致） */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const ZOOM_BUTTON_FACTOR = 1.1;
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
/** 「1枚を全体に収める」はぴったりではなく数％小さく（余白用） */
const CONTAIN_SCALE = 0.94;
/**
 * どのフィット／ズーム基準でも確保する左右余白。
 * iframe 内 `.ohyna-a4-zoom-shell` の左右 padding と一致させる。
 */
const SIDE_GUTTER_PX = 32;

function measureViewport(el: HTMLElement): { w: number; h: number } {
  const style = getComputedStyle(el);
  const padX =
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return {
    w: Math.max(
      120,
      Math.floor(el.clientWidth - padX - SIDE_GUTTER_PX * 2)
    ),
    h: Math.max(160, Math.floor(el.clientHeight - padY)),
  };
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(z.toFixed(3))));
}

type PreviewMessage = {
  source?: string;
  type?: string;
  diagramsReady?: boolean;
  zoom?: number;
  deltaY?: number;
  diagramErrorCount?: number;
  diagramErrors?: string[];
  currentPage?: number;
  pageCount?: number;
  height?: number;
  scrollTop?: number;
  scrollLeft?: number;
  /** 本文ブロック index（ページ再分割に耐えるアンカー） */
  anchorBi?: number;
  /** アンカー要素上端とビューポート上端の差（px, visual） */
  anchorOffset?: number;
  anchorHint?: string;
  a4WidthPx?: number;
  a4HeightPx?: number;
};

type ViewPos = {
  top: number;
  left: number;
  page: number;
  bi: number;
  offset: number;
  hint: string;
};

const EMPTY_VIEW: ViewPos = {
  top: 0,
  left: 0,
  page: 1,
  bi: -1,
  offset: 0,
  hint: "",
};

function viewHasAnchor(v: ViewPos): boolean {
  return Number.isFinite(v.bi) && v.bi >= 0;
}

function viewWorthRestoring(v: ViewPos): boolean {
  return viewHasAnchor(v) || v.page > 1 || v.top > 40;
}

const DESK_LIGHT = "#cfd6de";
const DESK_DARK = "#2a3038";

/** コンポーネント再マウントをまたいで表示位置を保持 */
let persistedPreviewView: ViewPos = { ...EMPTY_VIEW };

/** プレビュー HTML に机面の明暗を埋め込む（JS 不要で初回から効かせる） */
function withPreviewColorScheme(
  html: string,
  scheme: "light" | "dark"
): string {
  const desk = scheme === "dark" ? DESK_DARK : DESK_LIGHT;
  let out = html;
  if (/<html\b[^>]*\bdata-ohyna-color-scheme\s*=/.test(out)) {
    out = out.replace(
      /(<html\b[^>]*\bdata-ohyna-color-scheme\s*=\s*")(?:light|dark)(")/i,
      `$1${scheme}$2`
    );
  } else {
    out = out.replace(/<html\b/i, `<html data-ohyna-color-scheme="${scheme}"`);
  }
  const style =
    `<style id="ohyna-desk-scheme">` +
    `html,body{--ohyna-desk:${desk}!important;background:${desk}!important}` +
    `html.ohyna-a4-paginated,body.ohyna-a4-paginated{background:${desk}!important}` +
    `</style>`;
  if (/id=["']ohyna-desk-scheme["']/.test(out)) {
    out = out.replace(
      /<style id=["']ohyna-desk-scheme["']>[\s\S]*?<\/style>/i,
      style
    );
  } else if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${style}</head>`);
  } else {
    out = style + out;
  }
  return out;
}

export const HtmlPreview = memo(function HtmlPreview({
  html,
  layoutTick = 0,
  onDiagramStatus,
}: Props) {
  const colorScheme = useComputedColorScheme("light");
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const statusNotifiedRef = useRef(false);
  const onDiagramStatusRef = useRef(onDiagramStatus);
  onDiagramStatusRef.current = onDiagramStatus;
  /**
   * 表示位置（iframe からの postMessage のみで更新）。
   * sandbox で contentDocument が読めないため、ホスト側 DOM 読みは使わない。
   */
  const lastViewRef = useRef<ViewPos>({ ...persistedPreviewView });
  /** html 更新時に凍結した復元先。復元完了まで page=1 の報告で上書きしない */
  const pendingRestoreRef = useRef<ViewPos | null>(null);
  const restoringRef = useRef(false);
  const restoreTimersRef = useRef<number[]>([]);
  const restoreGenRef = useRef(0);
  const [viewport, setViewport] = useState({ w: 480, h: 640 });
  const [pageSize, setPageSize] = useState({
    w: A4_WIDTH_PX,
    h: A4_HEIGHT_PX,
  });
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [zoom, setZoom] = useState(1);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const scaleW = viewport.w / pageSize.w;
  const scaleH = viewport.h / pageSize.h;
  // 高さ合わせでも左右余白を食い潰さない（幅上限でクランプ）
  // contain はぴったりではなく CONTAIN_SCALE 分小さくする
  const fitScale =
    fitMode === "height"
      ? Math.min(scaleH, scaleW)
      : fitMode === "contain"
        ? Math.min(scaleW, scaleH) * CONTAIN_SCALE
        : scaleW;
  const effectiveZoom =
    fitMode === "manual" ? zoom : clampZoom(fitScale * zoom);
  const effectiveZoomRef = useRef(effectiveZoom);
  effectiveZoomRef.current = effectiveZoom;

  const postToFrame = useCallback((payload: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: "ohyna-preview-host", ...payload },
        "*"
      );
    } catch {
      /* ignore */
    }
  }, []);

  const sendRestoreView = useCallback(
    (target: ViewPos | null) => {
      if (!target) return;
      if (!viewWorthRestoring(target)) {
        restoringRef.current = false;
        return;
      }
      restoreTimersRef.current.forEach((t) => window.clearTimeout(t));
      restoreTimersRef.current = [];
      restoringRef.current = true;
      const gen = ++restoreGenRef.current;
      const payload = {
        type: "restoreView" as const,
        page: target.page,
        top: target.top,
        left: target.left,
        bi: target.bi,
        offset: target.offset,
        hint: target.hint,
      };
      const send = () => {
        if (restoreGenRef.current !== gen) return;
        postToFrame(payload);
      };
      send();
      // Mermaid / コードで紙面高さが変わるため長めに再送
      const delays = [80, 200, 400, 700, 1100, 1600, 2200, 3000, 4000];
      restoreTimersRef.current = [
        ...delays.map((ms) => window.setTimeout(send, ms)),
        window.setTimeout(() => {
          if (restoreGenRef.current === gen) restoringRef.current = false;
        }, 4200),
      ];
    },
    [postToFrame]
  );

  const syncZoomToFrame = useCallback(
    (z: number) => {
      postToFrame({ type: "setZoom", zoom: z });
    },
    [postToFrame]
  );

  useEffect(() => {
    if (!frameSrc) return;
    syncZoomToFrame(effectiveZoom);
  }, [effectiveZoom, frameSrc, syncZoomToFrame]);

  const syncColorSchemeToFrame = useCallback(() => {
    const scheme = colorScheme === "dark" ? "dark" : "light";
    const desk = scheme === "dark" ? DESK_DARK : DESK_LIGHT;
    document.documentElement.style.setProperty("--ohyna-host-desk", desk);
    postToFrame({ type: "setColorScheme", scheme });
    const frame = iframeRef.current;
    if (frame) frame.style.background = desk;
    const stage = stageRef.current;
    if (stage) stage.style.background = desk;
    const root = rootRef.current;
    if (root) root.style.background = desk;
  }, [postToFrame, colorScheme]);

  useEffect(() => {
    syncColorSchemeToFrame();
  }, [syncColorSchemeToFrame]);

  const zoomByWheel = useCallback((deltaY: number) => {
    setFitMode("manual");
    setZoom(
      clampZoom(
        effectiveZoomRef.current * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)
      )
    );
  }, []);

  const zoomByButton = useCallback((dir: 1 | -1) => {
    setFitMode("manual");
    setZoom(
      clampZoom(
        effectiveZoomRef.current *
          (dir > 0 ? ZOOM_BUTTON_FACTOR : 1 / ZOOM_BUTTON_FACTOR)
      )
    );
  }, []);

  const fitContain = useCallback(() => {
    setFitMode("contain");
    setZoom(1);
  }, []);
  const fitWidth = useCallback(() => {
    setFitMode("width");
    setZoom(1);
  }, []);
  const fitHeight = useCallback(() => {
    setFitMode("height");
    setZoom(1);
  }, []);

  const remesaureFit = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const next = measureViewport(el);
    setViewport((prev) =>
      Math.abs(prev.w - next.w) < 1 && Math.abs(prev.h - next.h) < 1
        ? prev
        : next
    );
  }, []);

  useEffect(() => {
    if (!html) {
      setFrameSrc(null);
      setReady(false);
      statusNotifiedRef.current = false;
      pendingRestoreRef.current = null;
      restoringRef.current = false;
      onDiagramStatusRef.current?.({ errorCount: 0, errors: [] });
      return;
    }
    // 更新直前の表示位置を凍結（再読込中の page=1 報告で潰さない）
    let freeze = { ...lastViewRef.current };
    if (!viewWorthRestoring(freeze) && viewWorthRestoring(persistedPreviewView)) {
      freeze = { ...persistedPreviewView };
    }
    pendingRestoreRef.current = freeze;
    restoringRef.current = true;
    const scheme = colorScheme === "dark" ? "dark" : "light";
    const prepared = withPreviewColorScheme(html, scheme);
    const blob = new Blob([prepared], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setFrameSrc(url);
    setReady(false);
    statusNotifiedRef.current = false;
    return () => URL.revokeObjectURL(url);
    // 明暗切替でも机色を確実に当てるため colorScheme 変更で再生成する
  }, [html, colorScheme]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    let timer = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(remesaureFit, 32);
      });
    };
    remesaureFit();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [html, remesaureFit]);

  useLayoutEffect(() => {
    if (!html) return;
    remesaureFit();
    const t = window.setTimeout(remesaureFit, 0);
    const t2 = window.setTimeout(remesaureFit, 50);
    postToFrame({ type: "remeasure" });
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [layoutTick, html, remesaureFit, postToFrame]);

  useCtrlWheelZoom(rootRef, {
    enabled: Boolean(frameSrc),
    resetKey: frameSrc,
    onZoom: zoomByWheel,
  });

  useEffect(() => {
    if (!frameSrc) return;
    // フレーム内スクリプトが落ちてもローディングが永久に残らないようにする
    const t = window.setTimeout(() => setReady(true), 12000);
    return () => window.clearTimeout(t);
  }, [frameSrc]);

  useEffect(() => {
    if (!frameSrc) return;
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== "ohyna-preview") return;
      if (data.type === "requestColorScheme") {
        syncColorSchemeToFrame();
        return;
      }
      if (typeof data.deltaY === "number") zoomByWheel(data.deltaY);
      if (
        typeof data.a4WidthPx === "number" &&
        typeof data.a4HeightPx === "number" &&
        data.a4WidthPx > 0 &&
        data.a4HeightPx > 0
      ) {
        setPageSize((prev) =>
          Math.abs(prev.w - data.a4WidthPx!) < 1 &&
          Math.abs(prev.h - data.a4HeightPx!) < 1
            ? prev
            : { w: data.a4WidthPx!, h: data.a4HeightPx! }
        );
      }
      // 復元中は先頭ページの報告で lastView を潰さない
      if (!restoringRef.current) {
        const page =
          typeof data.currentPage === "number" && data.currentPage > 0
            ? data.currentPage
            : lastViewRef.current.page;
        const top =
          typeof data.scrollTop === "number"
            ? data.scrollTop
            : lastViewRef.current.top;
        const left =
          typeof data.scrollLeft === "number"
            ? data.scrollLeft
            : lastViewRef.current.left;
        const bi =
          typeof data.anchorBi === "number"
            ? data.anchorBi
            : lastViewRef.current.bi;
        const offset =
          typeof data.anchorOffset === "number"
            ? data.anchorOffset
            : lastViewRef.current.offset;
        const hint =
          typeof data.anchorHint === "string"
            ? data.anchorHint
            : lastViewRef.current.hint;
        if (
          typeof data.currentPage === "number" ||
          typeof data.scrollTop === "number" ||
          typeof data.scrollLeft === "number" ||
          typeof data.anchorBi === "number"
        ) {
          const next = { page, top, left, bi, offset, hint };
          lastViewRef.current = next;
          if (viewWorthRestoring(next)) {
            persistedPreviewView = next;
          }
        }
      }
      if (data.diagramsReady) {
        setReady(true);
        const pending = pendingRestoreRef.current;
        if (pending && viewWorthRestoring(pending)) {
          sendRestoreView(pending);
          window.setTimeout(() => {
            if (pendingRestoreRef.current === pending) {
              pendingRestoreRef.current = null;
            }
          }, 4300);
        }
      }

      const isStatus =
        data.type === "diagramStatus" ||
        (data.diagramsReady && typeof data.diagramErrorCount === "number");
      if (!isStatus || statusNotifiedRef.current) return;
      statusNotifiedRef.current = true;
      const errorCount = Math.max(0, Number(data.diagramErrorCount) || 0);
      const errors = Array.isArray(data.diagramErrors)
        ? data.diagramErrors.filter((m): m is string => typeof m === "string")
        : [];
      onDiagramStatusRef.current?.({ errorCount, errors });
      if (errorCount > 0) {
        const first = errors[0]?.trim();
        const detail = [
          first,
          "プレビュー内の赤い枠を確認してください。本文は表示を継続します。",
          ...errors.slice(1),
        ]
          .filter(Boolean)
          .join("\n");
        notify({
          id: "ohyna-mermaid-diagram-errors",
          color: "red",
          title:
            errorCount === 1
              ? "Mermaid ダイアグラムの描画に失敗しました"
              : `Mermaid ダイアグラムの描画に失敗（${errorCount}件）`,
          message: detail,
          autoClose: 10000,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameSrc, zoomByWheel, sendRestoreView, syncColorSchemeToFrame]);

  const onFrameLoad = useCallback(() => {
    remesaureFit();
    syncZoomToFrame(effectiveZoom);
    syncColorSchemeToFrame();
    window.setTimeout(syncColorSchemeToFrame, 0);
    window.setTimeout(syncColorSchemeToFrame, 120);
    postToFrame({ type: "remeasure" });
    if (
      pendingRestoreRef.current &&
      viewWorthRestoring(pendingRestoreRef.current)
    ) {
      postToFrame({
        type: "restoreView",
        page: pendingRestoreRef.current.page,
        top: pendingRestoreRef.current.top,
        left: pendingRestoreRef.current.left,
        bi: pendingRestoreRef.current.bi,
        offset: pendingRestoreRef.current.offset,
        hint: pendingRestoreRef.current.hint,
      });
    }
  }, [
    remesaureFit,
    syncZoomToFrame,
    syncColorSchemeToFrame,
    effectiveZoom,
    postToFrame,
  ]);

  if (!html) {
    return (
      <Center h="100%">
        <Group gap="sm">
          <Loader size="sm" type="dots" />
          <Text c="dimmed" size="sm">
            生成中
          </Text>
        </Group>
      </Center>
    );
  }

  const pct = Math.round(effectiveZoom * 100);
  const containActive = fitMode === "contain" && zoom === 1;
  const widthActive = fitMode === "width" && zoom === 1;
  const heightActive = fitMode === "height" && zoom === 1;

  return (
    <div ref={rootRef} className="ohyna-pdf-root" tabIndex={0}>
      <Paper className="ohyna-pdf-toolbar" shadow="sm" withBorder radius="md" p={4}>
        <Group gap={4} wrap="nowrap">
          <Tooltip label={`縮小（${modScrollLabel()}）`} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="縮小"
              disabled={effectiveZoom <= ZOOM_MIN}
              onClick={() => zoomByButton(-1)}
            >
              <IconMinus size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Text
            size="xs"
            fw={600}
            w={44}
            ta="center"
            style={{
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
              cursor: "pointer",
            }}
            title="幅に合わせる"
            onClick={fitWidth}
          >
            {pct}%
          </Text>
          <Tooltip label={`拡大（${modScrollLabel()}）`} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="拡大"
              disabled={effectiveZoom >= ZOOM_MAX}
              onClick={() => zoomByButton(1)}
            >
              <IconPlus size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="1枚を全体に収める" withArrow>
            <ActionIcon
              variant={containActive ? "light" : "subtle"}
              color="gray"
              size="sm"
              aria-label="全体に収める"
              onClick={fitContain}
            >
              <IconArrowsMaximize size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="縦に合わせる" withArrow>
            <ActionIcon
              variant={heightActive ? "light" : "subtle"}
              color="gray"
              size="sm"
              aria-label="縦に合わせる"
              onClick={fitHeight}
            >
              <IconArrowAutofitHeight size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="幅に合わせる" withArrow>
            <ActionIcon
              variant={widthActive ? "light" : "subtle"}
              color="gray"
              size="sm"
              aria-label="幅に合わせる"
              onClick={fitWidth}
            >
              <IconArrowAutofitWidth size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>

      <div ref={stageRef} className="ohyna-html-stage">
        {!frameSrc ? (
          <Center h="100%">
            <Group gap="sm">
              <Loader size="sm" type="dots" />
              <Text c="dimmed" size="sm">
                読み込み中
              </Text>
            </Group>
          </Center>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              className="ohyna-html-frame-fill"
              title="A4 ドキュメントプレビュー"
              sandbox="allow-scripts"
              src={frameSrc}
              onLoad={onFrameLoad}
            />
            {!ready && (
              <Center className="ohyna-html-loading">
                <Group gap="sm">
                  <Loader size="sm" type="dots" />
                  <Text c="dimmed" size="sm">
                    読み込み中
                  </Text>
                </Group>
              </Center>
            )}
          </>
        )}
      </div>
    </div>
  );
});
