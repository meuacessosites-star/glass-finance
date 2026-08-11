import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/** Row of dots showing how many digits of the PIN have been entered. */
export function PinDots({
  length,
  max = 4,
  error = false,
}: {
  length: number;
  max?: number;
  error?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-3.5 rounded-full transition-all duration-150",
            i < length
              ? error
                ? "bg-[#FF3B30]"
                : "bg-glass-ink"
              : "bg-black/15 dark:bg-black/30",
          )}
        />
      ))}
    </div>
  );
}

/** iOS-style numeric keypad used to type the PIN. */
export function PinKeypad({
  onDigit,
  onBackspace,
  disabled = false,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  const keys: (string | "back")[] = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "", "0", "back",
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key, i) => {
        if (key === "") return <span key={i} aria-hidden />;
        if (key === "back") {
          return (
            <button
              key={i}
              type="button"
              aria-label="Apagar"
              disabled={disabled}
              onClick={onBackspace}
              className="flex h-16 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90 disabled:opacity-30"
            >
              <Delete className="size-6" strokeWidth={2} />
            </button>
          );
        }
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onDigit(key)}
            className="glass glass-strong flex h-16 items-center justify-center rounded-full text-[22px] font-semibold text-glass-ink transition-transform active:scale-90 disabled:opacity-30"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
