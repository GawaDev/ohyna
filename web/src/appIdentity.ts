/** 製品識別子（Vite 設定・GUI 双方から参照。import.meta / define に依存しない） */

export const APP_NAME = "Ohyna";

export const APP_NAME_FULL = "Ohyna（Open Hybrid Note App）";

/** meta description / PWA / OGP 共通の短い説明 */
export const APP_DESCRIPTION =
  "Markdown を編集してプレビューし、PDF を保存するツール。";

/** ブラウザタブ・OGP タイトル */
export const APP_TITLE = "Ohyna";

/** OGP 画像フッターなど、さらに短い一言 */
export const APP_TAGLINE = "Markdown を編集して、PDF にする";

/** ブラウザ／PWA の theme-color（ひよこ本体） */
export const APP_THEME_COLOR = "#FFB903";

/** UI プライマリ（ひよこくちばし） */
export const APP_PRIMARY_COLOR = "#FF8E01";

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
