import { memo, useCallback, type MutableRefObject } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { applyEditorDiagnostics } from "./editorDiagnostics";
import type { MdDiagnostic } from "./mdAnalysis";

/** @uiw/react-codemirror は basicSetup の参照が変わると拡張を全再構成する */
export const EDITOR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  bracketMatching: true,
  autocompletion: false,
  searchKeymap: true,
} as const;

type Props = {
  value: string;
  extensions: Extension[];
  onChange: (value: string) => void;
  viewRef: MutableRefObject<EditorView | null>;
  diagnosticsRef: MutableRefObject<MdDiagnostic[]>;
  "aria-label"?: string;
};

export const MarkdownEditor = memo(function MarkdownEditor({
  value,
  extensions,
  onChange,
  viewRef,
  diagnosticsRef,
  "aria-label": ariaLabel = "Markdown編集",
}: Props) {
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      applyEditorDiagnostics(view, diagnosticsRef.current);
    },
    [viewRef, diagnosticsRef]
  );

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme="none"
      basicSetup={EDITOR_BASIC_SETUP}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      aria-label={ariaLabel}
    />
  );
});
