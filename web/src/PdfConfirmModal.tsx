import { Button, Group, Modal, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconDeviceFloppy, IconPrinter } from "@tabler/icons-react";
import { PdfPreview } from "./PdfPreview";

type Props = {
  opened: boolean;
  url: string | null;
  filename: string;
  onClose: () => void;
  onSave: () => void;
  onPrint: () => void;
};

/** 生成完了後に開く PDF 確認。閉じるはヘッダ ✕。ツールバーは保存／印刷。 */
export function PdfConfirmModal({
  opened,
  url,
  filename,
  onClose,
  onSave,
  onPrint,
}: Props) {
  const isNarrow = useMediaQuery("(max-width: 768px)");

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="PDF確認"
      size={isNarrow ? "100%" : "90vw"}
      fullScreen={!!isNarrow}
      centered={!isNarrow}
      padding={0}
      radius={isNarrow ? 0 : "md"}
      closeButtonProps={{ "aria-label": "閉じる" }}
      transitionProps={{ transition: "fade", duration: 160 }}
      overlayProps={{ backgroundOpacity: 0.55 }}
      classNames={{
        content: "ohyna-pdf-modal-content",
        body: "ohyna-pdf-modal-body",
        header: "ohyna-pdf-modal-header",
      }}
    >
      <div className="ohyna-pdf-modal-toolbar">
        <Text size="sm" c="dimmed" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
          {isNarrow
            ? filename
            : `${filename} — 内容を確認して保存または印刷してください`}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            variant="default"
            leftSection={<IconPrinter size={16} stroke={1.5} />}
            onClick={onPrint}
            disabled={!url}
          >
            印刷
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} stroke={1.5} />}
            onClick={onSave}
            disabled={!url}
          >
            PDFを保存
          </Button>
        </Group>
      </div>
      <div className="ohyna-pdf-modal-stage">
        <PdfPreview url={url} />
      </div>
    </Modal>
  );
}
