import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Loader,
  ScrollArea,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconMinus,
  IconTrash,
  IconWindowMaximize,
  IconX,
} from "@tabler/icons-react";
import { formatDiagItem, formatLineRef } from "./diagFormat";
import type { MdDiagnostic } from "./mdAnalysis";
import { summarizeDiagnostics } from "./mdAnalysis";
import {
  clearConsoleEntries,
  consoleCounts,
  getConsoleEntries,
  subscribeConsole,
  type ConsoleEntry,
  type ConsoleLevel,
} from "./messageConsoleStore";

const COLLAPSED_H = 36;
/** タブレット／スマホ向け。ホームインジケータ付近でも押しやすい高さ */
const COLLAPSED_H_TOUCH = 48;
const EXPANDED_H = 240;

export const MESSAGE_CONSOLE_COLLAPSED = COLLAPSED_H;
export const MESSAGE_CONSOLE_COLLAPSED_TOUCH = COLLAPSED_H_TOUCH;
export const MESSAGE_CONSOLE_EXPANDED = EXPANDED_H;

export type ConsolePreviewState =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "blocked";

export type ConsoleAnalysisProps = {
  pending: boolean;
  diagnostics: MdDiagnostic[];
};

export type ConsolePreviewProps = {
  state: ConsolePreviewState;
  analyzePending?: boolean;
  message?: string;
  diagramErrorCount?: number;
  diagramErrorHint?: string;
};

type PanelTab = "output" | "problems";

function levelIcon(level: ConsoleLevel) {
  const size = 14;
  switch (level) {
    case "error":
      return <IconX size={size} color="var(--mantine-color-red-6)" />;
    case "warning":
      return (
        <IconAlertTriangle size={size} color="var(--mantine-color-orange-6)" />
      );
    case "success":
      return <IconCheck size={size} color="var(--mantine-color-teal-6)" />;
    default:
      return <IconInfoCircle size={size} color="var(--mantine-color-blue-6)" />;
  }
}

function levelLabel(level: ConsoleLevel): string {
  switch (level) {
    case "error":
      return "エラー";
    case "warning":
      return "注意";
    case "success":
      return "完了";
    default:
      return "情報";
  }
}

function formatTime(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

type StatusKind = "ok" | "error" | "warn" | "pending" | "idle";

type PaneStatus = {
  name: string;
  kind: StatusKind;
  tip: string;
  live: string;
};

function analysisStatus(analysis: ConsoleAnalysisProps): PaneStatus {
  const summary = summarizeDiagnostics(analysis.diagnostics);
  if (analysis.pending) {
    return {
      name: "Markdown",
      kind: "pending",
      tip: "内容を確認しています",
      live: "内容を確認しています",
    };
  }
  if (summary.errors > 0) {
    return {
      name: "Markdown",
      kind: "error",
      tip: `問題 ${summary.errors} 件`,
      live: `問題が ${summary.errors} 件あります`,
    };
  }
  if (summary.warnings > 0) {
    return {
      name: "Markdown",
      kind: "warn",
      tip: `注意 ${summary.warnings} 件`,
      live: `注意が ${summary.warnings} 件あります`,
    };
  }
  return {
    name: "Markdown",
    kind: "ok",
    tip: "問題なし",
    live: "問題はありません",
  };
}

function previewStatus(preview: ConsolePreviewProps): PaneStatus {
  if (preview.analyzePending && preview.state !== "loading") {
    return {
      name: "プレビュー",
      kind: "pending",
      tip: "確認中",
      live: "プレビューを確認しています",
    };
  }
  if (preview.state === "loading") {
    return {
      name: "プレビュー",
      kind: "pending",
      tip: "更新中",
      live: "プレビューを更新しています",
    };
  }
  if (preview.state === "blocked") {
    return {
      name: "プレビュー",
      kind: "warn",
      tip:
        preview.message ||
        "問題があるため、プレビューは前の内容のままです",
      live: "プレビューは未更新です",
    };
  }
  if (preview.state === "error") {
    return {
      name: "プレビュー",
      kind: "error",
      tip: preview.message || "プレビューに失敗しました",
      live: "プレビューでエラーがあります",
    };
  }
  if ((preview.diagramErrorCount ?? 0) > 0) {
    return {
      name: "プレビュー",
      kind: "error",
      tip:
        preview.diagramErrorHint ||
        `Mermaid ダイアグラム ${preview.diagramErrorCount} 件の描画に失敗しました`,
      live: `図の描画エラーが ${preview.diagramErrorCount} 件あります`,
    };
  }
  if (preview.state === "ready") {
    return {
      name: "プレビュー",
      kind: "ok",
      tip: "最新",
      live: "プレビューは最新です",
    };
  }
  return {
    name: "プレビュー",
    kind: "idle",
    tip: "待機",
    live: "プレビューは待機中です",
  };
}

function statusIcon(kind: StatusKind): ReactNode {
  const size = 14;
  switch (kind) {
    case "ok":
      return <IconCheck size={size} stroke={2.2} />;
    case "error":
      return <IconX size={size} stroke={2.2} />;
    case "warn":
      return <IconAlertTriangle size={size} stroke={2} />;
    case "pending":
      return <Loader size={12} type="dots" color="gray" />;
    default:
      return <IconMinus size={size} stroke={2} />;
  }
}

function EntryRow({ entry }: { entry: ConsoleEntry }) {
  return (
    <Box className={`ohyna-msg-row ohyna-msg-row--${entry.level}`}>
      <Group gap={8} wrap="nowrap" align="flex-start">
        <Box className="ohyna-msg-row__icon" aria-hidden>
          {levelIcon(entry.level)}
        </Box>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Group gap={8} wrap="nowrap" justify="space-between">
            <Text size="xs" fw={600} lineClamp={2}>
              <Text span c="dimmed" fw={500} mr={6}>
                {levelLabel(entry.level)}
              </Text>
              {entry.title}
            </Text>
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {formatTime(entry.at)}
            </Text>
          </Group>
          {entry.detail ? (
            <Text
              size="xs"
              c="dimmed"
              className="ohyna-msg-row__detail"
              component="pre"
            >
              {entry.detail}
            </Text>
          ) : null}
        </Box>
      </Group>
    </Box>
  );
}

function StatusChip({
  status,
  active,
  onClick,
}: {
  status: PaneStatus;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = active
    ? `ohyna-msg-console__status ohyna-msg-console__status--${status.kind} ohyna-msg-console__status--active`
    : `ohyna-msg-console__status ohyna-msg-console__status--${status.kind}`;
  const content = (
    <>
      <span className="ohyna-msg-console__status-icon" aria-hidden>
        {statusIcon(status.kind)}
      </span>
      <Text size="xs" fw={600} component="span">
        {status.name}
      </Text>
    </>
  );
  const body = onClick ? (
    <UnstyledButton
      className={className}
      onClick={onClick}
      aria-label={`${status.name}（${status.tip}）`}
    >
      {content}
    </UnstyledButton>
  ) : (
    <Box
      component="span"
      className={className}
      aria-label={`${status.name}（${status.tip}）`}
    >
      {content}
    </Box>
  );
  return (
    <Tooltip label={status.tip} withArrow multiline maw={320}>
      {body}
    </Tooltip>
  );
}

export function MessageConsole({
  expanded,
  onToggle,
  analysis,
  preview,
  onJumpLine,
  fill = false,
  windowMode = false,
  onPopOut,
  onFocusPopOut,
  onDockPopOut,
  poppedOut = false,
}: {
  expanded: boolean;
  onToggle?: () => void;
  analysis: ConsoleAnalysisProps;
  preview: ConsolePreviewProps;
  onJumpLine?: (line: number) => void;
  /** 親 Splitter ペインいっぱいに広げる */
  fill?: boolean;
  /** 子ウィンドウ表示（開閉トグルなし） */
  windowMode?: boolean;
  onPopOut?: () => void;
  onFocusPopOut?: () => void;
  onDockPopOut?: () => void;
  /** メイン側: コンソールが別ウィンドウにある */
  poppedOut?: boolean;
}) {
  const entries = useSyncExternalStore(
    subscribeConsole,
    getConsoleEntries,
    getConsoleEntries
  );
  const counts = consoleCounts(entries);
  const latest = entries[0];
  const showPanel = expanded || windowMode;
  const [tab, setTab] = useState<PanelTab>("output");
  const mdStatus = analysisStatus(analysis);
  const pvStatus = previewStatus(preview);

  const openProblems = () => {
    setTab("problems");
    if (!expanded && !windowMode && onToggle) onToggle();
  };

  const openOutput = () => {
    setTab("output");
    if (!expanded && !windowMode && onToggle) onToggle();
  };

  return (
    <Box
      className={
        showPanel ? "ohyna-msg-console ohyna-msg-console--open" : "ohyna-msg-console"
      }
      style={fill ? { height: "100%" } : { height: COLLAPSED_H }}
      role="region"
      aria-label="コンソール"
    >
      <Text
        component="span"
        className="ohyna-sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {`${mdStatus.live}。${pvStatus.live}`}
      </Text>
      <Group
        className="ohyna-msg-console__bar"
        h={COLLAPSED_H}
        px="sm"
        gap={8}
        wrap="nowrap"
        justify="space-between"
      >
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          {windowMode || !onToggle ? (
            <Text size="xs" fw={700} style={{ flexShrink: 0 }}>
              コンソール
            </Text>
          ) : (
            <UnstyledButton
              className="ohyna-msg-console__toggle"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={
                expanded ? "コンソールを閉じる" : "コンソールを開く"
              }
              style={{ flex: "0 0 auto", width: "auto" }}
            >
              <Group gap={6} wrap="nowrap">
                {expanded ? (
                  <IconChevronDown size={14} stroke={1.5} />
                ) : (
                  <IconChevronUp size={14} stroke={1.5} />
                )}
                <Text size="xs" fw={700}>
                  コンソール
                </Text>
              </Group>
            </UnstyledButton>
          )}

          <StatusChip
            status={mdStatus}
            active={showPanel && tab === "problems"}
            onClick={poppedOut ? onFocusPopOut : openProblems}
          />
          <StatusChip status={pvStatus} />

          {poppedOut ? (
            <Text size="xs" c="dimmed" lineClamp={1}>
              別ウィンドウで表示中
            </Text>
          ) : null}

          {!showPanel && !poppedOut && latest ? (
            <UnstyledButton
              className="ohyna-msg-console__latest"
              onClick={openOutput}
              aria-label="最新のメッセージを表示"
            >
              <Text size="xs" c="dimmed" lineClamp={1}>
                {latest.title}
                {latest.detail ? ` — ${latest.detail.split("\n")[0]}` : ""}
              </Text>
            </UnstyledButton>
          ) : null}
          {!showPanel && !poppedOut && !latest ? (
            <Text size="xs" c="dimmed">
              メッセージなし
            </Text>
          ) : null}
        </Group>

        <Group gap={4} wrap="nowrap">
          {counts.error > 0 ? (
            <Badge size="xs" color="red" variant="filled">
              {counts.error}
            </Badge>
          ) : null}
          {counts.warning > 0 ? (
            <Badge size="xs" color="orange" variant="light">
              {counts.warning}
            </Badge>
          ) : null}
          {!poppedOut ? (
            <Tooltip label="メッセージを消去" withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="メッセージを消去"
                disabled={entries.length === 0}
                onClick={() => clearConsoleEntries()}
              >
                <IconTrash size={14} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : null}
          {poppedOut ? (
            <>
              <Tooltip label="コンソールを前面へ" withArrow>
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="blue"
                  aria-label="コンソールを前面へ"
                  onClick={onFocusPopOut}
                >
                  <IconWindowMaximize size={14} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="コンソールを戻す" withArrow>
                <ActionIcon
                  size="sm"
                  variant="default"
                  aria-label="コンソールを戻す"
                  onClick={onDockPopOut}
                >
                  <IconArrowBackUp size={14} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </>
          ) : null}
          {!poppedOut && onPopOut ? (
            <Tooltip label="別ウィンドウで表示" withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="別ウィンドウで表示"
                onClick={onPopOut}
              >
                <IconWindowMaximize size={14} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : null}
          {windowMode && onDockPopOut ? (
            <Tooltip label="メインウィンドウへ戻す" withArrow>
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="メインウィンドウへ戻す"
                onClick={onDockPopOut}
              >
                <IconArrowBackUp size={14} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Group>
      </Group>

      {showPanel && !poppedOut ? (
        <Box className="ohyna-msg-console__panel">
          <Group
            className="ohyna-msg-console__tabs"
            gap={4}
            px="sm"
            wrap="nowrap"
          >
            <UnstyledButton
              className={
                tab === "problems"
                  ? "ohyna-msg-console__tab ohyna-msg-console__tab--active"
                  : "ohyna-msg-console__tab"
              }
              onClick={() => setTab("problems")}
            >
              問題
              {analysis.diagnostics.length > 0
                ? ` ${analysis.diagnostics.length}`
                : ""}
            </UnstyledButton>
            <UnstyledButton
              className={
                tab === "output"
                  ? "ohyna-msg-console__tab ohyna-msg-console__tab--active"
                  : "ohyna-msg-console__tab"
              }
              onClick={() => setTab("output")}
            >
              出力
              {entries.length > 0 ? ` ${entries.length}` : ""}
            </UnstyledButton>
          </Group>

          {tab === "problems" ? (
            <ScrollArea className="ohyna-msg-console__body" type="auto">
              {analysis.pending && analysis.diagnostics.length === 0 ? (
                <Text size="xs" c="dimmed" px="sm" py="xs">
                  確認しています…
                </Text>
              ) : analysis.diagnostics.length === 0 ? (
                <Text size="xs" c="dimmed" px="sm" py="xs">
                  指摘はありません
                </Text>
              ) : (
                analysis.diagnostics.map((d, i) => {
                  const canJump =
                    d.line != null && d.line > 0 && !!onJumpLine;
                  return (
                    <UnstyledButton
                      key={`${d.severity}-${d.line ?? 0}-${i}-${d.message}`}
                      className={
                        canJump
                          ? "ohyna-msg-row ohyna-diag-item ohyna-diag-item--jump"
                          : "ohyna-msg-row ohyna-diag-item"
                      }
                      onClick={() => {
                        if (!canJump || d.line == null || !onJumpLine) return;
                        onJumpLine(d.line);
                      }}
                      aria-label={
                        canJump && d.line != null
                          ? `${formatLineRef(d.line)}、${d.message}。クリックで移動`
                          : d.message
                      }
                    >
                      <Group gap={8} wrap="nowrap" align="flex-start">
                        <Badge
                          size="xs"
                          variant="dot"
                          color={
                            d.severity === "error"
                              ? "red"
                              : d.severity === "warning"
                                ? "orange"
                                : "blue"
                          }
                          styles={{ root: { flexShrink: 0, marginTop: 2 } }}
                        >
                          {d.severity === "error"
                            ? "エラー"
                            : d.severity === "warning"
                              ? "注意"
                              : "情報"}
                        </Badge>
                        <Text size="xs" style={{ flex: 1 }} lh={1.35}>
                          {formatDiagItem(d.line, d.message)}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  );
                })
              )}
            </ScrollArea>
          ) : (
            <ScrollArea className="ohyna-msg-console__body" type="auto">
              {entries.length === 0 ? (
                <Text size="xs" c="dimmed" px="sm" py="xs">
                  まだありません
                </Text>
              ) : (
                entries.map((e) => <EntryRow key={e.id} entry={e} />)
              )}
            </ScrollArea>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
