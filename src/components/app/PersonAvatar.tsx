import { avatarInk, personAvatarLetters } from "@/lib/person-avatar";
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

  let content: ReactNode = personAvatarLetters(name, avatarType === "letters" ? avatarValue : undefined);
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
      style={{ backgroundColor, color: avatarInk(backgroundColor) }}
      aria-hidden="true"
    >
      {content}
    </span>
  );
}
