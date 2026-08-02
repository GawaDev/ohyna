import { useEffect, type RefObject } from "react";

type Options = {
  /** false のときリスナーを付けない */
  enabled?: boolean;
  /**
   * Ctrl/⌘ + ホイール時のコールバック。
   * `deltaY` は WheelEvent.deltaY（下方向がプラス）。連続ズーム用。
   */
  onZoom: (deltaY: number) => void;
  /** 内容差し替え時にリスナーを張り直すキー（例: html / url） */
  resetKey?: unknown;
};

/**
 * Ctrl / ⌘ + ホイールで拡大縮小。
 * capture + preventDefault でブラウザ本体のズームを抑止する。
 * Acrobat 同様、deltaY の大きさに応じた連続ズームを渡す。
 */
export function useCtrlWheelZoom(
  targetRef: RefObject<HTMLElement | null>,
  { enabled = true, onZoom, resetKey }: Options
) {
  useEffect(() => {
    if (!enabled) return;
    const el = targetRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      onZoom(e.deltaY);
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel, true);
    };
  }, [enabled, onZoom, targetRef, resetKey]);
}
