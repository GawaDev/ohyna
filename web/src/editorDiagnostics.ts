import {
  lintGutter,
  lintKeymap,
  setDiagnostics,
  type Diagnostic,
} from "@codemirror/lint";
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { MdDiagnostic } from "./mdAnalysis";

/**
 * エディタ常駐:
 * - ガター印＋本文波線（setDiagnostics で更新）
 * - F8: 次の問題へ（CodeMirror lintKeymap）
 */
export const editorLintExtensions: Extension[] = [
  lintGutter({ hoverTime: 180 }),
  keymap.of(lintKeymap),
];

function clampLine(docLines: number, line: number): number {
  return Math.min(Math.max(1, Math.floor(line)), Math.max(1, docLines));
}

function toCmDiagnostics(
  view: EditorView,
  items: MdDiagnostic[]
): Diagnostic[] {
  const doc = view.state.doc;
  return items.map((d) => {
    const lineNo = clampLine(doc.lines, d.line ?? 1);
    const line = doc.line(lineNo);
    const severity: Diagnostic["severity"] =
      d.severity === "error"
        ? "error"
        : d.severity === "warning"
          ? "warning"
          : "info";
    return {
      from: line.from,
      to: Math.max(line.from + 1, line.to),
      severity,
      message: d.message,
      source: "チェック",
    };
  });
}

/** 診断結果をエディタ印に反映する */
export function applyEditorDiagnostics(
  view: EditorView | null,
  items: MdDiagnostic[]
): void {
  if (!view) return;
  view.dispatch(setDiagnostics(view.state, toCmDiagnostics(view, items)));
}

/** 問題行へジャンプ（キャレット＋中央付近へスクロール） */
export function jumpToDiagnosticLine(
  view: EditorView | null,
  line: number | undefined
): void {
  if (!view || line == null || line < 1) return;
  const doc = view.state.doc;
  const lineNo = clampLine(doc.lines, line);
  const lineObj = doc.line(lineNo);
  view.focus();
  view.dispatch({
    selection: { anchor: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
  });
}
