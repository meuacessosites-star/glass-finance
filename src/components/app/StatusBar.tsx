import { BatteryFull, Signal, Wifi } from "lucide-react";

/** iPhone status bar: time + dynamic island (desktop only) + system icons. */
export function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-8 pb-2 pt-4">
      <div className="flex items-center justify-between text-[13px] font-semibold tracking-tight text-foreground">
        <span className="w-16">9:41</span>
        <div className="hidden h-7 w-28 rounded-full bg-black md:block" />
        <div className="flex w-16 items-center justify-end gap-1.5">
          <Signal className="size-[15px]" strokeWidth={2.4} />
          <Wifi className="size-[15px]" strokeWidth={2.4} />
          <BatteryFull className="size-[17px]" strokeWidth={2.2} />
        </div>
      </div>
    </div>
  );
}

/** iOS home indicator shown at the bottom of the frame. */
export function HomeIndicator({ className = "" }: { className?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-30 flex justify-center">
      <div className={`h-1 w-28 rounded-full bg-black/25 dark:bg-black/40 ${className}`} />
    </div>
  );
}
