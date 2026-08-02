/**
 * `!!! note` / `??? tip` など pymdownx アドモニション／details のエディタ強調。
 */
import { tags as t, Tag } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

export const admonitionMarkTag = Tag.define(t.meta);
export const admonitionTitleTag = Tag.define(t.string);
export const admonitionTypeNoteTag = Tag.define();
export const admonitionTypeTipTag = Tag.define();
export const admonitionTypeWarningTag = Tag.define();
export const admonitionTypeDangerTag = Tag.define();
export const admonitionTypeOtherTag = Tag.define();

function typeNodeName(type: string): string {
  switch (type.toLowerCase()) {
    case "note":
    case "info":
    case "abstract":
    case "summary":
    case "tldr":
      return "AdmonitionTypeNote";
    case "tip":
    case "hint":
    case "success":
    case "check":
    case "done":
      return "AdmonitionTypeTip";
    case "warning":
    case "caution":
    case "attention":
      return "AdmonitionTypeWarning";
    case "danger":
    case "error":
    case "failure":
    case "fail":
    case "missing":
    case "bug":
      return "AdmonitionTypeDanger";
    default:
      return "AdmonitionTypeOther";
  }
}

type HeaderParts = {
  markEnd: number;
  type: string;
  typeStart: number;
  typeEnd: number;
  title?: { from: number; to: number };
};

/** `line.text` の `from` 以降を解析（相対オフセット） */
function parseHeader(text: string, from: number): HeaderParts | null {
  const s = text.slice(from);
  const markM = /^(!!!|\?\?\?\+?)([ \t]+)/.exec(s);
  if (!markM) return null;
  let i = markM[0].length;
  const typeM = /^([a-zA-Z][\w-]*)/.exec(s.slice(i));
  if (!typeM) return null;
  const typeStart = i;
  const typeEnd = i + typeM[1].length;
  i = typeEnd;

  let title: { from: number; to: number } | undefined;
  const ws = /^[ \t]+/.exec(s.slice(i));
  if (ws) {
    i += ws[0].length;
    if (s[i] === '"') {
      const close = s.indexOf('"', i + 1);
      if (close < 0) return null;
      title = { from: i + 1, to: close };
      i = close + 1;
    } else if (i < s.length) {
      let end = s.length;
      while (end > i && (s[end - 1] === " " || s[end - 1] === "\t")) end--;
      if (end > i) title = { from: i, to: end };
      i = s.length;
    }
  }
  if (s.slice(i).trim() !== "") return null;

  return {
    markEnd: markM[1].length,
    type: typeM[1],
    typeStart,
    typeEnd,
    title,
  };
}

export const admonitionExtension: MarkdownConfig = {
  defineNodes: [
    {
      name: "Admonition",
      block: true,
      composite(_cx, line, value) {
        // 4 スペース以上インデントなら本文継続（空行はブロック終了）
        if (line.indent < line.baseIndent + value) return false;
        line.moveBaseColumn(line.baseIndent + value);
        return true;
      },
    },
    { name: "AdmonitionMark", style: admonitionMarkTag },
    { name: "AdmonitionTypeNote", style: admonitionTypeNoteTag },
    { name: "AdmonitionTypeTip", style: admonitionTypeTipTag },
    { name: "AdmonitionTypeWarning", style: admonitionTypeWarningTag },
    { name: "AdmonitionTypeDanger", style: admonitionTypeDangerTag },
    { name: "AdmonitionTypeOther", style: admonitionTypeOtherTag },
    { name: "AdmonitionTitle", style: admonitionTitleTag },
  ],
  parseBlock: [
    {
      name: "Admonition",
      before: "Blockquote",
      parse(cx, line) {
        const header = parseHeader(line.text, line.pos);
        if (!header) return false;

        const base = cx.lineStart + line.pos;
        const typeNode = typeNodeName(header.type);

        cx.startComposite("Admonition", line.pos, 4);
        cx.addElement(
          cx.elt("AdmonitionMark", base, base + header.markEnd)
        );
        cx.addElement(
          cx.elt(
            typeNode,
            base + header.typeStart,
            base + header.typeEnd
          )
        );
        if (header.title) {
          cx.addElement(
            cx.elt(
              "AdmonitionTitle",
              base + header.title.from,
              base + header.title.to
            )
          );
        }
        // 見出し行に本文は無い
        line.moveBase(line.text.length);
        return null;
      },
    },
  ],
};
