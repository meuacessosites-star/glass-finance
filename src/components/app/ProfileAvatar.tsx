import type { AppProfile } from "@/lib/app-store";
import { DEFAULT_AVATAR_BG } from "@/lib/app-store";
import { cn } from "@/lib/utils";

/**
 * Renders a profile avatar — an emoji over the profile's background color, or
 * an uploaded photo with its zoom/pan crop applied — clipped to a circle.
 * Used everywhere a profile identity is shown (sidebar, profile list, home).
 * The parent controls the size via `className` (e.g. "size-11").
 */
export function ProfileAvatar({
  profile,
  className,
  emojiClassName,
}: {
  profile?: AppProfile | null;
  className?: string;
  emojiClassName?: string;
}) {
  const avatar = profile?.avatar;
  const image = avatar?.kind === "image" ? avatar.image : null;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{ backgroundColor: avatar?.bg || DEFAULT_AVATAR_BG }}
    >
      {image && avatar ? (
        <img
          src={image}
          alt=""
          draggable={false}
          className="size-full object-cover"
          style={{
            transform: `translate(${(
              avatar.crop.panX * (avatar.crop.scale - 1) * 50
            ).toFixed(2)}%, ${(
              avatar.crop.panY * (avatar.crop.scale - 1) * 50
            ).toFixed(2)}%) scale(${avatar.crop.scale})`,
          }}
        />
      ) : (
        <span className={cn("leading-none", emojiClassName)}>
          {avatar?.emoji || "👤"}
        </span>
      )}
    </div>
  );
}
