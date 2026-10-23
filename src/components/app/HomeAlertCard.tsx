import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import {
  BellRing,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock3,
} from "lucide-react";
import { formatCurrency, shortDate } from "@/lib/mock-data";
import type { HomeAlert } from "@/lib/home-alerts";
import "./home-notifications-carousel.css";

/** The preview and the actual Home card use exactly this same presentation. */
export function HomeAlertCard({
  item,
  index = 0,
  total = 1,
  active = true,
  preview = false,
  onOpen,
}: {
  item: HomeAlert;
  index?: number;
  total?: number;
  active?: boolean;
  preview?: boolean;
  onOpen?: (item: HomeAlert) => void;
}) {
  const formatCurrency = usePrivateCurrency();
  const Icon =
    item.tone === "overdue"
      ? CircleAlert
      : item.tone === "message"
        ? BellRing
        : item.tone === "closing"
          ? CalendarClock
          : Clock3;
  const action = (
    <>
      {item.action}
      <ChevronRight className="size-4" />
    </>
  );
  return (
    <article
      className={`home-alert home-alert--${item.tone} min-w-0 flex-[0_0_100%]`}
      role={preview ? undefined : "group"}
      aria-roledescription={preview ? undefined : "slide"}
      aria-label={preview ? "Prévia do aviso" : `${index + 1} de ${total}`}
      aria-hidden={!active}
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
          <p className="home-alert-meta mt-1 text-[12px] leading-5 text-glass-sub">
            <span>
              {item.description ? `${item.description} · ` : ""}
              {shortDate(item.date)}
            </span>
            <span aria-hidden="true"> · </span>
            <strong className="home-alert-value amount-tabular whitespace-nowrap">
              {formatCurrency(item.amount)}
            </strong>
            {item.receiving ? <span> a receber</span> : null}
          </p>
          {preview ? (
            <span className="home-alert-open mt-2">{action}</span>
          ) : (
            <button
              type="button"
              className="home-alert-open mt-2"
              tabIndex={active ? 0 : -1}
              onClick={() => onOpen?.(item)}
            >
              {action}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
