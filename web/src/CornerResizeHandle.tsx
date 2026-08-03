import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type CornerResizeDelta = {
  /** シェル全体に対するポインタ X（0–1）→ 左右ペイン比 */
  xRatio: number;
  /** シェル下端からの距離（px）→ コンソール高さ */
  consoleHeightPx: number;
};

type Props = {
  /** 左ペイン幅 %（0–100）。角グリップの水平位置 */
  leftPercent: number;
  /** コンソール高さ px。角グリップの垂直位置 */
  consoleHeightPx: number;
  disabled?: boolean;
  onResizeStart: () => void;
  onResize: (delta: CornerResizeDelta) => void;
  onResizeEnd: () => void;
  onReset?: () => void;
};

function shellHostRect(el: HTMLElement | null): DOMRect | null {
  const host = el?.closest(".ohyna-shell-host");
  if (!(host instanceof HTMLElement)) return null;
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

/**
 * Markdown | Preview の縦ハンドルと、コンソール横ハンドルが交わる角のグリップ。
 * 斜めドラッグで左右比とコンソール高さを同時に変える。
 */
export function CornerResizeHandle({
  leftPercent,
  consoleHeightPx,
  disabled,
  onResizeStart,
  onResize,
  onResizeEnd,
  onReset,
}: Props) {
  const draggingRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const emitFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = shellHostRect(btnRef.current);
      if (!rect) return;
      const xRatio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const consoleH = Math.min(
        rect.height * 0.7,
        Math.max(0, rect.bottom - clientY)
      );
      onResize({ xRatio, consoleHeightPx: consoleH });
    },
    [onResize]
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onResizeStart();
    emitFromEvent(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    emitFromEvent(e.clientX, e.clientY);
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onResizeEnd();
  };

  if (disabled) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      className="ohyna-corner-resize"
      aria-label="ペインの大きさを変更"
      style={{
        left: `${leftPercent}%`,
        bottom: consoleHeightPx,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReset?.();
      }}
    />
  );
}
