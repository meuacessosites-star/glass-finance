import {
  AlertTriangle,
  Banknote,
  Check,
  Clock,
  CreditCard,
  Infinity as InfinityIcon,
  Layers,
} from "lucide-react";
import type { AppCard, LoanReceivable } from "@/lib/app-store";
import { getLoanInstallmentHistory } from "@/lib/loan-history";
import { getLoanOutstandingAmount, isFreeLoan } from "@/lib/loan-repayments";
import { cardPaymentStyle, cardPaymentTone } from "@/lib/payment-method-theme";
import { formatCurrency, shortDate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const presentation = {
  paid: {
    label: "Recebida",
    Icon: Check,
    row: "border-green-200 bg-green-50/70",
    circle: "bg-green-100 text-green-700",
    text: "rounded-full bg-[#148d48] px-2 py-0.5 text-white",
  },
  pending: {
    label: "Pendente",
    Icon: Clock,
    row: "border-amber-200 bg-amber-50/70",
    circle: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
  },
  overdue: {
    label: "Vencida",
    Icon: AlertTriangle,
    row: "border-red-200 bg-red-50/70",
    circle: "bg-red-100 text-red-700",
    text: "text-red-700",
  },
  scheduled: {
    label: "Agendada",
    Icon: Clock,
    row: "border-slate-200 bg-slate-50/90",
    circle: "bg-slate-200/70 text-slate-500",
    text: "text-slate-500",
  },
  "invoice-needed": {
    label: "Definir fatura",
    Icon: CreditCard,
    row: "border-amber-200 bg-amber-50/70",
    circle: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
  },
};

export function LoanInstallmentHistory({
  item,
  items,
  card,
  today,
}: {
  item: LoanReceivable;
  items: LoanReceivable[];
  card?: AppCard;
  today: string;
}) {
  const free = isFreeLoan(item);
  const isCard = item.operationType === "card";
  const parts = getLoanInstallmentHistory(item, items, today);
  const receipts = [...(item.receipts ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const remaining = getLoanOutstandingAmount(item);
  const Icon = free ? InfinityIcon : isCard ? CreditCard : Banknote;
  return (
    <section
      aria-label={free ? "Histórico de recebimentos" : "Histórico de parcelas"}
      style={isCard ? cardPaymentStyle(card?.color ?? "#8e58af") : undefined}
      className={cn(
        "rounded-3xl border p-3.5",
        isCard
          ? cardPaymentTone
          : "border-[#cbe3df] bg-[#f1faf8] text-[#286b63] dark:border-[#35564f] dark:bg-[#17312c] dark:text-[#a3d6ca]",
      )}
    >
      <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide">
        <Layers className="size-[18px] shrink-0" />
        {free ? "Histórico de recebimentos" : "Histórico de parcelas"}
      </h3>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="size-3.5 shrink-0" />
        {free
          ? "Empréstimo livre · sem vencimento"
          : isCard
            ? (card?.name ?? "Cartão emprestado")
            : "Empréstimo fixo · datas combinadas"}
      </p>
      {!free ? (
        <ol className="mt-3 space-y-2">
          {parts.map((part) => {
            const view = presentation[part.status];
            const PartIcon = view.Icon;
            return (
              <li
                key={part.id}
                aria-current={part.isSelected ? "step" : undefined}
                className={cn("rounded-2xl border p-3", view.row)}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full max-[359px]:hidden",
                        view.circle,
                      )}
                    >
                      <PartIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold leading-4 text-glass-ink">
                        {part.total === 1
                          ? "Parcela única"
                          : `${part.number}ª parcela de ${part.total}`}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-[11px] leading-4 text-glass-sub">
                        {part.status === "paid" ? (
                          part.paymentDate ? (
                            <>
                              Recebida em{" "}
                              <time dateTime={part.paymentDate}>
                                {shortDate(part.paymentDate)}
                              </time>
                            </>
                          ) : (
                            "Data não informada"
                          )
                        ) : part.dueDate ? (
                          <>
                            {part.status === "overdue" ? "Venceu" : "Vence"} em{" "}
                            <time
                              dateTime={part.dueDate}
                              title={part.dueDate
                                .split("-")
                                .reverse()
                                .join("/")}
                            >
                              {shortDate(part.dueDate)}
                            </time>
                          </>
                        ) : part.status === "invoice-needed" ? (
                          "Fatura a definir"
                        ) : (
                          "Vencimento não informado"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="amount-tabular whitespace-nowrap text-[12px] font-bold text-glass-ink">
                      {formatCurrency(part.amount)}
                    </p>
                    <span className={cn("text-[10.5px] font-bold", view.text)}>
                      {view.label}
                    </span>
                  </div>
                </div>
                {part.status === "paid" && part.dueDate && (
                  <p className="mt-1 text-[10.5px] text-glass-sub">
                    Vencimento original {shortDate(part.dueDate)}
                  </p>
                )}
                {part.receivedAmount > 0 && part.remainingAmount > 0 && (
                  <p className="mt-2 text-[10.5px] text-glass-sub">
                    Recebido {formatCurrency(part.receivedAmount)} · Falta{" "}
                    {formatCurrency(part.remainingAmount)}
                  </p>
                )}
                {part.isSelected && (
                  <p className="mt-1.5 text-[10px] font-semibold text-glass-sub">
                    Parcela selecionada
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-3 space-y-2">
          <ol className="space-y-2">
            {receipts.map((receipt, index) => (
              <li
                key={receipt.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-green-200 bg-green-50/80 p-3 text-[12px] text-glass-ink"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 max-[359px]:hidden">
                    <Check className="size-4" />
                  </span>
                  <div>
                    <p className="font-bold">{index + 1}º recebimento</p>
                    <p className="mt-1 whitespace-nowrap text-[11px] text-glass-sub">
                      Recebido em {shortDate(receipt.date)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <strong className="amount-tabular whitespace-nowrap">
                    {formatCurrency(receipt.amount)}
                  </strong>
                  <span className="rounded-full bg-[#148d48] px-2 py-0.5 text-[10.5px] font-bold text-white">
                    Recebido
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {item.status === "paid" && !receipts.length && (
            <div className="rounded-2xl border border-green-200 bg-green-50/80 p-3 text-[12px] text-glass-ink">
              <p className="font-semibold">
                Recebimento concluído · {formatCurrency(item.amount)}
              </p>
              <p className="mt-1 text-glass-sub">
                {item.paymentDate
                  ? `Recebido em ${shortDate(item.paymentDate)}`
                  : "Data não informada"}
              </p>
            </div>
          )}
          {remaining > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#cbe3df] bg-white/80 p-3 text-[12px] text-glass-ink">
              <div>
                <p className="font-bold">Saldo em aberto</p>
                <p className="mt-1 text-[11px] text-glass-sub">
                  Sem vencimento
                </p>
              </div>
              <strong className="amount-tabular whitespace-nowrap">
                {formatCurrency(remaining)}
              </strong>
            </div>
          )}
          {item.freePaymentMode === "installments" &&
            item.suggestedPaymentAmount && (
              <p className="text-[11px]">
                Valor combinado por recebimento:{" "}
                {formatCurrency(item.suggestedPaymentAmount)}.
              </p>
            )}
          <p className="text-[11px] leading-relaxed">
            {remaining > 0
              ? "Só o saldo restante continua em aberto. Meses sem recebimento não criam novas parcelas nem aumentam a dívida."
              : "Empréstimo concluído. Não há saldo em aberto."}
          </p>
        </div>
      )}
    </section>
  );
}
