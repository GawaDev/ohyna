import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Alert,
  Button,
  CheckIcon,
  Fieldset,
  Group,
  Input,
  Modal,
  Select,
  type SelectProps,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconBook2,
  IconCode,
  IconLanguage,
  IconPalette,
  IconPrinter,
  IconSettings,
  IconTypography,
} from "@tabler/icons-react";
import { CoverPreview } from "./CoverPreview";
import {
  COVER_PATTERN_OPTIONS,
  FONT_MONO_OPTIONS,
  FONT_OPTIONS,
  MARGIN_PRESET_MM,
  MARGIN_PRESET_OPTIONS,
  PAGE_FOOTER_OPTIONS,
  PAGE_HEADER_OPTIONS,
  PAGE_ORIENTATION_OPTIONS,
  PAGE_SIZE_OPTIONS,
  pageSizeMm,
  RADIUS_OPTIONS,
  STYLE_OPTIONS,
  TOC_DEPTH_OPTIONS,
  TYPE_PRESET_OPTIONS,
  WATERMARK_OPTIONS,
  type DocumentSettings,
  REQUIRED_SETTINGS,
  monoPresetFromStack,
  monoStackFromPreset,
  settingsFromMarkdown,
  validateDocumentSettings,
} from "./frontmatter";
import {
  coverImageUrl,
  themeColors,
  type ThemeColors,
} from "./themePalette";

function ColorSwatch({
  colors,
  size = 22,
}: {
  colors: ThemeColors;
  size?: number;
}) {
  return (
    <span
      className="ohyna-color-swatch"
      style={
        {
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${colors.cover1} 0%, ${colors.cover2} 48%, ${colors.cover3} 100%)`,
        } as CSSProperties
      }
      aria-hidden
    />
  );
}

type Props = {
  opened: boolean;
  markdown: string;
  onClose: () => void;
  onApply: (settings: DocumentSettings) => void;
};

const LANG_OPTIONS = [
  { value: "ja", label: "日本語（ja）" },
  { value: "en", label: "English（en）" },
  { value: "zh", label: "中文（zh）" },
  { value: "ko", label: "한국어（ko）" },
];

const DEFAULT_MONO_UI = "cascadia";

function BodyFontPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input.Wrapper label="本文フォント" required withAsterisk error={error}>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mt={8}>
        {FONT_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <UnstyledButton
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              aria-label={`和文 ${opt.ja}、欧文 ${opt.en}`}
              className={
                active
                  ? "ohyna-font-option ohyna-font-option--active"
                  : "ohyna-font-option"
              }
            >
              {active ? (
                <span className="ohyna-font-option-check" aria-hidden>
                  <CheckIcon size={12} />
                </span>
              ) : null}
              <div className="ohyna-font-option-meta">
                {opt.ja === opt.en ? (
                  <span>{opt.ja}</span>
                ) : (
                  <>
                    <span>和文 {opt.ja}</span>
                    <span>欧文 {opt.en}</span>
                  </>
                )}
              </div>
              <div
                className="ohyna-font-option-sample"
                style={{ fontFamily: opt.stack }}
              >
                <span className="ohyna-font-option-sample-ja">{opt.sampleJa}</span>
                <span className="ohyna-font-option-sample-en">{opt.sampleEn}</span>
              </div>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Input.Wrapper>
  );
}

function MonoFontPicker({
  preset,
  customStack,
  onPresetChange,
  onCustomChange,
}: {
  preset: string;
  customStack: string;
  onPresetChange: (preset: string) => void;
  onCustomChange: (stack: string) => void;
}) {
  return (
    <Stack gap="sm">
      <Input.Wrapper label="コードフォント">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mt={8}>
          {FONT_MONO_OPTIONS.map((opt) => {
            const active = preset === opt.value;
            return (
              <UnstyledButton
                key={opt.value}
                type="button"
                onClick={() => onPresetChange(opt.value)}
                aria-pressed={active}
                className={
                  active
                    ? "ohyna-font-option ohyna-font-option--mono ohyna-font-option--active"
                    : "ohyna-font-option ohyna-font-option--mono"
                }
              >
                <div className="ohyna-font-option-top">
                  <Text className="ohyna-font-option-name">{opt.label}</Text>
                  {active ? (
                    <span className="ohyna-font-option-check" aria-hidden>
                      <CheckIcon size={12} />
                    </span>
                  ) : null}
                </div>
                <div
                  className="ohyna-font-option-sample ohyna-font-option-sample--code"
                  style={{ fontFamily: opt.stack }}
                >
                  {opt.sample}
                </div>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      </Input.Wrapper>
      <TextInput
        label="カスタム"
        description="入力すると上の選択より優先。空欄でプリセットに戻ります。"
        value={preset === "custom" ? customStack : ""}
        placeholder='"IBM Plex Mono", monospace'
        onChange={(e) => onCustomChange(e.currentTarget.value)}
        styles={{
          input: {
            fontFamily:
              (preset === "custom" && customStack.trim()) ||
              monoStackFromPreset(preset === "custom" ? "cascadia" : preset),
          },
        }}
      />
    </Stack>
  );
}

export function SettingsModal({
  opened,
  markdown,
  onClose,
  onApply,
}: Props) {
  const isNarrow = useMediaQuery("(max-width: 768px)");
  const [draft, setDraft] = useState<DocumentSettings>(() =>
    settingsFromMarkdown(markdown)
  );
  const [themes, setThemes] = useState<Record<string, ThemeColors>>({});
  const [monoPreset, setMonoPreset] = useState(DEFAULT_MONO_UI);

  // 開いたときだけ下書きを作る（適用直後の markdown 更新で入力中の値を潰さない）
  useEffect(() => {
    if (!opened) return;
    const next = settingsFromMarkdown(markdown);
    setDraft(next);
    setMonoPreset(monoPresetFromStack(next.fontMono));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate on open only
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    fetch("/styles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.themes) return;
        setThemes(data.themes as Record<string, ThemeColors>);
      })
      .catch(() => {
        /* オフライン時は CoverPreview 内フォールバック */
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const issues = useMemo(() => validateDocumentSettings(draft), [draft]);
  const canApply = issues.length === 0;
  const fieldError = (field: string) =>
    issues.find((i) => i.field === field)?.message;

  const set = <K extends keyof DocumentSettings>(
    key: K,
    value: DocumentSettings[K]
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const applyMonoPreset = (preset: string) => {
    setMonoPreset(preset);
    if (preset === "custom") return;
    set("fontMono", preset === "cascadia" ? "" : monoStackFromPreset(preset));
  };

  const applyMonoCustom = (stack: string) => {
    if (!stack.trim()) {
      setMonoPreset("cascadia");
      set("fontMono", "");
      return;
    }
    setMonoPreset("custom");
    set("fontMono", stack);
  };

  const renderStyleOption: SelectProps["renderOption"] = ({
    option,
    checked,
  }) => (
    <Group flex="1" gap="sm" wrap="nowrap">
      <ColorSwatch colors={themeColors(option.value, themes)} size={20} />
      <Text size="sm" style={{ flex: 1 }}>
        {option.label}
      </Text>
      {checked ? (
        <CheckIcon size={14} color="var(--mantine-color-blue-6)" />
      ) : null}
    </Group>
  );

  const coverStyle = draft.style || "blue";
  const renderCoverOption: SelectProps["renderOption"] = ({
    option,
    checked,
  }) => (
    <Group flex="1" gap="sm" wrap="nowrap">
      <img
        className="ohyna-cover-thumb ohyna-cover-thumb--lg"
        src={coverImageUrl(coverStyle, option.value)}
        alt=""
        aria-hidden
      />
      <Text size="sm" style={{ flex: 1 }}>
        {option.label}
      </Text>
      {checked ? (
        <CheckIcon size={14} color="var(--mantine-color-blue-6)" />
      ) : null}
    </Group>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8} wrap="nowrap">
          <IconSettings size={18} stroke={1.5} aria-hidden />
          <span>ドキュメント設定</span>
        </Group>
      }
      size="xl"
      fullScreen={!!isNarrow}
      centered={!isNarrow}
      withCloseButton={!!isNarrow}
      closeButtonProps={
        isNarrow ? { "aria-label": "閉じる" } : undefined
      }
      closeOnClickOutside
      closeOnEscape
      overlayProps={{ backgroundOpacity: 0.45 }}
      classNames={{
        content: isNarrow ? "ohyna-settings-modal-content--full" : undefined,
        body: "ohyna-settings-modal-body",
      }}
    >
      {!canApply && (
        <Alert color="orange" mb="md" title="未入力の項目があります">
          {issues
            .map((i) => {
              const label =
                REQUIRED_SETTINGS.find((r) => r.field === i.field)?.label ||
                i.field;
              return label;
            })
            .join(" / ")}
        </Alert>
      )}

      <Tabs defaultValue="general" className="ohyna-settings-tabs">
        <Tabs.List>
          <Tabs.Tab
            value="general"
            leftSection={<IconPalette size={14} stroke={1.5} />}
          >
            色・言語
          </Tabs.Tab>
          <Tabs.Tab
            value="cover"
            leftSection={<IconBook2 size={14} stroke={1.5} />}
          >
            表紙
          </Tabs.Tab>
          <Tabs.Tab
            value="type"
            leftSection={<IconTypography size={14} stroke={1.5} />}
          >
            フォント・体裁
          </Tabs.Tab>
          <Tabs.Tab
            value="page"
            leftSection={<IconPrinter size={14} stroke={1.5} />}
          >
            用紙・余白
          </Tabs.Tab>
          <Tabs.Tab
            value="output"
            leftSection={<IconCode size={14} stroke={1.5} />}
          >
            ページ・コード
          </Tabs.Tab>
        </Tabs.List>

        <div className="ohyna-settings-tab-body">
        <Tabs.Panel value="general" pt="md">
          <Stack gap="md">
            <Fieldset legend="色" variant="filled" radius="md">
              <Select
                label="色テーマ"
                required
                withAsterisk
                searchable
                error={fieldError("style")}
                data={[...STYLE_OPTIONS]}
                value={draft.style}
                onChange={(v) => set("style", v || "blue")}
                allowDeselect={false}
                leftSection={
                  <ColorSwatch colors={themeColors(draft.style, themes)} />
                }
                leftSectionPointerEvents="none"
                renderOption={renderStyleOption}
                withCheckIcon={false}
                nothingFoundMessage="該当なし"
              />
            </Fieldset>
            <Fieldset legend="言語" variant="filled" radius="md">
              <TextInput
                label="言語コード"
                description="例: ja、en"
                required
                withAsterisk
                error={fieldError("lang")}
                value={draft.lang}
                onChange={(e) => set("lang", e.currentTarget.value)}
                placeholder="ja"
                leftSection={<IconLanguage size={16} stroke={1.5} />}
              />
              <Group gap="xs" mt="sm">
                {LANG_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="compact-xs"
                    variant={draft.lang === opt.value ? "filled" : "light"}
                    onClick={() => set("lang", opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Group>
            </Fieldset>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="cover" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Stack gap="md">
              <Fieldset legend="背景" variant="filled" radius="md">
                <Switch
                  label="表紙を付ける"
                  description="オフのときは本文から始まります"
                  checked={draft.cover}
                  onChange={(e) => set("cover", e.currentTarget.checked)}
                />
                <Select
                  mt="sm"
                  label="表紙デザイン"
                  searchable
                  data={[...COVER_PATTERN_OPTIONS]}
                  value={draft.coverPattern}
                  onChange={(v) => {
                    const pattern = v || "noise";
                    setDraft((prev) => ({
                      ...prev,
                      coverPattern: pattern,
                      coverGradient: pattern !== "solid",
                    }));
                  }}
                  allowDeselect={false}
                  disabled={!draft.cover}
                  leftSection={
                    <img
                      className="ohyna-cover-thumb"
                      src={coverImageUrl(
                        draft.style || "blue",
                        draft.coverPattern || "noise"
                      )}
                      alt=""
                      aria-hidden
                    />
                  }
                  leftSectionWidth={36}
                  leftSectionPointerEvents="none"
                  renderOption={renderCoverOption}
                  withCheckIcon={false}
                  nothingFoundMessage="該当なし"
                  maxDropdownHeight={280}
                />
              </Fieldset>
              <Fieldset legend="文言" variant="filled" radius="md">
                <Stack gap="sm">
                  <TextInput
                    label="タイトル"
                    required
                    withAsterisk
                    error={fieldError("title")}
                    value={draft.title}
                    onChange={(e) => set("title", e.currentTarget.value)}
                    data-autofocus
                  />
                  <TextInput
                    label="サブタイトル"
                    value={draft.subtitle}
                    onChange={(e) => set("subtitle", e.currentTarget.value)}
                    disabled={!draft.cover}
                  />
                  <TextInput
                    label="ラベル"
                    description="番号など、上部の小さな枠"
                    value={draft.label}
                    onChange={(e) => set("label", e.currentTarget.value)}
                    disabled={!draft.cover}
                  />
                  <TagsInput
                    label="表紙フッタ"
                    description="下端の行。Enter で追加。空のときは下の著者・版・日付を自動流し込み"
                    placeholder="行を追加"
                    value={draft.meta}
                    onChange={(value) => set("meta", value)}
                    clearable
                    disabled={!draft.cover}
                  />
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    <TextInput
                      label="著者"
                      value={draft.author}
                      onChange={(e) => set("author", e.currentTarget.value)}
                    />
                    <TextInput
                      label="版"
                      value={draft.version}
                      onChange={(e) => set("version", e.currentTarget.value)}
                      placeholder="1.0"
                    />
                    <TextInput
                      label="日付"
                      value={draft.date}
                      onChange={(e) => set("date", e.currentTarget.value)}
                      placeholder="2026-07"
                    />
                  </SimpleGrid>
                </Stack>
              </Fieldset>
            </Stack>
            <CoverPreview settings={draft} themes={themes} />
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="type" pt="md">
          <Stack gap="md">
            <Fieldset legend="本文" variant="filled" radius="md">
              <Stack gap="sm">
                <BodyFontPicker
                  value={draft.font}
                  error={fieldError("font")}
                  onChange={(v) => {
                    set("font", v);
                    if (draft.fontFamily.trim()) {
                      set("fontFamily", "");
                    }
                  }}
                />
                <TextInput
                  label="カスタム"
                  description="入力すると上の選択より優先。"
                  value={draft.fontFamily}
                  onChange={(e) => set("fontFamily", e.currentTarget.value)}
                  placeholder='"Noto Serif JP", serif'
                  styles={{
                    input: draft.fontFamily.trim()
                      ? { fontFamily: draft.fontFamily }
                      : undefined,
                  }}
                />
              </Stack>
            </Fieldset>

            <Fieldset legend="コード" variant="filled" radius="md">
              <MonoFontPicker
                preset={monoPreset}
                customStack={draft.fontMono}
                onPresetChange={applyMonoPreset}
                onCustomChange={applyMonoCustom}
              />
            </Fieldset>

            <Fieldset legend="サイズ" variant="filled" radius="md">
              <Stack gap="sm">
                <Select
                  label="用途プリセット"
                  description="文字サイズ・行間・字間をまとめて設定"
                  data={[...TYPE_PRESET_OPTIONS]}
                  value={
                    TYPE_PRESET_OPTIONS.find(
                      (p) =>
                        p.fontSize === draft.fontSize &&
                        p.lineHeight === draft.lineHeight &&
                        p.letterSpacing === draft.letterSpacing
                    )?.value ?? null
                  }
                  onChange={(v) => {
                    const preset = TYPE_PRESET_OPTIONS.find((p) => p.value === v);
                    if (!preset) return;
                    setDraft((prev) => ({
                      ...prev,
                      fontSize: preset.fontSize,
                      lineHeight: preset.lineHeight,
                      letterSpacing: preset.letterSpacing,
                    }));
                  }}
                  clearable
                  placeholder="選択すると上書き"
                />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  <TextInput
                    label="文字サイズ"
                    value={draft.fontSize}
                    onChange={(e) => set("fontSize", e.currentTarget.value)}
                    placeholder="10.5pt"
                  />
                  <TextInput
                    label="行間"
                    description="倍率（例: 1.7）"
                    value={draft.lineHeight}
                    onChange={(e) => set("lineHeight", e.currentTarget.value)}
                    placeholder="1.7"
                  />
                  <TextInput
                    label="字間"
                    description="例: 0 / 0.02em"
                    value={draft.letterSpacing}
                    onChange={(e) =>
                      set("letterSpacing", e.currentTarget.value)
                    }
                    placeholder="0"
                  />
                </SimpleGrid>
              </Stack>
            </Fieldset>

            <Fieldset legend="装飾" variant="filled" radius="md">
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Switch
                    label="角丸"
                    description="コードブロック・表など"
                    checked={draft.rounded}
                    onChange={(e) => set("rounded", e.currentTarget.checked)}
                  />
                  <Select
                    label="角丸サイズ"
                    error={fieldError("radius")}
                    data={[...RADIUS_OPTIONS]}
                    value={draft.radius}
                    onChange={(v) => set("radius", v || "md")}
                    allowDeselect={false}
                    disabled={!draft.rounded}
                  />
                </SimpleGrid>
                <Switch
                  label="見出し帯"
                  description="見出し（h2）に色帯を付けます。"
                  checked={draft.headingBand}
                  onChange={(e) => set("headingBand", e.currentTarget.checked)}
                />
                <Switch
                  label="表ヘッダの塗り"
                  description="表の見出し行を色テーマで塗りつぶします。"
                  checked={draft.tableHeaderFill}
                  onChange={(e) =>
                    set("tableHeaderFill", e.currentTarget.checked)
                  }
                />
                <Switch
                  label="リンクに下線"
                  checked={draft.linkUnderline}
                  onChange={(e) =>
                    set("linkUnderline", e.currentTarget.checked)
                  }
                />
                <Switch
                  label="リンク色をテーマに合わせる"
                  description="オフのときは本文色"
                  checked={draft.linkThemeColor}
                  onChange={(e) =>
                    set("linkThemeColor", e.currentTarget.checked)
                  }
                />
              </Stack>
            </Fieldset>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="page" pt="md">
          <Stack gap="md">
            <Fieldset legend="用紙" variant="filled" radius="md">
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label="用紙サイズ"
                    error={fieldError("pageSize")}
                    data={[...PAGE_SIZE_OPTIONS]}
                    value={draft.pageSize}
                    onChange={(v) => set("pageSize", v || "a4")}
                    allowDeselect={false}
                  />
                  <Select
                    label="向き"
                    error={fieldError("pageOrientation")}
                    data={[...PAGE_ORIENTATION_OPTIONS]}
                    value={draft.pageOrientation}
                    onChange={(v) => set("pageOrientation", v || "portrait")}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                <Text size="xs" c="dimmed">
                  {(() => {
                    const p = pageSizeMm(draft.pageSize, draft.pageOrientation);
                    return `適用後の寸法: ${p.w} × ${p.h} mm`;
                  })()}
                </Text>
              </Stack>
            </Fieldset>
            <Fieldset legend="余白" variant="filled" radius="md">
              <Stack gap="sm">
                <Select
                  label="余白"
                  error={fieldError("marginPreset")}
                  data={[...MARGIN_PRESET_OPTIONS]}
                  value={draft.marginPreset}
                  onChange={(v) => {
                    const preset = v || "normal";
                    const mm = MARGIN_PRESET_MM[preset];
                    setDraft((prev) => ({
                      ...prev,
                      marginPreset: preset,
                      ...(mm
                        ? {
                            marginTop: mm.top,
                            marginRight: mm.right,
                            marginBottom: mm.bottom,
                            marginLeft: mm.left,
                          }
                        : {}),
                    }));
                  }}
                  allowDeselect={false}
                />
                {draft.marginPreset === "custom" && (
                  <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                    {(
                      [
                        ["marginTop", "上"],
                        ["marginRight", "右"],
                        ["marginBottom", "下"],
                        ["marginLeft", "左"],
                      ] as const
                    ).map(([key, label]) => (
                      <TextInput
                        key={key}
                        label={`${label} (mm)`}
                        value={draft[key]}
                        onChange={(e) => set(key, e.currentTarget.value)}
                      />
                    ))}
                  </SimpleGrid>
                )}
              </Stack>
            </Fieldset>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="output" pt="md">
          <Stack gap="md">
            <Fieldset legend="本文ページのヘッダ／フッタ" variant="filled" radius="md">
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  表紙フッタ（meta）とは別です。PDF
                  では全ページ（表紙含む）に出ます。プレビューでは本文ページのみです。
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    label="ヘッダ"
                    error={fieldError("pageHeader")}
                    data={[...PAGE_HEADER_OPTIONS]}
                    value={draft.pageHeader}
                    onChange={(v) => set("pageHeader", v || "none")}
                    allowDeselect={false}
                  />
                  <Select
                    label="フッタ"
                    error={fieldError("pageFooter")}
                    data={[...PAGE_FOOTER_OPTIONS]}
                    value={draft.pageFooter}
                    onChange={(v) => set("pageFooter", v || "none")}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                {draft.pageHeader === "custom" && (
                  <TextInput
                    label="ヘッダ文言"
                    value={draft.pageHeaderText}
                    onChange={(e) =>
                      set("pageHeaderText", e.currentTarget.value)
                    }
                  />
                )}
                {draft.pageFooter === "custom" && (
                  <TextInput
                    label="フッタ文言"
                    value={draft.pageFooterText}
                    onChange={(e) =>
                      set("pageFooterText", e.currentTarget.value)
                    }
                  />
                )}
              </Stack>
            </Fieldset>

            <Fieldset legend="目次" variant="filled" radius="md">
              <Stack gap="sm">
                <Switch
                  label="自動目次"
                  description="オンで [TOC] が無いとき本文先頭へ挿入します"
                  checked={draft.toc}
                  onChange={(e) => set("toc", e.currentTarget.checked)}
                />
                <Select
                  label="見出しの深さ"
                  error={fieldError("tocDepth")}
                  data={[...TOC_DEPTH_OPTIONS]}
                  value={draft.tocDepth}
                  onChange={(v) => set("tocDepth", v || "3")}
                  allowDeselect={false}
                  disabled={!draft.toc}
                />
              </Stack>
            </Fieldset>

            <Fieldset legend="コードブロック" variant="filled" radius="md">
              <Stack gap="sm">
                <Switch
                  label="行番号"
                  checked={draft.codeLineNumbers}
                  onChange={(e) =>
                    set("codeLineNumbers", e.currentTarget.checked)
                  }
                />
                <Switch
                  label="折り返し"
                  description="オフのときは横スクロール"
                  checked={draft.codeWrap}
                  onChange={(e) => set("codeWrap", e.currentTarget.checked)}
                />
                <TextInput
                  label="コードの文字サイズ"
                  description="空欄は本文連動（0.92em）"
                  value={draft.codeFontSize}
                  onChange={(e) => set("codeFontSize", e.currentTarget.value)}
                  placeholder="9pt"
                />
              </Stack>
            </Fieldset>

            <Fieldset legend="透かし" variant="filled" radius="md">
              <Stack gap="sm">
                <Select
                  label="透かし"
                  error={fieldError("watermark")}
                  data={[...WATERMARK_OPTIONS]}
                  value={draft.watermark}
                  onChange={(v) => set("watermark", v || "none")}
                  allowDeselect={false}
                />
                {draft.watermark === "custom" && (
                  <TextInput
                    label="透かし文言"
                    error={fieldError("watermarkText")}
                    value={draft.watermarkText}
                    onChange={(e) =>
                      set("watermarkText", e.currentTarget.value)
                    }
                    placeholder="CONFIDENTIAL"
                  />
                )}
              </Stack>
            </Fieldset>
          </Stack>
        </Tabs.Panel>
        </div>
      </Tabs>

      <Group justify="flex-end" mt="md" className="ohyna-settings-actions">
        <Button variant="default" onClick={onClose}>
          キャンセル
        </Button>
        <Button
          disabled={!canApply}
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          適用
        </Button>
      </Group>
    </Modal>
  );
}
