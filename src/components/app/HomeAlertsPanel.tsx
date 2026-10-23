import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { BellRing, CheckCheck, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { homeAlertDurationLabel, type HomeAlertPreferences } from "@/lib/home-alert-preferences";
import type { HomeAlert } from "@/lib/home-alerts";
import "./home-notifications-carousel.css";

/** Shared complete layout: the settings preview renders the same shell as Home. */
export function HomeAlertsPanel({
  preferences, tone, total, selected = 0, paused = false, preview = false,
  onPrevious, onNext, onPause, onSeen, children, ...events
}: {
  preferences: HomeAlertPreferences;
  tone: HomeAlert["tone"];
  total: number;
  selected?: number;
  paused?: boolean;
  preview?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onPause?: () => void;
  onSeen?: () => void;
  children: ReactNode;
} & Pick<HTMLAttributes<HTMLElement>, "onFocusCapture" | "onBlurCapture" | "onKeyDown">) {
  const pauseVisible = preferences.showPause && preferences.rotation === "auto" && total > 1;
  const toolsVisible = pauseVisible || preferences.showSeen;
  const navigationVisible = total > 1 && (preferences.showArrows || preferences.showPosition);
  const rows = preferences.appearance === "ticket"
    ? [["heading", "heading"], ["body", "body"], ["tools", "navigation"], ["caption", "caption"]]
    : preferences.appearance === "banner"
      ? [["heading", "tools"], ["body", "body"], ["navigation", "navigation"], ["caption", "caption"]]
      : preferences.appearance === "outline"
        ? [["heading", "tools"], ["body", "navigation"], ["caption", "navigation"]]
        : preferences.appearance === "compact"
          ? [["heading", "tools"], ["body", "navigation"], ["caption", "caption"]]
          : [["heading", "tools"], ["body", "body"], ["caption", "navigation"]];
  const hidden = new Set([
    ...(!toolsVisible ? ["tools"] : []),
    ...(!navigationVisible ? ["navigation"] : []),
    ...(!preferences.showTiming ? ["caption"] : []),
  ]);
  const gridTemplateAreas = rows.map((row) => row.map((area) => hidden.has(area) ? "." : area))
    .filter((row) => row.some((area) => area !== "."))
    .map((row) => {
      if (row[1] === "." && ["heading", "body", "caption"].includes(row[0])) row[1] = row[0];
      return `"${row.join(" ")}"`;
    }).join(" ");
  return (
    <section
      className={`home-alerts home-alert-panel home-alerts--${preferences.appearance} home-alert-panel--${tone} ${toolsVisible ? "" : "home-alert-panel--no-tools"} ${navigationVisible ? "" : "home-alert-panel--no-navigation"} ${preferences.showTiming ? "" : "home-alert-panel--no-caption"}`}
      style={{ "--alert-size": preferences.sizePercent / 100, width: `${preferences.widthPercent}%`, gridTemplateAreas } as CSSProperties}
      role={preview ? undefined : "region"}
      aria-roledescription={preview ? undefined : "carrossel"}
      aria-label={preview ? "Prévia completa dos avisos" : "Notificações e vencimentos"}
      {...events}
    >
      <header className="home-alert-panel-heading">
        <span className="home-alert-panel-emblem" aria-hidden="true"><BellRing className="size-4" /></span>
        <h2>Avisos para você</h2>
        {preferences.showHeadingCount && <span className="home-alert-panel-counter">{selected + 1} de {total}</span>}
      </header>
      {toolsVisible && <div className="home-alert-panel-tools">
        {pauseVisible && (
          <button type="button" className="home-alert-control" disabled={preview}
            aria-label={paused ? "Continuar troca automática de avisos" : "Pausar troca automática de avisos"}
            aria-pressed={paused} onClick={onPause}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        )}
        {preferences.showSeen && <button type="button" className="home-alert-control" disabled={preview}
          aria-label="Marcar este aviso como visto" title="Marcar como visto nesta abertura do app" onClick={onSeen}>
          <CheckCheck className="size-4" />
        </button>}
      </div>}
      <div className="home-alert-panel-body">{children}</div>
      {preferences.showTiming && <p className="home-alert-panel-caption">
        {preferences.displaySeconds === 0 ? "Até marcar como visto ou concluir." : `Até ${homeAlertDurationLabel(preferences.displaySeconds)} · pendências voltam ao reabrir.`}
      </p>}
      {navigationVisible && (
        <nav className="home-alert-panel-navigation" aria-label="Navegar pelos avisos">
          {preferences.showArrows && <button type="button" className="home-alert-control" disabled={preview} aria-label="Aviso anterior" onClick={onPrevious}><ChevronLeft className="size-4" /></button>}
          {preferences.showPosition && <span className="home-alert-panel-page">{String(selected + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>}
          {preferences.showArrows && <button type="button" className="home-alert-control" disabled={preview} aria-label="Próximo aviso" onClick={onNext}><ChevronRight className="size-4" /></button>}
        </nav>
      )}
    </section>
  );
}
