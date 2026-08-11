import type { LucideIcon } from "lucide-react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90",
        className,
      )}
    >
      {dark ? (
        <Sun className="size-[17px]" />
      ) : (
        <Moon className="size-[17px]" />
      )}
    </button>
  );
}

/** Tinted squircle icon used across list rows and quick actions. */
export function SquircleIcon({
  icon: Icon,
  color,
  size = "size-11",
  iconSize = "size-[19px]",
  className,
}: {
  icon: LucideIcon;
  color: string;
  size?: string;
  iconSize?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl",
        size,
        className,
      )}
      style={{ backgroundColor: `${color}1f` }}
    >
      <Icon className={iconSize} style={{ color }} strokeWidth={2.2} />
    </div>
  );
}
