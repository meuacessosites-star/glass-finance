/** iOS home indicator shown at the bottom of the frame. */
export function HomeIndicator({ className = "" }: { className?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-30 hidden justify-center md:flex">
      <div className={`h-1 w-28 rounded-full bg-black/25 dark:bg-black/40 ${className}`} />
    </div>
  );
}
