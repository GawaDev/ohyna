/**
 * 編集画面のコードフェンス言語（Ohyna Language Registry の GUI 側）。
 * 成果物の見た目の基準は Pygments。ここに無い稀な名前は編集中だけプレーン表示になりうる。
 *
 * 対象は sample.md／マニュアルで使う言語＋製品エイリアス。
 * 重い @codemirror/lang-* / legacy-modes は LanguageDescription.load で遅延読込する。
 */
import {
  markdown as cmMarkdown,
  markdownLanguage,
} from "@codemirror/lang-markdown";
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
} from "@codemirror/language";

function streamSupport(parser: StreamParser<unknown>): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(parser));
}

/** プレーンテキスト（色分けなし。text / txt / plain / 言語省略時） */
const plainStream = StreamLanguage.define({
  name: "plain",
  token(stream) {
    stream.skipToEnd();
    return null;
  },
});

export const plainLanguageSupport = new LanguageSupport(plainStream);

/** コンソール出力向け（プロンプト風の簡易色分け） */
const consoleStream = StreamLanguage.define({
  name: "console",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^[#$>]\s?/)) return "meta";
    if (stream.match(/^([A-Za-z]:\\|\.\/|\/)\S*/)) return "string";
    if (stream.match(/^".*?"|^'.*?'/)) return "string";
    if (stream.match(/^[A-Za-z_][\w.-]*/)) return "variableName";
    stream.next();
    return null;
  },
});

/** PHP（編集用の軽量ハイライト。成果物は Pygments） */
const phpStream = StreamLanguage.define({
  name: "php",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^<\?(?:php|=)?/)) return "meta";
    if (stream.match(/^\?>/)) return "meta";
    if (stream.match(/^\/\/.*|^#.*/)) return "comment";
    if (stream.match(/^\/\*[\s\S]*?\*\//)) return "comment";
    if (stream.match(/^\$[A-Za-z_][\w]*/)) return "variableName";
    if (
      stream.match(
        /^(function|return|echo|print|class|public|private|protected|namespace|use|if|else|elseif|foreach|while|for|new|array|true|false|null|as)\b/
      )
    ) {
      return "keyword";
    }
    if (stream.match(/^"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/)) return "string";
    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_][\w]*/)) return "variableName";
    stream.next();
    return null;
  },
});

/**
 * Mermaid フェンス用の寛容なストリームハイライト。
 * 図（mermaid）もコード表示（mermaid code）も先頭トークンが mermaid のため同じモード。
 */
const mermaidStream = StreamLanguage.define({
  name: "mermaid",
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match(/%%.*/)) return "comment";
    if (stream.match(/%%\{[\s\S]*?\}%%/)) return "meta";

    if (
      stream.match(
        /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|mindmap|timeline|zenuml|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture(?:-beta)?|radar(?:-beta)?|treemap(?:-beta)?|venn|ishikawa|wardley|cynefin|treeview)\b/
      )
    ) {
      return "keyword";
    }

    if (
      stream.match(
        /^(subgraph|end|direction|TD|TB|BT|RL|LR|participant|actor|Note|loop|alt|opt|else|par|and|critical|break|rect|activate|deactivate|title|section|dateFormat|axisFormat|excludes|includes|todayMarker|class|classDef|click|style|linkStyle|callback)\b/
      )
    ) {
      return "keyword";
    }

    if (stream.match(/"[^"]*"|'[^']*'/)) return "string";
    if (stream.match(/\|[^|]*\|/)) return "string";

    if (
      stream.match(
        /\(\[[^\]]*\]\)|\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\[\[[^\]]*\]\]/
      )
    ) {
      return "string";
    }

    if (stream.match(/-->|---|-\.->|==>|-->>|->>|->|--|~~/)) return "operator";
    if (stream.match(/&&&?/)) return "operator";

    if (stream.match(/[A-Za-z_][\w-]*/)) return "variableName";
    if (stream.match(/\d+(\.\d+)?/)) return "number";

    stream.next();
    return null;
  },
});

/** ツールバー「コードフェンス」挿入用（表示名 → info 言語トークン） */
export const fenceInsertLanguages: { label: string; lang: string }[] = [
  { label: "プレーン", lang: "text" },
  { label: "Python", lang: "python" },
  { label: "JavaScript", lang: "javascript" },
  { label: "TypeScript", lang: "typescript" },
  { label: "JSON", lang: "json" },
  { label: "YAML", lang: "yaml" },
  { label: "HTML", lang: "html" },
  { label: "CSS", lang: "css" },
  { label: "Shell", lang: "bash" },
  { label: "PowerShell", lang: "powershell" },
  { label: "SQL", lang: "sql" },
  { label: "Go", lang: "go" },
  { label: "Rust", lang: "rust" },
  { label: "Java", lang: "java" },
  { label: "C#", lang: "csharp" },
  { label: "C / C++", lang: "cpp" },
  { label: "Ruby", lang: "ruby" },
  { label: "PHP", lang: "php" },
  { label: "TOML", lang: "toml" },
  { label: "XML", lang: "xml" },
  { label: "Diff", lang: "diff" },
  { label: "Console", lang: "console" },
  { label: "Mermaid コード", lang: "mermaid code" },
  { label: "Markdown", lang: "markdown" },
];

export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: "Mermaid",
    alias: ["mermaid", "mermaid-code", "ohyna-mermaid"],
    support: new LanguageSupport(mermaidStream),
  }),
  LanguageDescription.of({
    name: "KaTeX / TeX",
    alias: ["math", "latex", "katex", "tex", "stex"],
    async load() {
      const { stexMath } = await import("@codemirror/legacy-modes/mode/stex");
      return new LanguageSupport(StreamLanguage.define(stexMath));
    },
  }),
  LanguageDescription.of({
    name: "Plain text",
    alias: ["text", "txt", "plain"],
    support: plainLanguageSupport,
  }),
  LanguageDescription.of({
    name: "Console",
    alias: ["console"],
    support: new LanguageSupport(consoleStream),
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yml", "yaml"],
    async load() {
      const { yaml } = await import("@codemirror/lang-yaml");
      return yaml();
    },
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json"],
    async load() {
      const { json } = await import("@codemirror/lang-json");
      return json();
    },
  }),
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "javascript", "mjs", "cjs"],
    async load() {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript();
    },
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "typescript"],
    async load() {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ typescript: true });
    },
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["py", "python"],
    async load() {
      const { python } = await import("@codemirror/lang-python");
      return python();
    },
  }),
  LanguageDescription.of({
    name: "PHP",
    alias: ["php"],
    support: new LanguageSupport(phpStream),
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm"],
    async load() {
      const { html } = await import("@codemirror/lang-html");
      return html();
    },
  }),
  LanguageDescription.of({
    name: "CSS",
    alias: ["css"],
    async load() {
      const { css } = await import("@codemirror/lang-css");
      return css();
    },
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["bash", "sh", "shell", "zsh"],
    async load() {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return streamSupport(shell);
    },
  }),
  LanguageDescription.of({
    name: "PowerShell",
    alias: ["powershell", "ps1", "pwsh"],
    async load() {
      const { powerShell } = await import(
        "@codemirror/legacy-modes/mode/powershell"
      );
      return streamSupport(powerShell);
    },
  }),
  LanguageDescription.of({
    name: "SQL",
    alias: ["sql"],
    async load() {
      const { standardSQL } = await import("@codemirror/legacy-modes/mode/sql");
      return streamSupport(standardSQL);
    },
  }),
  LanguageDescription.of({
    name: "Go",
    alias: ["go", "golang"],
    async load() {
      const { go } = await import("@codemirror/legacy-modes/mode/go");
      return streamSupport(go);
    },
  }),
  LanguageDescription.of({
    name: "Rust",
    alias: ["rust", "rs"],
    async load() {
      const { rust } = await import("@codemirror/legacy-modes/mode/rust");
      return streamSupport(rust);
    },
  }),
  LanguageDescription.of({
    name: "Java",
    alias: ["java"],
    async load() {
      const { java } = await import("@codemirror/legacy-modes/mode/clike");
      return streamSupport(java);
    },
  }),
  LanguageDescription.of({
    name: "C#",
    alias: ["csharp", "cs"],
    async load() {
      const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
      return streamSupport(csharp);
    },
  }),
  LanguageDescription.of({
    name: "C",
    alias: ["c", "h"],
    async load() {
      const { c } = await import("@codemirror/legacy-modes/mode/clike");
      return streamSupport(c);
    },
  }),
  LanguageDescription.of({
    name: "C++",
    alias: ["cpp", "c++", "hpp", "cc", "cxx"],
    async load() {
      const { cpp } = await import("@codemirror/legacy-modes/mode/clike");
      return streamSupport(cpp);
    },
  }),
  LanguageDescription.of({
    name: "Kotlin",
    alias: ["kotlin", "kt"],
    async load() {
      const { kotlin } = await import("@codemirror/legacy-modes/mode/clike");
      return streamSupport(kotlin);
    },
  }),
  LanguageDescription.of({
    name: "Ruby",
    alias: ["ruby", "rb"],
    async load() {
      const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
      return streamSupport(ruby);
    },
  }),
  LanguageDescription.of({
    name: "TOML",
    alias: ["toml"],
    async load() {
      const { toml } = await import("@codemirror/legacy-modes/mode/toml");
      return streamSupport(toml);
    },
  }),
  LanguageDescription.of({
    name: "XML",
    alias: ["xml", "svg"],
    async load() {
      const { xml } = await import("@codemirror/legacy-modes/mode/xml");
      return streamSupport(xml);
    },
  }),
  LanguageDescription.of({
    name: "Diff",
    alias: ["diff", "patch"],
    async load() {
      const { diff } = await import("@codemirror/legacy-modes/mode/diff");
      return streamSupport(diff);
    },
  }),
  LanguageDescription.of({
    name: "INI / Properties",
    alias: ["ini", "properties", "conf"],
    async load() {
      const { properties } = await import(
        "@codemirror/legacy-modes/mode/properties"
      );
      return streamSupport(properties);
    },
  }),
  LanguageDescription.of({
    name: "Dockerfile",
    alias: ["dockerfile", "docker"],
    async load() {
      const { dockerFile } = await import(
        "@codemirror/legacy-modes/mode/dockerfile"
      );
      return streamSupport(dockerFile);
    },
  }),
  LanguageDescription.of({
    name: "Markdown",
    alias: ["md", "markdown"],
    support: cmMarkdown({ base: markdownLanguage }),
  }),
];
