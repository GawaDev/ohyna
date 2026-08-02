/** OS に応じた修飾キー表示（実装の Mod = Ctrl / ⌘ に対応） */

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  if (uaData?.platform) {
    return /mac|iphone|ipad|ipod/i.test(uaData.platform);
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/** 主修飾キー（Windows: Ctrl、macOS: ⌘） */
export function modKeyLabel(): string {
  return isApplePlatform() ? "⌘" : "Ctrl";
}

/** Alt / Option */
export function altKeyLabel(): string {
  return isApplePlatform() ? "⌥" : "Alt";
}

/**
 * ショートカット表示。先頭に主修飾キーを付ける。
 * 例: chord("B") → "Ctrl+B" / "⌘+B"
 *     chord("Shift", "X") → "Ctrl+Shift+X" / "⌘+Shift+X"
 *     chord("Alt", "1") → "Ctrl+Alt+1" / "⌘+⌥+1"
 */
export function chord(...parts: string[]): string {
  const mapped = parts.map((p) => {
    if (p === "Alt" || p === "Option") return altKeyLabel();
    return p;
  });
  return [modKeyLabel(), ...mapped].join("+");
}

/** ホイール拡大用の短い説明 */
export function modScrollLabel(): string {
  return `${modKeyLabel()}+スクロール`;
}
