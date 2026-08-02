import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Menu,
  Tooltip,
} from "@mantine/core";
import {
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconMathFunction,
  IconPhoto,
  IconQuote,
  IconSeparator,
  IconStrikethrough,
  IconTable,
  IconClearAll,
  IconPlus,
  IconSitemap,
  IconNotes,
  IconKeyboard,
} from "@tabler/icons-react";
import type { EditorView } from "@codemirror/view";
import { fenceInsertLanguages } from "./fenceLanguages";
import {
  insertCodeFence,
  insertDetails,
  insertHorizontalRule,
  insertImage,
  insertLink,
  insertMathBlock,
  insertMermaid,
  insertTable,
  wrapKbd,
  setHeading,
  tidyMarkdown,
  toggleList,
  wrapSelection,
} from "./mdCommands";
import { chord } from "./platform";

type Props = {
  getView: () => EditorView | null;
};

function run(getView: () => EditorView | null, fn: (v: EditorView) => boolean) {
  const view = getView();
  if (!view) return;
  fn(view);
  view.focus();
}

export function EditorToolbar({ getView }: Props) {
  return (
    <Group
      className="ohyna-editor-toolbar"
      gap={2}
      wrap="nowrap"
      px="xs"
      py={4}
      justify="flex-start"
    >
      <Tooltip.Group openDelay={400} closeDelay={80}>
        <ActionIcon.Group>
          <Tooltip label={`太字 (${chord("B")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="太字"
              onClick={() =>
                run(getView, (v) => wrapSelection(v, "**", "**", "太字"))
              }
            >
              <IconBold size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`斜体 (${chord("I")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="斜体"
              onClick={() =>
                run(getView, (v) => wrapSelection(v, "*", "*", "斜体"))
              }
            >
              <IconItalic size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`取り消し線 (${chord("Shift", "X")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="取り消し線"
              onClick={() =>
                run(getView, (v) => wrapSelection(v, "~~", "~~", "取り消し"))
              }
            >
              <IconStrikethrough size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`インラインコード (${chord("E")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="インラインコード"
              onClick={() =>
                run(getView, (v) => wrapSelection(v, "`", "`", "code"))
              }
            >
              <IconCode size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" mx={4} />

        <ActionIcon.Group>
          <Tooltip label={`見出し1 (${chord("Alt", "1")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="見出し1"
              onClick={() => run(getView, (v) => setHeading(v, 1))}
            >
              <IconH1 size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`見出し2 (${chord("Alt", "2")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="見出し2"
              onClick={() => run(getView, (v) => setHeading(v, 2))}
            >
              <IconH2 size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`見出し3 (${chord("Alt", "3")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="見出し3"
              onClick={() => run(getView, (v) => setHeading(v, 3))}
            >
              <IconH3 size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" mx={4} />

        <ActionIcon.Group>
          <Tooltip label={`箇条書き (${chord("Shift", "8")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="箇条書き"
              onClick={() => run(getView, (v) => toggleList(v, "ul"))}
            >
              <IconList size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`番号付き (${chord("Shift", "7")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="番号付きリスト"
              onClick={() => run(getView, (v) => toggleList(v, "ol"))}
            >
              <IconListNumbers size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`タスクリスト (${chord("Shift", "9")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="タスクリスト"
              onClick={() => run(getView, (v) => toggleList(v, "task"))}
            >
              <IconListCheck size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`引用 (${chord("Shift", ".")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="引用"
              onClick={() => run(getView, (v) => toggleList(v, "quote"))}
            >
              <IconQuote size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" mx={4} />

        <ActionIcon.Group>
          <Tooltip label={`リンク (${chord("K")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="リンク"
              onClick={() => run(getView, (v) => insertLink(v))}
            >
              <IconLink size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="画像">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="画像"
              onClick={() => run(getView, (v) => insertImage(v))}
            >
              <IconPhoto size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`インライン数式 (${chord("Shift", "M")})`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="インライン数式"
              onClick={() =>
                run(getView, (v) => wrapSelection(v, "$", "$", "E=mc^2"))
              }
            >
              <IconMathFunction size={15} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" mx={4} />

        <Menu shadow="md" width={220} position="bottom-start">
          <Tooltip label="ブロックを挿入">
            <Menu.Target>
              <Button
                className="ohyna-editor-insert-btn"
                variant="subtle"
                color="gray"
                size="compact-sm"
                leftSection={<IconPlus size={15} stroke={1.75} />}
                aria-label="挿入"
              >
                挿入
              </Button>
            </Menu.Target>
          </Tooltip>
          <Menu.Dropdown>
            <Menu.Label>ブロック挿入</Menu.Label>
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item leftSection={<IconCode size={14} />}>
                  コードフェンス
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <Menu.Label>言語</Menu.Label>
                {fenceInsertLanguages.map((opt) => (
                  <Menu.Item
                    key={opt.lang || "plain"}
                    onClick={() =>
                      run(getView, (v) => insertCodeFence(v, opt.lang))
                    }
                  >
                    {opt.label}
                  </Menu.Item>
                ))}
              </Menu.Sub.Dropdown>
            </Menu.Sub>
            <Menu.Item
              leftSection={<IconSitemap size={14} />}
              onClick={() => run(getView, (v) => insertMermaid(v))}
            >
              Mermaid ダイアグラム
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMathFunction size={14} />}
              onClick={() => run(getView, (v) => insertMathBlock(v))}
            >
              ディスプレイ数式
            </Menu.Item>
            <Menu.Item
              leftSection={<IconTable size={14} />}
              onClick={() => run(getView, (v) => insertTable(v))}
            >
              表
            </Menu.Item>
            <Menu.Item
              leftSection={<IconSeparator size={14} />}
              onClick={() => run(getView, (v) => insertHorizontalRule(v))}
            >
              水平線
            </Menu.Item>
            <Menu.Item
              leftSection={<IconNotes size={14} />}
              title="アドモニション形式の折りたたみブロック"
              onClick={() => run(getView, (v) => insertDetails(v))}
            >
              折りたたみ
            </Menu.Item>
            <Menu.Item
              leftSection={<IconKeyboard size={14} />}
              title="キーボードキー表記"
              onClick={() => run(getView, (v) => wrapKbd(v))}
            >
              キー
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Tooltip label={`ドキュメントを整形 (${chord("Shift", "L")})`}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Markdown整形"
            onClick={() => run(getView, (v) => tidyMarkdown(v))}
          >
            <IconClearAll size={15} stroke={1.75} />
          </ActionIcon>
        </Tooltip>
      </Tooltip.Group>
    </Group>
  );
}
