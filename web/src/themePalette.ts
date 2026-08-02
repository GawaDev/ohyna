/** 色テーマの表紙色（サーバ /styles.themes が無いときのフォールバック） */
export type ThemeColors = {
  cover1: string;
  cover2: string;
  cover3: string;
  coverFg: string;
};

export const THEME_PALETTE: Record<string, ThemeColors> = {
  blue: {
    cover1: "#0d4073",
    cover2: "#1976d2",
    cover3: "#87b7e7",
    coverFg: "#ffffff",
  },
  sky: {
    cover1: "#014a72",
    cover2: "#0288d1",
    cover3: "#7bc1e7",
    coverFg: "#ffffff",
  },
  indigo: {
    cover1: "#1f285e",
    cover2: "#3949ab",
    cover3: "#98a0d3",
    coverFg: "#ffffff",
  },
  celadon: {
    cover1: "#004b43",
    cover2: "#00897b",
    cover3: "#7ac1ba",
    coverFg: "#ffffff",
  },
  forest: {
    cover1: "#19441b",
    cover2: "#2e7d32",
    cover3: "#92bb94",
    coverFg: "#ffffff",
  },
  yellow: {
    cover1: "#8a6918",
    cover2: "#fbc02d",
    cover3: "#fcde91",
    coverFg: "#ffffff",
  },
  default: {
    cover1: "#74580c",
    cover2: "#d4a017",
    cover3: "#e8cd86",
    coverFg: "#ffffff",
  },
  gold: {
    cover1: "#6e5915",
    cover2: "#c9a227",
    cover3: "#e2ce8e",
    coverFg: "#ffffff",
  },
  orange: {
    cover1: "#833b00",
    cover2: "#ef6c00",
    cover3: "#f6b27a",
    coverFg: "#ffffff",
  },
  sakura: {
    cover1: "#760e34",
    cover2: "#d81b60",
    cover3: "#ea88ac",
    coverFg: "#ffffff",
  },
  red: {
    cover1: "#6c1616",
    cover2: "#c62828",
    cover3: "#e18f8f",
    coverFg: "#ffffff",
  },
  wine: {
    cover1: "#5f0b2f",
    cover2: "#ad1457",
    cover3: "#d484a7",
    coverFg: "#ffffff",
  },
  purple: {
    cover1: "#4e135d",
    cover2: "#8e24aa",
    cover3: "#c48dd2",
    coverFg: "#ffffff",
  },
  brown: {
    cover1: "#3b2923",
    cover2: "#6d4c41",
    cover3: "#b3a19c",
    coverFg: "#ffffff",
  },
  neutral: {
    cover1: "#353535",
    cover2: "#616161",
    cover3: "#acacac",
    coverFg: "#ffffff",
  },
  dark: {
    cover1: "#0a1018",
    cover2: "#1b2836",
    cover3: "#5a738c",
    coverFg: "#ffffff",
  },
};

export function themeColors(
  style: string,
  override?: Record<string, ThemeColors>
): ThemeColors {
  return override?.[style] || THEME_PALETTE[style] || THEME_PALETTE.blue;
}

export function coverImageUrl(style: string, pattern: string): string {
  return `/covers/${encodeURIComponent(style)}/${encodeURIComponent(pattern)}.webp`;
}
