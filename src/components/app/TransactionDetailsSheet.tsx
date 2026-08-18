import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  ImageIcon,
  Layers,
  Pencil,
  Repeat,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { downloadAttachment } from "@/lib/attachment-utils";
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
import { Switch } from "@/components/ui/switch";

const fallback = { label: "Outros", color: "#8E8E93", icon: "outros" };
const LIGHTBOX_MIN_ZOOM = 1;
const LIGHTBOX_MAX_ZOOM = 3;

type LightboxImageSize = {
  width: number;
  height: number;
};

function fitLightboxImageSize(
  naturalWidth: number,
  naturalHeight: number,
): LightboxImageSize {
  const maxWidth = Math.max(1, window.innerWidth - 64);
  const maxHeight = Math.max(1, window.innerHeight - 144);
  const scale = Math.min(
    1,
    maxWidth / Math.max(1, naturalWidth),
    maxHeight / Math.max(1, naturalHeight),
  );

  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function clampLightboxZoom(value: number) {
  return Math.min(
    LIGHTBOX_MAX_ZOOM,
    Math.max(LIGHTBOX_MIN_ZOOM, Math.round(value * 100) / 100),
  );
}

function distanceBetweenPoints(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/**
 * Transaction details — opened by tapping a transaction card. Shows the
 * receipt photo(s) attached by Escanear Nota, the draft/observations, and
 * the scanned date and time. Photos open a full-screen lightbox.
 */
export function TransactionDetailsSheet({
  transaction,
  open,
  onClose,
  onEdit,
}: {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const { categoryById, cards, updateTransaction } = useAppStore();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(LIGHTBOX_MIN_ZOOM);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [lightboxImageSize, setLightboxImageSize] =
    useState<LightboxImageSize | null>(null);
  const lightboxImageRef = useRef<HTMLImageElement | null>(null);
  const paymentDateInputRef = useRef<HTMLInputElement | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const category = categoryById[transaction.categoryId] ?? fallback;
  const isIncome = transaction.amount > 0;
  const attachments = transaction.attachments ?? [];
  const imageAttachments = attachments.flatMap((src, index) =>
    src.startsWith("data:image") ? [{ src, index }] : [],
  );
  const lightboxSrc =
    lightboxIndex === null ? null : imageAttachments[lightboxIndex]?.src ?? null;
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
  const editablePaymentDate = transaction.paymentDate ?? transaction.date;
  const showPaymentDateOnCard = transaction.showPaymentDateOnCard !== false;

  const openPaymentDatePicker = () => {
    const input = paymentDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  };

  const handlePaymentDateChange = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    updateTransaction(transaction.id, { paymentDate: value });
    toast.success("Data de pagamento atualizada");
  };

  const handlePaymentDateVisibilityChange = (checked: boolean) => {
    updateTransaction(transaction.id, { showPaymentDateOnCard: checked });
    toast.success(checked ? "Data exibida no card" : "Data ocultada no card");
  };

  const resetLightboxViewport = () => {
    activePointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
    setLightboxZoom(LIGHTBOX_MIN_ZOOM);
    setLightboxPan({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    setLightboxImageSize(null);
    resetLightboxViewport();
  };

  const openLightbox = (attachmentIndex: number) => {
    const galleryIndex = imageAttachments.findIndex(
      (item) => item.index === attachmentIndex,
    );
    if (galleryIndex < 0) return;
    setLightboxIndex(galleryIndex);
    setLightboxImageSize(null);
    resetLightboxViewport();
  };

  const moveLightbox = (direction: -1 | 1) => {
    if (
      lightboxIndex === null ||
      imageAttachments.length < 2 ||
      lightboxZoom > LIGHTBOX_MIN_ZOOM
    ) return;
    setLightboxIndex((currentIndex) => {
      if (currentIndex === null) return currentIndex;
      return (
        (currentIndex + direction + imageAttachments.length) %
        imageAttachments.length
      );
    });
    setLightboxImageSize(null);
    resetLightboxViewport();
  };

  const adjustLightboxZoom = (delta: number) => {
    const nextZoom = clampLightboxZoom(lightboxZoom + delta);
    setLightboxZoom(nextZoom);
    if (nextZoom === LIGHTBOX_MIN_ZOOM) {
      setLightboxPan({ x: 0, y: 0 });
      return;
    }
    const bounds = getLightboxPanBounds(nextZoom);
    setLightboxPan((currentPan) => ({
      x: Math.min(bounds.x, Math.max(-bounds.x, currentPan.x)),
      y: Math.min(bounds.y, Math.max(-bounds.y, currentPan.y)),
    }));
  };

  const handleLightboxWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    adjustLightboxZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const getLightboxPanBounds = (zoom: number) => {
    const image = lightboxImageRef.current;
    const baseWidth = image?.offsetWidth ?? window.innerWidth - 48;
    const baseHeight = image?.offsetHeight ?? window.innerHeight - 48;
    const viewportWidth = Math.max(1, window.innerWidth - 32);
    const viewportHeight = Math.max(1, window.innerHeight - 32);

    return {
      x: Math.max(0, (baseWidth * zoom - viewportWidth) / 2),
      y: Math.max(0, (baseHeight * zoom - viewportHeight) / 2),
    };
  };

  const handleLightboxPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lightboxZoom <= LIGHTBOX_MIN_ZOOM) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      const points = Array.from(activePointersRef.current.values()).slice(0, 2);
      pinchRef.current = {
        distance: distanceBetweenPoints(points[0], points[1]),
        zoom: lightboxZoom,
      };
      panRef.current = null;
      return;
    }

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: lightboxPan.x,
      originY: lightboxPan.y,
    };
  };

  const handleLightboxPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      event.preventDefault();
      event.stopPropagation();
      const points = Array.from(activePointersRef.current.values()).slice(0, 2);
      const distance = distanceBetweenPoints(points[0], points[1]);
      const pinch = pinchRef.current ?? { distance, zoom: lightboxZoom };
      pinchRef.current = pinch;
      const nextZoom = clampLightboxZoom(pinch.zoom * (distance / pinch.distance));
      setLightboxZoom(nextZoom);
      if (nextZoom === LIGHTBOX_MIN_ZOOM) {
        setLightboxPan({ x: 0, y: 0 });
        return;
      }
      const bounds = getLightboxPanBounds(nextZoom);
      setLightboxPan((currentPan) => ({
        x: Math.min(bounds.x, Math.max(-bounds.x, currentPan.x)),
        y: Math.min(bounds.y, Math.max(-bounds.y, currentPan.y)),
      }));
      return;
    }

    if (
      lightboxZoom <= LIGHTBOX_MIN_ZOOM ||
      !panRef.current ||
      panRef.current.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const bounds = getLightboxPanBounds(lightboxZoom);
    setLightboxPan({
      x: Math.min(
        bounds.x,
        Math.max(bounds.x * -1, panRef.current.originX + event.clientX - panRef.current.startX),
      ),
      y: Math.min(
        bounds.y,
        Math.max(bounds.y * -1, panRef.current.originY + event.clientY - panRef.current.startY),
      ),
    });
  };

  const handleLightboxPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size < 2) pinchRef.current = null;
    if (activePointersRef.current.size === 1 && lightboxZoom > LIGHTBOX_MIN_ZOOM) {
      const [pointerId, point] = Array.from(activePointersRef.current.entries())[0];
      panRef.current = {
        pointerId,
        startX: point.x,
        startY: point.y,
        originX: lightboxPan.x,
        originY: lightboxPan.y,
      };
    } else if (activePointersRef.current.size === 0) {
      panRef.current = null;
    }
  };

  const handleLightboxImageLoad = (image: HTMLImageElement) => {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    setLightboxImageSize(
      fitLightboxImageSize(image.naturalWidth, image.naturalHeight),
    );
  };

  const handleAttachmentDownload = async (src: string, index: number) => {
    try {
      await downloadAttachment(src, `anexo-${index + 1}`);
    } catch {
      toast.error("Não foi possível baixar este anexo");
    }
  };

  return createPortal(
    <>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className="absolute inset-0 z-[65] flex items-center justify-center bg-[#0b1630]/45 px-8 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="glass glass-strong no-scrollbar max-h-[85%] w-full max-w-[320px] overflow-y-auto rounded-[2rem] bg-white p-5 dark:bg-[#f4f8ff]"
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
              {transaction.paymentStatus === "paid" && (
                <>
                  <div
                    className="flex items-center gap-3 rounded-2xl bg-[#1FBF4F]/10 px-3.5 py-2.5"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Check className="size-4 shrink-0 text-[#168A39]" />
                    <button
                      type="button"
                      onClick={openPaymentDatePicker}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-[13px] font-semibold text-[#168A39] transition-opacity hover:opacity-80 active:scale-[0.99]"
                    >
                      <span>Pago em {shortDate(editablePaymentDate)}</span>
                      <CalendarDays className="size-4 shrink-0" />
                    </button>
                    <input
                      ref={paymentDateInputRef}
                      type="date"
                      value={editablePaymentDate}
                      aria-label="Alterar data de pagamento"
                      onChange={(event) => handlePaymentDateChange(event.target.value)}
                      className="sr-only"
                    />
                  </div>
                  <div
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <label
                      htmlFor={`show-payment-date-${transaction.id}`}
                      className="min-w-0 cursor-pointer text-[12px] font-semibold text-glass-ink"
                    >
                      <span className="block">Mostrar data no card</span>
                      <span className="mt-0.5 block text-[10.5px] font-medium text-glass-sub">
                        Exibe “Pago em DD/MM” na lista
                      </span>
                    </label>
                    <Switch
                      id={`show-payment-date-${transaction.id}`}
                      checked={showPaymentDateOnCard}
                      onCheckedChange={handlePaymentDateVisibilityChange}
                      aria-label="Mostrar data no card"
                    />
                  </div>
                </>
              )}
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
                        onClick={() => openLightbox(i)}
                        className="group relative aspect-square overflow-hidden rounded-2xl transition-transform active:scale-95"
                      >
                        <img
                          src={src}
                          alt={`Anexo ${i + 1}`}
                          className="size-full object-cover"
                        />
                      </button>
                    ) : (
                      <button
                        key={i}
                        type="button"
                        onClick={() => void handleAttachmentDownload(src, i)}
                        className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/40 px-2 text-center transition-transform active:scale-95"
                      >
                        <FileText className="size-5 shrink-0 text-[#2F6BFF]" />
                        <span className="truncate text-[10.5px] font-semibold leading-tight text-glass-sub">
                          Arquivo
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(47,107,255,0.75)] transition-all hover:brightness-105 active:scale-[0.99]"
              >
                <Pencil className="size-4" />
                Editar
              </button>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Attachment gallery: navigation and zoom are local-only viewer state. */}
      {lightboxSrc &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Visualizador de anexos"
            onClick={closeLightbox}
            className="absolute inset-0 z-[70] flex items-center justify-center bg-[#0b1630]/95 p-4"
          >
            <button
              type="button"
              aria-label="Fechar imagem"
              onClick={closeLightbox}
              className="glass absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full text-white"
            >
              <X className="size-4" />
            </button>

            {imageAttachments.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Imagem anterior"
                  disabled={lightboxZoom > LIGHTBOX_MIN_ZOOM}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveLightbox(-1);
                  }}
                  className="glass absolute left-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-white transition-transform active:scale-90 disabled:opacity-35"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima imagem"
                  disabled={lightboxZoom > LIGHTBOX_MIN_ZOOM}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveLightbox(1);
                  }}
                  className="glass absolute right-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-white transition-transform active:scale-90 disabled:opacity-35"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}

            <motion.div
              drag={imageAttachments.length > 1 && lightboxZoom === LIGHTBOX_MIN_ZOOM ? "x" : false}
              dragConstraints={{ left: -180, right: 180 }}
              dragElastic={0.18}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (lightboxZoom > LIGHTBOX_MIN_ZOOM) return;
                if (info.offset.x <= -56) moveLightbox(1);
                else if (info.offset.x >= 56) moveLightbox(-1);
              }}
              onWheel={handleLightboxWheel}
              onPointerDown={handleLightboxPointerDown}
              onPointerMove={handleLightboxPointerMove}
              onPointerUp={handleLightboxPointerEnd}
              onPointerCancel={handleLightboxPointerEnd}
              onClick={(event) => event.stopPropagation()}
              style={{ touchAction: lightboxZoom > LIGHTBOX_MIN_ZOOM ? "none" : "pan-y" }}
              className="flex h-fit w-fit max-h-[calc(84vh-1.5rem)] max-w-[calc(100vw-3.5rem)] items-center justify-center overflow-visible rounded-[1.5rem] bg-[#e5e7eb] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-2 ring-[#111827]"
            >
              <motion.img
                key={lightboxSrc}
                src={lightboxSrc}
                alt={`Anexo ${
                  (imageAttachments[lightboxIndex ?? 0]?.index ?? 0) + 1
                }`}
                onDoubleClick={() => {
                  const nextZoom = lightboxZoom > LIGHTBOX_MIN_ZOOM ? LIGHTBOX_MIN_ZOOM : 2;
                  setLightboxZoom(nextZoom);
                  if (nextZoom === LIGHTBOX_MIN_ZOOM) setLightboxPan({ x: 0, y: 0 });
                }}
                onLoad={(event) => handleLightboxImageLoad(event.currentTarget)}
                animate={{ scale: lightboxZoom, x: lightboxPan.x, y: lightboxPan.y }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                ref={lightboxImageRef}
                style={
                  lightboxImageSize
                    ? {
                        width: `${lightboxImageSize.width}px`,
                        height: `${lightboxImageSize.height}px`,
                      }
                    : undefined
                }
                className="block h-auto w-auto max-h-[calc(84vh-1.5rem)] max-w-[calc(100vw-3.5rem)] flex-none select-none rounded-xl border border-[#4b5563]/60 object-contain shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
                draggable={false}
              />
            </motion.div>

            <div
              className="glass absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#111827]/90 px-2 py-1.5 text-white"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Reduzir zoom"
                onClick={() => adjustLightboxZoom(-0.25)}
                disabled={lightboxZoom <= 1}
                className="flex size-8 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="min-w-[44px] text-center text-[11px] font-bold">
                {Math.round(lightboxZoom * 100)}% · {lightboxZoom.toFixed(2)}×
              </span>
              <button
                type="button"
                aria-label="Aumentar zoom"
                onClick={() => adjustLightboxZoom(0.25)}
                disabled={lightboxZoom >= 3}
                className="flex size-8 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Redefinir zoom"
                onClick={resetLightboxViewport}
                disabled={lightboxZoom === LIGHTBOX_MIN_ZOOM && lightboxPan.x === 0 && lightboxPan.y === 0}
                className="ml-0.5 flex size-8 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
              >
                <RotateCcw className="size-3.5" />
              </button>
              {imageAttachments.length > 1 && (
                <span className="ml-1 border-l border-white/20 pl-2 text-[11px] font-bold">
                  {(lightboxIndex ?? 0) + 1}/{imageAttachments.length}
                </span>
              )}
            </div>
          </div>,
          screen,
        )}
    </>,
    screen,
  );
}
