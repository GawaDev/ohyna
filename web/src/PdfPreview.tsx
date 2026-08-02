import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Center,
  Group,
  Loader,
  Paper,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconMinus,
  IconPlus,
  IconArrowAutofitWidth,
  IconArrowAutofitHeight,
  IconArrowsMaximize,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { modScrollLabel } from "./platform";
import { useCtrlWheelZoom } from "./useCtrlWheelZoom";
import { useMiddleClickPan } from "./useMiddleClickPan";

/**
 * PDF 確認ビューア。
 * 参考: https://qiita.com/pyto86pri/items/b83a3010b4398ec38c77
 * - 全ページ同時 canvas は重い → 可視範囲＋前後のみ Page をマウント（仮想化）
 * - ズームは PDF 再描画ではなく CSS transform で即時反映し、ビューポート中心を維持
 */

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Props = {
  url: string | null;
};

type FitMode = "contain" | "width" | "height";

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const ZOOM_BUTTON_FACTOR = 1.1;
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
/** 「1枚を全体に収める」はぴったりではなく数％小さく（余白用） */
const CONTAIN_SCALE = 0.94;
/** CSS padding に加え、用紙とビューポート端のあいだに残す左右余白 */
const SIDE_GUTTER_PX = 16;
/** .ohyna-pdf-document の gap と一致 */
const PAGE_GAP_PX = 12;
/** 仮想化: 可視外でも前後何ページ分を描画するか */
const PAGE_OVERSCAN = 2;

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

export function PdfPreview({ url }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageNumberRef = useRef(1);
  const programmaticScrollRef = useRef(false);
  const zoomRef = useRef(1);
  const prevFitWidthRef = useRef(0);
  /** ズーム直前に捉えた、ビューポート中心のスケーラローカル座標 */
  const zoomAnchorRef = useRef<{ localX: number; localY: number } | null>(null);
  const [viewport, setViewport] = useState({ w: 480, h: 640 });
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [zoom, setZoom] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [docError, setDocError] = useState("");
  /** 仮想化: 描画するページ番号の閉区間 */
  const [renderRange, setRenderRange] = useState({ lo: 1, hi: 1 });

  pageNumberRef.current = pageNumber;
  zoomRef.current = zoom;
  /** PDF 再生成時にスクロール位置を戻す */
  const scrollRestoreRef = useRef<{
    top: number;
    left: number;
    page: number;
  } | null>(null);
  const pendingPdfRestoreRef = useRef(false);

  const scaleW = viewport.w / A4_WIDTH_PX;
  const scaleH = viewport.h / A4_HEIGHT_PX;
  const baseScale =
    fitMode === "width"
      ? scaleW
      : fitMode === "height"
        ? Math.min(scaleH, scaleW)
        : Math.min(scaleW, scaleH) * CONTAIN_SCALE;
  // Page 描画幅はフィット基準のみ。ユーザーズームは CSS transform（記事のピンチ中方針と同型）
  const fitWidthPx = Math.max(120, Math.floor(A4_WIDTH_PX * baseScale));
  const pageLayoutH = Math.max(
    160,
    Math.round(fitWidthPx * (A4_HEIGHT_PX / A4_WIDTH_PX))
  );
  const pageStride = pageLayoutH + PAGE_GAP_PX;
  const contentHeight = useMemo(() => {
    if (numPages < 1) return 0;
    return numPages * pageLayoutH + Math.max(0, numPages - 1) * PAGE_GAP_PX + 24;
  }, [numPages, pageLayoutH]);
  const slotWidth = Math.max(1, Math.floor(fitWidthPx * zoom));
  const slotHeight = Math.max(1, Math.ceil(contentHeight * zoom));

  const updateRenderRange = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || numPages < 1) return;
    const z = zoomRef.current || 1;
    const layoutTop = wrap.scrollTop / z;
    const layoutView = wrap.clientHeight / z;
    const lo = Math.max(
      1,
      Math.floor(layoutTop / pageStride) + 1 - PAGE_OVERSCAN
    );
    const hi = Math.min(
      numPages,
      Math.ceil((layoutTop + layoutView) / pageStride) + PAGE_OVERSCAN
    );
    setRenderRange((prev) =>
      prev.lo === lo && prev.hi === hi ? prev : { lo, hi }
    );
  }, [numPages, pageStride]);

  const captureZoomAnchor = useCallback(() => {
    const wrap = wrapRef.current;
    const scaler = scalerRef.current;
    if (!wrap || !scaler) return;
    const z = zoomRef.current || 1;
    const wrapRect = wrap.getBoundingClientRect();
    const vx = wrapRect.left + wrap.clientWidth / 2;
    const vy = wrapRect.top + wrap.clientHeight / 2;
    const r = scaler.getBoundingClientRect();
    zoomAnchorRef.current = {
      localX: (vx - r.left) / z,
      localY: (vy - r.top) / z,
    };
  }, []);

  const applyZoomAnchor = useCallback((nextZoom: number) => {
    const wrap = wrapRef.current;
    const scaler = scalerRef.current;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!wrap || !scaler || !anchor) return;
    const wrapRect = wrap.getBoundingClientRect();
    const vx = wrapRect.left + wrap.clientWidth / 2;
    const vy = wrapRect.top + wrap.clientHeight / 2;
    const r = scaler.getBoundingClientRect();
    const ax = r.left + anchor.localX * nextZoom;
    const ay = r.top + anchor.localY * nextZoom;
    programmaticScrollRef.current = true;
    wrap.scrollLeft += ax - vx;
    wrap.scrollTop += ay - vy;
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      updateRenderRange();
    });
  }, [updateRenderRange]);

  // 記事同様: レイアウト確定直後にスクロール補正（チラつき抑制）
  useLayoutEffect(() => {
    applyZoomAnchor(zoom);
  }, [zoom, applyZoomAnchor]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const prev = prevFitWidthRef.current;
    prevFitWidthRef.current = fitWidthPx;
    if (!wrap || !prev || prev === fitWidthPx) return;
    const ratio = fitWidthPx / prev;
    const cx = wrap.scrollLeft + wrap.clientWidth / 2;
    const cy = wrap.scrollTop + wrap.clientHeight / 2;
    programmaticScrollRef.current = true;
    wrap.scrollLeft = Math.max(0, cx * ratio - wrap.clientWidth / 2);
    wrap.scrollTop = Math.max(0, cy * ratio - wrap.clientHeight / 2);
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      updateRenderRange();
    });
  }, [fitWidthPx, updateRenderRange]);

  const zoomByWheel = useCallback(
    (deltaY: number) => {
      captureZoomAnchor();
      setZoom((z) => clampZoom(z * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY)));
    },
    [captureZoomAnchor]
  );

  const zoomByButton = useCallback(
    (dir: 1 | -1) => {
      captureZoomAnchor();
      setZoom((z) =>
        clampZoom(z * (dir > 0 ? ZOOM_BUTTON_FACTOR : 1 / ZOOM_BUTTON_FACTOR))
      );
    },
    [captureZoomAnchor]
  );

  const fitContain = useCallback(() => {
    zoomAnchorRef.current = null;
    setFitMode("contain");
    setZoom(1);
  }, []);

  const fitWidth = useCallback(() => {
    zoomAnchorRef.current = null;
    setFitMode("width");
    setZoom(1);
  }, []);

  const fitHeight = useCallback(() => {
    zoomAnchorRef.current = null;
    setFitMode("height");
    setZoom(1);
  }, []);

  /** プレースホルダ高さ基準でページ中央をビュー中央へ */
  const scrollToPage = useCallback(
    (n: number) => {
      const wrap = wrapRef.current;
      if (!wrap || numPages < 1) return;
      const z = zoomRef.current || 1;
      const layoutCenterY = (n - 1) * pageStride + pageLayoutH / 2;
      const top = layoutCenterY * z - wrap.clientHeight / 2;
      // 行き先付近を先に描画（記事: ピンチ後の空白チラつき対策と同趣旨）
      setRenderRange({
        lo: Math.max(1, n - PAGE_OVERSCAN),
        hi: Math.min(numPages, n + PAGE_OVERSCAN),
      });
      programmaticScrollRef.current = true;
      wrap.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      setPageNumber(n);
      window.setTimeout(() => {
        programmaticScrollRef.current = false;
        updateRenderRange();
      }, 450);
    },
    [numPages, pageLayoutH, pageStride, updateRenderRange]
  );

  const goPrev = useCallback(() => {
    const next = Math.max(1, pageNumberRef.current - 1);
    if (next === pageNumberRef.current) return;
    scrollToPage(next);
  }, [scrollToPage]);

  const goNext = useCallback(() => {
    if (numPages < 1) return;
    const next = Math.min(numPages, pageNumberRef.current + 1);
    if (next === pageNumberRef.current) return;
    scrollToPage(next);
  }, [numPages, scrollToPage]);

  useCtrlWheelZoom(rootRef, {
    enabled: Boolean(url),
    resetKey: url,
    onZoom: zoomByWheel,
  });

  useMiddleClickPan(wrapRef, {
    enabled: Boolean(url),
    resetKey: url,
  });

  useEffect(() => {
    if (!url) return;
    const el = wrapRef.current;
    if (!el) return;

    let raf = 0;
    let timer = 0;

    const apply = () => {
      const next = measureViewport(el);
      setViewport((prev) =>
        Math.abs(prev.w - next.w) < 1 && Math.abs(prev.h - next.h) < 1
          ? prev
          : next
      );
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(apply, 32);
      });
    };

    apply();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [url]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap) {
      scrollRestoreRef.current = {
        top: wrap.scrollTop,
        left: wrap.scrollLeft,
        page: pageNumberRef.current,
      };
    } else {
      scrollRestoreRef.current = null;
    }
    pendingPdfRestoreRef.current = true;
    setNumPages(0);
    setDocError("");
    setRenderRange({ lo: 1, hi: 1 });
    pageRefs.current.clear();
  }, [url]);

  useEffect(() => {
    if (numPages > 0 && pageNumber > numPages) {
      setPageNumber(numPages);
    }
  }, [numPages, pageNumber]);

  useEffect(() => {
    if (numPages < 1) return;
    setRenderRange({
      lo: 1,
      hi: Math.min(numPages, 1 + PAGE_OVERSCAN * 2),
    });
    updateRenderRange();

    if (!pendingPdfRestoreRef.current) return;
    pendingPdfRestoreRef.current = false;
    const saved = scrollRestoreRef.current;
    const wrap = wrapRef.current;
    if (!saved || !wrap) return;
    const page = Math.min(Math.max(1, saved.page), numPages);
    setPageNumber(page);
    setRenderRange({
      lo: Math.max(1, page - PAGE_OVERSCAN),
      hi: Math.min(numPages, page + PAGE_OVERSCAN),
    });
    const restore = () => {
      const el = wrapRef.current;
      if (!el) return;
      // 文書長が変わっても近い位置にいるよう、ページ基準を優先しつつピクセルも使う
      const z = zoomRef.current || 1;
      const pageTop = (page - 1) * pageStride * z;
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const top =
        saved.top > 0
          ? Math.min(saved.top, maxTop)
          : Math.min(pageTop, maxTop);
      el.scrollLeft = saved.left;
      el.scrollTop = top;
    };
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 50);
  }, [numPages, pageStride, updateRenderRange]);

  // スクロール → 仮想化範囲＋現在ページ
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !url || numPages < 1) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updateRenderRange();
        if (programmaticScrollRef.current) return;
        const z = zoomRef.current || 1;
        const midLayout = (wrap.scrollTop + wrap.clientHeight / 2) / z;
        const idx = Math.min(
          numPages,
          Math.max(1, Math.floor(midLayout / pageStride) + 1)
        );
        setPageNumber((p) => (p === idx ? p : idx));
      });
    };

    wrap.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      wrap.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [url, numPages, pageStride, updateRenderRange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !url || numPages < 1) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      }
    };

    root.tabIndex = 0;
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [url, numPages, goPrev, goNext]);

  if (!url) {
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

  const pct = Math.round(zoom * 100);
  const canPrev = pageNumber > 1;
  const canNext = numPages > 0 && pageNumber < numPages;
  const containActive = fitMode === "contain" && zoom === 1;
  const widthActive = fitMode === "width" && zoom === 1;
  const heightActive = fitMode === "height" && zoom === 1;

  return (
    <div ref={rootRef} className="ohyna-pdf-root" tabIndex={0}>
      <Paper className="ohyna-pdf-toolbar" shadow="sm" withBorder radius="md" p={4}>
        <Group gap={4} wrap="nowrap">
          <Tooltip label="前のページ（←）" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="前のページ"
              disabled={!canPrev}
              onClick={goPrev}
            >
              <IconChevronLeft size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Text
            size="xs"
            fw={600}
            miw={52}
            ta="center"
            style={{ fontVariantNumeric: "tabular-nums", userSelect: "none" }}
            title="ページ"
          >
            {numPages > 0 ? `${pageNumber} / ${numPages}` : "—"}
          </Text>
          <Tooltip label="次のページ（→）" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="次のページ"
              disabled={!canNext}
              onClick={goNext}
            >
              <IconChevronRight size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>

          <Text size="xs" c="dimmed" px={2} style={{ userSelect: "none" }}>
            |
          </Text>

          <Tooltip label={`縮小（${modScrollLabel()}）`} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="縮小"
              disabled={zoom <= ZOOM_MIN}
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
            title="クリックで全体に収める"
            onClick={fitContain}
          >
            {pct}%
          </Text>
          <Tooltip label={`拡大（${modScrollLabel()}）`} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="拡大"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => zoomByButton(1)}
            >
              <IconPlus size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="全体に収める（縦横ともはみ出さない）" withArrow>
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

      <button
        type="button"
        className="ohyna-pdf-nav ohyna-pdf-nav-prev"
        aria-label="前のページ"
        disabled={!canPrev}
        onClick={goPrev}
      >
        <IconChevronLeft size={22} stroke={1.5} />
      </button>
      <button
        type="button"
        className="ohyna-pdf-nav ohyna-pdf-nav-next"
        aria-label="次のページ"
        disabled={!canNext}
        onClick={goNext}
      >
        <IconChevronRight size={22} stroke={1.5} />
      </button>

      <div ref={wrapRef} className="ohyna-pdf-scroll">
        <div
          className="ohyna-pdf-scaler-slot"
          style={{ width: slotWidth, height: slotHeight || undefined }}
        >
          <div
            ref={scalerRef}
            className="ohyna-pdf-scaler"
            style={{
              width: fitWidthPx,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <Document
              file={url}
              className="ohyna-pdf-document"
              // 確認画面でもジャンプしない（見た目確認のみ）
              onItemClick={() => {}}
              loading={
                <Center py="xl">
                  <Loader size="sm" type="dots" />
                </Center>
              }
              error={
                <Center py="xl">
                  <Text c="red" size="sm">
                    {docError || "PDFの表示に失敗しました"}
                  </Text>
                </Center>
              }
              onLoadSuccess={(pdf) => {
                setNumPages(pdf.numPages);
                setDocError("");
              }}
              onLoadError={(err) => {
                setDocError(err?.message || "PDFの読み込みに失敗しました");
                setNumPages(0);
              }}
            >
              {Array.from({ length: numPages }, (_, i) => {
                const n = i + 1;
                const mounted = n >= renderRange.lo && n <= renderRange.hi;
                return (
                  <div
                    key={`${url}-${n}`}
                    className="ohyna-pdf-page-wrap"
                    data-page={n}
                    style={{
                      width: fitWidthPx,
                      height: pageLayoutH,
                      minHeight: pageLayoutH,
                    }}
                    ref={(el) => {
                      if (el) pageRefs.current.set(n, el);
                      else pageRefs.current.delete(n);
                    }}
                  >
                    {mounted ? (
                      <Page
                        pageNumber={n}
                        width={fitWidthPx}
                        className="ohyna-pdf-page"
                        devicePixelRatio={Math.min(
                          2.5,
                          typeof window !== "undefined"
                            ? window.devicePixelRatio || 1
                            : 1
                        )}
                        renderAnnotationLayer
                        renderTextLayer
                      />
                    ) : null}
                  </div>
                );
              })}
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
}
