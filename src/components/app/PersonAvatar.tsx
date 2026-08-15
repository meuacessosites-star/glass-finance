import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type PersonAvatarData = {
  name: string;
  avatarType?: "letters" | "emoji" | "foto";
  avatarValue?: string;
  backgroundColor?: string;
};

type PersonAvatarProps = PersonAvatarData & {
  size?: "sm" | "md" | "lg";
  className?: string;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function PersonAvatar({
  name,
  avatarType = "letters",
  avatarValue,
  backgroundColor = "#E8EEFF",
  size = "md",
  className,
}: PersonAvatarProps) {
  const sizeClass = {
    sm: "size-8 text-[11px]",
    md: "size-10 text-[13px]",
    lg: "size-16 text-xl",
  }[size];

  let content: ReactNode = initials(name);
  if (avatarType === "emoji") content = avatarValue || "🙂";
  if (avatarType === "foto" && avatarValue) {
    content = (
      <img
        src={avatarValue}
        alt=""
        className="size-full rounded-full object-cover"
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-glass-ink",
        sizeClass,
        className,
      )}
      style={{ backgroundColor }}
      aria-hidden="true"
    >
      {content}
    </span>
  );
}
