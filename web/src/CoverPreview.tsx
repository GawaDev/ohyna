import { useEffect, useState, type CSSProperties } from "react";
import { Box, Text } from "@mantine/core";
import {
  COVER_PATTERN_OPTIONS,
  STYLE_OPTIONS,
  pageSizeMm,
  type DocumentSettings,
} from "./frontmatter";
import {
  coverImageUrl,
  themeColors,
  type ThemeColors,
} from "./themePalette";

type Props = {
  settings: DocumentSettings;
  /** /styles から取得した themes。無ければ内蔵パレット */
  themes?: Record<string, ThemeColors>;
};

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string
): string {
  return options.find((o) => o.value === value)?.label || value;
}

/** 表紙の構成プレビュー（実 PDF と同じ要素順・役割ラベル付き） */
export function CoverPreview({ settings, themes }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const style = settings.style || "blue";
  const pattern = settings.coverPattern || "noise";
  const colors = themeColors(style, themes);
  const imgSrc = coverImageUrl(style, pattern);
  const styleLabel = optionLabel(STYLE_OPTIONS, style);
  const patternLabel = optionLabel(COVER_PATTERN_OPTIONS, pattern);

  useEffect(() => {
    setImgOk(true);
    const probe = new Image();
    probe.onload = () => setImgOk(true);
    probe.onerror = () => setImgOk(false);
    probe.src = imgSrc;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [imgSrc]);

  if (!settings.cover) {
    return (
      <Box className="ohyna-cover-preview ohyna-cover-preview--off">
        <Text size="sm" c="dimmed" ta="center">
          表紙なし（本文から開始）
        </Text>
      </Box>
    );
  }

  const title = settings.title.trim() || "（タイトル）";
  const subtitle = settings.subtitle.trim();
  const label = settings.label.trim();
  const meta = settings.meta.filter((m) => m.trim());
  const page = pageSizeMm(settings.pageSize, settings.pageOrientation);

  return (
    <Box className="ohyna-cover-preview-wrap">
      <Text size="xs" c="dimmed" mb={6}>
        表紙プレビュー（{settings.pageSize.toUpperCase()}{" "}
        {settings.pageOrientation === "landscape" ? "横" : "縦"}）
      </Text>
      <Box
        className="ohyna-cover-preview"
        style={
          {
            "--ohyna-cover-fg": colors.coverFg,
            "--ohyna-cover-bg": colors.cover2,
            "--ohyna-cover-aspect": `${page.w} / ${page.h}`,
          } as CSSProperties
        }
      >
        {imgOk ? (
          <img
            key={imgSrc}
            className="ohyna-cover-preview-bg"
            src={imgSrc}
            alt=""
            aria-hidden
            onError={() => setImgOk(false)}
          />
        ) : (
          <Box
            className="ohyna-cover-preview-bg ohyna-cover-preview-bg--solid"
            style={{
              background: `linear-gradient(145deg, ${colors.cover1}, ${colors.cover2} 55%, ${colors.cover3})`,
            }}
          />
        )}

        <Box className="ohyna-cover-preview-body">
          {label ? (
            <Box className="ohyna-cover-slot">
              <span className="ohyna-cover-slot-tag">ラベル</span>
              <div className="ohyna-cover-part-label">{label}</div>
            </Box>
          ) : (
            <Box className="ohyna-cover-slot ohyna-cover-slot--empty">
              <span className="ohyna-cover-slot-tag">ラベル</span>
              <Text size="xs" c="rgba(255,255,255,0.55)">
                未設定
              </Text>
            </Box>
          )}

          <Box className="ohyna-cover-slot">
            <span className="ohyna-cover-slot-tag">タイトル</span>
            <h1 className="ohyna-cover-title">{title}</h1>
          </Box>

          {subtitle ? (
            <Box className="ohyna-cover-slot">
              <span className="ohyna-cover-slot-tag">サブタイトル</span>
              <p className="ohyna-cover-subtitle">{subtitle}</p>
            </Box>
          ) : (
            <Box className="ohyna-cover-slot ohyna-cover-slot--empty">
              <span className="ohyna-cover-slot-tag">サブタイトル</span>
              <Text size="xs" c="rgba(255,255,255,0.55)">
                未設定
              </Text>
            </Box>
          )}

          <Box className="ohyna-cover-slot ohyna-cover-slot--meta">
            <span className="ohyna-cover-slot-tag">フッタ</span>
            {meta.length > 0 ? (
              <div className="ohyna-cover-meta">
                {meta.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : (
              <Text size="xs" c="rgba(255,255,255,0.55)">
                未設定
              </Text>
            )}
          </Box>
        </Box>
      </Box>
      <Box className="ohyna-cover-caption" mt={8}>
        <Text size="xs">色テーマ：{styleLabel}</Text>
        <Text size="xs">表紙デザイン：{patternLabel}</Text>
      </Box>
    </Box>
  );
}
