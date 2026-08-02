import { load as yamlLoad, YAMLException } from "js-yaml";
import {
  COVER_PATTERN_OPTIONS,
  FONT_OPTIONS,
  RADIUS_OPTIONS,
  STYLE_OPTIONS,
  extractOhynaConfig,
  hasOhynaFrontmatter,
  settingsFromMarkdown,
  validateDocumentSettings,
} from "./frontmatter";

export type MdDiagnostic = {
  severity: "error" | "warning" | "info";
  message: string;
  /** 1-based。不明なら省略 */
  line?: number;
};

const STYLE_VALUES = new Set(STYLE_OPTIONS.map((o) => o.value));
const FONT_VALUES = new Set(FONT_OPTIONS.map((o) => o.value));
const RADIUS_VALUES = new Set(RADIUS_OPTIONS.map((o) => o.value));
const COVER_VALUES = new Set(COVER_PATTERN_OPTIONS.map((o) => o.value));

function stripLeadingComments(text: string): { offsetLines: number; rest: string } {
  let src = String(text || "").replace(/^\uFEFF/, "");
  let offsetLines = 0;
  while (/^\s*<!--[\s\S]*?-->/.test(src)) {
    const m = src.match(/^(\s*<!--[\s\S]*?-->\s*)/);
    if (!m) break;
    offsetLines += m[1].split(/\r?\n/).length - 1;
    src = src.slice(m[1].length);
  }
  return { offsetLines, rest: src };
}

function analyzeFrontmatter(markdown: string, out: MdDiagnostic[]): void {
  const { offsetLines, rest } = stripLeadingComments(markdown);
  const m = rest.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) {
    out.push({
      severity: "error",
      message: "ドキュメント設定（ohyna:）がありません",
      line: 1,
    });
    return;
  }

  const fmStartLine = offsetLines + 2; // after opening ---
  try {
    const data = yamlLoad(m[1]);
    if (data == null || typeof data !== "object" || Array.isArray(data)) {
      out.push({
        severity: "error",
        message: "front matter はオブジェクトである必要があります",
        line: fmStartLine,
      });
      return;
    }
  } catch (e) {
    if (e instanceof YAMLException) {
      const markLine =
        typeof e.mark?.line === "number" ? fmStartLine + e.mark.line : fmStartLine;
      out.push({
        severity: "error",
        message: `YAML の構文エラー: ${e.reason || e.message}`,
        line: markLine,
      });
    } else {
      out.push({
        severity: "error",
        message: "YAML の解析に失敗しました",
        line: fmStartLine,
      });
    }
    return;
  }

  if (!hasOhynaFrontmatter(markdown)) {
    out.push({
      severity: "error",
      message: "ohyna: ブロックがありません",
      line: fmStartLine,
    });
    return;
  }

  const cfg = extractOhynaConfig(
    (() => {
      try {
        const data = yamlLoad(m[1]);
        return data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    })()
  );

  const settings = settingsFromMarkdown(markdown);
  for (const issue of validateDocumentSettings(settings)) {
    out.push({
      severity: "error",
      message: issue.message,
      line: fmStartLine,
    });
  }

  if (cfg.style != null && String(cfg.style).trim() && !STYLE_VALUES.has(String(cfg.style))) {
    out.push({
      severity: "error",
      message: `未知の色テーマです: ${String(cfg.style)}`,
      line: fmStartLine,
    });
  }
  if (
    cfg.font != null &&
    String(cfg.font).trim() &&
    !FONT_VALUES.has(String(cfg.font)) &&
    !(cfg.fontFamily && String(cfg.fontFamily).trim())
  ) {
    out.push({
      severity: "error",
      message: `未知のフォントです: ${String(cfg.font)}`,
      line: fmStartLine,
    });
  }
  if (cfg.radius != null && String(cfg.radius).trim() && !RADIUS_VALUES.has(String(cfg.radius))) {
    out.push({
      severity: "error",
      message: `未知の角丸サイズです: ${String(cfg.radius)}`,
      line: fmStartLine,
    });
  }
  if (
    cfg.coverPattern != null &&
    String(cfg.coverPattern).trim() &&
    !COVER_VALUES.has(String(cfg.coverPattern))
  ) {
    out.push({
      severity: "error",
      message: `未知の表紙デザインです: ${String(cfg.coverPattern)}`,
      line: fmStartLine,
    });
  }
}

function analyzeFences(markdown: string, out: MdDiagnostic[]): void {
  const lines = markdown.split(/\r?\n/);
  let open: {
    line: number;
    lang: string;
    marker: string;
    len: number;
    info: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/);
    if (!fence) continue;
    const marker = fence[2][0];
    const len = fence[2].length;
    const info = fence[3].trim();
    if (!open) {
      const tokens = info ? info.toLowerCase().split(/\s+/) : [];
      const lang = tokens[0] || "";
      open = { line: i + 1, lang, marker, len, info };
      if (
        marker === "`" &&
        lang === "mermaid" &&
        tokens.length > 1 &&
        !(tokens.length === 2 && tokens[1] === "code")
      ) {
        out.push({
          severity: "error",
          message: "mermaid フェンスで指定できる追加トークンは code のみです",
          line: i + 1,
        });
      }
      continue;
    }
    if (marker === open.marker && len >= open.len && info === "") {
      open = null;
    }
  }

  if (open) {
    out.push({
      severity: "error",
      message: open.lang
        ? `コードフェンス（${open.lang}）が閉じられていません`
        : "コードフェンスが閉じられていません",
      line: open.line,
    });
  }
}

/** ローカル即時チェック（サーバ厳格検証の到着前フォールバック） */
export function analyzeMarkdown(markdown: string): MdDiagnostic[] {
  const out: MdDiagnostic[] = [];
  const text = String(markdown || "");
  if (!text.trim()) {
    out.push({ severity: "error", message: "ドキュメントが空です", line: 1 });
    return out;
  }
  analyzeFrontmatter(text, out);
  analyzeFences(text, out);
  return out;
}

export function summarizeDiagnostics(items: MdDiagnostic[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const d of items) {
    if (d.severity === "error") errors += 1;
    else if (d.severity === "warning") warnings += 1;
    else infos += 1;
  }
  return { errors, warnings, infos };
}
