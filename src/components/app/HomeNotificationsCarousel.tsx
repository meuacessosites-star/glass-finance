import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { useReducedMotion } from "framer-motion";
import {
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CheckCheck,
  Pause,
  Play,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { useLocalDate } from "@/hooks/use-local-date";
import { formatCurrency, shortDate } from "@/lib/mock-data";
import {
  createHomeAlertSession,
  getHomeAlerts,
  hideHomeAlert,
  registerHomeAlerts,
  visibleHomeAlerts,
  type HomeAlert,
} from "@/lib/home-alerts";
import { homeAlertDurationLabel } from "@/lib/home-alert-preferences";
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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenRequest, setSeenRequest] = useState<HomeAlert | null>(null);
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const activeIndex = Math.min(selected, Math.max(0, items.length - 1));
  const current = items[activeIndex];
  const rotating =
    preferences.rotation === "auto" &&
    items.length > 1 &&
    !paused &&
    !hovered &&
    !focused &&
    !seenRequest &&
    pageVisible &&
    !reducedMotion;

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
    carousel.on("select", sync).on("reInit", sync);
    return () => {
      carousel.off("select", sync).off("reInit", sync);
    };
  }, [carousel]);

  useEffect(() => {
    if (!carousel || !rotating) return;
    const timer = window.setInterval(
      () => carousel.scrollNext(),
      preferences.intervalSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [carousel, rotating, preferences.intervalSeconds]);

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
      <section
        className={`home-alerts home-alerts--${preferences.appearance} glass rounded-3xl p-3 sm:p-4`}
        role="region"
        aria-roledescription="carrossel"
        aria-label="Notificações e vencimentos"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            carousel?.scrollPrev();
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            carousel?.scrollNext();
          }
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[13px] font-bold text-glass-ink sm:text-[14px]">
            Avisos para você
          </h2>
          <span className="text-[11px] font-semibold tabular-nums text-glass-sub">
            {activeIndex + 1} de {items.length}
          </span>
          {preferences.rotation === "auto" &&
            items.length > 1 &&
            !reducedMotion && (
              <button
                type="button"
                className="home-alert-control"
                aria-label={
                  paused
                    ? "Continuar troca automática de avisos"
                    : "Pausar troca automática de avisos"
                }
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? (
                  <Play className="size-4" />
                ) : (
                  <Pause className="size-4" />
                )}
              </button>
            )}
          <button
            type="button"
            className="home-alert-control"
            aria-label="Marcar este aviso como visto"
            title="Marcar como visto nesta abertura do app"
            onClick={() => setSeenRequest(current)}
          >
            <CheckCheck className="size-4" />
          </button>
        </div>
        <div
          className="overflow-hidden rounded-2xl"
          ref={viewportRef}
          aria-live={rotating ? "off" : "polite"}
        >
          <div className="flex" style={{ touchAction: "pan-y pinch-zoom" }}>
            {items.map((item, index) => {
              const Icon =
                item.tone === "overdue"
                  ? CircleAlert
                  : item.tone === "message"
                    ? BellRing
                    : item.tone === "closing"
                      ? CalendarClock
                      : Clock3;
              return (
                <article
                  key={item.id}
                  className={`home-alert home-alert--${item.tone} min-w-0 flex-[0_0_100%]`}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} de ${items.length}`}
                  aria-hidden={index !== activeIndex}
                >
                  <div className="flex items-start gap-3">
                    <span className="home-alert-icon">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="home-alert-label">{item.label}</p>
                      <h3 className="mt-0.5 line-clamp-2 break-words text-[14px] font-bold leading-5 text-glass-ink sm:text-[15px]">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-[12px] leading-5 text-glass-sub">
                        {item.description ? `${item.description} · ` : ""}
                        {shortDate(item.date)} ·{" "}
                        <strong className="amount-tabular whitespace-nowrap">
                          {formatCurrency(item.amount)}
                        </strong>
                        {item.receiving ? " a receber" : ""}
                      </p>
                      <button
                        type="button"
                        className="home-alert-open mt-2"
                        tabIndex={index === activeIndex ? 0 : -1}
                        onClick={() => open(item)}
                      >
                        {item.action}
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 text-[10px] leading-4 text-glass-sub">
            {preferences.displaySeconds === 0
              ? "Até marcar como visto ou concluir."
              : `Até ${homeAlertDurationLabel(preferences.displaySeconds)} · pendências voltam ao reabrir.`}
          </p>
          {items.length > 1 && (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="home-alert-control"
                aria-label="Aviso anterior"
                onClick={() => carousel?.scrollPrev()}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                className="home-alert-control"
                aria-label="Próximo aviso"
                onClick={() => carousel?.scrollNext()}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </section>
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
