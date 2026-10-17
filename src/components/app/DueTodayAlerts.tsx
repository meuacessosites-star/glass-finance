import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";
import { getDueTodayAlerts } from "@/lib/due-today";
import { useLocalDate } from "@/hooks/use-local-date";

export function DueTodayAlerts() {
  const navigate = useNavigate();
  const { activeProfile, cards, visibleTransactions, loanReceivables } = useAppStore();
  const today = useLocalDate();

  const dueToday = useMemo(
    () => getDueTodayAlerts(cards, visibleTransactions, loanReceivables),
    [cards, loanReceivables, visibleTransactions, today],
  );

  const alertKey = useMemo(
    () =>
      `${activeProfile?.id ?? "profile"}:${today}:${dueToday
        .map((item) => item.id)
        .sort()
        .join(",")}`,
    [activeProfile?.id, dueToday, today],
  );
  const displayedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!dueToday.length || displayedKey.current === alertKey) return;

    const storageKey = `granascan:due-today-alert:${alertKey}`;
    try {
      if (window.sessionStorage.getItem(storageKey) === "shown") {
        displayedKey.current = alertKey;
        return;
      }
      window.sessionStorage.setItem(storageKey, "shown");
    } catch {
      // A restricted storage environment should not prevent the visual alert.
    }

    displayedKey.current = alertKey;
    const visibleItems = dueToday.slice(0, 3).map((item) => item.label).join(" • ");
    const remaining = dueToday.length - 3;
    toast.warning(
      `${dueToday.length} aviso${dueToday.length === 1 ? "" : "s"} de pagamento`,
      {
        description: `${visibleItems}${remaining > 0 ? ` • +${remaining} outra${remaining === 1 ? "" : "s"}` : ""}`,
        duration: 9000,
        action: {
          label: "Ver avisos",
          onClick: () => navigate("/dashboard/notificacoes"),
        },
      },
    );
  }, [alertKey, dueToday, navigate]);

  return null;
}
