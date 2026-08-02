import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Box,
  Center,
  Group,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowBackUp } from "@tabler/icons-react";
import { HtmlPreview } from "./HtmlPreview";
import { APP_NAME } from "./brand";
import {
  createPopoutChannel,
  type PopoutMessage,
} from "./popoutBridge";

/** 子窓: 親（エディタ）が生成したプレビュー HTML を表示 */
export function PopoutPreview() {
  const [html, setHtml] = useState<string | null>(null);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [previewState, setPreviewState] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [layoutTick, setLayoutTick] = useState(0);
  const channelRef = useRef<ReturnType<typeof createPopoutChannel> | null>(
    null
  );

  useEffect(() => {
    document.title = `${APP_NAME} — プレビュー`;
    const ch = createPopoutChannel((msg: PopoutMessage) => {
      if (msg.type === "state") {
        setHtml(msg.previewHtml);
        setSettingsMissing(msg.settingsMissing);
        setPreviewState(msg.previewState);
        setErrorMessage(msg.errorMessage);
        setLayoutTick((n) => n + 1);
      }
      if (msg.type === "preview") {
        setHtml(msg.html);
        setSettingsMissing(msg.settingsMissing);
        setPreviewState(msg.previewState);
        setErrorMessage(msg.errorMessage);
        setLayoutTick((n) => n + 1);
      }
      if (msg.type === "dock") {
        window.close();
      }
    });
    channelRef.current = ch;
    ch.post({ type: "hello" });
    ch.post({ type: "request-state" });

    const onUnload = () => {
      ch.post({ type: "bye" });
    };
    window.addEventListener("beforeunload", onUnload);
    const onResize = () => setLayoutTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("resize", onResize);
      ch.post({ type: "bye" });
      ch.close();
    };
  }, []);

  const dock = () => {
    channelRef.current?.post({ type: "dock" });
    window.close();
  };

  const statusLabel =
    previewState === "loading"
      ? "更新中…"
      : previewState === "error" || previewState === "blocked"
        ? errorMessage || "エラー"
        : previewState === "ready"
          ? "同期中"
          : "待機";

  return (
    <AppShell className="ohyna-app ohyna-popout" header={{ height: 44 }} padding={0}>
      <AppShell.Header px="sm">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Title order={5} fw={700}>
              プレビュー
            </Title>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {statusLabel}
            </Text>
          </Group>
          <Tooltip label="メインウィンドウへ戻す">
            <ActionIcon
              variant="default"
              size="sm"
              aria-label="メインウィンドウへ戻す"
              onClick={dock}
            >
              <IconArrowBackUp size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Box className="ohyna-pane" h="100%" mih={0}>
          <Box className="ohyna-preview-stage" mih={0} style={{ flex: 1 }}>
            {settingsMissing ? (
              <Center h="100%" px="md">
                <Text size="sm" c="dimmed" ta="center">
                  メインウィンドウでドキュメント設定を完了するとプレビューを表示します。
                </Text>
              </Center>
            ) : html ? (
              <HtmlPreview html={html} layoutTick={layoutTick} />
            ) : (
              <Center h="100%" px="md">
                <Text size="sm" c="dimmed" ta="center">
                  {previewState === "loading" || previewState === "idle"
                    ? "メインウィンドウからプレビューを受信しています…"
                    : errorMessage || "プレビューがありません"}
                </Text>
              </Center>
            )}
          </Box>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
