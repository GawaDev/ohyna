export {
  APP_BACKGROUND_COLOR,
  APP_DESCRIPTION,
  APP_MANIFEST_ID,
  APP_NAME,
  APP_NAME_FULL,
  APP_SCOPE,
  APP_START_URL,
  APP_THEME_COLOR,
} from "./appIdentity";

export { APP_VERSION } from "./appVersion";

/** 静的アセット（Vite base `/gui/` 配下） */
export const APP_MARK_SRC = `${import.meta.env.BASE_URL}ohyna-mark.svg`;
export const APP_ICON_192 = `${import.meta.env.BASE_URL}pwa-192.png`;
