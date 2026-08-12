import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  Clock,
  CreditCard,
  FileText,
  ImagePlus,
  QrCode,
  RefreshCw,
  ScanLine,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useSuggestedCategory } from "@/hooks/use-suggested-category";
import { useAppStore } from "@/lib/app-store";
import {
  decodeQrPayload,
  extractItems,
  findCategoryId,
  formatItemsText,
  imageToDataUrl,
  parseQrFromPayload,
  parseReceiptText,
  scanReceiptWithTimeout,
  SCAN_CATEGORIES,
} from "@/lib/receipt-scan";
import { cn } from "@/lib/utils";
import { CameraQrScanner } from "./CameraQrScanner";
import { CategoryIcon } from "./CategoryIcon";
import {
  CARD_MODE_LABELS,
  normalizePaymentMethod,
  PaymentMethodSelector,
  type CardMode,
  type PaymentMethodId,
} from "./PaymentMethodSelector";

// ---------------------------------------------------------------------------
// Escanear Nota — pick a photo (camera or gallery), OCR it in the browser,
// review the extracted fields (auto-creating categories that don't exist),
// attach one or more receipt photos, add a draft note and approve before
// saving. The photos become attachments shown in the transaction details.
// ---------------------------------------------------------------------------

type Step = "source" | "camera" | "edit" | "approve";
type OcrState = "idle" | "scanning" | "done" | "empty" | "failed";

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

const INCOME_IDS = new Set(["salario", "freelance"]);

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  credito: "Crédito",
  debito: "Débito",
  boleto: "Boleto",
  transferencia: "Transferência",
};

export function ScanReceiptSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories, cards, addTransaction } = useAppStore();
  const applySuggestedCategory = useSuggestedCategory();

  const [step, setStep] = useState<Step>("source");
  const [images, setImages] = useState<string[]>([]);
  const [ocrState, setOcrState] = useState<OcrState>("idle");

  // Form fields (OCR fills what is still empty)
  const [title, setTitle] = useState("");
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | "">("");
  const [cardMode, setCardMode] = useState<CardMode | "">("");
  const [cardId, setCardId] = useState<string | null>(null);
  // Raw OCR text — shown collapsed so the user can see what was read (and
  // why a field came back empty).
  const [rawText, setRawText] = useState("");
  // QR decode status, also shown collapsed ("QR não detectado" / "QR
  // detectado · valor R$ 9,90" / "… sem valor no código").
  const [qrInfo, setQrInfo] = useState("");

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const addMoreRef = useRef<HTMLInputElement | null>(null);
  // Bumped on every open/reset so stale OCR results never fill a fresh form.
  const runIdRef = useRef(0);
  // Original picked File, kept so "Tentar de novo" re-OCRs at full quality.
  const sourceFileRef = useRef<File | null>(null);
  // True once the user picks the date manually — the OCR date never overrides it.
  const dateTouchedRef = useRef(false);
  // True once the user picks Despesa/Receita manually — the OCR never overrides it.
  const typeTouchedRef = useRef(false);
  // Category chip refs, so the selected chip can be scrolled into view (the
  // row is horizontally scrollable and the match may be off-screen).
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    runIdRef.current += 1;
    setStep("source");
    setImages([]);
    setOcrState("idle");
    setTitle("");
    setCents(0);
    setCategoryId("");
    setCategoryTouched(false);
    setDate(new Date().toISOString().slice(0, 10));
    setTime("");
    setNote("");
    setType("expense");
    setPaymentMethod("");
    setCardMode("");
    setCardId(null);
    setRawText("");
    setQrInfo("");
    sourceFileRef.current = null;
    dateTouchedRef.current = false;
    typeTouchedRef.current = false;
  }, [open]);

  // Keep the selected category chip visible in the scrollable chips row.
  useEffect(() => {
    if (!categoryId) return;
    chipRefs.current[categoryId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [categoryId]);

  /** Default expense category (used before OCR answers). */
  const defaultCategoryId = () => {
    const fallback = categories.find((c) => !INCOME_IDS.has(c.id));
    return fallback?.id ?? categories[0]?.id ?? "outros";
  };

  const runOcr = async (input: File | string, knownPayload?: string) => {
    const runId = runIdRef.current;
    setOcrState("scanning");
    try {
      // OCR and QR decoding run in parallel. A payment-screen QR (PIX
      // "copia e cola") carries the EXACT value, which OCR often mangles
      // ("R$ 9”" → 9,00), so its amount wins; its merchant name is a title
      // fallback and its description feeds category detection.
      const [text, qr] = await Promise.all([
        scanReceiptWithTimeout(input),
        knownPayload
          ? Promise.resolve(parseQrFromPayload(knownPayload))
          : decodeQrPayload(input),
      ]);
      if (runId !== runIdRef.current) return; // form was reset meanwhile
      const parsed = parseReceiptText(text);
      // Extract the QR facts into plain locals (avoids TS narrowing through
      // the awaited value below).
      const qrAmount = qr?.amount;
      const qrName = qr?.name;
      const qrDescription = qr?.description;
      const qrNfceStore = qr?.nfceStore;
      const qrNfceDate = qr?.nfceEmissionDate;
      if (qrAmount && qrAmount > 0) parsed.amount = qrAmount;
      if (!parsed.title && qrName) parsed.title = qrName;
      if (!parsed.title && qrNfceStore) parsed.title = qrNfceStore;
      // An NFC-e access key carries the emission date (AAMM) — it is more
      // reliable than the OCR date, but the user's manual pick still wins.
      if (qrNfceDate && !dateTouchedRef.current) parsed.date = qrNfceDate;
      if (qrDescription) {
        const qrCat = findCategoryId(qrDescription, qrName ?? "");
        if (qrCat && qrCat !== "outros" && parsed.categoryId === "outros") {
          parsed.categoryId = qrCat;
        }
      }
      setRawText(text);
      if (!parsed.title && parsed.amount <= 0) {
        setOcrState("empty");
        return;
      }
      setOcrState("done");
      // Prefill the draft with the item list (name + qty + price) when the
      // note is still empty, and fall back to the first item as the
      // description when no store name was recognized.
      const items = extractItems(text);
      if (items.length > 0) {
        setNote((prev) => (prev.trim() ? prev : formatItemsText(items)));
        if (!parsed.title) {
          setTitle((prev) => (prev.trim() ? prev : items[0]?.name ?? ""));
        }
      }
      // Fill only the fields the user hasn't touched yet. The date starts
      // as "today" only as a placeholder — the OCR date overrides it unless
      // the user picked a date manually.
      setTitle((prev) => (prev.trim() ? prev : parsed.title));
      setCents((prev) => (prev > 0 ? prev : Math.round(parsed.amount * 100)));
      setDate((prev) =>
        dateTouchedRef.current ? prev : parsed.date || prev,
      );
      setTime((prev) => (prev ? prev : parsed.time));
      if (!typeTouchedRef.current) setType(parsed.type);
      {
        const { method, cardMode: mode } = normalizePaymentMethod(
          parsed.paymentMethod,
        );
        setPaymentMethod(method);
        if (method === "cartao" && mode) setCardMode(mode);
      }
      setQrInfo(
        qr
          ? qr.amount
            ? `QR detectado · valor ${qr.amount
                .toFixed(2)
                .replace(".", ",")} reais`
            : qr.nfceStore
              ? `QR NFC-e detectado · ${qr.nfceStore}`
              : "QR detectado · sem valor no código"
          : "QR não detectado",
      );
      if (!categoryTouched && parsed.categoryId) {
        const suggested = SCAN_CATEGORIES.find(
          (c) => c.id === parsed.categoryId,
        );
        if (suggested) {
          const { id, created } = applySuggestedCategory(suggested);
          setCategoryId(id);
          if (created) {
            toast(`Categoria "${suggested.label}" criada`, {
              description:
                "Você pode renomeá-la em Categorias a qualquer momento.",
            });
          }
        }
      }
    } catch {
      setOcrState("failed");
    }
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await imageToDataUrl(file, 1000);
      setImages([url]);
      setCategoryId(defaultCategoryId());
      setStep("edit");
      sourceFileRef.current = file;
      void runOcr(file);
    } catch {
      toast("Não foi possível abrir essa imagem", { description: "Tente outra foto." });
    }
  };

  /** Live-camera path: a QR was detected on screen — capture that frame and
   * run the exact same OCR + QR merge as a photo, so the user gets the same
   * review flow. */
  const handleCameraResult = async (payload: string, frame: string) => {
    setStep("edit");
    setImages([frame]);
    setCategoryId(defaultCategoryId());
    void runOcr(frame, payload);
  };

  const handleAddMore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || images.length >= 6) return;
    try {
      const url = await imageToDataUrl(file, 1000);
      setImages((prev) => [...prev, url]);
    } catch {
      toast("Não foi possível abrir essa imagem");
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    setCents(digits ? parseInt(digits, 10) : 0);
  };

  const amountLabel = (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const canSave = cents > 0 && title.trim().length > 0 && !!categoryId;

  const handleSave = () => {
    if (!canSave) return;
    addTransaction({
      title: title.trim(),
      categoryId,
      amount: type === "income" ? cents / 100 : -cents / 100,
      date,
      time: time || undefined,
      note: note.trim() || undefined,
      attachments: images.length ? images : undefined,
      paymentMethod: paymentMethod || undefined,
      cardId: cardId ?? undefined,
      cardMode: paymentMethod === "cartao" ? cardMode || undefined : undefined,
    });
    toast("Nota escaneada e salva", {
      description: "Ela já aparece no seu histórico, com a nota anexada.",
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scan-sheet"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className="glass glass-strong absolute inset-0 z-[56] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                {step === "approve" ? "Revisar e aprovar" : "Escanear nota"}
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                {step === "source" && "Fotografe o cupom ou escolha uma imagem"}
                {step === "camera" && "Aponte para o QR code da nota fiscal"}
                {step === "edit" && "Confira o que a leitura encontrou"}
                {step === "approve" && "Tudo certo antes de salvar?"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
            >
              <X className="size-[18px]" />
            </button>
          </div>

          {/* ---------------- SOURCE ---------------- */}
          {step === "source" && (
            <div className="flex flex-1 flex-col items-center overflow-y-auto no-scrollbar px-5 pb-8 pt-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-[1.6rem] bg-[#1FBF4F]/15 shadow-[0_14px_34px_-14px_rgba(31,191,79,0.6)]">
                <ScanLine className="size-9 text-[#17a443]" strokeWidth={2.2} />
              </div>
              <p className="mt-5 max-w-[280px] text-[14px] leading-relaxed text-glass-sub">
                A câmera lê o cupom fiscal e preenche valor, categoria e data
                para você. Também dá para anexar mais de uma foto.
              </p>

              <div className="mt-8 w-full space-y-3">
                <button
                  type="button"
                  onClick={() => setStep("camera")}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <QrCode className="size-[18px]" />
                  Escanear com a câmera
                </button>
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="glass glass-soft flex w-full items-center justify-center gap-2.5 rounded-full py-3.5 text-[15px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  <Camera className="size-[18px]" />
                  Tirar foto
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="glass glass-soft flex w-full items-center justify-center gap-2.5 rounded-full py-3.5 text-[15px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  <ImagePlus className="size-[18px]" />
                  Escolher da galeria
                </button>
              </div>

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePick}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePick}
              />
            </div>
          )}

          {/* ---------------- CAMERA (live QR scanner) ---------------- */}
          {step === "camera" && (
            <div className="flex flex-1 flex-col px-5 pb-6 pt-3">
              <CameraQrScanner
                onResult={handleCameraResult}
                onClose={() => setStep("source")}
              />
            </div>
          )}

          {/* ---------------- EDIT ---------------- */}
          {step === "edit" && (
            <>
              <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
                {/* Scan animation while the OCR runs */}
                {ocrState === "scanning" && images[0] && (
                  <div className="mx-auto mt-3 w-full max-w-[250px]">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl shadow-[0_18px_44px_-18px_rgba(15,40,90,0.5)] ring-1 ring-white/60">
                      <img
                        src={images[0]}
                        alt="Nota sendo lida"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[#0b1630]/10" />
                      <span className="pointer-events-none absolute left-3 top-3 h-5 w-5 rounded-tl-xl border-l-[3px] border-t-[3px] border-white/90" />
                      <span className="pointer-events-none absolute right-3 top-3 h-5 w-5 rounded-tr-xl border-r-[3px] border-t-[3px] border-white/90" />
                      <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 rounded-bl-xl border-b-[3px] border-l-[3px] border-white/90" />
                      <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 rounded-br-xl border-b-[3px] border-r-[3px] border-white/90" />
                      <div className="scan-line" aria-hidden="true" />
                    </div>
                    <div className="glass mt-3 flex items-center justify-center gap-2 rounded-full px-4 py-2.5">
                      <span className="size-2 shrink-0 animate-pulse rounded-full bg-[#FF9500]" />
                      <p className="text-[12.5px] font-semibold text-glass-ink">
                        Lendo a nota…
                      </p>
                    </div>
                  </div>
                )}

                {/* Attachments strip (hidden while the scan animation shows) */}
                {ocrState !== "scanning" && (
                  <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-0.5">
                    {images.map((img, i) => (
                      <div key={i} className="relative shrink-0">
                        <img
                          src={img}
                          alt={`Nota ${i + 1}`}
                          className="h-24 w-24 rounded-2xl object-cover shadow-[0_8px_20px_-8px_rgba(15,40,90,0.4)]"
                        />
                        <button
                          type="button"
                          aria-label="Remover foto"
                          onClick={() => removeImage(i)}
                          className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-md transition-transform active:scale-90"
                        >
                          <X className="size-3.5" strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                    {images.length < 6 && (
                      <button
                        type="button"
                        onClick={() => addMoreRef.current?.click()}
                        className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-glass-faint/60 text-glass-sub transition-colors hover:bg-white/40"
                      >
                        <ImagePlus className="size-5" />
                        <span className="text-[11px] font-semibold">
                          Adicionar
                        </span>
                      </button>
                    )}
                  </div>
                )}
                <input
                  ref={addMoreRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAddMore}
                />

                {/* OCR status */}
                {ocrState === "scanning" && !images[0] && (
                  <div className="glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-[#FF9500]" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-glass-ink">
                        Lendo a nota…
                      </p>
                      <p className="text-[12px] text-glass-sub">
                        Reconhecendo texto, valor e categoria
                      </p>
                    </div>
                  </div>
                )}
                {ocrState === "done" && (
                  <div className="glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1FBF4F]/15">
                      <Check className="size-3.5 text-[#17a443]" strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-glass-ink">
                        Leitura concluída
                      </p>
                      <p className="text-[12px] text-glass-sub">
                        Confira os campos abaixo e ajuste se precisar.
                      </p>
                    </div>
                  </div>
                )}
                {(ocrState === "empty" || ocrState === "failed") && (
                  <div className="glass mt-4 rounded-2xl px-4 py-3">
                    <p className="text-[13px] font-semibold text-[#FF9500]">
                      Não conseguimos ler a nota automaticamente.
                    </p>
                    <p className="mt-0.5 text-[12px] text-glass-sub">
                      Preencha os campos abaixo ou tente outra foto.
                    </p>
                    {images[0] && (
                      <button
                        type="button"
                        onClick={() =>
                          void runOcr(sourceFileRef.current ?? images[0])
                        }
                        className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-bold text-primary"
                      >
                        <RefreshCw className="size-3.5" /> Tentar de novo
                      </button>
                    )}
                  </div>
                )}

                {/* Raw OCR text (collapsed) */}
                {rawText &&
                  (ocrState === "done" ||
                    ocrState === "empty" ||
                    ocrState === "failed") && (
                    <details className="glass mt-3 rounded-2xl px-4 py-3">
                      <summary className="cursor-pointer select-none text-[12.5px] font-bold text-glass-sub">
                        Ver o que a leitura encontrou
                      </summary>
                      <div className="mt-2 space-y-1 text-[12px] text-glass-sub">
                        <p>
                          Tipo:{" "}
                          <span className="font-bold text-glass-ink">
                            {type === "income" ? "Receita" : "Despesa"}
                          </span>
                          {paymentMethod && (
                            <>
                              {" "}
                              · Pagamento:{" "}
                              <span className="font-bold text-glass-ink">
                                {PAYMENT_LABELS[paymentMethod] ??
                                  paymentMethod}
                              </span>
                            </>
                          )}
                        </p>
                        {categoryId && (
                          <p>
                            Categoria:{" "}
                            <span className="font-bold text-glass-ink">
                              {categories.find((c) => c.id === categoryId)
                                ?.label ?? "Outros"}
                            </span>
                          </p>
                        )}
                        <p>{qrInfo}</p>
                      </div>
                      <pre className="no-scrollbar mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white/40 p-2.5 text-[11px] leading-relaxed text-glass-sub">
                        {rawText}
                      </pre>
                    </details>
                  )}

                {/* Type: despesa / receita */}
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setType("expense");
                      typeTouchedRef.current = true;
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold transition-all active:scale-95",
                      type === "expense"
                        ? "bg-[#FF3B30]/12 text-[#FF3B30] ring-1 ring-[#FF3B30]/40"
                        : "glass text-glass-sub",
                    )}
                  >
                    <ArrowDownLeft className="size-4" /> Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType("income");
                      typeTouchedRef.current = true;
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold transition-all active:scale-95",
                      type === "income"
                        ? "bg-[#1FBF4F]/12 text-[#17a443] ring-1 ring-[#17a443]/40"
                        : "glass text-glass-sub",
                    )}
                  >
                    <ArrowUpRight className="size-4" /> Receita
                  </button>
                </div>

                {/* Amount */}
                <div className="mt-4 text-center">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Valor
                  </p>
                  <input
                    inputMode="numeric"
                    value={amountLabel}
                    onChange={(e) => handleAmount(e.target.value)}
                    placeholder="R$ 0,00"
                    aria-label="Valor"
                    className={cn(
                      "mt-1 w-full bg-transparent text-center text-[36px] font-bold tracking-tight outline-none",
                      type === "income"
                        ? "text-[#17a443]"
                        : "text-[#FF3B30]",
                    )}
                  />
                  <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-primary/30" />
                </div>

                {/* Description */}
                <div className="mt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Descrição
                  </p>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Pão de Açúcar"
                    maxLength={40}
                    className={cn(inputClass, "mt-2")}
                  />
                </div>

                {/* Category */}
                <div className="mt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Categoria
                  </p>
                  <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-0.5">
                    {categories.map((c) => {
                      const selected = categoryId === c.id;
                      return (
                        <button
                          key={c.id}
                          ref={(el) => {
                            chipRefs.current[c.id] = el;
                          }}
                          type="button"
                          onClick={() => {
                            setCategoryId(c.id);
                            setCategoryTouched(true);
                          }}
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all",
                            selected
                              ? "text-white shadow-[0_6px_16px_-6px_rgba(47,107,255,0.5)]"
                              : "glass text-glass-sub",
                          )}
                          style={
                            selected ? { backgroundColor: c.color } : undefined
                          }
                        >
                          <CategoryIcon
                            categoryId={c.id}
                            size="size-5"
                            iconSize="size-3"
                          />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment method */}
                <div className="mt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Forma de pagamento
                  </p>
                  <PaymentMethodSelector
                    value={paymentMethod}
                    onValueChange={(v) => {
                      setPaymentMethod(v);
                      if (v === "cartao") setCardMode("credito");
                      else {
                        setCardMode("");
                        setCardId(null);
                      }
                    }}
                    cardMode={cardMode}
                    onCardModeChange={setCardMode}
                    cardId={cardId}
                    onCardChange={setCardId}
                    cards={cards}
                  />
                </div>

                {/* Date + time */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                      Data
                    </p>
                    <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                      <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => {
                          dateTouchedRef.current = true;
                          setDate(e.target.value);
                        }}
                        className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </label>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                      Hora
                    </p>
                    <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                      <Clock className="size-4 shrink-0 text-glass-sub" />
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </label>
                  </div>
                </div>

                {/* Draft / notes */}
                <div className="mt-6">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    <FileText className="size-3.5" /> Rascunho / Observações
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anotações, parcelas, o que você quiser lembrar…"
                    maxLength={300}
                    rows={3}
                    className={cn(inputClass, "mt-2 resize-none leading-relaxed")}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 pb-7 pt-2">
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={() => setStep("approve")}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]",
                    !canSave && "opacity-50",
                  )}
                >
                  <Check className="size-[18px]" strokeWidth={2.6} />
                  Visualizar e aprovar
                </button>
              </div>
            </>
          )}

          {/* ---------------- APPROVE ---------------- */}
          {step === "approve" && (
            <>
              <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
                {/* Receipt-style summary */}
                <div className="glass rounded-3xl p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1FBF4F]/15">
                      <ScanLine className="size-6 text-[#17a443]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-bold text-glass-ink">
                        {title}
                      </p>
                      <p className="text-[12.5px] text-glass-sub">
                        {date.split("-").reverse().join("/")}
                        {time ? ` às ${time}` : ""}
                      </p>
                    </div>
                  </div>

                  <p
                    className={cn(
                      "amount-tabular mt-4 text-[32px] font-bold leading-none tracking-tight",
                      type === "income"
                        ? "text-[#17a443]"
                        : "text-[#FF3B30]",
                    )}
                  >
                    {type === "income" ? "" : "−"}
                    {amountLabel}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white"
                      style={{
                        backgroundColor:
                          categories.find((c) => c.id === categoryId)?.color ??
                          "#8E8E93",
                      }}
                    >
                      <span className="size-1.5 rounded-full bg-white/90" />
                      {categories.find((c) => c.id === categoryId)?.label ??
                        "Outros"}
                    </span>
                    {paymentMethod && (
                      <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-glass-sub">
                        <CreditCard className="size-3" />
                        {PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
                        {paymentMethod === "cartao" && cardMode
                          ? ` · ${
                              CARD_MODE_LABELS[cardMode as "credito" | "debito"] ??
                              cardMode
                            }`
                          : ""}
                        {cardId &&
                          ` · ${cards.find((c) => c.id === cardId)?.name ?? ""}`.trim()}
                      </span>
                    )}
                    {images.length > 0 && (
                      <span className="glass rounded-full px-3 py-1.5 text-[12px] font-semibold text-glass-sub">
                        {images.length}{" "}
                        {images.length === 1 ? "foto anexada" : "fotos anexadas"}
                      </span>
                    )}
                  </div>

                  {note.trim() && (
                    <div className="mt-4 rounded-2xl bg-white/40 p-3">
                      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                        <FileText className="size-3.5" /> Rascunho
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-glass-ink">
                        {note.trim()}
                      </p>
                    </div>
                  )}

                  {images.length > 0 && (
                    <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-0.5">
                      {images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`Anexo ${i + 1}`}
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-4 px-2 text-center text-[12px] leading-relaxed text-glass-faint">
                  A nota fica anexada à transação e aparece quando você toca no
                  card dela.
                </p>
              </div>

              {/* Footer */}
              <div className="space-y-2.5 px-5 pb-7 pt-2">
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={handleSave}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <Check className="size-[18px]" strokeWidth={2.6} />
                  Salvar transação
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep("edit")}
                    className="glass glass-soft rounded-full py-3 text-[14px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full py-3 text-[14px] font-semibold text-[#FF3B30] transition-colors hover:bg-[#FF3B30]/10 active:scale-[0.98]"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
