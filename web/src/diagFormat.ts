/**
 * 診断・メッセージコンソール向けの行位置・要約表記。
 * 行は「N行目」とする（「N行:」は使わない）。
 */

export function formatLineRef(line: number): string {
  return `${line}行目`;
}

/** 問題一覧・コンソール詳細の 1 行（例: `12行目: タイトルは必須です`） */
export function formatDiagItem(
  line: number | null | undefined,
  message: string
): string {
  const msg = message.trim();
  if (line == null) return msg;
  return `${formatLineRef(line)}: ${msg}`;
}

/** 短い要約（例: `問題 2 件: 12行目 タイトルは必須です（ほか 1 件）`） */
export function formatDiagSummary(
  errors: { line?: number | null; message: string }[]
): string {
  if (errors.length === 0) return "";
  const head = errors[0];
  const loc = head.line != null ? `${formatLineRef(head.line)} ` : "";
  const more =
    errors.length > 1 ? `（ほか ${errors.length - 1} 件）` : "";
  return `問題 ${errors.length} 件: ${loc}${head.message.trim()}${more}`;
}
