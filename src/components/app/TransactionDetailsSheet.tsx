import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  CreditCard,
  FileText,
  ImageIcon,
  Layers,
  Repeat,
  X,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import {
  dayLabel,
  formatCurrency,
  recurrenceLabel,
  shortDate,
  type Transaction,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import {
  CARD_MODE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./PaymentMethodSelector";

const fallback = { label: "Outros", color: "#8E8E93", icon: "outros" };

/**
 * Transaction details — opened by tapping a transaction card. Shows the
 * receipt photo(s) attached by Escanear Nota, the draft/observations, and
 * the scanned date and time. Photos open a full-screen lightbox.
 */
export function TransactionDetailsSheet({
  transaction,
  open,
  onClose,
}: {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
}) {
  const { categoryById, cards } = useAppStore();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const category = categoryById[transaction.categoryId] ?? fallback;
  const isIncome = transaction.amount > 0;
  const attachments = transaction.attachments ?? [];
  const rawMethod = transaction.paymentMethod ?? "";
  const methodId =
    rawMethod === "credito" || rawMethod === "debito" ? "cartao" : rawMethod;
  const mode =
    transaction.cardMode ??
    (rawMethod === "credito" || rawMethod === "debito" ? rawMethod : undefined) ??
    "";
  const paymentLabel = methodId
    ? PAYMENT_METHOD_LABELS[methodId] ?? methodId
    : null;
  const paymentCard = transaction.cardId
    ? cards.find((c) => c.id === transaction.cardId)
    : undefined;

  const screen = document.getElementById("app-screen");
  if (!screen) return null;

  const dateLabel = `${dayLabel(transaction.date)} · ${shortDate(transaction.date)}${
    transaction.time ? ` às ${transaction.time}` : ""
  }`;

  return createPortal(
    <>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 z-[65] flex items-center justify-center bg-[#0b1630]/45 px-8 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="glass glass-strong no-scrollbar max-h-[85%] w-full max-w-[320px] overflow-y-auto rounded-[2rem] p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold tracking-tight text-glass-ink">
                Detalhes
              </p>
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                className="glass glass-soft flex size-8 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Main row */}
            <div className="mt-4 flex items-center gap-3">
              <CategoryIcon
                categoryId={transaction.categoryId}
                size="size-14"
                iconSize="size-6"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold text-glass-ink">
                  {transaction.title}
                </p>
                <p className="mt-0.5 text-[12.5px] font-semibold" style={{ color: category.color }}>
                  {category.label}
                </p>
              </div>
            </div>

            <p
              className={cn(
                "amount-tabular mt-4 text-[30px] font-bold leading-none tracking-tight",
                isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
              )}
            >
              {isIncome ? "+" : "−"}
              {formatCurrency(transaction.amount)}
            </p>

            {/* Info rows */}
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                <p className="text-[13px] font-medium text-glass-ink">{dateLabel}</p>
              </div>
              {attachments.length > 0 && (
                <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                  <ImageIcon className="size-4 shrink-0 text-glass-sub" />
                  <p className="text-[13px] font-medium text-glass-ink">
                    {attachments.length}{" "}
                    {attachments.length === 1 ? "nota anexada" : "notas anexadas"}
                  </p>
                </div>
              )}
              {transaction.time && (
                <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                  <Clock className="size-4 shrink-0 text-glass-sub" />
                  <p className="text-[13px] font-medium text-glass-ink">
                    Registrada às {transaction.time}
                  </p>
                </div>
              )}
              {paymentLabel && (
                <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                  <CreditCard className="size-4 shrink-0 text-glass-sub" />
                  <p className="text-[13px] font-medium text-glass-ink">
                    Pagamento · {paymentLabel}
                    {methodId === "cartao" && mode
                      ? ` · ${CARD_MODE_LABELS[mode as "credito" | "debito"] ?? mode}`
                      : ""}
                    {paymentCard
                      ? ` · ${paymentCard.name} ····${paymentCard.last4}`
                      : ""}
                  </p>
                </div>
              )}
              {recurrenceLabel(transaction) && (
                <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                  {transaction.recurrence === "parcelada" ? (
                    <Layers className="size-4 shrink-0 text-glass-sub" />
                  ) : (
                    <Repeat className="size-4 shrink-0 text-glass-sub" />
                  )}
                  <p className="text-[13px] font-medium text-glass-ink">
                    {recurrenceLabel(transaction)}
                  </p>
                </div>
              )}
            </div>

            {/* Draft / notes */}
            {transaction.note && (
              <div className="mt-4 rounded-2xl bg-white/40 p-3.5">
                <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                  <FileText className="size-3.5" /> Rascunho
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-glass-ink">
                  {transaction.note}
                </p>
              </div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                  Anexos
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {attachments.map((src, i) =>
                    src.startsWith("data:image") ? (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Ver anexo ${i + 1}`}
                        onClick={() => setLightbox(src)}
                        className="group relative aspect-square overflow-hidden rounded-2xl transition-transform active:scale-95"
                      >
                        <img
                          src={src}
                          alt={`Anexo ${i + 1}`}
                          className="size-full object-cover"
                        />
                      </button>
                    ) : (
                      <a
                        key={i}
                        href={src}
                        download={`anexo-${i + 1}`}
                        className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/40 px-2 text-center transition-transform active:scale-95"
                      >
                        <FileText className="size-5 shrink-0 text-[#2F6BFF]" />
                        <span className="truncate text-[10.5px] font-semibold leading-tight text-glass-sub">
                          Arquivo
                        </span>
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Lightbox */}
      {lightbox &&
        createPortal(
          <div
            onClick={() => setLightbox(null)}
            className="absolute inset-0 z-[70] flex items-center justify-center bg-[#0b1630]/85 p-4"
          >
            <button
              type="button"
              aria-label="Fechar imagem"
              onClick={() => setLightbox(null)}
              className="glass absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-white"
            >
              <X className="size-4" />
            </button>
            <img
              src={lightbox}
              alt="Nota fiscal"
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>,
          screen,
        )}
    </>,
    screen,
  );
}
