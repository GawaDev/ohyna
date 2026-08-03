import { dump as yamlDump, load as yamlLoad } from "js-yaml";

export const OHYNA_KEY = "ohyna";

export type DocumentSettings = {
  cover: boolean;
  title: string;
  subtitle: string;
  label: string;
  meta: string[];
  author: string;
  version: string;
  date: string;
  style: string;
  lang: string;
  rounded: boolean;
  radius: string;
  font: string;
  fontFamily: string;
  fontMono: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  coverGradient: boolean;
  /** 表紙デザイン */
  coverPattern: string;
  headingBand: boolean;
  tableHeaderFill: boolean;
  pageSize: string;
  pageOrientation: string;
  marginPreset: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  pageHeader: string;
  pageHeaderText: string;
  pageFooter: string;
  pageFooterText: string;
  toc: boolean;
  tocDepth: string;
  codeLineNumbers: boolean;
  codeWrap: boolean;
  codeFontSize: string;
  linkUnderline: boolean;
  linkThemeColor: boolean;
  watermark: string;
  watermarkText: string;
};

export const STYLE_OPTIONS = [
  { value: "blue", label: "縹（はなだ／青）" },
  { value: "sky", label: "空色（そらいろ／水色）" },
  { value: "indigo", label: "藍（あい／紺）" },
  { value: "celadon", label: "青磁（せいじ／青緑）" },
  { value: "forest", label: "常磐（ときわ／緑）" },
  { value: "yellow", label: "山吹（やまぶき／黄）" },
  { value: "default", label: "琥珀（こはく／黄茶）" },
  { value: "gold", label: "金色（こんじき／金）" },
  { value: "orange", label: "柑子（こうじ／オレンジ）" },
  { value: "sakura", label: "桜（さくら／ピンク）" },
  { value: "red", label: "朱（あけ／赤）" },
  { value: "wine", label: "蘇芳（すおう／赤紫）" },
  { value: "purple", label: "藤（ふじ／紫）" },
  { value: "brown", label: "焦茶（こげちゃ／茶）" },
  { value: "neutral", label: "銀鼠（ぎんねず／灰色）" },
  { value: "dark", label: "墨色（すみいろ／黒）" },
] as const;

export const RADIUS_OPTIONS = [
  { value: "none", label: "なし" },
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
] as const;

/**
 * 本文フォントプリセット。
 * - ja: 和文で優先されるファミリー名
 * - en: 欧文で優先されるファミリー名
 * - stack: 実際に CSS へ渡す font-family（設計どおりのフォールバック順）
 */
export const FONT_OPTIONS = [
  {
    value: "noto",
    ja: "Noto Sans JP",
    en: "Segoe UI",
    stack: '"Noto Sans JP", "Segoe UI", sans-serif',
    sampleJa: "あア漢字",
    sampleEn: "Abc 123",
  },
  {
    value: "gothic",
    ja: "游ゴシック / ヒラギノ角ゴ / Noto Sans JP",
    en: "Segoe UI",
    stack: '"Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif',
    sampleJa: "あア漢字",
    sampleEn: "Abc 123",
  },
  {
    value: "mincho",
    ja: "Noto Serif JP / 游明朝 / ヒラギノ明朝",
    en: "Noto Serif JP / 游明朝 / ヒラギノ明朝",
    stack: '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif',
    sampleJa: "あア漢字",
    sampleEn: "Abc 123",
  },
  {
    value: "sans",
    ja: "Noto Sans JP",
    en: "Segoe UI / system-ui",
    stack: '"Segoe UI", system-ui, "Noto Sans JP", sans-serif',
    sampleJa: "あア漢字",
    sampleEn: "AaBbCc",
  },
  {
    value: "serif",
    ja: "Noto Serif JP",
    en: "Georgia / Times New Roman",
    stack: 'Georgia, "Noto Serif JP", "Times New Roman", serif',
    sampleJa: "あア漢字",
    sampleEn: "AaBbCc",
  },
  {
    value: "inter",
    ja: "Noto Sans JP",
    en: "Inter",
    stack: 'Inter, "Noto Sans JP", "Segoe UI", sans-serif',
    sampleJa: "あア漢字",
    sampleEn: "Inter",
  },
  {
    value: "mono",
    ja: "IBM Plex Mono",
    en: "IBM Plex Mono",
    stack: '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
    sampleJa: "あア",
    sampleEn: "AaBb 0123",
  },
] as const;

/** コード（インライン／フェンス）用フォント。空の fontMono は cascadia 相当。 */
export const FONT_MONO_OPTIONS = [
  {
    value: "cascadia",
    label: "Cascadia / Consolas",
    en: "Cascadia Mono → Consolas → Courier New",
    stack: '"Cascadia Mono", Consolas, "Courier New", monospace',
    sample: "const x = 42;",
  },
  {
    value: "plex",
    label: "IBM Plex Mono",
    en: "IBM Plex Mono → Cascadia Mono → Consolas",
    stack: '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
    sample: "const x = 42;",
  },
  {
    value: "consolas",
    label: "Consolas",
    en: "Consolas → Courier New",
    stack: 'Consolas, "Courier New", monospace',
    sample: "const x = 42;",
  },
] as const;

export const DEFAULT_MONO_PRESET = "cascadia";

export function monoPresetFromStack(stack: string): string {
  const s = (stack || "").trim();
  if (!s) return DEFAULT_MONO_PRESET;
  for (const opt of FONT_MONO_OPTIONS) {
    if (opt.stack === s) return opt.value;
  }
  return "custom";
}

export function monoStackFromPreset(preset: string): string {
  const hit = FONT_MONO_OPTIONS.find((o) => o.value === preset);
  return hit ? hit.stack : FONT_MONO_OPTIONS[0].stack;
}

/** 用紙サイズ（縦向き mm）。PDF／プレビューと同じ定義。 */
export const PAGE_SIZE_MM: Record<string, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
  b5: { w: 176, h: 250 },
  letter: { w: 215.9, h: 279.4 },
};

export const PAGE_SIZE_OPTIONS = [
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "b5", label: "B5（JIS）" },
  { value: "letter", label: "Letter" },
] as const;

/** 設定に応じた用紙寸法（mm）。向きを反映する。 */
export function pageSizeMm(
  pageSize: string,
  pageOrientation: string
): { w: number; h: number } {
  const base = PAGE_SIZE_MM[pageSize] || PAGE_SIZE_MM.a4;
  if (pageOrientation === "landscape") {
    return { w: base.h, h: base.w };
  }
  return { w: base.w, h: base.h };
}

export const PAGE_ORIENTATION_OPTIONS = [
  { value: "portrait", label: "縦" },
  { value: "landscape", label: "横" },
] as const;

export const MARGIN_PRESET_OPTIONS = [
  { value: "narrow", label: "狭め（10mm）" },
  { value: "normal", label: "標準（14mm）" },
  { value: "wide", label: "広め（20mm）" },
  { value: "custom", label: "カスタム（mm）" },
] as const;

export const MARGIN_PRESET_MM: Record<
  string,
  { top: string; right: string; bottom: string; left: string }
> = {
  narrow: { top: "10", right: "10", bottom: "12", left: "10" },
  normal: { top: "14", right: "14", bottom: "16", left: "14" },
  wide: { top: "20", right: "20", bottom: "22", left: "20" },
};

export const PAGE_HEADER_OPTIONS = [
  { value: "none", label: "なし" },
  { value: "title", label: "文書名" },
  { value: "author", label: "著者" },
  { value: "date", label: "日付" },
  { value: "version", label: "版" },
  { value: "confidential", label: "社外秘" },
  { value: "custom", label: "カスタム" },
] as const;

export const PAGE_FOOTER_OPTIONS = [
  { value: "none", label: "なし" },
  { value: "page", label: "ページ番号" },
  { value: "title", label: "文書名" },
  { value: "title-page", label: "文書名＋ページ番号" },
  { value: "date", label: "日付" },
  { value: "author", label: "著者" },
  { value: "confidential", label: "社外秘" },
  { value: "custom", label: "カスタム" },
] as const;

export const TOC_DEPTH_OPTIONS = [
  { value: "2", label: "H2 まで" },
  { value: "3", label: "H3 まで" },
] as const;

export const WATERMARK_OPTIONS = [
  { value: "none", label: "なし" },
  { value: "draft", label: "DRAFT" },
  { value: "confidential", label: "社外秘" },
  { value: "custom", label: "カスタム" },
] as const;

/** 用途別の文字サイズ／行間／字間プリセット（設定キーへ展開） */
export const TYPE_PRESET_OPTIONS = [
  {
    value: "standard",
    label: "標準",
    fontSize: "10.5pt",
    lineHeight: "1.7",
    letterSpacing: "0",
  },
  {
    value: "report",
    label: "報告書",
    fontSize: "10.5pt",
    lineHeight: "1.85",
    letterSpacing: "0.01em",
  },
  {
    value: "slide",
    label: "スライド資料寄り",
    fontSize: "12pt",
    lineHeight: "1.45",
    letterSpacing: "0.02em",
  },
] as const;

export const COVER_PATTERN_OPTIONS = [
  { value: "noise", label: "霞（かすみ／ぼかし）" },
  { value: "grainy", label: "砂子（すなご／粒子）" },
  { value: "aurora", label: "極光（きょっこう／オーロラ）" },
  { value: "mesh", label: "彩雲（さいうん／メッシュ）" },
  { value: "solid", label: "無地（むじ／単色）" },
  { value: "diagonal", label: "斜影（しゃえい／斜め）" },
  { value: "horizontal", label: "横霞（よこがすみ／横ぼかし）" },
  { value: "vertical", label: "縦霞（たてがすみ／縦ぼかし）" },
  { value: "radial", label: "円暈（えんうん／放射）" },
  { value: "split", label: "二面（にめん／二分割）" },
  { value: "band", label: "帯（おび／帯飾り）" },
  { value: "corner", label: "隅取り（すみとり／コーナー）" },
  { value: "ribbon", label: "側帯（そくたい／リボン）" },
  { value: "panel", label: "脇板（わきいた／パネル）" },
  { value: "frame", label: "額縁（がくぶち／フレーム）" },
  { value: "glow", label: "中暈（ちゅううん／中心光）" },
  { value: "dusk", label: "黄昏（たそがれ／夕暮れ）" },
  { value: "mist", label: "薄霧（うすぎり／ミスト）" },
  { value: "horizon", label: "地平（ちへい／水平線）" },
  { value: "stripe", label: "縦縞（たてじま／ストライプ）" },
  { value: "dots", label: "点描（てんびょう／ドット）" },
  { value: "grid", label: "方眼（ほうがん／グリッド）" },
  { value: "chevron", label: "矢筈（やはず／シェブロン）" },
  { value: "diamond", label: "菱（ひし／ダイヤ）" },
  { value: "hex", label: "亀甲（きっこう／六角）" },
  { value: "triangle", label: "鱗（うろこ／三角）" },
  { value: "checker", label: "市松（いちまつ／チェッカー）" },
  { value: "herringbone", label: "杉綾（すぎあや／ヘリンボーン）" },
  { value: "isometric", label: "升目（ますめ／立体格子）" },
  { value: "lattice", label: "組子（くみこ／格子）" },
  { value: "mosaic", label: "寄木（よせぎ／モザイク）" },
  { value: "blades", label: "切子（きりこ／鋭角）" },
  { value: "sunburst", label: "日輪（にちりん／放射）" },
  { value: "spiral", label: "渦（うず／スパイラル）" },
  { value: "orbit", label: "周回（しゅうかい／軌道）" },
  { value: "circles", label: "同心円（どうしんえん／円環）" },
  { value: "wave", label: "波（なみ／ウェーブ）" },
  { value: "waves", label: "連波（れんぱ／多重波）" },
  { value: "ripples", label: "細波（さざなみ／さざ波）" },
  { value: "scallop", label: "波縁（なみぶち／スカラップ）" },
  { value: "mountains", label: "連山（れんざん／山並み）" },
  { value: "arcs", label: "円弧（えんこ／アーク）" },
  { value: "zigzag", label: "稲妻（いなずま／ジグザグ）" },
] as const;

const OHYNA_KEYS = new Set<string>([
  "cover",
  "title",
  "subtitle",
  "label",
  "meta",
  "author",
  "version",
  "date",
  "style",
  "lang",
  "rounded",
  "radius",
  "font",
  "fontFamily",
  "fontMono",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "coverGradient",
  "coverPattern",
  "headingBand",
  "tableHeaderFill",
  "pageSize",
  "pageOrientation",
  "marginPreset",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "pageHeader",
  "pageHeaderText",
  "pageFooter",
  "pageFooterText",
  "toc",
  "tocDepth",
  "codeLineNumbers",
  "codeWrap",
  "codeFontSize",
  "linkUnderline",
  "linkThemeColor",
  "watermark",
  "watermarkText",
  "design",
]);

const REJECTED_KEYS = new Set(["partLabel", "engine"]);

export const DEFAULT_SETTINGS: DocumentSettings = {
  cover: true,
  title: "",
  subtitle: "",
  label: "",
  meta: [],
  author: "",
  version: "",
  date: "",
  style: "blue",
  lang: "ja",
  rounded: true,
  radius: "md",
  font: "noto",
  fontFamily: "",
  fontMono: "",
  fontSize: "10.5pt",
  lineHeight: "1.7",
  letterSpacing: "0",
  coverGradient: true,
  coverPattern: "noise",
  headingBand: true,
  tableHeaderFill: true,
  pageSize: "a4",
  pageOrientation: "portrait",
  marginPreset: "normal",
  marginTop: "14",
  marginRight: "14",
  marginBottom: "16",
  marginLeft: "14",
  pageHeader: "none",
  pageHeaderText: "",
  pageFooter: "none",
  pageFooterText: "",
  toc: false,
  tocDepth: "3",
  codeLineNumbers: false,
  codeWrap: false,
  codeFontSize: "",
  linkUnderline: false,
  linkThemeColor: true,
  watermark: "none",
  watermarkText: "",
};

const STYLE_VALUES = new Set(STYLE_OPTIONS.map((o) => o.value));
const FONT_VALUES = new Set(FONT_OPTIONS.map((o) => o.value));
const RADIUS_VALUES = new Set(RADIUS_OPTIONS.map((o) => o.value));
const COVER_PATTERN_VALUES = new Set(COVER_PATTERN_OPTIONS.map((o) => o.value));
const PAGE_SIZE_VALUES = new Set(PAGE_SIZE_OPTIONS.map((o) => o.value));
const PAGE_ORIENTATION_VALUES = new Set(
  PAGE_ORIENTATION_OPTIONS.map((o) => o.value)
);
const MARGIN_PRESET_VALUES = new Set(MARGIN_PRESET_OPTIONS.map((o) => o.value));
const PAGE_HEADER_VALUES = new Set(PAGE_HEADER_OPTIONS.map((o) => o.value));
const PAGE_FOOTER_VALUES = new Set(PAGE_FOOTER_OPTIONS.map((o) => o.value));
const TOC_DEPTH_VALUES = new Set(TOC_DEPTH_OPTIONS.map((o) => o.value));
const WATERMARK_VALUES = new Set(WATERMARK_OPTIONS.map((o) => o.value));

/** 必須項目（適用時に必ず埋める） */
export const REQUIRED_SETTINGS = [
  { field: "title", label: "タイトル" },
  { field: "style", label: "色テーマ" },
  { field: "font", label: "本文フォント" },
  { field: "lang", label: "言語" },
] as const;

export type SettingsIssue = { field: string; message: string };

/** ohyna 名前空間ブロックがあるか */
export function frontmatterBlock(markdown: string): string {
  const src = String(markdown || "").replace(/^\uFEFF/, "");
  const m = src.match(/^---\r?\n[\s\S]*?\r?\n---/);
  return m ? m[0] : "";
}

export function hasOhynaFrontmatter(markdown: string): boolean {
  const root = parseFrontmatterRoot(markdown);
  const value = root[OHYNA_KEY];
  return !!(value && typeof value === "object" && !Array.isArray(value));
}

/** 解決済み設定の妥当性（必須・列挙値） */
export function validateDocumentSettings(
  settings: DocumentSettings
): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  if (!settings.title.trim()) {
    issues.push({ field: "title", message: "入力してください" });
  }
  if (!STYLE_VALUES.has(settings.style)) {
    issues.push({ field: "style", message: "選択してください" });
  }
  const fontOk =
    FONT_VALUES.has(settings.font) || settings.fontFamily.trim().length > 0;
  if (!fontOk) {
    issues.push({ field: "font", message: "選択してください" });
  }
  if (!settings.lang.trim()) {
    issues.push({ field: "lang", message: "入力してください" });
  }
  if (settings.rounded && !RADIUS_VALUES.has(settings.radius)) {
    issues.push({ field: "radius", message: "角丸サイズが不正です" });
  }
  if (!PAGE_SIZE_VALUES.has(settings.pageSize as (typeof PAGE_SIZE_OPTIONS)[number]["value"])) {
    issues.push({ field: "pageSize", message: "用紙サイズが不正です" });
  }
  if (
    !PAGE_ORIENTATION_VALUES.has(
      settings.pageOrientation as (typeof PAGE_ORIENTATION_OPTIONS)[number]["value"]
    )
  ) {
    issues.push({ field: "pageOrientation", message: "向きが不正です" });
  }
  if (
    !MARGIN_PRESET_VALUES.has(
      settings.marginPreset as (typeof MARGIN_PRESET_OPTIONS)[number]["value"]
    )
  ) {
    issues.push({ field: "marginPreset", message: "余白が不正です" });
  }
  if (
    !PAGE_HEADER_VALUES.has(
      settings.pageHeader as (typeof PAGE_HEADER_OPTIONS)[number]["value"]
    )
  ) {
    issues.push({ field: "pageHeader", message: "ヘッダが不正です" });
  }
  if (
    !PAGE_FOOTER_VALUES.has(
      settings.pageFooter as (typeof PAGE_FOOTER_OPTIONS)[number]["value"]
    )
  ) {
    issues.push({ field: "pageFooter", message: "フッタが不正です" });
  }
  if (!TOC_DEPTH_VALUES.has(settings.tocDepth as (typeof TOC_DEPTH_OPTIONS)[number]["value"])) {
    issues.push({ field: "tocDepth", message: "目次の深さが不正です" });
  }
  if (
    !WATERMARK_VALUES.has(
      settings.watermark as (typeof WATERMARK_OPTIONS)[number]["value"]
    )
  ) {
    issues.push({ field: "watermark", message: "透かしが不正です" });
  }
  if (settings.watermark === "custom" && !settings.watermarkText.trim()) {
    issues.push({ field: "watermarkText", message: "透かし文言を入力してください" });
  }
  return issues;
}

/**
 * 文書設定が完了しているか。
 * - ohyna front matter がある
 * - 必須項目（title / style / font / lang）が妥当
 */
export function hasDocumentSettings(markdown: string): boolean {
  if (!hasOhynaFrontmatter(markdown)) return false;
  return validateDocumentSettings(settingsFromMarkdown(markdown)).length === 0;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function asStr(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v);
}

function asMeta(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((x) => x.length > 0);
}

function stripLeadingComments(text: string): { comments: string; rest: string } {
  let src = String(text || "").replace(/^\uFEFF/, "");
  let comments = "";
  while (/^\s*<!--[\s\S]*?-->/.test(src)) {
    const m = src.match(/^(\s*<!--[\s\S]*?-->\s*)/);
    if (!m) break;
    comments += m[1];
    src = src.slice(m[1].length);
  }
  return { comments, rest: src };
}

/** 先頭 YAML front matter 全体（ルートオブジェクト）を返す */
export function parseFrontmatterRoot(text: string): Record<string, unknown> {
  const { rest } = stripLeadingComments(text);
  const m = rest.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return {};
  try {
    const data = yamlLoad(m[1]);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** 文書設定は ``ohyna:`` ブロックのみ（フラット不可） */
export function extractOhynaConfig(
  root: Record<string, unknown>
): Record<string, unknown> {
  for (const key of REJECTED_KEYS) {
    if (key in root) {
      throw new Error(`キー '${key}' は使えません`);
    }
  }
  const value = root[OHYNA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const cfg = { ...(value as Record<string, unknown>) };
  for (const key of REJECTED_KEYS) {
    if (key in cfg) {
      throw new Error(`キー '${OHYNA_KEY}.${key}' は使えません`);
    }
  }
  return cfg;
}

export function settingsFromMarkdown(markdown: string): DocumentSettings {
  let cfg: Record<string, unknown> = {};
  try {
    cfg = extractOhynaConfig(parseFrontmatterRoot(markdown));
  } catch {
    cfg = {};
  }
  const design =
    cfg.design && typeof cfg.design === "object"
      ? (cfg.design as Record<string, unknown>)
      : {};
  const pick = (key: keyof DocumentSettings, fallback: string) =>
    asStr(cfg[key] ?? design[key], fallback);

  const coverPatternRaw = asStr(
    cfg.coverPattern ?? design.coverPattern,
    DEFAULT_SETTINGS.coverPattern
  ).toLowerCase();
  const coverPattern = COVER_PATTERN_VALUES.has(
    coverPatternRaw as (typeof COVER_PATTERN_OPTIONS)[number]["value"]
  )
    ? coverPatternRaw
    : DEFAULT_SETTINGS.coverPattern;

  const styleRaw = (
    pick("style", DEFAULT_SETTINGS.style) || DEFAULT_SETTINGS.style
  )
    .trim()
    .toLowerCase();
  const fontRaw = (
    pick("font", DEFAULT_SETTINGS.font) || DEFAULT_SETTINGS.font
  )
    .trim()
    .toLowerCase();
  const radiusRaw = (
    pick("radius", DEFAULT_SETTINGS.radius) || DEFAULT_SETTINGS.radius
  )
    .trim()
    .toLowerCase();

  const enumOr = (
    raw: string,
    allowed: Set<string>,
    fallback: string
  ): string => {
    const v = raw.trim().toLowerCase();
    return allowed.has(v) ? v : fallback;
  };

  const marginPreset = enumOr(
    pick("marginPreset", DEFAULT_SETTINGS.marginPreset),
    MARGIN_PRESET_VALUES as Set<string>,
    DEFAULT_SETTINGS.marginPreset
  );
  const presetMm = MARGIN_PRESET_MM[marginPreset];

  return {
    cover: asBool(cfg.cover, DEFAULT_SETTINGS.cover),
    title: asStr(cfg.title),
    subtitle: asStr(cfg.subtitle),
    label: asStr(cfg.label),
    meta: asMeta(cfg.meta),
    author: pick("author", ""),
    version: pick("version", ""),
    date: pick("date", ""),
    style: styleRaw || DEFAULT_SETTINGS.style,
    lang: pick("lang", DEFAULT_SETTINGS.lang) || DEFAULT_SETTINGS.lang,
    rounded: asBool(cfg.rounded ?? design.rounded, DEFAULT_SETTINGS.rounded),
    radius: radiusRaw || DEFAULT_SETTINGS.radius,
    font: fontRaw || DEFAULT_SETTINGS.font,
    fontFamily: pick("fontFamily", ""),
    fontMono: pick("fontMono", ""),
    fontSize: pick("fontSize", DEFAULT_SETTINGS.fontSize),
    lineHeight: pick("lineHeight", DEFAULT_SETTINGS.lineHeight),
    letterSpacing: pick("letterSpacing", DEFAULT_SETTINGS.letterSpacing),
    coverGradient: asBool(
      cfg.coverGradient ?? design.coverGradient,
      DEFAULT_SETTINGS.coverGradient
    ),
    coverPattern,
    headingBand: asBool(
      cfg.headingBand ?? design.headingBand,
      DEFAULT_SETTINGS.headingBand
    ),
    tableHeaderFill: asBool(
      cfg.tableHeaderFill ?? design.tableHeaderFill,
      DEFAULT_SETTINGS.tableHeaderFill
    ),
    pageSize: enumOr(
      pick("pageSize", DEFAULT_SETTINGS.pageSize),
      PAGE_SIZE_VALUES as Set<string>,
      DEFAULT_SETTINGS.pageSize
    ),
    pageOrientation: enumOr(
      pick("pageOrientation", DEFAULT_SETTINGS.pageOrientation),
      PAGE_ORIENTATION_VALUES as Set<string>,
      DEFAULT_SETTINGS.pageOrientation
    ),
    marginPreset,
    marginTop: presetMm
      ? presetMm.top
      : pick("marginTop", DEFAULT_SETTINGS.marginTop).replace(/mm$/i, "") ||
        DEFAULT_SETTINGS.marginTop,
    marginRight: presetMm
      ? presetMm.right
      : pick("marginRight", DEFAULT_SETTINGS.marginRight).replace(/mm$/i, "") ||
        DEFAULT_SETTINGS.marginRight,
    marginBottom: presetMm
      ? presetMm.bottom
      : pick("marginBottom", DEFAULT_SETTINGS.marginBottom).replace(
          /mm$/i,
          ""
        ) || DEFAULT_SETTINGS.marginBottom,
    marginLeft: presetMm
      ? presetMm.left
      : pick("marginLeft", DEFAULT_SETTINGS.marginLeft).replace(/mm$/i, "") ||
        DEFAULT_SETTINGS.marginLeft,
    pageHeader: enumOr(
      pick("pageHeader", DEFAULT_SETTINGS.pageHeader),
      PAGE_HEADER_VALUES as Set<string>,
      DEFAULT_SETTINGS.pageHeader
    ),
    pageHeaderText: pick("pageHeaderText", ""),
    pageFooter: enumOr(
      pick("pageFooter", DEFAULT_SETTINGS.pageFooter),
      PAGE_FOOTER_VALUES as Set<string>,
      DEFAULT_SETTINGS.pageFooter
    ),
    pageFooterText: pick("pageFooterText", ""),
    toc: asBool(cfg.toc ?? design.toc, DEFAULT_SETTINGS.toc),
    tocDepth: enumOr(
      pick("tocDepth", DEFAULT_SETTINGS.tocDepth),
      TOC_DEPTH_VALUES as Set<string>,
      DEFAULT_SETTINGS.tocDepth
    ),
    codeLineNumbers: asBool(
      cfg.codeLineNumbers ?? design.codeLineNumbers,
      DEFAULT_SETTINGS.codeLineNumbers
    ),
    codeWrap: asBool(
      cfg.codeWrap ?? design.codeWrap,
      DEFAULT_SETTINGS.codeWrap
    ),
    codeFontSize: pick("codeFontSize", ""),
    linkUnderline: asBool(
      cfg.linkUnderline ?? design.linkUnderline,
      DEFAULT_SETTINGS.linkUnderline
    ),
    linkThemeColor: asBool(
      cfg.linkThemeColor ?? design.linkThemeColor,
      DEFAULT_SETTINGS.linkThemeColor
    ),
    watermark: enumOr(
      pick("watermark", DEFAULT_SETTINGS.watermark),
      WATERMARK_VALUES as Set<string>,
      DEFAULT_SETTINGS.watermark
    ),
    watermarkText: pick("watermarkText", ""),
  };
}

function settingsToOhynaObject(settings: DocumentSettings): Record<string, unknown> {
  // 欠落キーを既定で埋め、title 以外が落ちないようにする
  const merged: DocumentSettings = { ...DEFAULT_SETTINGS, ...settings };
  const out: Record<string, unknown> = {};
  const order: (keyof DocumentSettings)[] = [
    "cover",
    "title",
    "subtitle",
    "label",
    "meta",
    "author",
    "version",
    "date",
    "style",
    "lang",
    "rounded",
    "radius",
    "font",
    "fontFamily",
    "fontMono",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "coverPattern",
    "coverGradient",
    "headingBand",
    "tableHeaderFill",
    "pageSize",
    "pageOrientation",
    "marginPreset",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "pageHeader",
    "pageHeaderText",
    "pageFooter",
    "pageFooterText",
    "toc",
    "tocDepth",
    "codeLineNumbers",
    "codeWrap",
    "codeFontSize",
    "linkUnderline",
    "linkThemeColor",
    "watermark",
    "watermarkText",
  ];

  const skipIfDefault = new Set<keyof DocumentSettings>([
    "author",
    "version",
    "date",
    "letterSpacing",
    "pageSize",
    "pageOrientation",
    "marginPreset",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "pageHeader",
    "pageHeaderText",
    "pageFooter",
    "pageFooterText",
    "toc",
    "tocDepth",
    "codeLineNumbers",
    "codeWrap",
    "codeFontSize",
    "linkUnderline",
    "linkThemeColor",
    "watermark",
    "watermarkText",
  ]);

  for (const key of order) {
    const value = merged[key];
    if (key === "meta") {
      const list = merged.meta.filter((x) => x.trim().length > 0);
      if (list.length > 0) out.meta = list;
      continue;
    }
    if (typeof value === "string" && value.trim() === "" && key !== "title") {
      continue;
    }
    if (skipIfDefault.has(key) && value === DEFAULT_SETTINGS[key]) {
      continue;
    }
    // 余白 mm は custom のときだけ書く
    if (
      (key === "marginTop" ||
        key === "marginRight" ||
        key === "marginBottom" ||
        key === "marginLeft") &&
      merged.marginPreset !== "custom"
    ) {
      continue;
    }
    if (key === "pageHeaderText" && merged.pageHeader !== "custom") continue;
    if (key === "pageFooterText" && merged.pageFooter !== "custom") continue;
    if (key === "watermarkText" && merged.watermark !== "custom") continue;
    if (key === "tocDepth") {
      out.tocDepth = Number(merged.tocDepth) || 3;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function splitMarkdown(text: string): {
  body: string;
  root: Record<string, unknown>;
} {
  const { rest } = stripLeadingComments(text);
  const fm = rest.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!fm) {
    return { body: rest.replace(/^\s+/, ""), root: {} };
  }
  let root: Record<string, unknown> = {};
  try {
    const data = yamlLoad(fm[1]);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      root = data as Record<string, unknown>;
    }
  } catch {
    root = {};
  }
  return {
    body: rest.slice(fm[0].length).replace(/^\s+/, ""),
    root,
  };
}

/** 設定を ``ohyna:`` 配下に書き戻した Markdown を返す */
export function applySettingsToMarkdown(
  markdown: string,
  settings: DocumentSettings
): string {
  const { body, root } = splitMarkdown(markdown);
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(root)) {
    if (key === OHYNA_KEY) continue;
    if (OHYNA_KEYS.has(key) || REJECTED_KEYS.has(key)) continue;
    next[key] = value;
  }

  next[OHYNA_KEY] = settingsToOhynaObject(settings);

  const dumped = yamlDump(next, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).replace(/\s+$/, "");

  const fm = `---\n${dumped}\n---\n`;
  const cleanedBody = body.replace(/^\s+/, "");
  return cleanedBody ? `${fm}\n${cleanedBody}` : fm;
}
