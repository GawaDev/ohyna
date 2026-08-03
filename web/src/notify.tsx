/**
 * トースト通知 + メッセージコンソールへの振り分け。
 *
 * | 引数 | 役割 |
 * | title | トースト見出し＝コンソール title |
 * | message | 通常時のトースト本文。detail 未指定時はコンソール detail にも使う |
 * | detail | コンソール専用の詳細（優先）。行位置は「N行目: …」 |
 * | level / color | 区分（error/warning/info/success）。未指定時は color から推定 |
 * | detailInConsole | true のときトースト本文を案内文に差し替え（error/warning 既定 true） |
 * | toConsole | false でコンソールへ書かない（既定 true） |
 */
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { APP_COLOR_NAME } from "./brandColors";
import {
  appendConsoleEntry,
  type ConsoleLevel,
} from "./messageConsoleStore";

export type NotifyOptions = {
  title: string;
  message?: string;
  detail?: string;
  color?: string;
  level?: ConsoleLevel;
  autoClose?: number | false;
  id?: string;
  toConsole?: boolean;
  detailInConsole?: boolean;
};

function levelFromColor(color?: string): ConsoleLevel {
  switch (color) {
    case "red":
      return "error";
    case "orange":
    case "yellow":
      return "warning";
    case "teal":
    case "green":
      return "success";
    default:
      return "info";
  }
}

function colorForLevel(level: ConsoleLevel): string {
  switch (level) {
    case "error":
      return "red";
    case "warning":
      return "orange";
    case "success":
      return "teal";
    default:
      return APP_COLOR_NAME;
  }
}

function iconForLevel(level: ConsoleLevel): ReactNode {
  const size = 18;
  switch (level) {
    case "error":
      return <IconX size={size} />;
    case "warning":
      return <IconAlertTriangle size={size} />;
    case "success":
      return <IconCheck size={size} />;
    default:
      return <IconInfoCircle size={size} />;
  }
}

export function notify(opts: NotifyOptions): string {
  const level = opts.level ?? levelFromColor(opts.color);
  const color = opts.color ?? colorForLevel(level);
  const detailInConsole =
    opts.detailInConsole ?? (level === "error" || level === "warning");
  const toConsole = opts.toConsole ?? true;
  const detailText = (opts.detail ?? opts.message)?.trim();

  if (toConsole) {
    appendConsoleEntry({
      level,
      title: opts.title,
      detail: detailText,
    });
  }

  const toastMessage = detailInConsole
    ? detailText
      ? "詳細は下部の出力を確認してください"
      : undefined
    : opts.message;

  return notifications.show({
    id: opts.id,
    color,
    title: opts.title,
    message: toastMessage || "",
    icon: iconForLevel(level),
    autoClose: opts.autoClose,
    withCloseButton: true,
  });
}
