/** 製品識別子（Vite 設定・GUI 双方から参照。import.meta に依存しない） */

export const APP_NAME = "Ohyna";

export const APP_NAME_FULL = "Ohyna（Open Hybrid Note App／おひな）";

export const APP_DESCRIPTION =
  "Markdown を編集・検査・プレビューし、印刷向け PDF を作成するアプリケーション。";

/** ブラウザタブ・OGP 用の短いタイトル */
export const APP_TITLE = "Ohyna — Markdown から印刷向け PDF";

export const APP_THEME_COLOR = "#0b6bcb";

export const APP_BACKGROUND_COLOR = "#ffffff";

export const APP_LOCALE = "ja_JP";

/** Web App Manifest の安定 ID */
export const APP_MANIFEST_ID = "/gui/";

export const APP_START_URL = "/gui/";

export const APP_SCOPE = "/gui/";

/** OGP / canonical。配信時にサーバが実オリジンへ置換するプレースホルダ */
export const APP_ORIGIN_PLACEHOLDER = "__OHYNA_ORIGIN__";

/** ソースリポジトリ（GitHub） */
export const APP_REPO_URL = "https://github.com/GawaDev/ohyna";

/** 公開デモのオリジン */
export const APP_DEMO_ORIGIN = "https://ohyna.onrender.com";

export const APP_DEMO_GUI_URL = `${APP_DEMO_ORIGIN}/gui/`;

export const APP_SECURITY_ADVISORY_URL = `${APP_REPO_URL}/security/advisories/new`;

export const APP_ISSUES_URL = `${APP_REPO_URL}/issues`;
