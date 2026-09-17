/** 主题切换按钮：深色 → 浅色 → 跟随系统 循环。 */

import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore, type Theme } from "@/state/themeStore";

const ORDER: Theme[] = ["dark", "light", "system"];
const META: Record<Theme, { label: string; Icon: typeof Moon }> = {
  dark: { label: "深色", Icon: Moon },
  light: { label: "浅色", Icon: Sun },
  system: { label: "跟随系统", Icon: Monitor },
};

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const { label, Icon } = META[theme];
  return (
    <button
      className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      onClick={() => setTheme(next)}
      title={`当前：${label}（点击切换到${META[next].label}）`}
    >
      <Icon className="size-4" />
    </button>
  );
}
