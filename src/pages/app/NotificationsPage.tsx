import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import {
  NOTIFICATION_RETENTION_OPTIONS,
  notificationExpiry,
  isNotificationExpired,
} from "@/lib/notification-history";
import "@/components/app/notifications.css";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Settings2,
  Check,
  CheckCheck,
  CircleAlert,
  Clock3,
  CalendarDays,
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileText,
  HandCoins,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { HomeAlertSettings } from "@/components/app/HomeAlertSettings";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { LoanTransactionSheet } from "@/components/app/LoanTransactionSheet";
import { LoanEditDialog } from "@/components/app/LoanEditDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useAppStore, type AppNotification } from "@/lib/app-store";
import { formatCurrency, shortDate } from "@/lib/mock-data";
import {
  getCurrentInvoiceMonth,
  isCreditCardExpense,
} from "@/lib/card-billing";
import { notificationRecord } from "@/lib/notification-actions";
import { searchApprovedNotifications } from "@/lib/notification-search";
import { hideHomePaymentAlerts } from "@/lib/home-alert-session";
import {
  getPaymentNotifications,
  type PaymentNotification,
} from "@/lib/payment-notifications";
import { transactionToFormValues } from "@/lib/transaction-form-values";
import { useLocalDate } from "@/hooks/use-local-date";

const action = "notification-action";
const primary = `${action} notification-action--approve`;
const restoreAction = `${action} notification-action--restore`;
const readAction = `${action} notification-action--read`;
const neutralAction = `${action} notification-action--neutral`;
const muted = "text-[12px] leading-relaxed text-glass-sub";
type View = "overview" | "pending" | "approved" | "ignored" | "payments";
const titles: Record<View, string> = {
  overview: "Notificações",
  pending: "Pendentes",
  approved: "Aprovadas",
  ignored: "Ignoradas",
  payments: "Avisos de pagamento",
};

export default function NotificationsPage() {
  const { activeProfile } = useAppStore();
  return <NotificationInbox key={activeProfile?.id} />;
}

function NotificationInbox() {
  const formatCurrency = usePrivateCurrency();
  const store = useAppStore();
  const {
    cards,
    transactions,
    visibleTransactions,
    loanReceivables,
    categories,
    notifications,
    ignoredNotificationCount,
    readPaymentNotificationIds,
    includeBorrowedCardInvoices,
  } = store;
  const location = useLocation();
  const routeMessageId = (location.state as { notificationId?: string } | null)?.notificationId;
  const navigate = useNavigate();
  const formHost =
    typeof document === "undefined"
      ? null
      : (document.getElementById("app-screen") ?? document.body);
  const today = useLocalDate();
  const [view, setView] = useState<View>(routeMessageId ? "pending" : "overview");
  const [messageTarget, setMessageTarget] = useState<string | null>(routeMessageId ?? null);
  const [retentionDraft, setRetentionDraft] = useState<number | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [approvedQuery, setApprovedQuery] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [review, setReview] = useState<
    "transaction" | "loan" | "loan-edit" | null
  >(null);
  const [selection, setSelection] = useState<{
    mode: "approve" | "restore";
    ids: string[];
  } | null>(null);
  const [ignoreIds, setIgnoreIds] = useState<string[] | null>(null);
  const [readRequest, setReadRequest] = useState<{
    ids: string[];
    all: boolean;
  } | null>(null);
  const pending = notifications.filter((n) => n.status === "pending");
  const approved = notifications.filter((n) => n.status === "approved");
  const filteredApproved = useMemo(() => searchApprovedNotifications({
    notifications, transactions, loanReceivables, categories, cards,
  }, approvedQuery), [notifications, transactions, loanReceivables, categories, cards, approvedQuery]);
  const payments = getPaymentNotifications(
    {
      cards,
      transactions: visibleTransactions,
      loanReceivables,
      readPaymentNotificationIds,
      includeBorrowedCardInvoices,
    },
    today,
  );
  const selectedPendingIds = pendingSelection.filter((id) =>
    pending.some((n) => n.id === id),
  );
  const retentionRemovals =
    retentionDraft === null
      ? 0
      : notifications.filter((n) => isNotificationExpired(n, retentionDraft))
          .length;
  const readTargets = payments.filter((item) =>
    readRequest?.ids.includes(item.id),
  );
  const current = pending.find((n) => n.id === queue[0]);
  const linked = current
    ? notificationRecord({ transactions, loanReceivables }, current)
    : undefined;
  const linkedTransaction =
    linked?.kind === "transaction"
      ? transactions.find((row) => row.id === linked.id)
      : undefined;
  const linkedLoan =
    linked?.kind === "loan"
      ? loanReceivables.find((row) => row.id === linked.id)
      : undefined;
  const validCard = current
    ? cards.find((card) => card.id === current.cardId && !card.archived)
    : undefined;
  const transactionInitial = useMemo(
    () =>
      current
        ? transactionToFormValues(
            linkedTransaction ?? {
              id: "review",
              title: current.merchant,
              amount: -current.amount,
              date: current.date,
              time: current.time,
              categoryId:
                categories.find((c) => c.id === current.categoryId)?.id ??
                categories[0]?.id ??
                "",
              note: `Notificação de ${current.bank}`,
              paymentMethod: validCard ? "cartao" : "pix",
              cardMode: validCard ? "credito" : undefined,
              cardId: validCard?.id,
              paymentStatus: "pending",
            },
          )
        : undefined,
    [current, linkedTransaction, categories, validCard],
  );
  const selectionItems = selection?.mode === "approve" ? pending : approved;
  const selectedIds =
    selection?.ids.filter((id) => selectionItems.some((n) => n.id === id)) ??
    [];

  useEffect(() => {
    if (queue.length && !current) {
      setReview(null);
      setQueue((ids) => ids.slice(1));
    }
  }, [current, queue.length]);

  useEffect(() => {
    document.getElementById("app-content-scroll")?.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => {
    setMessageTarget(routeMessageId ?? null);
    if (routeMessageId) setView("pending");
  }, [location.key]);
  useEffect(() => {
    if (!messageTarget || view !== "pending") return;
    const frame = requestAnimationFrame(() => {
      const message = Array.from(document.querySelectorAll<HTMLElement>("[data-notification-id]"))
        .find((element) => element.dataset.notificationId === messageTarget);
      message?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
      message?.focus({ preventScroll: true });
      setMessageTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [messageTarget, view]);

  const stopReview = () => {
    setReview(null);
    setQueue([]);
  };
  const finishReview = () => {
    if (current) store.approveNotification(current.id);
    setReview(null);
    setQueue((ids) => ids.slice(1));
  };
  const openRecord = (n: AppNotification) => {
    const record = notificationRecord({ transactions, loanReceivables }, n);
    if (!record) {
      toast("O registro vinculado não está mais disponível");
      return;
    }
    navigate(
      record.kind === "loan"
        ? "/dashboard/emprestimos"
        : "/dashboard/transacoes",
      {
        state:
          record.kind === "loan"
            ? { receivableId: record.id }
            : { transactionId: record.id },
      },
    );
  };
  const openPayment = (item: PaymentNotification) => {
    if (store.activeProfile && store.homeAlertPreferences.hideOnOpen) hideHomePaymentAlerts(store.activeProfile.id, [item]);
    if (item.kind === "invoice")
      navigate("/dashboard/compras-cartao", {
        state: { cardId: item.cardId, invoiceMonth: item.invoiceMonth },
      });
    else if (item.kind === "loan")
      navigate("/dashboard/emprestimos", {
        state: { receivableId: item.receivableId },
      });
    else
      navigate("/dashboard/transacoes", {
        state: { transactionId: item.transactionId },
      });
  };
  const requestRead = (ids: string[], all = false) => {
    setReadRequest({ ids: [...new Set(ids)], all });
  };
  const confirmRead = () => {
    if (!readTargets.length) return;
    if (store.activeProfile) hideHomePaymentAlerts(store.activeProfile.id, readTargets);
    store.markPaymentNotificationsRead(readTargets.map((item) => item.id));
    toast(
      readTargets.length === 1
        ? "Aviso marcado como lido"
        : "Avisos marcados como lidos",
    );
    setReadRequest(null);
  };
  const renderMessage = (n: AppNotification) => {
    const record = notificationRecord({ transactions, loanReceivables }, n);
    const transaction =
      record?.kind === "transaction"
        ? transactions.find((row) => row.id === record.id)
        : undefined;
    const category = categories.find((item) => item.id === n.categoryId);
    const messageCard = cards.find((item) => item.id === n.cardId);
    const savedLoan =
      record?.kind === "loan"
        ? loanReceivables.find((row) => row.id === record.id)
        : undefined;
    const invoiceCardId =
      transaction && isCreditCardExpense(transaction)
        ? transaction.cardId
        : savedLoan?.operationType === "card"
          ? savedLoan.cardId
          : undefined;
    const invoiceMonth =
      transaction && isCreditCardExpense(transaction)
        ? getCurrentInvoiceMonth(
            transaction,
            cards.find((card) => card.id === transaction.cardId),
          )
        : savedLoan?.cardInvoiceMonth;
    return (
      <article
        key={n.id}
        data-notification-id={n.id}
        tabIndex={-1}
        className={`glass notification-card ${n.status === "approved" ? "notification-card--approved" : "notification-card--pending"} space-y-3 rounded-3xl p-4`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="break-words text-[15px] font-bold text-glass-ink">
              {n.merchant}
            </h3>
            <p className={muted}>
              {n.bank} · {shortDate(n.date)}
              {n.time ? ` às ${n.time}` : ""}
            </p>
          </div>
          <p className="amount-tabular text-[16px] font-bold text-[#be252c]">
            {formatCurrency(n.amount)}
          </p>
        </div>
        {(category || messageCard) && (
          <p className="notification-detail">
            {category?.label}
            {category && messageCard ? " · " : ""}
            {messageCard ? `${messageCard.name} ····${messageCard.last4}` : ""}
          </p>
        )}
        <p
          className="flex items-start gap-2 text-[12px] font-semibold leading-relaxed"
          style={{ color: "var(--notice-ink)" }}
        >
          {n.status === "approved" ? (
            <CheckCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Clock3 className="mt-0.5 size-4 shrink-0" />
          )}
          {n.status === "approved"
            ? `Aprovada${record ? ` · salva em ${record.kind === "loan" ? "Empréstimos" : "Transações"}` : ""}`
            : record || n.recordKind
              ? "Aguardando sua revisão"
              : "Aguardando sua revisão"}
        </p>
        {n.approvedAt && (
          <p className={muted}>
            {notificationExpiry(n, store.notificationRetentionDays)
              ? `Disponível até ${new Date(notificationExpiry(n, store.notificationRetentionDays)!).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
              : "Sem expiração"}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {n.status === "pending" ? (
            <>
              <label
                className="notification-select"
                title="Selecionar mensagem"
              >
                <input
                  type="checkbox"
                  className="size-5 accent-[#713eaa]"
                  aria-label={`Selecionar ${n.merchant}`}
                  checked={selectedPendingIds.includes(n.id)}
                  onChange={(event) =>
                    setPendingSelection((ids) =>
                      event.target.checked
                        ? [...new Set([...ids, n.id])]
                        : ids.filter((id) => id !== n.id),
                    )
                  }
                />
              </label>
              <button className={primary} onClick={() => setQueue([n.id])}>
                <Check className="size-4" />
                Aprovar
              </button>
            </>
          ) : (
            <>
              <button className={action} onClick={() => openRecord(n)}>
                <FileText className="size-4" />
                {record?.kind === "loan" ? "Ver empréstimo" : "Ver transação"}
              </button>
              {invoiceCardId && invoiceMonth && (
                <button
                  className={action}
                  onClick={() =>
                    navigate("/dashboard/compras-cartao", {
                      state: { cardId: invoiceCardId, invoiceMonth },
                    })
                  }
                >
                  <CreditCard className="size-4" />
                  Ver fatura
                </button>
              )}
              <button
                className={restoreAction}
                onClick={() => setSelection({ mode: "restore", ids: [n.id] })}
              >
                <RotateCcw className="size-4" />
                Refazer
              </button>
            </>
          )}
          <button
            className={`${action} notification-action--ignore`}
            onClick={() => setIgnoreIds([n.id])}
          >
            <Trash2 className="size-4" />
            Ignorar
          </button>
        </div>
      </article>
    );
  };
  const renderPayment = (item: PaymentNotification) => {
    const label =
      item.phase === "overdue"
        ? "Em atraso"
        : item.phase === "today"
          ? "Vence hoje"
          : item.phase === "closing"
            ? "Fecha hoje"
            : item.event === "closing"
              ? "Próximo fechamento"
              : "Próximo vencimento";
    return (
      <article
        key={item.id}
        className={`glass notification-card notification-card--${item.phase === "closing" || item.event === "closing" ? "closing" : item.phase} space-y-3 rounded-3xl p-4`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-[14px] font-bold text-glass-ink">
            {item.title}
          </h3>
          <span className="notification-status">
            {item.phase === "overdue" ? (
              <CircleAlert className="size-3.5 shrink-0" />
            ) : item.event === "closing" ? (
              <CalendarClock className="size-3.5 shrink-0" />
            ) : (
              <Clock3 className="size-3.5 shrink-0" />
            )}
            {label}
          </span>
        </div>
        <p className="notification-date flex flex-wrap items-center gap-2">
          <CalendarDays className="size-4 shrink-0" />
          {shortDate(item.date)} <span aria-hidden="true">·</span>
          <strong
            className={`amount-tabular text-[16px] ${item.receiving ? "text-[#17613e]" : "text-glass-ink"}`}
          >
            {formatCurrency(item.amount)}
          </strong>
          {item.receiving ? " a receber" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={action} onClick={() => openPayment(item)}>
            {item.kind === "invoice"
              ? "Ver fatura"
              : item.kind === "loan"
                ? "Ver empréstimo"
                : "Ver transação"}
            <ChevronRight className="size-4" />
          </button>
          {item.kind === "loan" && item.cardId && item.invoiceMonth && (
            <button
              className={action}
              onClick={() =>
                navigate("/dashboard/compras-cartao", {
                  state: {
                    cardId: item.cardId,
                    invoiceMonth: item.invoiceMonth,
                  },
                })
              }
            >
              Ver fatura
            </button>
          )}
          <button className={readAction} onClick={() => requestRead([item.id])}>
            <Check className="size-4" />
            Marcar como lido
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="notification-page space-y-4">
      <SettingsHeader
        title={titles[view]}
        onBack={view === "overview" ? undefined : () => setView("overview")}
      />
      <div className={view === "overview" || view === "payments" ? "notification-toolbar" : "flex flex-wrap gap-2"}>
        <button
          className={`${action} notification-action--history`}
          onClick={() => setRetentionDraft(store.notificationRetentionDays)}
        >
          <Settings2 className="size-4" />
          <span>Guardar aprovadas:{" "}
          {store.notificationRetentionDays
            ? `${store.notificationRetentionDays} dias`
            : "sempre"}</span>
        </button>
        {(view === "overview" || view === "payments") && (
          <>
            <HomeAlertSettings />
            <button
              className={readAction}
              disabled={payments.length === 0}
              onClick={() => requestRead(payments.map((row) => row.id), true)}
            >
              <CheckCheck className="size-4" />
              <span>Marcar todos como lidos</span>
            </button>
          </>
        )}
      </div>
      {(view === "overview" || view === "payments") && (
        <section className="space-y-3" aria-label="Avisos de pagamento">
          <h2 className="text-[16px] font-bold text-glass-ink">
            Pagamentos e recebimentos
          </h2>
          <p className={muted}>
            Pagamentos e recebimentos vencidos, de hoje e dos próximos 7 dias.
            Marcar como lido só oculta nesta abertura: ao reabrir o app, o que
            continuar pendente volta a aparecer. O aviso deixa de voltar quando
            o pagamento ou recebimento for efetivado no registro.
          </p>
          {payments.length ? (
            (view === "payments" ? payments : payments.slice(0, 3)).map(
              renderPayment,
            )
          ) : (
            <p className="glass rounded-2xl p-4 text-[13px] text-glass-sub">
              Nenhum aviso de pagamento não lido.
            </p>
          )}
          {view === "overview" && payments.length > 3 && (
            <button className={action} onClick={() => setView("payments")}>
              Ver todos os {payments.length} avisos
              <ChevronRight className="size-4" />
            </button>
          )}
        </section>
      )}
      {view !== "payments" && (
        <section className="space-y-3" aria-label="Mensagens para revisar">
          {view === "overview" && (
            <>
              <h2 className="text-[16px] font-bold text-glass-ink">
                Mensagens para revisar
              </h2>
              <p className={muted}>
                Escolha onde salvar e confira os dados antes de confirmar.
              </p>
            </>
          )}
          <div className="glass grid grid-cols-3 gap-2 rounded-2xl p-2">
            {(
              [
                {
                  id: "pending",
                  label: "Pendentes",
                  count: pending.length,
                  tone: "pending",
                },
                {
                  id: "approved",
                  label: "Aprovadas",
                  count: approved.length,
                  tone: "approved",
                },
                {
                  id: "ignored",
                  label: "Ignoradas hoje",
                  count: ignoredNotificationCount,
                  tone: "ignored",
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                aria-pressed={view === item.id}
                className={`notification-stat notification-stat--${item.tone}`}
                onClick={() => setView(item.id)}
              >
                <span className="block text-[22px] font-bold">
                  {item.count}
                </span>
                <span className="text-[11px] font-bold">{item.label}</span>
              </button>
            ))}
          </div>
          {view === "ignored" ? (
            <div className="glass space-y-2 rounded-3xl p-5">
              <h3 className="font-bold text-glass-ink">
                Mensagens excluídas permanentemente
              </h3>
              <p className={muted}>
                O contador mostra apenas as mensagens ignoradas hoje e zera na
                virada do dia, conforme o horário do seu aparelho. O conteúdo
                foi apagado e não pode ser restaurado. Os registros financeiros
                que já foram salvos continuam no aplicativo.
              </p>
            </div>
          ) : (
            <>
              {view === "approved" && (
                <div className="space-y-2">
                  <div className="glass flex min-h-11 items-center gap-2 rounded-2xl px-3 focus-within:ring-2 focus-within:ring-emerald-600/40">
                    <Search className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                    <input
                      type="search"
                      enterKeyHint="search"
                      value={approvedQuery}
                      onChange={(event) => setApprovedQuery(event.target.value)}
                      placeholder="Buscar nome, banco ou valor..."
                      aria-label="Buscar mensagens aprovadas"
                      className="h-11 w-full min-w-0 bg-transparent text-[16px] text-glass-ink outline-none placeholder:text-glass-faint [&::-webkit-search-cancel-button]:hidden"
                    />
                    {approvedQuery && (
                      <button
                        type="button"
                        aria-label="Limpar busca de aprovadas"
                        onClick={() => setApprovedQuery("")}
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-glass-sub"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <p className={muted} role="status">
                    {filteredApproved.length} {filteredApproved.length === 1 ? "mensagem encontrada" : "mensagens encontradas"}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {view !== "approved" && pending.length > 0 && (
                  <button
                    className={`${action} notification-action--approve-soft`}
                    onClick={() => setSelection({ mode: "approve", ids: [] })}
                  >
                    <Check className="size-4" />
                    Aprovar ({pending.length})
                  </button>
                )}
                {approved.length > 0 && (
                  <button
                    className={restoreAction}
                    onClick={() => setSelection({ mode: "restore", ids: [] })}
                  >
                    <RotateCcw className="size-4" />
                    Refazer ({approved.length})
                  </button>
                )}
              </div>
              {view !== "approved" && pending.length > 0 && (
                <div className="notification-pending-selection space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-[#68438a]">
                      {selectedPendingIds.length
                        ? `${selectedPendingIds.length} selecionadas`
                        : "Selecione ao lado de Aprovar"}
                    </p>
                    <button
                      className={neutralAction}
                      onClick={() =>
                        setPendingSelection(
                          selectedPendingIds.length === pending.length
                            ? []
                            : pending.map((n) => n.id),
                        )
                      }
                    >
                      {selectedPendingIds.length === pending.length
                        ? "Limpar seleção"
                        : "Selecionar todas"}
                    </button>
                  </div>
                  {selectedPendingIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={primary}
                        onClick={() => {
                          setQueue(selectedPendingIds);
                          setPendingSelection([]);
                        }}
                      >
                        <Check className="size-4" />
                        Aprovar selecionadas
                      </button>
                      <button
                        className={`${action} notification-action--ignore`}
                        onClick={() => setIgnoreIds(selectedPendingIds)}
                      >
                        <Trash2 className="size-4" />
                        Ignorar selecionadas
                      </button>
                    </div>
                  )}
                </div>
              )}
              {(view === "approved"
                ? filteredApproved
                : view === "overview"
                  ? pending.slice(0, 3)
                  : pending
              ).map(renderMessage)}
              {(view === "approved" ? filteredApproved.length : pending.length) ===
                0 && (
                <p className="glass rounded-2xl p-5 text-[13px] text-glass-sub">
                  {view === "approved"
                    ? approvedQuery.trim()
                      ? `Nenhuma mensagem aprovada encontrada para “${approvedQuery.trim()}”.`
                      : "Nenhuma mensagem aprovada."
                    : "Nenhuma mensagem pendente de revisão."}
                </p>
              )}
              {view === "overview" && pending.length > 3 && (
                <button className={action} onClick={() => setView("pending")}>
                  Ver todas as pendentes
                  <ChevronRight className="size-4" />
                </button>
              )}
            </>
          )}
        </section>
      )}

      <Dialog
        open={retentionDraft !== null}
        onOpenChange={(open) => {
          if (!open) setRetentionDraft(null);
        }}
      >
        <DialogContent className="glass-strong flex max-h-[85dvh] flex-col overflow-y-auto rounded-3xl bg-white text-glass-ink dark:bg-[#f4f8ff]">
          <DialogHeader>
            <DialogTitle>Guardar mensagens aprovadas</DialogTitle>
            <DialogDescription>
              Escolha por quanto tempo uma mensagem fica disponível após a
              primeira aprovação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {NOTIFICATION_RETENTION_OPTIONS.map((days) => (
              <button
                key={days}
                aria-pressed={retentionDraft === days}
                className={`notification-retention-choice ${retentionDraft === days ? "notification-retention-choice--selected" : ""}`}
                onClick={() => setRetentionDraft(days)}
              >
                {days === 0
                  ? "Sem expiração"
                  : `${days} ${days === 1 ? "dia" : "dias"}`}
                {retentionDraft === days && <Check className="size-4" />}
              </button>
            ))}
          </div>
          <p className={muted}>
            Ao vencer o prazo, a mensagem é excluída e não pode mais ser vista
            ou restaurada. Transações, empréstimos e comprovantes salvos
            continuam no aplicativo. Mensagens novas ainda não aprovadas não
            expiram por esta configuração.
          </p>
          {retentionRemovals > 0 && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-[13px] font-semibold text-red-800"
            >
              Salvar este prazo excluirá agora {retentionRemovals}{" "}
              {retentionRemovals === 1
                ? "mensagem antiga"
                : "mensagens antigas"}
              . Essa exclusão não pode ser desfeita.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className={neutralAction}
              onClick={() => setRetentionDraft(null)}
            >
              Cancelar
            </button>
            <button
              className={primary}
              onClick={() => {
                if (retentionDraft !== null)
                  store.setNotificationRetentionDays(retentionDraft);
                setRetentionDraft(null);
                toast("Prazo das mensagens atualizado");
              }}
            >
              Salvar prazo
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(selection)}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        <DialogContent className="glass-strong flex max-h-[85dvh] flex-col rounded-3xl bg-white text-glass-ink dark:bg-[#f4f8ff]">
          <DialogHeader>
            <DialogTitle>
              {selection?.mode === "approve"
                ? "Selecionar para aprovar"
                : "Selecionar para refazer"}
            </DialogTitle>
            <DialogDescription>
              {selection?.mode === "approve"
                ? "Você revisará cada mensagem antes de salvar. Cancelar mantém as demais pendentes."
                : "Refazer remove os lançamentos criados por estas mensagens, incluindo parcelas e recebimentos vinculados, e devolve as mensagens para Pendente. Os saldos e as faturas serão recalculados."}
            </DialogDescription>
          </DialogHeader>
          <button
            className={action}
            onClick={() =>
              setSelection((s) =>
                s
                  ? {
                      ...s,
                      ids:
                        selectedIds.length === selectionItems.length
                          ? []
                          : selectionItems.map((n) => n.id),
                    }
                  : null,
              )
            }
          >
            {selectedIds.length === selectionItems.length &&
            selectionItems.length
              ? "Desmarcar todas"
              : "Selecionar todas"}
          </button>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
            {selectionItems.map((n) => (
              <label
                key={n.id}
                className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl bg-primary/5 p-3"
              >
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  checked={selectedIds.includes(n.id)}
                  onChange={(event) =>
                    setSelection((s) =>
                      s
                        ? {
                            ...s,
                            ids: event.target.checked
                              ? [...s.ids, n.id]
                              : s.ids.filter((id) => id !== n.id),
                          }
                        : null,
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <strong className="block break-words text-[13px]">
                    {n.merchant}
                  </strong>
                  <span className={muted}>
                    {n.bank} · {shortDate(n.date)} · {formatCurrency(n.amount)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {selection?.mode === "approve" && (
            <button
              className={`${action} notification-action--ignore`}
              disabled={!selectedIds.length}
              onClick={() => {
                setIgnoreIds(selectedIds);
                setSelection(null);
              }}
            >
              Ignorar selecionadas ({selectedIds.length})
            </button>
          )}
          <button
            className={selection?.mode === "restore" ? restoreAction : primary}
            disabled={!selectedIds.length}
            onClick={() => {
              if (selection?.mode === "approve") setQueue(selectedIds);
              else {
                store.restoreNotifications(selectedIds);
                setView("pending");
                toast("Lançamentos desfeitos. Mensagens em Pendente.");
              }
              setSelection(null);
            }}
          >
            {selection?.mode === "approve" ? "Revisar" : "Confirmar e refazer"}{" "}
            {selectedIds.length}{" "}
            {selectedIds.length === 1 ? "mensagem" : "mensagens"}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(current && !review)}
        onOpenChange={(open) => {
          if (!open) stopReview();
        }}
      >
        <DialogContent className="glass-strong max-h-[85dvh] overflow-y-auto rounded-3xl bg-white text-glass-ink dark:bg-[#f4f8ff]">
          <DialogHeader>
            <DialogTitle>
              {linked || current?.recordKind
                ? "Revisar mensagem restaurada"
                : "Onde deseja salvar?"}
            </DialogTitle>
            <DialogDescription>
              {current?.merchant} · {formatCurrency(current?.amount ?? 0)}
              {queue.length > 1 ? ` · ${queue.length} mensagens na fila` : ""}
            </DialogDescription>
          </DialogHeader>
          {linked || current?.recordKind ? (
            <>
              <p className={muted}>
                {linked
                  ? "Esta mensagem já possui um registro salvo. Você pode revisá-lo ou confirmar a aprovação mantendo os dados atuais."
                  : "O registro anterior não está disponível. Confirmar altera apenas o status da mensagem, sem criar outro lançamento."}
              </p>
              {linkedTransaction && (
                <button
                  className={action}
                  onClick={() => setReview("transaction")}
                >
                  Editar transação salva
                </button>
              )}
              {linkedLoan && (
                <button
                  className={action}
                  onClick={() => setReview("loan-edit")}
                >
                  Editar empréstimo salvo
                </button>
              )}
              <button className={primary} onClick={finishReview}>
                Confirmar aprovação
              </button>
            </>
          ) : (
            <>
              <p className={muted}>
                Os dados serão preenchidos para você conferir, acrescentar
                informações e editar. A mensagem só será aprovada quando você
                salvar o formulário.
              </p>
              <button
                className={primary}
                onClick={() => setReview("transaction")}
              >
                <FileText className="size-5" />
                Transação
              </button>
              <button
                className={`${action} notification-action--loan`}
                onClick={() => setReview("loan")}
              >
                <HandCoins className="size-5" />
                Empréstimo ou cartão emprestado
              </button>
            </>
          )}
          <button className={neutralAction} onClick={stopReview}>
            Cancelar{queue.length > 1 ? " revisão" : ""}
          </button>
        </DialogContent>
      </Dialog>
      {current &&
        review === "transaction" &&
        formHost &&
        createPortal(
          <AddTransactionSheet
            key={`tx-${current.id}`}
            open
            onClose={stopReview}
            onSaved={finishReview}
            editTransactionId={linkedTransaction?.id}
            initial={transactionInitial}
            onCommit={(data) => store.approveNotification(current.id, data)}
          />,
          formHost,
        )}
      {current &&
        review === "loan" &&
        formHost &&
        createPortal(
          <LoanTransactionSheet
            key={`loan-${current.id}`}
            open
            onClose={stopReview}
            onSaved={finishReview}
            initial={{
              amount: current.amount,
              date: current.date,
              description: current.merchant,
              note: `Notificação de ${current.bank}`,
              cardId: validCard?.id,
              operationType: validCard ? "card" : "loan",
            }}
            onCommit={(data) => store.approveLoanNotification(current.id, data)}
          />,
          formHost,
        )}
      {current && review === "loan-edit" && linkedLoan && (
        <LoanEditDialog
          key={`edit-${current.id}`}
          item={linkedLoan}
          purchaseDate={linkedLoan.startDate}
          onClose={stopReview}
          onSaved={finishReview}
        />
      )}
      <AlertDialog
        open={Boolean(readRequest)}
        onOpenChange={(open) => {
          if (!open) setReadRequest(null);
        }}
      >
        <AlertDialogContent className="glass-strong max-h-[85dvh] overflow-y-auto rounded-3xl bg-white text-glass-ink dark:bg-[#f4f8ff]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {readRequest?.all
                ? "Marcar todos estes avisos como lidos?"
                : "Marcar este aviso como lido?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza?{" "}
              {readRequest?.all
                ? "Os avisos abaixo sairão da lista de não lidos."
                : "Este aviso sairá da lista de não lidos."}{" "}
              Isso não registra pagamentos nem recebimentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="notification-read-summary">
            {readRequest?.all ? (
              <>
                <strong>
                  {readTargets.length}{" "}
                  {readTargets.length === 1
                    ? "aviso selecionado"
                    : "avisos selecionados"}
                </strong>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {readTargets.map((item) => (
                    <li key={item.id}>
                      {item.title} · {shortDate(item.date)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <strong>
                  {readTargets[0]?.title ?? "Este aviso já não está na lista"}
                </strong>
                {readTargets[0] && (
                  <p className="mt-1">
                    {shortDate(readTargets[0].date)} ·{" "}
                    {formatCurrency(readTargets[0].amount)}
                  </p>
                )}
              </>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className={neutralAction}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className={`${action} notification-action--read-confirm`}
              disabled={!readTargets.length}
              onClick={confirmRead}
            >
              Sim, marcar {readRequest?.all ? "estes avisos" : "como lido"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(ignoreIds)}
        onOpenChange={(open) => {
          if (!open) setIgnoreIds(null);
        }}
      >
        <AlertDialogContent className="glass-strong rounded-3xl bg-white text-glass-ink dark:bg-[#f4f8ff]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(ignoreIds?.length ?? 0) > 1
                ? `Excluir ${ignoreIds?.length} mensagens permanentemente?`
                : "Excluir mensagem permanentemente?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ao ignorar, o conteúdo será apagado e não poderá ser restaurado.
              Transações e empréstimos já salvos continuam no aplicativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(ignoreIds?.length ?? 0) > 1 && (
            <ul className="notification-read-summary max-h-40 space-y-1 overflow-y-auto">
              {notifications
                .filter((n) => ignoreIds?.includes(n.id))
                .map((n) => (
                  <li key={n.id}>
                    {n.merchant} · {formatCurrency(n.amount)}
                  </li>
                ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={`${action} notification-action--danger`}
              onClick={() => {
                store.ignoreNotifications(ignoreIds ?? []);
                setPendingSelection([]);
                setIgnoreIds(null);
                toast("Mensagem excluída permanentemente");
              }}
            >
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
