/**
 * アプリ UI（chrome）のブランド色正本。
 * 文書の色テーマ（themePalette の blue＝縹 など）とは別系統。
 */
import type { MantineColorsTuple } from "@mantine/core";
import {
  APP_BACKGROUND_COLOR,
  APP_PRIMARY_COLOR,
  APP_THEME_COLOR,
} from "./appIdentity";

export {
  APP_BACKGROUND_COLOR,
  APP_PRIMARY_COLOR,
  APP_THEME_COLOR,
};

/** Mantine `primaryColor` / CSS `--mantine-color-ohyna-*` の名前 */
export const APP_COLOR_NAME = "ohyna" as const;

/**
 * 黄〜橙の 10 階調（0=最淡 … 9=最濃）。
 * shade 4 = THEME、shade 6 = PRIMARY（`primaryShade.light`）。
 * `primaryShade.dark` は shade 5（THEME と PRIMARY の中間）。
 */
export const OHYNA_COLORS = [
  "#FFF9E8",
  "#FFF0C2",
  "#FFE08A",
  "#FFD054",
  APP_THEME_COLOR,
  "#FFA601",
  APP_PRIMARY_COLOR,
  "#E67A00",
  "#C96800",
  "#8F4800",
] as const;

export type OhynaShade = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const OHYNA_COLOR_TUPLE = [...OHYNA_COLORS] as unknown as MantineColorsTuple;

/** `#RRGGBB` → `rgba(r,g,b,a)`（エディタ選択ハイライトなど） */
export function hexRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ohynaHex(shade: OhynaShade): string {
  return OHYNA_COLORS[shade];
}
