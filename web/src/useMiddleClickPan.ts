import { useEffect, type RefObject } from "react";

type Options = {
  enabled?: boolean;
  resetKey?: unknown;
};

/**
 * ミドルクリック（ボタン1）ドラッグでスクロールパン。
 * ブラウザ既定のオートスクロールは抑止する。
 */
export function useMiddleClickPan(
  scrollRef: RefObject<HTMLElement | null>,
  { enabled = true, resetKey }: Options = {}
) {
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const endDrag = (e?: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("ohyna-panning");
      if (e) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.classList.add("ohyna-panning");
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 1 || dragging) {
        e.preventDefault();
        endDrag(e);
      }
    };

    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    /** iframe 内からのパン（postMessage） */
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "ohyna-preview") return;
      if (data.panStart && typeof data.x === "number" && typeof data.y === "number") {
        dragging = true;
        lastX = data.x;
        lastY = data.y;
        el.classList.add("ohyna-panning");
        return;
      }
      if (data.panMove && dragging && typeof data.x === "number" && typeof data.y === "number") {
        el.scrollLeft -= data.x - lastX;
        el.scrollTop -= data.y - lastY;
        lastX = data.x;
        lastY = data.y;
        return;
      }
      if (data.panEnd) {
        dragging = false;
        el.classList.remove("ohyna-panning");
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("auxclick", onAuxClick);
    window.addEventListener("message", onMessage);

    return () => {
      endDrag();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("auxclick", onAuxClick);
      window.removeEventListener("message", onMessage);
    };
  }, [enabled, scrollRef, resetKey]);
}
