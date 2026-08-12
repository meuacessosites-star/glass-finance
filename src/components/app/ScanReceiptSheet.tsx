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
  Link2,
  RefreshCw,
  ScanLine,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useSuggestedCategory } from "@/hooks/use-suggested-category";
import { useAppStore } from "@/lib/app-store";
import { api } from "@/convex/_generated/api";
import {
  classifyPurchase,
  describePurchase,
  draftPurchase,
} from "@/lib/purchase-format";
import type { NfceScrapeResult } from "@/convex/nfceParser";
import {
  decodeQrFromDataUrl,
  imageToDataUrl,
  parseQrPayload,
  SCAN_CATEGORIES,
} from "@/lib/receipt-scan";
import { useAction } from "convex/react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import {
  CARD_MODE_LABELS,
  PaymentMethodSelector,
  type CardMode,
  type PaymentMethodId,
} from "./PaymentMethodSelector";

// ---------------------------------------------------------------------------
// Escanear Nota — 100% determinístico (SEM IA, SEM OCR).
//   1. Foto recebida → decodificação de QR Code com jsQR (UMA tentativa,
//      orçamento de ~1s — nunca fica "caçando").
//   2. QR com URL da NFC-e → scrape da SEFAZ no backend (convex/nfce.ts,
//      cheerio) → dados EXATOS preenchem a tela de aprovação.
//   3. QR com payload PIX → valor/beneficiário lidos direto do código.
//   4. QR ilegível/ausente ou scrape com erro → mensagem amigável + campo
//      "Cole o link do QR Code da nota aqui" (link manual).
//   5. As regras condicionais (3+ itens → categoria; 1–2 → "qtd x produto";
//      Rascunho → loja + lista limpa) são aplicadas no preenchimento.
// ---------------------------------------------------------------------------

type Step = "source" | "scan" | "edit" | "approve";
type ScanPhase = "reading" | "link" | "success";

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

type ScrapeResult = NfceScrapeResult;

export function ScanReceiptSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories, cards, addTransaction } = useAppStore();
  const applySuggestedCategory = useSuggestedCategory();
  const scrapeNfce = useAction(api.nfce.scrapeNfce);

  const [step, setStep] = useState<Step>("source");
  const [images, setImages] = useState<string[]>([]);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("reading");
  const [scanStatus, setScanStatus] = useState("");
  const [scanResultInfo, setScanResultInfo] = useState("");
  // Mensagem técnica (ex.: "http 404", "url não permitida") exibida de forma
  // discreta quando o scrape do link falha.
  const [scanError, setScanError] = useState("");
  // Campo de link manual (fallback quando o QR não é legível).
  const [manualLink, setManualLink] = useState("");

  // Form fields (prefilled only with dados exatos do QR/scrape)
  const [title, setTitle] = useState("");
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | "">("");
  const [cardMode, setCardMode] = useState<CardMode | "">("");
  const [cardId, setCardId] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const addMoreRef = useRef<HTMLInputElement | null>(null);
  // Bumped on every open/reset so stale scan results never fill a fresh form.
  const runIdRef = useRef(0);
  // Original picked File, kept so "Tentar novamente" re-scans at full quality.
  const sourceFileRef = useRef<File | null>(null);
  // True once the user picks the date manually — scan data never overrides it.
  const dateTouchedRef = useRef(false);
  // True once the user picks Despesa/Receita manually — scan data never overrides it.
  const typeTouchedRef = useRef(false);
  // Timer that advances "success" → "approve", cleared on reset/unmount.
  const successTimerRef = useRef<number | null>(null);
  // Category chip refs, so the selected chip can be scrolled into view.
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    runIdRef.current += 1;
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    setStep("source");
    setImages([]);
    setScanPhase("reading");
    setScanStatus("");
    setScanResultInfo("");
    setScanError("");
    setManualLink("");
    setTitle("");
    setCents(0);
    setCategoryId("");
    setDate(new Date().toISOString().slice(0, 10));
    setTime("");
    setNote("");
    setType("expense");
    setPaymentMethod("");
    setCardMode("");
    setCardId(null);
    sourceFileRef.current = null;
    dateTouchedRef.current = false;
    typeTouchedRef.current = false;
  }, [open]);

  // Clear the success timer on unmount.
  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  // Keep the selected category chip visible in the scrollable chips row.
  useEffect(() => {
    if (!categoryId) return;
    chipRefs.current[categoryId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [categoryId]);

  /** Default expense category (used until the scan answers). */
  const defaultCategoryId = () => {
    const fallback = categories.find((c) => !INCOME_IDS.has(c.id));
    return fallback?.id ?? categories[0]?.id ?? "outros";
  };

  /** Resolves a scan category, auto-creating it when it doesn't exist. */
  const applyCategory = (id: string) => {
    const suggested = SCAN_CATEGORIES.find((c) => c.id === id);
    if (!suggested) return;
    const { id: resolved, created } = applySuggestedCategory(suggested);
    setCategoryId(resolved);
    if (created) {
      toast(`Categoria "${suggested.label}" criada`, {
        description: "Você pode renomeá-la em Categorias a qualquer momento.",
      });
    }
  };

  /**
   * Preenche o formulário com os dados EXATOS da nota (scrape da SEFAZ),
   * aplicando as regras universais: 3+ itens → Descrição com categoria geral
   * (Mercado/Farmácia/Restaurante); 1–2 itens → "1x Produto"; Rascunho com
   * "Estabelecimento: {loja}" + lista formatada dos itens.
   */
  const applyScraped = (res: ScrapeResult) => {
    const store = res.store || "";
    const items = res.items;
    const total =
      (res.total && res.total > 0
        ? res.total
        : items.reduce((sum, it) => sum + (it.price || 0), 0)) || 0;
    if (total > 0) setCents(Math.round(total * 100));
    if (res.date) setDate(res.date);
    if (res.time) setTime(res.time);
    if (items.length > 0) {
      setTitle(describePurchase(items, store, res.store ?? ""));
      setNote(draftPurchase(store, items));
      const detected = classifyPurchase(items, store).categoryId;
      if (detected && detected !== "outros") applyCategory(detected);
    } else {
      setTitle((prev) => (prev.trim() ? prev : store || "Nota fiscal"));
    }
    if (!categoryId) setCategoryId(defaultCategoryId());
    setScanResultInfo(
      `Leitura da nota · ${store || "imagem"} · ${items.length} ${
        items.length === 1 ? "item" : "itens"
      }`,
    );
  };

  /** Termina uma leitura bem-sucedida e leva à tela de aprovação. */
  const finishScan = (runId: number) => {
    setScanPhase("success");
    setScanStatus("Dados encontrados — abrindo a revisão…");
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = window.setTimeout(() => {
      if (runId === runIdRef.current) setStep("approve");
    }, 450);
  };

  /**
   * Bifurcação silenciosa após a leitura do QR: URL → scrape da SEFAZ;
   * PIX → preenchimento direto. Falha no scrape → fase "link" (manual),
   * SEM tela de erro — apenas mensagem amigável + campo de link.
   */
  const aplicarScrape = async (url: string, runId: number) => {
    setScanPhase("reading");
    setScanStatus("QR encontrado — buscando os dados da nota na SEFAZ…");
    let res: ScrapeResult;
    try {
      res = await scrapeNfce({ url });
    } catch (e) {
      console.error("[Leitor de Notas] Erro no scrape:", e);
      res = { ok: false, items: [], error: "scrape-falhou" };
    }
    if (runId !== runIdRef.current) return;
    if (res.ok && (res.store || res.total || res.items.length)) {
      applyScraped(res);
      finishScan(runId);
      return;
    }
    // Scrape falhou → link manual (sem IA, sem OCR).
    setScanPhase("link");
    setScanStatus(
      "Não foi possível acessar a página da nota pelo link. Confira se ele está completo e tente de novo:",
    );
    setScanError(res.error ?? "scrape-falhou");
  };

  /**
   * FUNÇÃO CENTRAL — processa uma foto de forma 100% determinística:
   *   1) Converte o arquivo em data URL (sem IA);
   *   2) UMA tentativa de QR Code com jsQR (orçamento de ~1s);
   *   3) QR com URL → scrape da SEFAZ; QR PIX → preenchimento direto;
   *   4) Sem QR legível → mensagem amigável + campo de link manual.
   * Nenhuma etapa usa IA nem OCR. O fluxo nunca "caça" o QR.
   */
  const processarImagem = async (file: File) => {
    const runId = runIdRef.current;
    sourceFileRef.current = file;

    setStep("scan");
    setScanPhase("reading");
    setScanStatus("Procurando o QR Code da nota…");
    setScanError("");
    setManualLink("");

    // 1) Conversão segura da imagem.
    let dataUrl: string | null = null;
    try {
      dataUrl = await imageToDataUrl(file, 1600, 0.9);
      console.log("[Leitor de Notas] Foto convertida:", {
        ok: dataUrl.startsWith("data:"),
        tamanho: `${Math.round(dataUrl.length / 1024)} KB`,
        arquivo: file.name,
      });
    } catch (e) {
      console.error("[Leitor de Notas] Falha na conversão da imagem:", e);
    }
    if (runId !== runIdRef.current) return;
    if (!dataUrl) {
      setScanPhase("link");
      setScanStatus(
        "Não conseguimos abrir essa imagem. Cole o link do QR Code da nota abaixo ou tente outra foto:",
      );
      setScanError("conversao-imagem-falhou");
      return;
    }
    setImages([dataUrl]);

    // 2) UMA tentativa de QR Code (orçamento ~1s) — sem caçada multi-resolução.
    const raw = await decodeQrFromDataUrl(dataUrl, 1000);
    if (runId !== runIdRef.current) return;
    const payload = parseQrPayload(raw ?? "");

    // 3) Bifurcação silenciosa com base no conteúdo do QR.
    if (payload?.kind === "url") {
      await aplicarScrape(payload.url, runId);
      return;
    }
    if (payload?.kind === "pix") {
      setScanStatus("QR encontrado — dados do Pix lidos…");
      if (payload.value && payload.value > 0) {
        setCents(Math.round(payload.value * 100));
      }
      setTitle(payload.merchant ? `Pix · ${payload.merchant}` : "Pix");
      setPaymentMethod("pix");
      if (!categoryId) setCategoryId(defaultCategoryId());
      setScanResultInfo(
        `Leitura do QR · Pix · ${payload.merchant || "recebedor"}`,
      );
      finishScan(runId);
      return;
    }

    // 4) QR ilegível/ausente → mensagem amigável + campo de link manual.
    //    Nenhum erro é mostrado; o usuário cola o link e seguimos o scrape.
    setScanPhase("link");
    setScanStatus(
      "Não encontramos um QR Code legível na foto. Tire uma foto mais nítida do QR — ou cole o link do QR Code da nota abaixo:",
    );
  };

  /** Fallback manual: usuário cola o link do QR Code da nota. */
  const processarLink = async () => {
    const runId = runIdRef.current;
    const link = manualLink.trim();
    if (!/^https?:\/\//i.test(link)) {
      setScanError("Informe um link completo, começando com https://");
      return;
    }
    setStep("scan");
    setScanPhase("reading");
    setScanStatus("Buscando os dados da nota na SEFAZ…");
    setScanError("");
    await aplicarScrape(link, runId);
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Tudo acontece dentro de `processarImagem`: QR → scrape → aprovação
    // (ou campo de link manual). Nenhum erro é disparado neste ponto.
    void processarImagem(file);
  };

  const handleRetry = () => {
    const file = sourceFileRef.current;
    if (!file) return;
    void processarImagem(file);
  };

  const handleManualFill = () => {
    if (!categoryId) setCategoryId(defaultCategoryId());
    setStep("edit");
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

  const scanStatusTitle =
    scanPhase === "reading"
      ? "Lendo a nota…"
      : scanPhase === "success"
        ? "Dados encontrados"
        : "QR Code não legível";

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
                {step === "source" && "Fotografe o cupom ou cole o link do QR Code"}
                {step === "scan" && "Lendo o QR Code da nota…"}
                {step === "edit" && "Confira e ajuste os campos"}
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
            <div className="no-scrollbar flex flex-1 flex-col items-center overflow-y-auto px-5 pb-8 pt-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-[1.6rem] bg-[#1FBF4F]/15 shadow-[0_14px_34px_-14px_rgba(31,191,79,0.6)]">
                <ScanLine className="size-9 text-[#17a443]" strokeWidth={2.2} />
              </div>
              <p className="mt-5 max-w-[300px] text-[14px] leading-relaxed text-glass-sub">
                Fotografe o QR Code da nota fiscal (NFC-e) ou escolha uma
                imagem. O sistema lê o QR, busca os dados oficiais na SEFAZ e
                preenche tudo para você revisar.
              </p>

              <div className="mt-8 w-full space-y-3">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]"
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

              <div className="mt-7 w-full">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-glass-faint/40" />
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-faint">
                    Não tem a foto?
                  </p>
                  <span className="h-px flex-1 bg-glass-faint/40" />
                </div>
                <label className="glass glass-soft mt-3 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-left">
                  <Link2 className="size-4 shrink-0 text-glass-sub" />
                  <input
                    value={manualLink}
                    onChange={(e) => setManualLink(e.target.value)}
                    placeholder="Cole o link do QR Code da nota aqui"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full bg-transparent text-[13.5px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint"
                  />
                </label>
                <button
                  type="button"
                  disabled={!/^https?:\/\//i.test(manualLink.trim())}
                  onClick={() => void processarLink()}
                  className="glass mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98] disabled:opacity-40"
                >
                  <Link2 className="size-4" />
                  Buscar dados da nota
                </button>
                {scanError && (
                  <p className="mt-2 text-[12px] font-medium text-[#FF3B30]">
                    {scanError}
                  </p>
                )}
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

          {/* ---------------- SCAN (lendo o QR / link manual) ---------------- */}
          {step === "scan" && (
            <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
              <div className="mx-auto mt-3 w-full max-w-[250px]">
                {scanPhase === "reading" && (
                  <button
                    type="button"
                    onClick={() => setStep("source")}
                    className="glass glass-soft mb-3 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-semibold text-glass-sub transition-all hover:bg-white/60 active:scale-[0.98]"
                  >
                    <ImagePlus className="size-3.5" />
                    Escolher outra foto
                  </button>
                )}
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl shadow-[0_18px_44px_-18px_rgba(15,40,90,0.5)] ring-1 ring-white/60">
                  {images[0] ? (
                    <img
                      src={images[0]}
                      alt="Nota sendo lida"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0b1630]">
                      <ScanLine className="size-10 text-white/50" />
                    </div>
                  )}
                  {scanPhase === "reading" && (
                    <>
                      <div className="pointer-events-none absolute inset-0 bg-[#0b1630]/10" />
                      <span className="pointer-events-none absolute left-3 top-3 h-5 w-5 rounded-tl-xl border-l-[3px] border-t-[3px] border-white/90" />
                      <span className="pointer-events-none absolute right-3 top-3 h-5 w-5 rounded-tr-xl border-r-[3px] border-t-[3px] border-white/90" />
                      <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 rounded-bl-xl border-b-[3px] border-l-[3px] border-white/90" />
                      <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 rounded-br-xl border-b-[3px] border-r-[3px] border-white/90" />
                      <div className="scan-line" aria-hidden="true" />
                    </>
                  )}
                </div>

                {/* Status */}
                <div className="glass mt-3 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {scanPhase === "success" ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1FBF4F]/15">
                        <Check
                          className="size-3.5 text-[#17a443]"
                          strokeWidth={3}
                        />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "size-2.5 shrink-0 animate-pulse rounded-full",
                          scanPhase === "link"
                            ? "bg-[#FF9500]"
                            : "bg-[#FF9500]",
                        )}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-glass-ink">
                        {scanStatusTitle}
                      </p>
                      <p className="text-[12px] text-glass-sub">{scanStatus}</p>
                    </div>
                  </div>

                  {scanPhase === "link" && (
                    <div className="mt-3 space-y-2.5">
                      {/* Campo de link manual (fallback) */}
                      <label className="glass glass-soft flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5">
                        <Link2 className="size-4 shrink-0 text-glass-sub" />
                        <input
                          value={manualLink}
                          onChange={(e) => setManualLink(e.target.value)}
                          placeholder="Cole o link do QR Code da nota aqui"
                          inputMode="url"
                          autoCapitalize="none"
                          autoCorrect="off"
                          className="w-full bg-transparent text-[13px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint"
                        />
                      </label>
                      {scanError && (
                        <p className="px-1 text-[11.5px] font-medium text-[#FF3B30]">
                          {/^https?:\/\//i.test(manualLink.trim())
                            ? "Não foi possível buscar os dados. Confira o link e tente de novo."
                            : "Informe um link completo, começando com https://"}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => void processarLink()}
                          className="flex items-center justify-center gap-1.5 rounded-full bg-primary py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(47,107,255,0.6)] transition-all hover:brightness-105 active:scale-[0.98]"
                        >
                          <Link2 className="size-3.5" />
                          Buscar dados
                        </button>
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="glass glass-soft flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                        >
                          <RefreshCw className="size-3.5" />
                          Outra foto
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleManualFill}
                        className="w-full rounded-full py-2.5 text-[13px] font-semibold text-glass-sub transition-colors hover:bg-white/40 active:scale-[0.98]"
                      >
                        Preencher manualmente
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---------------- EDIT ---------------- */}
          {step === "edit" && (
            <>
              <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
                {/* Attachments strip */}
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
                <input
                  ref={addMoreRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAddMore}
                />

                {scanResultInfo && (
                  <div className="glass mt-3 flex items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1FBF4F]/15">
                      <Check
                        className="size-3.5 text-[#17a443]"
                        strokeWidth={3}
                      />
                    </span>
                    <p className="text-[12.5px] font-semibold leading-snug text-glass-ink">
                      {scanResultInfo}
                    </p>
                  </div>
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
                          onClick={() => setCategoryId(c.id)}
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
