/**
 * PWA（Service Worker）の登録のみ行う。
 *
 * vite-plugin-pwa の autoUpdate は更新検知で location.reload() するため、
 * ここでは onNeedReload を空にして自動再読み込みを止める。
 * 新版のアセットは、ユーザが次にタブを開き直したときに使われる。
 * キャッシュ制御をユーザへ通知しない。
 */
import { registerSW } from "virtual:pwa-register";

export function initPwaUpdate(): void {
  registerSW({
    immediate: true,
    onNeedReload() {
      /* 自動リロードしない */
    },
  });
}
