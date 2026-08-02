import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export type UnsavedChangesAction =
  | "new-empty"
  | "new-sample"
  | "open"
  | "close";

const ACTION_LABEL: Record<UnsavedChangesAction, string> = {
  "new-empty": "空のドキュメントにする",
  "new-sample": "サンプルから作成する",
  open: "別のファイルを開く",
  close: "ドキュメントを閉じる",
};

export function UnsavedChangesModal({
  opened,
  action,
  docLabel,
  saving,
  onCancel,
  onDiscard,
  onSave,
}: {
  opened: boolean;
  action: UnsavedChangesAction | null;
  /** 表示用のドキュメント名（無題可） */
  docLabel: string;
  saving?: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const actionLabel = action ? ACTION_LABEL[action] : "";

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title="保存していない変更があります"
      centered
      size="md"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Stack gap="md">
        <Text size="sm">
          「{docLabel}」への変更が保存されていません。
          {actionLabel ? `${actionLabel}前にどうしますか？` : ""}
        </Text>
        <Group justify="flex-end" gap="xs" wrap="wrap">
          <Button
            variant="default"
            disabled={saving}
            onClick={onDiscard}
          >
            保存しない
          </Button>
          <Button variant="default" disabled={saving} onClick={onCancel}>
            キャンセル
          </Button>
          <Button
            color="blue"
            loading={saving}
            onClick={onSave}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
