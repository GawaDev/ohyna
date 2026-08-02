/**
 * 編集画面のコードフェンス言語（Ohyna Language Registry の GUI 側）。
 * 成果物の見た目の基準は Pygments。ここに無い稀な名前は編集中だけプレーン表示になりうる。
 *
 * 対象は sample.md／マニュアルで使う言語＋製品エイリアス。
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
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { stexMath } from "@codemirror/legacy-modes/mode/stex";
import {
  c,
  cpp,
  csharp,
  java,
  kotlin,
} from "@codemirror/legacy-modes/mode/clike";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { go } from "@codemirror/legacy-modes/mode/go";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { xml } from "@codemirror/legacy-modes/mode/xml";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";

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

const stexMathSupport = new LanguageSupport(StreamLanguage.define(stexMath));

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
    support: stexMathSupport,
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
    support: yaml(),
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json"],
    support: json(),
  }),
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "javascript", "mjs", "cjs"],
    support: javascript(),
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "typescript"],
    support: javascript({ typescript: true }),
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["py", "python"],
    support: python(),
  }),
  LanguageDescription.of({
    name: "PHP",
    alias: ["php"],
    support: new LanguageSupport(phpStream),
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm"],
    support: html(),
  }),
  LanguageDescription.of({
    name: "CSS",
    alias: ["css"],
    support: css(),
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["bash", "sh", "shell", "zsh"],
    support: streamSupport(shell),
  }),
  LanguageDescription.of({
    name: "PowerShell",
    alias: ["powershell", "ps1", "pwsh"],
    support: streamSupport(powerShell),
  }),
  LanguageDescription.of({
    name: "SQL",
    alias: ["sql"],
    support: streamSupport(standardSQL),
  }),
  LanguageDescription.of({
    name: "Go",
    alias: ["go", "golang"],
    support: streamSupport(go),
  }),
  LanguageDescription.of({
    name: "Rust",
    alias: ["rust", "rs"],
    support: streamSupport(rust),
  }),
  LanguageDescription.of({
    name: "Java",
    alias: ["java"],
    support: streamSupport(java),
  }),
  LanguageDescription.of({
    name: "C#",
    alias: ["csharp", "cs"],
    support: streamSupport(csharp),
  }),
  LanguageDescription.of({
    name: "C",
    alias: ["c", "h"],
    support: streamSupport(c),
  }),
  LanguageDescription.of({
    name: "C++",
    alias: ["cpp", "c++", "hpp", "cc", "cxx"],
    support: streamSupport(cpp),
  }),
  LanguageDescription.of({
    name: "Kotlin",
    alias: ["kotlin", "kt"],
    support: streamSupport(kotlin),
  }),
  LanguageDescription.of({
    name: "Ruby",
    alias: ["ruby", "rb"],
    support: streamSupport(ruby),
  }),
  LanguageDescription.of({
    name: "TOML",
    alias: ["toml"],
    support: streamSupport(toml),
  }),
  LanguageDescription.of({
    name: "XML",
    alias: ["xml", "svg"],
    support: streamSupport(xml),
  }),
  LanguageDescription.of({
    name: "Diff",
    alias: ["diff", "patch"],
    support: streamSupport(diff),
  }),
  LanguageDescription.of({
    name: "INI / Properties",
    alias: ["ini", "properties", "conf"],
    support: streamSupport(properties),
  }),
  LanguageDescription.of({
    name: "Dockerfile",
    alias: ["dockerfile", "docker"],
    support: streamSupport(dockerFile),
  }),
  LanguageDescription.of({
    name: "Markdown",
    alias: ["md", "markdown"],
    support: cmMarkdown({ base: markdownLanguage }),
  }),
];
