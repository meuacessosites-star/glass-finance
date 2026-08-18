import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type ScrollControlsProps = {
  containerId?: string;
};

type ScrollTarget = HTMLElement | Window;
type ScrollDirection = "up" | "down";

function getScrollTarget(containerId?: string): ScrollTarget {
  if (containerId) {
    const container = document.getElementById(containerId);
    if (container) return container;
  }
  return window;
}

function hasOverflow(target: ScrollTarget) {
  if (target instanceof HTMLElement) {
    return target.scrollHeight > target.clientHeight + 8;
  }
  return document.documentElement.scrollHeight > window.innerHeight + 8;
}

function getScrollTop(target: ScrollTarget) {
  if (target instanceof HTMLElement) return target.scrollTop;
  return window.scrollY;
}

function getMaxScrollTop(target: ScrollTarget) {
  if (target instanceof HTMLElement) {
    return Math.max(0, target.scrollHeight - target.clientHeight);
  }
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

export function ScrollControls({ containerId }: ScrollControlsProps) {
  const [visible, setVisible] = useState(false);
  const [scrollable, setScrollable] = useState(true);
  const [direction, setDirection] = useState<ScrollDirection>("down");
  const hideTimer = useRef<number | null>(null);
  const settleFrame = useRef<number | null>(null);
  const directionRef = useRef<ScrollDirection>("down");
  const lastScrollTop = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const reveal = useCallback(
    (nextDirection?: ScrollDirection) => {
      clearHideTimer();

      if (nextDirection && nextDirection !== directionRef.current) {
        directionRef.current = nextDirection;
        setDirection(nextDirection);
      }

      setVisible(true);
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        hideTimer.current = null;
      }, 2500);
    },
    [clearHideTimer],
  );

  useEffect(() => {
    const target = getScrollTarget(containerId);
    lastScrollTop.current = getScrollTop(target);

    const refreshScrollableState = () => {
      const canScroll = hasOverflow(target);
      setScrollable(canScroll);
      if (canScroll) reveal();
    };

    const handleScroll = () => {
      const currentScrollTop = getScrollTop(target);
      const delta = currentScrollTop - lastScrollTop.current;
      const nextDirection =
        delta < -1 ? "up" : delta > 1 ? "down" : directionRef.current;

      lastScrollTop.current = currentScrollTop;
      const canScroll = hasOverflow(target);
      setScrollable(canScroll);
      if (canScroll) reveal(nextDirection);
    };

    refreshScrollableState();
    target.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pointermove", refreshScrollableState, { passive: true });
    window.addEventListener("touchstart", refreshScrollableState, { passive: true });
    window.addEventListener("touchmove", refreshScrollableState, { passive: true });
    window.addEventListener("keydown", refreshScrollableState);
    window.addEventListener("resize", refreshScrollableState);

    return () => {
      target.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pointermove", refreshScrollableState);
      window.removeEventListener("touchstart", refreshScrollableState);
      window.removeEventListener("touchmove", refreshScrollableState);
      window.removeEventListener("keydown", refreshScrollableState);
      window.removeEventListener("resize", refreshScrollableState);
      clearHideTimer();
      if (settleFrame.current !== null) {
        window.cancelAnimationFrame(settleFrame.current);
        settleFrame.current = null;
      }
    };
  }, [clearHideTimer, containerId, reveal]);

  const scrollTo = (position: ScrollDirection) => {
    const target = getScrollTarget(containerId);
    const top = position === "up" ? 0 : getMaxScrollTop(target);

    target.scrollTo({
      top,
      behavior: "smooth",
    });
    reveal(position);

    if (settleFrame.current !== null) {
      window.cancelAnimationFrame(settleFrame.current);
    }

    let frameCount = 0;
    const settleAtDestination = () => {
      const currentTop = getScrollTop(target);
      const reachedDestination = Math.abs(currentTop - top) <= 2;
      if (reachedDestination || frameCount >= 120) {
        settleFrame.current = null;
        reveal(position === "up" ? "down" : "up");
        return;
      }
      frameCount += 1;
      settleFrame.current = window.requestAnimationFrame(settleAtDestination);
    };

    settleFrame.current = window.requestAnimationFrame(settleAtDestination);
  };

  const controlIsVisible = visible && scrollable;

  return (
    <div
      aria-label="Controles de rolagem"
      className={cn(
        "pointer-events-none fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-50 flex flex-col gap-2 transition-opacity duration-300 sm:right-5 md:bottom-8",
        controlIsVisible ? "opacity-100" : "opacity-0",
      )}
    >
      {direction === "up" ? (
        <button
          type="button"
          aria-label="Rolar para o topo"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => scrollTo("up")}
          tabIndex={controlIsVisible ? 0 : -1}
          className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-glass-sub shadow-[0_8px_24px_-12px_rgba(35,60,110,0.65)] backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 dark:border-white/30 dark:bg-white/90"
        >
          <ChevronUp className="size-4" strokeWidth={2.5} />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Rolar para o final"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => scrollTo("down")}
          tabIndex={controlIsVisible ? 0 : -1}
          className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-glass-sub shadow-[0_8px_24px_-12px_rgba(35,60,110,0.65)] backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 dark:border-white/30 dark:bg-white/90"
        >
          <ChevronDown className="size-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
