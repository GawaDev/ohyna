import { useEffect, type RefObject } from "react";

type Options = {
  /** false のときリスナーを付けない */
  enabled?: boolean;
  /**
   * 直前フレームからの倍率（1 より大＝拡大）。
   * 呼び出し側で現在ズームに掛け合わせる。
   */
  onZoomFactor: (factor: number) => void;
  /** 2 本指が揃った直後（アンカー取得など） */
  onPinchStart?: () => void;
  /** 内容差し替え時にリスナーを張り直すキー */
  resetKey?: unknown;
};

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * 2 本指ピンチで拡大縮小。
 * `touch-action: pan-x pan-y` 前提で、ブラウザのページピンチを抑止しつつ倍率を渡す。
 */
export function usePinchZoom(
  targetRef: RefObject<HTMLElement | null>,
  { enabled = true, onZoomFactor, onPinchStart, resetKey }: Options
) {
  useEffect(() => {
    if (!enabled) return;
    const el = targetRef.current;
    if (!el) return;

    let pinching = false;
    let lastDist = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinching = true;
      lastDist = touchDistance(e.touches[0], e.touches[1]);
      onPinchStart?.();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      const dist = touchDistance(e.touches[0], e.touches[1]);
      if (lastDist > 0) {
        const factor = dist / lastDist;
        if (Math.abs(factor - 1) >= 0.002) {
          onZoomFactor(factor);
        }
      }
      lastDist = dist;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      pinching = false;
      lastDist = 0;
    };

    el.addEventListener("touchstart", onTouchStart, {
      passive: true,
      capture: true,
    });
    el.addEventListener("touchmove", onTouchMove, {
      passive: false,
      capture: true,
    });
    el.addEventListener("touchend", onTouchEnd, {
      passive: true,
      capture: true,
    });
    el.addEventListener("touchcancel", onTouchEnd, {
      passive: true,
      capture: true,
    });

    return () => {
      el.removeEventListener("touchstart", onTouchStart, true);
      el.removeEventListener("touchmove", onTouchMove, true);
      el.removeEventListener("touchend", onTouchEnd, true);
      el.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [enabled, onZoomFactor, onPinchStart, targetRef, resetKey]);
}
