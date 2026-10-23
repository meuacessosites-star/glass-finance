import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { useReducedMotion } from "framer-motion";
import { useAppStore } from "@/lib/app-store";
import { useLocalDate } from "@/hooks/use-local-date";
import { HomeAlertCard } from "./HomeAlertCard";
import {
  canRotateHomeAlerts,
  nextHomeAlertIndex,
  startHomeAlertRotation,
} from "@/lib/home-alert-rotation";
import {
  createHomeAlertSession,
  getHomeAlerts,
  hideHomeAlert,
  registerHomeAlerts,
  visibleHomeAlerts,
  type HomeAlert,
} from "@/lib/home-alerts";
import { HomeAlertsPanel } from "./HomeAlertsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  loadHomeAlertSession,
  saveHomeAlertSession,
} from "@/lib/home-alert-session";
import "./home-notifications-carousel.css";

export function HomeNotificationsCarousel() {
  const { activeProfile } = useAppStore();
  if (!activeProfile) return null;
  return (
    <ProfileHomeCarousel key={activeProfile.id} profileId={activeProfile.id} />
  );
}

function ProfileHomeCarousel({ profileId }: { profileId: string }) {
  const {
    cards,
    visibleTransactions,
    loanReceivables,
    notifications,
    includeBorrowedCardInvoices,
    homeAlertPreferences: preferences,
  } = useAppStore();
  const today = useLocalDate();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const alerts = useMemo(
    () =>
      getHomeAlerts(
        {
          cards,
          transactions: visibleTransactions,
          loanReceivables,
          notifications,
          includeBorrowedCardInvoices,
        },
        today,
      ),
    [
      cards,
      visibleTransactions,
      loanReceivables,
      notifications,
      includeBorrowedCardInvoices,
      today,
    ],
  );
  const [session, setSession] = useState(() => {
    const value = preferences.enabled
      ? registerHomeAlerts(loadHomeAlertSession(profileId), alerts, Date.now())
      : loadHomeAlertSession(profileId);
    saveHomeAlertSession(profileId, value);
    return value;
  });
  const [tick, setTick] = useState(Date.now);
  const now = Math.max(tick, Date.now());
  const items = preferences.enabled
    ? visibleHomeAlerts(alerts, session, now, preferences.displaySeconds)
    : [];
  const [viewportRef, carousel] = useEmblaCarousel({
    loop: true,
    align: "start",
    duration: reducedMotion ? 0 : 25,
  });
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenRequest, setSeenRequest] = useState<HomeAlert | null>(null);
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const activeIndex = Math.min(selected, Math.max(0, items.length - 1));
  const current = items[activeIndex];
  const rotating = canRotateHomeAlerts({
    automatic: preferences.rotation === "auto",
    count: items.length,
    paused,
    keyboardFocused: focused,
    dragging,
    confirming: Boolean(seenRequest),
    pageVisible,
  });
  const go = (direction: number) => {
    if (carousel)
      carousel.scrollTo(
        nextHomeAlertIndex(
          carousel.selectedScrollSnap(),
          carousel.scrollSnapList().length,
          direction,
        ),
        Boolean(reducedMotion),
      );
  };

  useEffect(() => {
    if (preferences.enabled)
      setSession((previous) =>
        registerHomeAlerts(previous, alerts, Date.now()),
      );
  }, [alerts, profileId, preferences.enabled]);
  useEffect(() => {
    saveHomeAlertSession(profileId, session);
  }, [profileId, session]);

  useEffect(() => {
    const refresh = () => {
      setTick(Date.now());
      setPageVisible(document.visibilityState !== "hidden");
    };
    const reopen = (event: PageTransitionEvent) => {
      if (event.persisted) {
        const next = registerHomeAlerts(
          createHomeAlertSession(),
          alerts,
          Date.now(),
        );
        saveHomeAlertSession(profileId, next);
        setSession(next);
      }
      refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", reopen);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", reopen);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [alerts, profileId]);

  const nextExpiry =
    items.length && preferences.displaySeconds > 0
      ? Math.min(
          ...items.map(
            (item) =>
              (session.firstShownAt[item.id] ?? now) +
              preferences.displaySeconds * 1000,
          ),
        )
      : null;
  useEffect(() => {
    if (nextExpiry === null) return;
    const timer = window.setTimeout(
      () => setTick(Date.now()),
      Math.max(1, nextExpiry - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [nextExpiry]);

  useEffect(() => {
    if (!carousel) return;
    const sync = () => setSelected(carousel.selectedScrollSnap());
    sync();
    const dragStart = () => setDragging(true);
    const dragEnd = () => setDragging(false);
    carousel
      .on("select", sync)
      .on("reInit", sync)
      .on("pointerDown", dragStart)
      .on("pointerUp", dragEnd);
    return () => {
      carousel
        .off("select", sync)
        .off("reInit", sync)
        .off("pointerDown", dragStart)
        .off("pointerUp", dragEnd);
    };
  }, [carousel]);

  useEffect(() => {
    if (!carousel || !rotating) return;
    return startHomeAlertRotation(
      carousel,
      preferences.intervalSeconds,
      Boolean(reducedMotion),
    );
  }, [carousel, rotating, preferences.intervalSeconds, reducedMotion]);

  const hide = (id: string) => {
    const next = hideHomeAlert(session, id);
    saveHomeAlertSession(profileId, next);
    setSession(next);
  };
  const open = (item: HomeAlert) => {
    if (preferences.hideOnOpen) hide(item.id);
    navigate(item.destination.pathname, { state: item.destination.state });
  };
  if (!current) return null;

  return (
    <>
      <HomeAlertsPanel
        preferences={preferences}
        tone={current.tone}
        total={items.length}
        selected={activeIndex}
        paused={paused || focused}
        onPrevious={() => go(-1)}
        onNext={() => go(1)}
        onPause={() => {
          setPaused(!(paused || focused));
          setFocused(false);
        }}
        onSeen={() => setSeenRequest(current)}
        onFocusCapture={(event) =>
          setFocused((event.target as HTMLElement).matches(":focus-visible"))
        }
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            go(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            go(1);
          }
        }}
      >
        <div
          className="overflow-hidden rounded-2xl"
          ref={viewportRef}
          aria-live={rotating ? "off" : "polite"}
        >
          <div className="flex" style={{ touchAction: "pan-y pinch-zoom" }}>
            {items.map((item, index) => (
              <HomeAlertCard
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                active={index === activeIndex}
                onOpen={open}
              />
            ))}
          </div>
        </div>
      </HomeAlertsPanel>
      <AlertDialog
        open={seenRequest !== null}
        onOpenChange={(open) => {
          if (!open) setSeenRequest(null);
        }}
      >
        <AlertDialogContent className="glass-strong max-w-[calc(100%-2rem)] rounded-3xl bg-[#f5f8ff] text-glass-ink sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar este aviso como visto?</AlertDialogTitle>
            <AlertDialogDescription className="text-glass-sub">
              {seenRequest?.title}. O aviso sai da tela inicial nesta abertura.
              Se continuar pendente, poderá voltar ao reabrir o app. Isso não
              apaga a mensagem nem efetua pagamentos ou recebimentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-[#116762] text-white hover:bg-[#0d514e]"
              onClick={() => {
                if (seenRequest) hide(seenRequest.id);
                setSeenRequest(null);
              }}
            >
              Marcar como visto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
