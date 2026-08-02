import { ActionIcon, Menu, Tooltip, useMantineColorScheme } from "@mantine/core";
import {
  IconCheck,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";

const OPTIONS = [
  { value: "light" as const, label: "明るい表示", icon: IconSun },
  { value: "dark" as const, label: "暗い表示", icon: IconMoon },
  { value: "auto" as const, label: "システムに合わせる", icon: IconDeviceDesktop },
];

export function ColorSchemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const ActiveIcon =
    colorScheme === "dark"
      ? IconMoon
      : colorScheme === "light"
        ? IconSun
        : IconDeviceDesktop;

  return (
    <Menu shadow="md" width={220} position="bottom-start">
      <Menu.Target>
        <Tooltip label="表示の明るさ" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="表示の明るさ"
          >
            <ActiveIcon size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>表示</Menu.Label>
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = colorScheme === opt.value;
          return (
            <Menu.Item
              key={opt.value}
              leftSection={<Icon size={16} stroke={1.5} />}
              rightSection={
                active ? <IconCheck size={14} stroke={1.5} /> : null
              }
              onClick={() => setColorScheme(opt.value)}
            >
              {opt.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
