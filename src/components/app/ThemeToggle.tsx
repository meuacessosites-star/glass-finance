import type { LucideIcon } from "lucide-react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setMounted(true), []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90",
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
  image,
  className,
  backgroundColor,
  strokeWidth = 2.2,
}: {
  icon: LucideIcon;
  color: string;
  size?: string;
  iconSize?: string;
  image?: string;
  className?: string;
  backgroundColor?: string;
  strokeWidth?: number;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl",
        size,
        className,
      )}
      style={{ backgroundColor: backgroundColor ?? `${color}1f` }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="size-full rounded-2xl object-cover"
        />
      ) : (
        <Icon className={iconSize} style={{ color }} strokeWidth={strokeWidth} />
      )}
    </div>
  );
}
