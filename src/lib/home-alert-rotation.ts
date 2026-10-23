type Carousel = {
  selectedScrollSnap(): number;
  scrollSnapList(): number[];
  scrollTo(index: number, jump?: boolean): void;
};
export function nextHomeAlertIndex(
  current: number,
  count: number,
  direction = 1,
): number {
  return count > 0 ? (((current + direction) % count) + count) % count : 0;
}
export function canRotateHomeAlerts(options: {
  automatic: boolean;
  count: number;
  paused: boolean;
  keyboardFocused: boolean;
  dragging: boolean;
  confirming: boolean;
  pageVisible: boolean;
}): boolean {
  return (
    options.automatic &&
    options.count > 1 &&
    !options.paused &&
    !options.keyboardFocused &&
    !options.dragging &&
    !options.confirming &&
    options.pageVisible
  );
}
type Schedule = (tick: () => void, milliseconds: number) => () => void;
export function startHomeAlertRotation(
  carousel: Carousel,
  seconds: number,
  jump: boolean,
  schedule: Schedule = (tick, milliseconds) => {
    const timer = globalThis.setInterval(tick, milliseconds);
    return () => globalThis.clearInterval(timer);
  },
): () => void {
  return schedule(() => {
    const count = carousel.scrollSnapList().length;
    if (count > 1)
      carousel.scrollTo(
        nextHomeAlertIndex(carousel.selectedScrollSnap(), count),
        jump,
      );
  }, seconds * 1000);
}
