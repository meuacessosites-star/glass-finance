import { cn } from "@/lib/utils";

/**
 * Bright, cool aurora backdrop shared by the landing, auth and app shell.
 * Layered blurred blobs over a soft vertical gradient — always LIGHT.
 */
export function AppBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#dcebfe] via-[#eef1fe] to-white dark:from-[#131923] dark:via-[#171c28] dark:to-[#11171e]" />
      <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full bg-aurora-1 opacity-40 blur-[80px] dark:opacity-15" />
      <div className="absolute -right-28 top-1/3 h-96 w-96 rounded-full bg-aurora-2 opacity-30 blur-[90px] dark:opacity-10" />
      <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-aurora-3 opacity-30 blur-[80px] dark:opacity-15" />
      <div className="absolute right-10 top-16 h-40 w-40 rounded-full bg-aurora-1 opacity-25 blur-[60px] dark:opacity-15" />
    </div>
  );
}
