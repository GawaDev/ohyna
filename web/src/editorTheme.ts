import {
  markdown as cmMarkdown,
  markdownLanguage,
} from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { tags as t, Tag } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";
import { EditorView } from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";
import { markdownAssistKeymap } from "./mdCommands";
import { editorLintExtensions } from "./editorDiagnostics";
import { codeLanguages, plainLanguageSupport } from "./fenceLanguages";
import {
  admonitionExtension,
  admonitionMarkTag,
  admonitionTitleTag,
  admonitionTypeDangerTag,
  admonitionTypeNoteTag,
  admonitionTypeOtherTag,
  admonitionTypeTipTag,
  admonitionTypeWarningTag,
} from "./admonitionHighlight";

/** KaTeX / TeX 数式ノード用タグ */
const katexMarkTag = Tag.define();
const katexContentTag = Tag.define();
/** pymdownx.mark / caret */
const markContentTag = Tag.define();
const insertContentTag = Tag.define();

/**
 * `$...$` / `$$...$$` / `\(...\)` / `\[...\]` を Markdown 構文木に載せる。
 */
const katexMathExtension: MarkdownConfig = {
  defineNodes: [
    { name: "KatexInlineMath", style: katexContentTag },
    { name: "KatexInlineMark", style: katexMarkTag },
    { name: "KatexBlockMath", block: true, style: katexContentTag },
    { name: "KatexBlockMark", style: katexMarkTag },
  ],
  parseInline: [
    {
      name: "KatexInlineMath",
      before: "Escape",
      parse(cx, next, pos) {
        if (next !== 36 /* $ */) return -1;
        if (cx.char(pos + 1) === 36) return -1;
        if (pos > cx.offset && cx.char(pos - 1) === 92 /* \ */) return -1;
        const after = cx.char(pos + 1);
        if (after < 0 || after === 32 || after === 9 || after === 10) return -1;

        let i = pos + 1;
        while (i < cx.end) {
          const ch = cx.char(i);
          if (ch === 92) {
            i += 2;
            continue;
          }
          if (ch === 10) break;
          if (ch === 36) {
            const prev = cx.char(i - 1);
            if (prev === 32 || prev === 9) return -1;
            if (i === pos + 1) return -1;
            return cx.addElement(
              cx.elt("KatexInlineMath", pos, i + 1, [
                cx.elt("KatexInlineMark", pos, pos + 1),
                cx.elt("KatexInlineMark", i, i + 1),
              ])
            );
          }
          i++;
        }
        return -1;
      },
    },
    {
      name: "KatexParenInlineMath",
      before: "Escape",
      parse(cx, next, pos) {
        // \( ... \)
        if (next !== 92 /* \ */ || cx.char(pos + 1) !== 40 /* ( */) return -1;
        let i = pos + 2;
        while (i < cx.end) {
          const ch = cx.char(i);
          if (ch === 10) break;
          if (ch === 92 && cx.char(i + 1) === 41 /* ) */) {
            return cx.addElement(
              cx.elt("KatexInlineMath", pos, i + 2, [
                cx.elt("KatexInlineMark", pos, pos + 2),
                cx.elt("KatexInlineMark", i, i + 2),
              ])
            );
          }
          i++;
        }
        return -1;
      },
    },
  ],
  parseBlock: [
    {
      name: "KatexBlockMath",
      before: "FencedCode",
      parse(cx, line) {
        if (!line.text.startsWith("$$", line.pos)) return false;
        const from = cx.lineStart + line.pos;
        const rest = line.text.slice(line.pos + 2);
        const same = rest.indexOf("$$");
        if (same >= 0) {
          const to = from + 2 + same + 2;
          cx.addElement(
            cx.elt("KatexBlockMath", from, to, [
              cx.elt("KatexBlockMark", from, from + 2),
              cx.elt("KatexBlockMark", to - 2, to),
            ])
          );
          cx.nextLine();
          return true;
        }
        const openMark = cx.elt("KatexBlockMark", from, from + 2);
        if (!cx.nextLine()) return false;
        for (;;) {
          const idx = line.text.indexOf("$$");
          if (idx >= 0) {
            const to = cx.lineStart + idx + 2;
            cx.addElement(
              cx.elt("KatexBlockMath", from, to, [
                openMark,
                cx.elt("KatexBlockMark", to - 2, to),
              ])
            );
            cx.nextLine();
            return true;
          }
          if (!cx.nextLine()) return false;
        }
      },
    },
    {
      name: "KatexBracketBlockMath",
      before: "FencedCode",
      parse(cx, line) {
        // \[ ... \]
        if (!line.text.startsWith("\\[", line.pos)) return false;
        const from = cx.lineStart + line.pos;
        const rest = line.text.slice(line.pos + 2);
        const same = rest.indexOf("\\]");
        if (same >= 0) {
          const to = from + 2 + same + 2;
          cx.addElement(
            cx.elt("KatexBlockMath", from, to, [
              cx.elt("KatexBlockMark", from, from + 2),
              cx.elt("KatexBlockMark", to - 2, to),
            ])
          );
          cx.nextLine();
          return true;
        }
        const openMark = cx.elt("KatexBlockMark", from, from + 2);
        if (!cx.nextLine()) return false;
        for (;;) {
          const idx = line.text.indexOf("\\]");
          if (idx >= 0) {
            const to = cx.lineStart + idx + 2;
            cx.addElement(
              cx.elt("KatexBlockMath", from, to, [
                openMark,
                cx.elt("KatexBlockMark", to - 2, to),
              ])
            );
            cx.nextLine();
            return true;
          }
          if (!cx.nextLine()) return false;
        }
      },
    },
  ],
};

/** `==ハイライト==`（pymdownx.mark）と `^^挿入^^`（pymdownx.caret） */
const markInsertExtension: MarkdownConfig = {
  defineNodes: [
    { name: "MtpMark", style: markContentTag },
    { name: "MtpInsert", style: insertContentTag },
  ],
  parseInline: [
    {
      name: "MtpMark",
      parse(cx, next, pos) {
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61) return -1;
        let i = pos + 2;
        while (i < cx.end) {
          const ch = cx.char(i);
          if (ch === 10) break;
          if (ch === 61 && cx.char(i + 1) === 61) {
            if (i === pos + 2) return -1;
            return cx.addElement(cx.elt("MtpMark", pos, i + 2));
          }
          i++;
        }
        return -1;
      },
    },
    {
      name: "MtpInsert",
      parse(cx, next, pos) {
        if (next !== 94 /* ^ */ || cx.char(pos + 1) !== 94) return -1;
        let i = pos + 2;
        while (i < cx.end) {
          const ch = cx.char(i);
          if (ch === 10) break;
          if (ch === 94 && cx.char(i + 1) === 94) {
            if (i === pos + 2) return -1;
            return cx.addElement(cx.elt("MtpInsert", pos, i + 2));
          }
          i++;
        }
        return -1;
      },
    },
  ],
};

const mdSupport = cmMarkdown({
  base: markdownLanguage,
  codeLanguages,
  defaultCodeLanguage: plainLanguageSupport,
  extensions: [katexMathExtension, markInsertExtension, admonitionExtension],
});

/** Markdown / YAML / コードフェンス／KaTeX 向けの HighlightStyle（ライト） */
const lightHighlight = HighlightStyle.define([
  { tag: t.heading1, color: "#0550ae", fontWeight: "800" },
  { tag: t.heading2, color: "#0969da", fontWeight: "700" },
  { tag: t.heading3, color: "#218bff", fontWeight: "700" },
  { tag: t.heading4, color: "#539bf5", fontWeight: "600" },
  { tag: t.heading5, color: "#6cb6ff", fontWeight: "600" },
  { tag: t.heading6, color: "#80bbff", fontWeight: "600" },
  { tag: t.strong, color: "#cf222e", fontWeight: "700" },
  { tag: t.emphasis, color: "#8250df", fontStyle: "italic" },
  { tag: t.strikethrough, color: "#8c959f", textDecoration: "line-through" },
  { tag: t.link, color: "#0969da", textDecoration: "underline" },
  { tag: t.url, color: "#0a7373" },
  {
    tag: t.monospace,
    color: "#24292f",
    backgroundColor: "rgba(175, 184, 193, 0.2)",
  },
  { tag: t.quote, color: "#57606a", fontStyle: "italic" },
  { tag: t.list, color: "#bf3989" },
  { tag: t.contentSeparator, color: "#8250df", fontWeight: "700" },
  { tag: t.processingInstruction, color: "#116329" },
  { tag: t.labelName, color: "#bf3989" },
  { tag: t.meta, color: "#116329" },
  { tag: t.comment, color: "#6e7781", fontStyle: "italic" },
  { tag: t.lineComment, color: "#6e7781", fontStyle: "italic" },
  { tag: t.keyword, color: "#cf222e", fontWeight: "700" },
  { tag: t.controlKeyword, color: "#cf222e", fontWeight: "700" },
  { tag: t.operatorKeyword, color: "#cf222e" },
  { tag: t.definitionKeyword, color: "#8250df", fontWeight: "700" },
  { tag: t.moduleKeyword, color: "#8250df", fontWeight: "700" },
  { tag: t.string, color: "#0a3069" },
  { tag: t.special(t.string), color: "#0a7373" },
  { tag: t.character, color: "#0a3069" },
  { tag: t.number, color: "#0550ae" },
  { tag: t.bool, color: "#0550ae", fontWeight: "600" },
  { tag: t.null, color: "#0550ae", fontWeight: "600" },
  { tag: t.atom, color: "#8250df" },
  { tag: t.propertyName, color: "#953800" },
  { tag: t.attributeName, color: "#953800" },
  { tag: t.variableName, color: "#953800" },
  {
    tag: t.definition(t.variableName),
    color: "#953800",
    fontWeight: "600",
  },
  { tag: t.typeName, color: "#0550ae" },
  { tag: t.className, color: "#0550ae", fontWeight: "600" },
  { tag: t.namespace, color: "#8250df" },
  { tag: t.operator, color: "#8250df", fontWeight: "600" },
  { tag: t.compareOperator, color: "#cf222e" },
  { tag: t.logicOperator, color: "#cf222e" },
  { tag: t.punctuation, color: "#24292f" },
  { tag: t.bracket, color: "#57606a" },
  { tag: t.angleBracket, color: "#116329" },
  { tag: t.tagName, color: "#116329", fontWeight: "600" },
  { tag: t.attributeValue, color: "#0a3069" },
  {
    tag: t.invalid,
    color: "#cf222e",
    backgroundColor: "rgba(255, 129, 130, 0.15)",
  },
  {
    tag: katexMarkTag,
    color: "#9a6700",
    fontWeight: "700",
  },
  {
    tag: katexContentTag,
    color: "#7d4e00",
    backgroundColor: "rgba(255, 212, 121, 0.28)",
  },
  {
    tag: markContentTag,
    color: "#24292f",
    backgroundColor: "rgba(255, 212, 0, 0.45)",
  },
  {
    tag: insertContentTag,
    color: "#116329",
    textDecoration: "underline",
  },
  {
    tag: admonitionMarkTag,
    color: "#57606a",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeNoteTag,
    color: "#0550ae",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeTipTag,
    color: "#1a7f37",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeWarningTag,
    color: "#9a6700",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeDangerTag,
    color: "#cf222e",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeOtherTag,
    color: "#8250df",
    fontWeight: "700",
  },
  {
    tag: admonitionTitleTag,
    color: "#0a3069",
    fontStyle: "italic",
  },
]);

/** ダーク UI 向け（紙面プレビューとは別） */
const darkHighlight = HighlightStyle.define([
  { tag: t.heading1, color: "#79c0ff", fontWeight: "800" },
  { tag: t.heading2, color: "#79c0ff", fontWeight: "700" },
  { tag: t.heading3, color: "#a5d6ff", fontWeight: "700" },
  { tag: t.heading4, color: "#a5d6ff", fontWeight: "600" },
  { tag: t.heading5, color: "#c9e4ff", fontWeight: "600" },
  { tag: t.heading6, color: "#c9e4ff", fontWeight: "600" },
  { tag: t.strong, color: "#ff7b72", fontWeight: "700" },
  { tag: t.emphasis, color: "#d2a8ff", fontStyle: "italic" },
  { tag: t.strikethrough, color: "#8b949e", textDecoration: "line-through" },
  { tag: t.link, color: "#58a6ff", textDecoration: "underline" },
  { tag: t.url, color: "#39d0d0" },
  {
    tag: t.monospace,
    color: "#e6edf3",
    backgroundColor: "rgba(110, 118, 129, 0.28)",
  },
  { tag: t.quote, color: "#8b949e", fontStyle: "italic" },
  { tag: t.list, color: "#ff9bce" },
  { tag: t.contentSeparator, color: "#d2a8ff", fontWeight: "700" },
  { tag: t.processingInstruction, color: "#7ee787" },
  { tag: t.labelName, color: "#ff9bce" },
  { tag: t.meta, color: "#7ee787" },
  { tag: t.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: t.lineComment, color: "#8b949e", fontStyle: "italic" },
  { tag: t.keyword, color: "#ff7b72", fontWeight: "700" },
  { tag: t.controlKeyword, color: "#ff7b72", fontWeight: "700" },
  { tag: t.operatorKeyword, color: "#ff7b72" },
  { tag: t.definitionKeyword, color: "#d2a8ff", fontWeight: "700" },
  { tag: t.moduleKeyword, color: "#d2a8ff", fontWeight: "700" },
  { tag: t.string, color: "#a5d6ff" },
  { tag: t.special(t.string), color: "#39d0d0" },
  { tag: t.character, color: "#a5d6ff" },
  { tag: t.number, color: "#79c0ff" },
  { tag: t.bool, color: "#79c0ff", fontWeight: "600" },
  { tag: t.null, color: "#79c0ff", fontWeight: "600" },
  { tag: t.atom, color: "#d2a8ff" },
  { tag: t.propertyName, color: "#ffa657" },
  { tag: t.attributeName, color: "#ffa657" },
  { tag: t.variableName, color: "#ffa657" },
  {
    tag: t.definition(t.variableName),
    color: "#ffa657",
    fontWeight: "600",
  },
  { tag: t.typeName, color: "#79c0ff" },
  { tag: t.className, color: "#79c0ff", fontWeight: "600" },
  { tag: t.namespace, color: "#d2a8ff" },
  { tag: t.operator, color: "#d2a8ff", fontWeight: "600" },
  { tag: t.compareOperator, color: "#ff7b72" },
  { tag: t.logicOperator, color: "#ff7b72" },
  { tag: t.punctuation, color: "#e6edf3" },
  { tag: t.bracket, color: "#8b949e" },
  { tag: t.angleBracket, color: "#7ee787" },
  { tag: t.tagName, color: "#7ee787", fontWeight: "600" },
  { tag: t.attributeValue, color: "#a5d6ff" },
  {
    tag: t.invalid,
    color: "#ff7b72",
    backgroundColor: "rgba(248, 81, 73, 0.2)",
  },
  {
    tag: katexMarkTag,
    color: "#e3b341",
    fontWeight: "700",
  },
  {
    tag: katexContentTag,
    color: "#e3b341",
    backgroundColor: "rgba(210, 153, 34, 0.22)",
  },
  {
    tag: markContentTag,
    color: "#e6edf3",
    backgroundColor: "rgba(210, 153, 34, 0.35)",
  },
  {
    tag: insertContentTag,
    color: "#7ee787",
    textDecoration: "underline",
  },
  {
    tag: admonitionMarkTag,
    color: "#8b949e",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeNoteTag,
    color: "#79c0ff",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeTipTag,
    color: "#7ee787",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeWarningTag,
    color: "#e3b341",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeDangerTag,
    color: "#ff7b72",
    fontWeight: "700",
  },
  {
    tag: admonitionTypeOtherTag,
    color: "#d2a8ff",
    fontWeight: "700",
  },
  {
    tag: admonitionTitleTag,
    color: "#a5d6ff",
    fontStyle: "italic",
  },
]);

const lightChrome = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "#fbfcfd",
    color: "#24292f",
  },
  ".cm-scroller": {
    fontFamily: '"IBM Plex Mono", "Cascadia Code", Consolas, monospace',
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "14px 0", caretColor: "#0969da" },
  ".cm-gutters": {
    backgroundColor: "#f0f3f6",
    color: "#8c959f",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "#e7ecf1", color: "#24292f" },
  ".cm-activeLine": { backgroundColor: "rgba(9, 105, 218, 0.06)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(9, 105, 218, 0.18)",
  },
  ".cm-cursor": { borderLeftColor: "#0969da" },
  ".cm-matchingBracket": {
    backgroundColor: "rgba(130, 80, 223, 0.18)",
    outline: "1px solid rgba(130, 80, 223, 0.45)",
  },
});

const darkChrome = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "13px",
      backgroundColor: "#0d1117",
      color: "#e6edf3",
    },
    ".cm-scroller": {
      fontFamily: '"IBM Plex Mono", "Cascadia Code", Consolas, monospace',
      lineHeight: "1.65",
    },
    ".cm-content": { padding: "14px 0", caretColor: "#58a6ff" },
    ".cm-gutters": {
      backgroundColor: "#010409",
      color: "#7d8590",
      border: "none",
    },
    ".cm-activeLineGutter": { backgroundColor: "#161b22", color: "#e6edf3" },
    ".cm-activeLine": { backgroundColor: "rgba(56, 139, 253, 0.1)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(56, 139, 253, 0.28)",
    },
    ".cm-cursor": { borderLeftColor: "#58a6ff" },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(210, 168, 255, 0.2)",
      outline: "1px solid rgba(210, 168, 255, 0.45)",
    },
  },
  { dark: true }
);

const editorBaseExtensions: Extension[] = [
  yamlFrontmatter({ content: mdSupport }),
  ...editorLintExtensions,
  markdownAssistKeymap,
  EditorView.lineWrapping,
];

export function getEditorExtensions(
  scheme: "light" | "dark" = "light"
): Extension[] {
  const highlight = scheme === "dark" ? darkHighlight : lightHighlight;
  const chrome = scheme === "dark" ? darkChrome : lightChrome;
  return [
    ...editorBaseExtensions,
    Prec.high(syntaxHighlighting(highlight)),
    chrome,
  ];
}
