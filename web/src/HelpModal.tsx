import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Group,
  Loader,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBook2,
  IconChevronLeft,
  IconChevronRight,
  IconFileText,
  IconHelp,
  IconLicense,
  IconScale,
} from "@tabler/icons-react";
import { marked } from "marked";

export type HelpDocItem = {
  id: string;
  title: string;
  group: string;
  url: string;
};

type Props = {
  opened: boolean;
  onClose: () => void;
  /** 開いたときに選ぶ文書 id（例: manual/01-intro.md） */
  initialDocId?: string;
};

const HELP_TITLE = "ヘルプ";

const GROUP_META: Record<
  string,
  { label: string; color: string; Icon: typeof IconBook2 }
> = {
  マニュアル: { label: "マニュアル", color: "blue", Icon: IconBook2 },
  仕様書: { label: "仕様書", color: "violet", Icon: IconScale },
  ライセンス: { label: "ライセンス", color: "gray", Icon: IconLicense },
};

marked.setOptions({
  gfm: true,
  breaks: false,
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** marked 出力を最低限サニタイズ（script / on* を除去） */
function sanitizeHelpHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function groupDocs(docs: HelpDocItem[]): { group: string; items: HelpDocItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, HelpDocItem[]>();
  for (const d of docs) {
    if (!map.has(d.group)) {
      order.push(d.group);
      map.set(d.group, []);
    }
    map.get(d.group)!.push(d);
  }
  return order.map((group) => ({ group, items: map.get(group)! }));
}

/** 相対パスの Markdown リンクをカタログ id に解決 */
function resolveHelpDocId(fromId: string, href: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^(https?:|mailto:|data:|javascript:)/i.test(raw)) return null;
  const pathOnly = raw.split("#")[0].trim();
  if (!pathOnly || !/\.md$/i.test(pathOnly)) return null;
  try {
    const baseDir = fromId.includes("/")
      ? fromId.slice(0, fromId.lastIndexOf("/") + 1)
      : "";
    const resolved = new URL(pathOnly, `https://ohyna.help/${baseDir}`);
    return decodeURIComponent(resolved.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]/g, "");
}

export function HelpModal({ opened, onClose, initialDocId }: Props) {
  const [docs, setDocs] = useState<HelpDocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [markdown, setMarkdown] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [error, setError] = useState("");
  const articleViewportRef = useRef<HTMLDivElement>(null);
  const pendingHashRef = useRef<string>("");

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setLoadingList(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch("/docs");
        if (!res.ok) throw new Error(`一覧の取得に失敗しました (${res.status})`);
        const data = (await res.json()) as { docs?: HelpDocItem[] };
        const list = Array.isArray(data.docs) ? data.docs : [];
        if (cancelled) return;
        setDocs(list);
        const preferred =
          list.find((d) => d.id === initialDocId)?.id ||
          list.find((d) => d.id === "manual/01-intro.md")?.id ||
          list[0]?.id ||
          "";
        setActiveId(preferred);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setDocs([]);
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, initialDocId]);

  useEffect(() => {
    if (!opened || !activeId) {
      setMarkdown("");
      return;
    }
    const entry = docs.find((d) => d.id === activeId);
    if (!entry) return;
    let cancelled = false;
    setLoadingDoc(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(entry.url);
        if (!res.ok) throw new Error(`取得に失敗しました (${res.status})`);
        const text = await res.text();
        if (!cancelled) setMarkdown(text);
      } catch (e) {
        if (!cancelled) {
          setMarkdown("");
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, activeId, docs]);

  const html = useMemo(() => {
    if (!markdown.trim()) return "";
    try {
      const raw = marked.parse(markdown, { async: false }) as string;
      // 見出しに id を付与（頁内アンカー用）
      const withIds = raw.replace(
        /<h([1-4])>([\s\S]*?)<\/h\1>/gi,
        (_m, level: string, inner: string) => {
          const text = inner.replace(/<[^>]+>/g, "");
          const id = slugifyHeading(text);
          return id
            ? `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`
            : `<h${level}>${inner}</h${level}>`;
        },
      );
      return sanitizeHelpHtml(withIds);
    } catch {
      return `<pre>${escapeHtml(markdown)}</pre>`;
    }
  }, [markdown]);

  // 記事切替・再表示では先頭へ（ハッシュ指定時は該当見出しへ）
  useEffect(() => {
    if (!opened || !activeId || !html) return;
    const el = articleViewportRef.current;
    if (!el) return;
    const hash = pendingHashRef.current;
    pendingHashRef.current = "";
    if (hash) {
      const target = el.querySelector(
        `#${CSS.escape(hash.replace(/^#/, ""))}`,
      ) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [opened, activeId, html]);

  const grouped = useMemo(() => groupDocs(docs), [docs]);
  const active = docs.find((d) => d.id === activeId);
  const activeTitle = active?.title || HELP_TITLE;
  const activeGroup = active?.group || "";
  const groupMeta = GROUP_META[activeGroup];
  const GroupIcon = groupMeta?.Icon;
  const flatIndex = docs.findIndex((d) => d.id === activeId);
  const prevDoc = flatIndex > 0 ? docs[flatIndex - 1] : null;
  const nextDoc =
    flatIndex >= 0 && flatIndex < docs.length - 1 ? docs[flatIndex + 1] : null;

  const onArticleClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || !articleViewportRef.current?.contains(a)) return;
    const href = a.getAttribute("href");
    if (!href) return;

    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target = articleViewportRef.current.querySelector(
        `#${CSS.escape(id)}`,
      ) as HTMLElement | null;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const hashPart = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    const resolved = resolveHelpDocId(activeId, href);
    if (!resolved) return;
    const hit = docs.find((d) => d.id === resolved);
    if (!hit) return;
    e.preventDefault();
    if (hashPart) pendingHashRef.current = hashPart;
    setActiveId(hit.id);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8} wrap="nowrap">
          <IconHelp size={18} stroke={1.6} />
          <Text fw={700} size="sm">
            {HELP_TITLE}
          </Text>
        </Group>
      }
      size="100%"
      fullScreen
      padding={0}
      radius={0}
      closeButtonProps={{ "aria-label": "閉じる" }}
      overlayProps={{ backgroundOpacity: 0.45 }}
      transitionProps={{ transition: "fade", duration: 200 }}
      classNames={{
        content: "ohyna-help-modal-content",
        header: "ohyna-help-modal-header",
        body: "ohyna-help-modal-body",
        title: "ohyna-help-modal-title",
      }}
    >
      <Box className="ohyna-help-layout">
        <aside className="ohyna-help-nav" aria-label="ヘルプ目次">
          <ScrollArea className="ohyna-help-nav-scroll" type="auto" offsetScrollbars>
            <Stack gap={14} p="sm">
              {loadingList && (
                <Group gap="xs" px="xs" py={4}>
                  <Loader size={14} type="dots" />
                  <Text size="xs" c="dimmed">
                    読み込み中
                  </Text>
                </Group>
              )}
              {grouped.map(({ group, items }) => {
                const meta = GROUP_META[group] || {
                  label: group,
                  color: "gray",
                  Icon: IconFileText,
                };
                const GIcon = meta.Icon;
                return (
                  <Box key={group} className="ohyna-help-nav-group">
                    <Group gap={6} px={6} mb={6} wrap="nowrap">
                      <GIcon size={14} stroke={1.6} className="ohyna-help-nav-group-icon" />
                      <Text className="ohyna-help-nav-group-label" size="xs" fw={700}>
                        {meta.label}
                      </Text>
                    </Group>
                    <Stack gap={2}>
                      {items.map((d) => (
                        <NavLink
                          key={d.id}
                          label={d.title}
                          active={d.id === activeId}
                          onClick={() => setActiveId(d.id)}
                          variant="subtle"
                          className="ohyna-help-nav-link"
                          classNames={{
                            root: "ohyna-help-nav-link-root",
                            label: "ohyna-help-nav-link-label",
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </ScrollArea>
        </aside>

        <Box className="ohyna-help-main">
          <Group
            className="ohyna-help-main-head"
            px="md"
            py={10}
            justify="space-between"
            wrap="nowrap"
            gap="sm"
          >
            <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
              {groupMeta && GroupIcon ? (
                <Badge
                  variant="light"
                  color={groupMeta.color}
                  size="sm"
                  radius="sm"
                  leftSection={<GroupIcon size={12} stroke={1.8} />}
                >
                  {groupMeta.label}
                </Badge>
              ) : null}
              <Text size="sm" fw={700} lh={1.25} truncate className="ohyna-help-main-title">
                {activeTitle}
              </Text>
            </Group>
            {loadingDoc && <Loader size={14} type="dots" />}
          </Group>

          <ScrollArea
            key={activeId || "empty"}
            className="ohyna-help-article"
            type="auto"
            offsetScrollbars
            viewportRef={articleViewportRef}
            startScrollPosition={{ x: 0, y: 0 }}
          >
            <Box className="ohyna-help-article-inner" p="lg">
              {error && (
                <Alert color="red" mb="md" title="読み込みエラー" radius="md">
                  {error}
                </Alert>
              )}
              {!error && !loadingDoc && !html && (
                <Box className="ohyna-help-empty">
                  <IconHelp size={28} stroke={1.4} />
                  <Text size="sm" c="dimmed" mt={8}>
                    左の一覧から項目を選んでください
                  </Text>
                </Box>
              )}
              {html ? (
                <div
                  className="ohyna-help-markdown"
                  onClick={onArticleClick}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : null}
            </Box>
          </ScrollArea>

          <Group
            className="ohyna-help-footer"
            px="md"
            py={8}
            justify="space-between"
            wrap="nowrap"
          >
            <Tooltip label={prevDoc ? prevDoc.title : "前の項目はありません"} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                radius="md"
                disabled={!prevDoc}
                aria-label="前の項目"
                onClick={() => prevDoc && setActiveId(prevDoc.id)}
              >
                <IconChevronLeft size={18} stroke={1.6} />
              </ActionIcon>
            </Tooltip>
            <Text size="xs" c="dimmed" ta="center" style={{ flex: 1 }} truncate>
              {flatIndex >= 0
                ? `${flatIndex + 1} / ${docs.length}`
                : loadingList
                  ? "…"
                  : ""}
            </Text>
            <Tooltip label={nextDoc ? nextDoc.title : "次の項目はありません"} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                radius="md"
                disabled={!nextDoc}
                aria-label="次の項目"
                onClick={() => nextDoc && setActiveId(nextDoc.id)}
              >
                <IconChevronRight size={18} stroke={1.6} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      </Box>
    </Modal>
  );
}
