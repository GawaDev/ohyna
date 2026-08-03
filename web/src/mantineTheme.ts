import { createTheme } from "@mantine/core";
import {
  APP_COLOR_NAME,
  OHYNA_COLOR_TUPLE,
} from "./brandColors";

export const appTheme = createTheme({
  primaryColor: APP_COLOR_NAME,
  primaryShade: { light: 6, dark: 5 },
  colors: {
    [APP_COLOR_NAME]: OHYNA_COLOR_TUPLE,
    // 旧 UI の color="blue" / --mantine-color-blue-* をブランドへ寄せる。
    // 文書キー style: "blue"（縹）は themePalette 側の固定色で、こことは別。
    blue: OHYNA_COLOR_TUPLE,
  },
  fontFamily: '"Noto Sans JP", "Segoe UI", sans-serif',
  defaultRadius: "sm",
});
