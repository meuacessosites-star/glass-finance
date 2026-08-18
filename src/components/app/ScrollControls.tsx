import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type ScrollControlsProps = {
  containerId?: string;
};

type ScrollTarget = HTMLElement | Window;

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

function getScrollHeight(target: ScrollTarget) {
  if (target instanceof HTMLElement) return target.scrollHeight;
  return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
}

export function ScrollControls({ containerId }: ScrollControlsProps) {
  const [visible, setVisible] = useState(false);
  const [scrollable, setScrollable] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    clearHideTimer();
    setVisible(true);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      hideTimer.current = null;
    }, 2500);
  }, [clearHideTimer]);

  useEffect(() => {
    const target = getScrollTarget(containerId);

    const handleActivity = () => {
      const canScroll = hasOverflow(target);
      setScrollable(canScroll);
      if (canScroll) reveal();
    };

    handleActivity();
    target.addEventListener("scroll", handleActivity, { passive: true });
    window.addEventListener("pointermove", handleActivity, { passive: true });
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("touchmove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("resize", handleActivity);

    return () => {
      target.removeEventListener("scroll", handleActivity);
      window.removeEventListener("pointermove", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("touchmove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("resize", handleActivity);
      clearHideTimer();
    };
  }, [clearHideTimer, containerId, reveal]);

  const scrollTo = (position: "top" | "bottom") => {
    const target = getScrollTarget(containerId);
    target.scrollTo({
      top: position === "top" ? 0 : getScrollHeight(target),
      behavior: "smooth",
    });
    reveal();
  };

  return (
    <div
      aria-label="Controles de rolagem"
      className={cn(
        "pointer-events-none fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-30 flex flex-col gap-2 transition-opacity duration-300 sm:right-5 md:bottom-8",
        visible && scrollable ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        aria-label="Rolar para o topo"
        onClick={() => scrollTo("top")}
        tabIndex={visible && scrollable ? 0 : -1}
        className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-glass-sub shadow-[0_8px_24px_-12px_rgba(35,60,110,0.65)] backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 dark:border-white/30 dark:bg-white/90"
      >
        <ChevronUp className="size-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-label="Rolar para o final"
        onClick={() => scrollTo("bottom")}
        tabIndex={visible && scrollable ? 0 : -1}
        className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-glass-sub shadow-[0_8px_24px_-12px_rgba(35,60,110,0.65)] backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 dark:border-white/30 dark:bg-white/90"
      >
        <ChevronDown className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
