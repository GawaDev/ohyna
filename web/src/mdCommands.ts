import {
  EditorSelection,
  type ChangeSpec,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { modKeyLabel } from "./platform";

function selectedOrPlaceholder(
  state: EditorView["state"],
  from: number,
  to: number,
  placeholder: string
): string {
  const text = state.sliceDoc(from, to);
  return text.length > 0 ? text : placeholder;
}

/** 選択範囲を before/after で囲む。既に囲まれていれば外す。 */
export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder = "テキスト"
): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const from = range.from;
      const to = range.to;
      const selected = state.sliceDoc(from, to);

      if (
        selected.startsWith(before) &&
        selected.endsWith(after) &&
        selected.length >= before.length + after.length
      ) {
        const inner = selected.slice(before.length, selected.length - after.length);
        return {
          changes: { from, to, insert: inner },
          range: EditorSelection.range(from, from + inner.length),
        };
      }

      const beforeDoc = state.sliceDoc(Math.max(0, from - before.length), from);
      const afterDoc = state.sliceDoc(to, Math.min(state.doc.length, to + after.length));
      if (beforeDoc === before && afterDoc === after) {
        return {
          changes: [
            { from: from - before.length, to: from, insert: "" },
            { from: to, to: to + after.length, insert: "" },
          ],
          range: EditorSelection.range(from - before.length, to - before.length),
        };
      }

      const text = selectedOrPlaceholder(state, from, to, placeholder);
      const insert = before + text + after;
      return {
        changes: { from, to, insert },
        range: EditorSelection.range(
          from + before.length,
          from + before.length + text.length
        ),
      };
    })
  );
  return true;
}

function lineRangeForSelection(view: EditorView): { from: number; to: number } {
  const { state } = view;
  let from = state.doc.length;
  let to = 0;
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    from = Math.min(from, startLine.from);
    to = Math.max(to, endLine.to);
  }
  return { from, to };
}

const HEADING_RE = /^(#{1,6})\s+/;
const UL_RE = /^(\s*)([-*+])\s+(\[[ xX]\]\s+)?/;
const OL_RE = /^(\s*)(\d+)\.\s+/;
const QUOTE_RE = /^(>\s?)/;

/** 見出しレベル 1–6。同じレベル再実行で解除。0 で解除のみ。 */
export function setHeading(view: EditorView, level: number): boolean {
  const { state } = view;
  const { from, to } = lineRangeForSelection(view);
  const changes: ChangeSpec[] = [];
  let cursor = from;
  while (cursor <= to) {
    const line = state.doc.lineAt(cursor);
    const text = line.text;
    const m = text.match(HEADING_RE);
    let next: string;
    if (level <= 0) {
      next = m ? text.slice(m[0].length) : text;
    } else if (m && m[1].length === level) {
      next = text.slice(m[0].length);
    } else {
      const body = m ? text.slice(m[0].length) : text;
      next = `${"#".repeat(level)} ${body}`;
    }
    if (next !== text) {
      changes.push({ from: line.from, to: line.to, insert: next });
    }
    if (line.to >= state.doc.length) break;
    cursor = line.to + 1;
    if (cursor > to) break;
  }
  if (changes.length) {
    view.dispatch({ changes, userEvent: "input.format" });
  }
  return true;
}

type ListMode = "ul" | "ol" | "task" | "quote" | "none";

function detectListMode(line: string): ListMode {
  if (QUOTE_RE.test(line)) return "quote";
  const ul = line.match(UL_RE);
  if (ul) return ul[3] ? "task" : "ul";
  if (OL_RE.test(line)) return "ol";
  return "none";
}

function stripListPrefix(line: string): string {
  return line
    .replace(HEADING_RE, "")
    .replace(QUOTE_RE, "")
    .replace(UL_RE, "$1")
    .replace(OL_RE, "$1");
}

/** 箇条書き／番号／タスク／引用のトグル */
export function toggleList(view: EditorView, mode: Exclude<ListMode, "none">): boolean {
  const { state } = view;
  const { from, to } = lineRangeForSelection(view);
  const changes: ChangeSpec[] = [];
  let cursor = from;
  let ol = 1;
  while (cursor <= to) {
    const line = state.doc.lineAt(cursor);
    const text = line.text;
    const current = detectListMode(text);
    const indent = (text.match(/^(\s*)/) || ["", ""])[1];
    const plain = stripListPrefix(text).replace(/^\s+/, "");
    let next: string;
    if (current === mode) {
      next = text
        .replace(QUOTE_RE, "")
        .replace(UL_RE, (_, sp: string) => sp)
        .replace(OL_RE, (_, sp: string) => sp);
    } else if (mode === "ul") {
      next = `${indent}- ${plain}`;
    } else if (mode === "ol") {
      next = `${indent}${ol}. ${plain}`;
      ol += 1;
    } else if (mode === "task") {
      next = `${indent}- [ ] ${plain}`;
    } else {
      next = `> ${plain}`;
    }
    if (next !== text) {
      changes.push({ from: line.from, to: line.to, insert: next });
    }
    if (line.to >= state.doc.length) break;
    cursor = line.to + 1;
    if (cursor > to) break;
  }
  if (changes.length) {
    view.dispatch({ changes, userEvent: "input.format" });
  }
  return true;
}

/** カーソル位置にスニペットを挿入し、${} プレースホルダを選択 */
export function insertSnippet(view: EditorView, template: string): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const atLineStart = pos === line.from || state.sliceDoc(line.from, pos).trim() === "";
  let insert = template;
  if (!atLineStart && !template.startsWith("\n") && template.includes("\n")) {
    insert = "\n" + template;
  }
  const ph = insert.indexOf("${}");
  const clean = insert.replace("${}", "");
  const anchor = pos + (ph >= 0 ? ph : clean.length);
  const head = ph >= 0 ? anchor : pos + clean.length;
  view.dispatch({
    changes: { from: pos, to: state.selection.main.to, insert: clean },
    selection: EditorSelection.range(anchor, head),
    userEvent: "input",
  });
  return true;
}

export function insertLink(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to) || "リンクテキスト";
  const insert = `[${selected}](${"${}"})`;
  const clean = insert.replace("${}", "https://");
  const urlFrom = range.from + selected.length + 3;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: clean },
    selection: EditorSelection.range(urlFrom, urlFrom + "https://".length),
    userEvent: "input",
  });
  return true;
}

export function insertImage(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const alt = state.sliceDoc(range.from, range.to) || "画像";
  const insert = `![${alt}](path/to/image.png)`;
  const pathFrom = range.from + alt.length + 4;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(pathFrom, pathFrom + "path/to/image.png".length),
    userEvent: "input",
  });
  return true;
}

export function insertHorizontalRule(view: EditorView): boolean {
  return insertSnippet(view, "\n---\n\n");
}

export function insertCodeFence(view: EditorView, lang = ""): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to) || "コード";
  const open = "```" + lang;
  const insert = `${open}\n${selected}\n\`\`\`\n`;
  const selFrom = range.from + open.length + 1;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(selFrom, selFrom + selected.length),
    userEvent: "input",
  });
  return true;
}

export function insertMermaid(view: EditorView): boolean {
  const tpl = `\`\`\`mermaid
flowchart LR
  A[開始] --> B[処理]
  B --> C[終了]
\`\`\`
`;
  return insertSnippet(view, tpl);
}

export function insertMathBlock(view: EditorView): boolean {
  return insertSnippet(view, "$$\n${}\n$$\n");
}

export function insertTable(view: EditorView): boolean {
  const tpl = `| 項目 | 内容 |
|------|------|
| A    |      |
| B    |      |
`;
  return insertSnippet(view, tpl);
}

export function insertDetails(view: EditorView): boolean {
  const tpl = `??? note "補足"
    ここに折りたたみ内容を書きます。
`;
  return insertSnippet(view, tpl);
}

/** 選択を <kbd>…</kbd> で囲む（キー表記） */
export function wrapKbd(view: EditorView): boolean {
  return wrapSelection(view, "<kbd>", "</kbd>", modKeyLabel());
}

/** 行末空白除去・連続空行の整理・末尾改行 */
export function tidyMarkdown(view: EditorView): boolean {
  const { state } = view;
  const raw = state.doc.toString();
  const lines = raw.split(/\r?\n/).map((ln) => ln.replace(/[ \t]+$/g, ""));
  const out: string[] = [];
  let blank = 0;
  for (const ln of lines) {
    if (ln.trim() === "") {
      blank += 1;
      if (blank <= 2) out.push("");
    } else {
      blank = 0;
      out.push(ln);
    }
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  let next = out.join("\n");
  if (next.length > 0) next += "\n";
  if (next === raw) return true;
  view.dispatch({
    changes: { from: 0, to: state.doc.length, insert: next },
    userEvent: "input.format",
  } satisfies TransactionSpec);
  return true;
}

export const markdownAssistKeymap = keymap.of([
  indentWithTab,
  {
    key: "Mod-b",
    run: (v) => wrapSelection(v, "**", "**", "太字"),
  },
  {
    key: "Mod-i",
    run: (v) => wrapSelection(v, "*", "*", "斜体"),
  },
  {
    key: "Mod-Shift-x",
    run: (v) => wrapSelection(v, "~~", "~~", "取り消し"),
  },
  {
    key: "Mod-e",
    run: (v) => wrapSelection(v, "`", "`", "code"),
  },
  {
    key: "Mod-k",
    run: (v) => insertLink(v),
  },
  {
    key: "Mod-Shift-m",
    run: (v) => wrapSelection(v, "$", "$", "E=mc^2"),
  },
  { key: "Mod-Alt-1", run: (v) => setHeading(v, 1) },
  { key: "Mod-Alt-2", run: (v) => setHeading(v, 2) },
  { key: "Mod-Alt-3", run: (v) => setHeading(v, 3) },
  { key: "Mod-Alt-4", run: (v) => setHeading(v, 4) },
  { key: "Mod-Alt-5", run: (v) => setHeading(v, 5) },
  { key: "Mod-Alt-6", run: (v) => setHeading(v, 6) },
  { key: "Mod-Shift-8", run: (v) => toggleList(v, "ul") },
  { key: "Mod-Shift-7", run: (v) => toggleList(v, "ol") },
  { key: "Mod-Shift-9", run: (v) => toggleList(v, "task") },
  { key: "Mod-Shift-.", run: (v) => toggleList(v, "quote") },
  { key: "Mod-Shift-l", run: (v) => tidyMarkdown(v) },
]);
