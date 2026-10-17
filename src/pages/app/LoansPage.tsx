import { useState } from "react";
import { motion } from "framer-motion";
import { Banknote, CreditCard } from "lucide-react";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useReportNavigationPendingCount } from "@/components/app/NavigationPendingContext";
import { useAppStore } from "@/lib/app-store";
import {
  cardLoans,
  dayLabel,
  formatCurrency,
  initials,
  loans,
  shortDate,
  type CardLoan,
  type DraftDisplayMode,
  type Loan,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Tab = "dinheiro" | "cartao";

const tintFor = (name: string) => {
  const palette = ["#2F6BFF", "#AF52DE", "#1FBF4F", "#FF9500", "#FF2D55", "#00C7BE"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return palette[hash % palette.length];
};

function StatusPill({ status }: { status: "pago" | "pendente" }) {
  const paid = status === "pago";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-bold",
        paid ? "bg-[#1FBF4F]/15 text-[#17a443]" : "bg-[#FF9500]/15 text-[#d97b00]",
      )}
    >
      {paid ? "Pago" : "Pendente"}
    </span>
  );
}

type DraftMeta = {
  note?: string;
  draftDisplay?: DraftDisplayMode;
  attachments?: string[];
};

type LoanRowData = Loan & DraftMeta & { dateLabel?: string };
type CardLoanRowData = CardLoan & DraftMeta;

const shouldShowDraft = ({ note, draftDisplay }: DraftMeta) =>
  draftDisplay === "multipleMedia" && Boolean(note?.trim());

function DraftBlock({ note, draftDisplay }: DraftMeta) {
  if (!shouldShowDraft({ note, draftDisplay })) return null;

  return (
    <div className="mt-1.5 overflow-hidden rounded-2xl bg-[#dfe4ff]/90 px-2.5 py-1.5 dark:bg-[#1c2542]/80 sm:mt-2 sm:px-3 sm:py-2">
      <p className="text-[9px] font-medium text-glass-faint sm:text-[10px]">Rascunho</p>
      <p className="mt-0.5 line-clamp-2 whitespace-pre-line border-l-2 border-[#7C6FF2] pl-2 text-[11px] leading-4 text-glass-ink/85 dark:text-white/85 sm:pl-2.5 sm:text-[12px]">
        {note}
      </p>
    </div>
  );
}

function LoanRow({ loan }: { loan: LoanRowData }) {
  const receiving = loan.direction === "receber";
  return (
    <div className="flex items-center gap-3.5 py-3">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
        style={{ backgroundColor: tintFor(loan.name) }}
      >
        {initials(loan.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-glass-ink">
          {loan.name}
        </p>
        <p className="mt-0.5 text-[12.5px] text-glass-sub">
          {loan.dateLabel ?? dayLabel(loan.date)}
        </p>
        <DraftBlock
          note={loan.note}
          draftDisplay={loan.draftDisplay}
          attachments={loan.attachments}
        />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p
          className={cn(
            "amount-tabular text-[15px] font-bold",
            receiving ? "text-[#1FBF4F]" : "text-glass-ink",
          )}
        >
          {receiving ? "+" : "−"}
          {formatCurrency(loan.amount)}
        </p>
        <StatusPill status={loan.status} />
      </div>
    </div>
  );
}

function InstallmentDots({
  total,
  current,
  done,
}: {
  total: number;
  current: number;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            done || i < current ? "bg-[#1FBF4F]" : "bg-black/15 dark:bg-black/30",
          )}
        />
      ))}
    </div>
  );
}

function CardLoanRow({ loan }: { loan: CardLoanRowData }) {
  const done = loan.status === "pago";
  return (
    <div className="flex items-center gap-3.5 py-3">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
        style={{ backgroundColor: tintFor(loan.name) }}
      >
        {initials(loan.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-glass-ink">
          {loan.name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-glass-sub">
            Parcela {loan.currentInstallment}/{loan.installments}
          </span>
          <InstallmentDots
            total={loan.installments}
            current={loan.currentInstallment}
            done={done}
          />
        </div>
        {!done && (
          <p className="mt-0.5 text-[11.5px] text-glass-faint">
            Próxima em {shortDate(loan.nextDue)}
          </p>
        )}
        <DraftBlock
          note={loan.note}
          draftDisplay={loan.draftDisplay}
          attachments={loan.attachments}
        />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p className="amount-tabular text-[15px] font-bold text-glass-ink">
          {formatCurrency(loan.amount)}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            done
              ? "bg-[#1FBF4F]/15 text-[#17a443]"
              : "bg-primary/10 text-primary",
          )}
        >
          {done ? "Pago" : "Ativo"}
        </span>
      </div>
    </div>
  );
}

export default function LoansPage() {
  const [tab, setTab] = useState<Tab>("dinheiro");
  const { loanReceivables, loanTransactions: transactions } = useAppStore();
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const draftMetaFor = (item: (typeof loanReceivables)[number]): DraftMeta => {
    const relatedTransaction =
      (item.transactionId ? transactionById.get(item.transactionId) : undefined) ??
      transactions.find(
        (transaction) =>
          transaction.source === "loan" &&
          transaction.note?.includes(`Referência: ${item.loanId}`),
      );

    return {
      note: item.note ?? relatedTransaction?.note,
      draftDisplay: item.draftDisplay ?? relatedTransaction?.draftDisplay,
      attachments: item.attachments ?? relatedTransaction?.attachments,
    };
  };

  const recordedReceivables: LoanRowData[] = loanReceivables
    .filter((item) => item.operationType !== "card")
    .map((item) => ({
      id: item.id,
      name: item.contact,
      amount: item.amount,
      date: item.dueDate ?? item.createdAt,
      ...draftMetaFor(item),
      status: item.status === "paid" ? "pago" : "pendente",
      direction: "receber",
      dateLabel:
        item.status === "open"
          ? "Dívida em aberto"
          : `Vence em ${shortDate(item.dueDate ?? item.createdAt)}`,
    }));
  const receivable = [
    ...recordedReceivables,
    ...loans.filter((l) => l.direction === "receber"),
  ];
  const payable = loans.filter((l) => l.direction === "pagar");
  const pendingReceivable = receivable
    .filter((l) => l.status === "pendente")
    .reduce((s, l) => s + l.amount, 0);
  const pendingPayable = payable
    .filter((l) => l.status === "pendente")
    .reduce((s, l) => s + l.amount, 0);
  const recordedCardLoans: CardLoan[] = loanReceivables
    .filter((item) => item.operationType === "card")
    .map((item) => ({
      id: item.id,
      name: item.contact,
      amount: item.amount,
      installments: item.installments ?? 1,
      currentInstallment: item.installment ?? 1,
      ...draftMetaFor(item),
      status: item.status === "paid" ? "pago" : "ativo",
      nextDue: item.dueDate ?? item.createdAt,
    }));
  const allCardLoans = [...recordedCardLoans, ...cardLoans];
  const activeCards = allCardLoans.filter((c) => c.status === "ativo");
  const activeCardTotal = activeCards.reduce((s, c) => s + c.amount, 0);
  useReportNavigationPendingCount("loans", tab === "cartao" ? activeCards.length : [...receivable, ...payable].filter((loan) => loan.status === "pendente").length);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-0">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-foreground">
              Empréstimos
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Dinheiro e cartões de terceiros
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-3xl p-4">
          <p className="text-[12px] font-medium text-glass-sub">A receber</p>
          <p className="amount-tabular mt-1 text-[20px] font-bold text-[#1FBF4F]">
            {formatCurrency(pendingReceivable)}
          </p>
          <p className="mt-0.5 text-[11px] text-glass-faint">Pendente agora</p>
        </div>
        <div className="glass rounded-3xl p-4">
          <p className="text-[12px] font-medium text-glass-sub">A pagar</p>
          <p className="amount-tabular mt-1 text-[20px] font-bold text-[#FF3B30]">
            {formatCurrency(pendingPayable)}
          </p>
          <p className="mt-0.5 text-[11px] text-glass-faint">Pendente agora</p>
        </div>
      </div>

      {/* Segmented control */}
      <div className="glass glass-strong relative grid grid-cols-2 rounded-full p-1">
        {(
          [
            { id: "dinheiro", label: "Dinheiro" },
            { id: "cartao", label: "Cartão Emprestado" },
          ] as { id: Tab; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13.5px] font-semibold transition-colors",
              tab === item.id ? "text-white" : "text-glass-sub",
            )}
          >
            {tab === item.id && (
              <motion.span
                layoutId="loans-segment"
                className="absolute inset-0 -z-10 rounded-full bg-primary shadow-[0_6px_16px_-6px_rgba(47,107,255,0.6)]"
                transition={{ type: "spring", damping: 30, stiffness: 400 }}
              />
            )}
            {item.id === "dinheiro" ? (
              <Banknote className="size-4" />
            ) : (
              <CreditCard className="size-4" />
            )}
            {item.label}
          </button>
        ))}
      </div>

      {/* Dinheiro tab */}
      {tab === "dinheiro" && (
        <div className="space-y-4">
          <section>
            <p className="mb-1 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Quem me deve
            </p>
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {receivable.map((loan) => (
                <LoanRow key={loan.id} loan={loan} />
              ))}
            </div>
          </section>
          <section>
            <p className="mb-1 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Eu devo
            </p>
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {payable.map((loan) => (
                <LoanRow key={loan.id} loan={loan} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Cartão tab */}
      {tab === "cartao" && (
        <div className="space-y-4">
          <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
            <p className="text-[12.5px] text-glass-sub">Total em parcelas ativas</p>
            <p className="amount-tabular text-[13px] font-bold text-glass-ink">
              {formatCurrency(activeCardTotal)}
            </p>
          </div>
          <section>
            <p className="mb-1 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Compras no meu cartão
            </p>
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {allCardLoans.map((loan) => (
                <CardLoanRow key={loan.id} loan={loan} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
