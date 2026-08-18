import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  ImagePlus,
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
import type { ReceiptResult } from "@/convex/aiVision";
import { imageToDataUrl, SCAN_CATEGORIES } from "@/lib/receipt-scan";
import { useAction } from "convex/react";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";
import { normalizePaymentMethod } from "./PaymentMethodSelector";
import {
  AddTransactionSheet,
  type TransactionFormValues,
} from "./AddTransactionSheet";

// ---------------------------------------------------------------------------
// Escanear Nota — 100% Google Gemini (SEM QR Code, SEM OCR).
//   Aceita QUALQUER imagem: nota fiscal com ou sem QR, recibo simples etc.
//   1. Foto recebida → conversão imediata para base64 (sem validação de QR);
//   2. Tela de leitura animada: porcentagem simulada (0→85%), barra de
//      progresso e mensagens rotativas a cada 1,5s;
//   3. O base64 vai DIRETO para a action extractReceipt (Gemini), que devolve
//      campos estruturados de valor, tipo, título, categoria e itens;
//   4. Ao terminar (100%), o resultado é injetado no formulário COMPLETO do
//      "Adicionar Manual" (AddTransactionSheet) — a única diferença entre os
//      fluxos Manual e Scanner é a origem dos dados (digitação vs. IA);
//      a imagem escaneada entra no campo de ANEXOS como miniatura;
//   5. Erro final só se o Gemini falhar ou a imagem for ilegível.
// ---------------------------------------------------------------------------

type Step = "source" | "scan" | "review";
type ScanPhase = "reading" | "success" | "failed";

const INCOME_IDS = new Set(["salario", "freelance", "transferencias"]);

/** Frases rotativas exibidas enquanto a IA lê o comprovante. */
const SCAN_MESSAGES = [
  "Lendo as letrinhas…",
  "Identificando o estabelecimento…",
  "Calculando os valores…",
  "Conferindo os itens…",
  "Quase pronto…",
];

export function ScanReceiptSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories } = useAppStore();
  const applySuggestedCategory = useSuggestedCategory();
  const extractReceipt = useAction(api.aiVision.extractReceipt);
  const overlay = useExclusiveOverlay({
    name: "scan-receipt-sheet",
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
  });

  const [step, setStep] = useState<Step>("source");
  const [images, setImages] = useState<string[]>([]);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("reading");
  // Porcentagem simulada da leitura: sobe até ~85% enquanto a IA responde e
  // pula para 100% quando a API retorna.
  const [progress, setProgress] = useState(0);
  const [scanMsgIndex, setScanMsgIndex] = useState(0);
  // Motivo técnico da falha (ex.: "no-gemini-key", "gemini http 429") exibido
  // de forma discreta na tela de erro para facilitar o diagnóstico.
  const [scanError, setScanError] = useState("");

  // Pré-preenchimento do formulário unificado (AddTransactionSheet) com o
  // resultado da IA — ou vazio quando o usuário escolhe preencher manualmente.
  const [prefill, setPrefill] = useState<TransactionFormValues | null>(null);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  // Bumped on every open/reset so stale scan results never fill a fresh form.
  const runIdRef = useRef(0);
  // Original picked File, kept so "Tentar novamente" re-scans at full quality.
  const sourceFileRef = useRef<File | null>(null);
  // Timers da tela de leitura (progresso, mensagens e abertura do formulário).
  const progressTimerRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const openFormTimerRef = useRef<number | null>(null);

  /** Limpa todos os timers da tela de leitura. */
  const clearScanTimers = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
    }
    if (messageTimerRef.current !== null) {
      window.clearInterval(messageTimerRef.current);
    }
    if (openFormTimerRef.current !== null) {
      window.clearTimeout(openFormTimerRef.current);
    }
    progressTimerRef.current = null;
    messageTimerRef.current = null;
    openFormTimerRef.current = null;
  }, []);

  // Fresh state every time the sheet opens. The cleanup runs whenever the
  // sheet closes or unmounts, so no progress/message interval can outlive its
  // loading view and update a replacement DOM tree.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    clearScanTimers();
    // Invalida respostas assíncronas quando o scanner fecha para que uma
    // leitura pendente não reabra o formulário depois da desmontagem.
    runIdRef.current += 1;
    if (!open) return undefined;
    setStep("source");
    setImages([]);
    setScanPhase("reading");
    setProgress(0);
    setScanMsgIndex(0);
    setScanError("");
    setPrefill(null);
    sourceFileRef.current = null;

    return () => clearScanTimers();
  }, [open, clearScanTimers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Default expense category (used until the scan answers). */
  const defaultCategoryId = () => {
    const fallback = categories.find((c) => !INCOME_IDS.has(c.id));
    return fallback?.id ?? categories[0]?.id ?? "outros";
  };

  /** Resolves a scan category, auto-creating it when it doesn't exist. */
  const applyCategory = (id: string): string => {
    const suggested = SCAN_CATEGORIES.find((c) => c.id === id);
    if (!suggested) return "";
    const { id: resolved, created } = applySuggestedCategory(suggested);
    if (created) {
      toast(`Categoria "${suggested.label}" criada`, {
        description: "Você pode renomeá-la em Categorias a qualquer momento.",
      });
    }
    return resolved;
  };

  /**
   * Monta o pré-preenchimento do formulário unificado a partir do contrato
   * estruturado do Gemini. O tipo seleciona a apresentação já existente de
   * receita/despesa; o título da IA é usado diretamente e regras locais
   * servem apenas como contingência.
   */
  const buildPrefill = (res: ReceiptResult, img: string | null) => {
    const today = new Date().toISOString().slice(0, 10);
    const store = typeof res.store === "string" ? res.store.trim() : "";
    const items = Array.isArray(res.items)
      ? res.items
          .filter((item) => item && typeof item.name === "string")
          .map((item) => ({
            name: item.name.trim() || "Item não identificado",
            qty:
              typeof item.qty === "string" && item.qty.trim()
                ? item.qty.trim()
                : typeof item.qty === "number" &&
                    Number.isFinite(item.qty) &&
                    item.qty > 0
                  ? String(Math.floor(item.qty))
                  : "1",
            price:
              typeof item.price === "number" &&
              Number.isFinite(item.price) &&
              item.price >= 0
                ? item.price
                : 0,
          }))
      : [];
    const effectiveType =
      res.transactionType === "income" ? "income" : "expense";
    const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
    const total =
      typeof res.total === "number" &&
      Number.isFinite(res.total) &&
      res.total > 0
        ? res.total
        : itemsTotal;
    const safeDate =
      typeof res.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(res.date) &&
      !Number.isNaN(Date.parse(`${res.date}T12:00:00`))
        ? res.date
        : today;
    const safeTime =
      typeof res.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(res.time)
        ? res.time
        : "";

    const fallbackTitle =
      effectiveType === "income"
        ? store
          ? `Pix recebido de ${store}`
          : "Receita recebida"
        : items.length > 0
          ? describePurchase(items, store, store)
          : store || "Comprovante";
    const title =
      typeof res.suggestedTitle === "string" && res.suggestedTitle.trim()
        ? res.suggestedTitle.trim()
        : fallbackTitle;

    // Despesas recebem somente os itens comprados. Serviços digitais e
    // pagamentos únicos não usam o prefixo artificial "1x"; receitas ficam
    // sem itens adquiridos a registrar no rascunho.
    const note =
      effectiveType === "income"
        ? ""
        : draftPurchase(items, {
            omitSingleQuantity:
              res.purchaseContext === "digital" ||
              res.purchaseContext === "single_payment" ||
              res.categorySuggestion === "assinaturas" ||
              /^assinatura\b/i.test(title),
          });

    const fallbackCategory =
      effectiveType === "income"
        ? "transferencias"
        : classifyPurchase(items, store).categoryId;
    const suggestedCategory =
      effectiveType === "income"
        ? res.categorySuggestion === "salario"
          ? "salario"
          : fallbackCategory
        : res.categorySuggestion && res.categorySuggestion !== "outros"
          ? res.categorySuggestion
          : fallbackCategory;
    const resolvedCategory = suggestedCategory
      ? applyCategory(suggestedCategory)
      : "";
    const payment = normalizePaymentMethod(res.paymentMethod);

    return {
      type: effectiveType,
      cents: Math.max(0, Math.round(total * 100)),
      title,
      // Nunca repassa um ID sugerido sem resolução: o formulário recebe um ID
      // existente/criado pelo catálogo ou um fallback seguro já presente.
      categoryId: resolvedCategory || defaultCategoryId(),
      date: safeDate,
      time: safeTime,
      note,
      // A imagem original escaneada entra no campo de ANEXOS do formulário.
      attachments:
        typeof img === "string" && img.startsWith("data:image/")
          ? [{ src: img, isImage: true, name: "Nota escaneada" }]
          : [],
      recurrence: "unica" as const,
      frequency: "mensal" as const,
      daysInterval: 15,
      installments: 2,
      currentInstallment: 1,
      paymentMethod: payment.method,
      cardMode: payment.cardMode,
      cardId: null,
    } satisfies TransactionFormValues;
  };

  /** Pré-preenchimento mínimo usado se uma resposta externa vier incompleta.
   * Mantém a revisão navegável mesmo quando não for possível aproveitar os
   * campos opcionais retornados pela IA. */
  const buildSafeFallbackPrefill = (img: string | null) => ({
    type: "expense" as const,
    cents: 0,
    title: "Comprovante",
    categoryId: defaultCategoryId(),
    date: new Date().toISOString().slice(0, 10),
    time: "",
    note: "",
    attachments:
      typeof img === "string" && img.startsWith("data:image/")
        ? [{ src: img, isImage: true, name: "Nota escaneada" }]
        : [],
    recurrence: "unica" as const,
    frequency: "mensal" as const,
    daysInterval: 15,
    installments: 2,
    currentInstallment: 1,
    paymentMethod: "" as const,
    cardMode: "" as const,
    cardId: null,
  }) satisfies TransactionFormValues;

  /** Atualiza o formulário unificado já montado com o pré-preenchimento.
   * A mudança para review alterna somente a visibilidade entre as duas views. */
  const openReviewForm = (values: TransactionFormValues) => {
    setPrefill(values);
    setStep("review");
  };

  /**
   * FUNÇÃO CENTRAL — lê QUALQUER imagem de comprovante com o Gemini.
   *   1) Sem nenhuma validação de QR Code: converte a foto para base64;
   *   2) Tela de leitura animada (porcentagem + barra + mensagens rotativas);
   *   3) Envia o base64 DIRETO para extractReceipt (Gemini — modelo
   *      gemini-1.5-pro-latest, com fallback automático para outros);
   *   4) Ao responder, pula para 100% e abre o formulário "Adicionar Manual"
   *      já preenchido, com a nota anexada;
   *   5) Erro final só se o Gemini falhar ou a imagem for ilegível.
   */
  const lerComprovante = async (file: File) => {
    const runId = runIdRef.current;
    sourceFileRef.current = file;

    setStep("scan");
    setScanPhase("reading");
    setScanError("");
    clearScanTimers();
    setProgress(0);
    setScanMsgIndex(0);

    // Progresso simulado: sobe rápido até ~85% enquanto a IA processa.
    progressTimerRef.current = window.setInterval(() => {
      setProgress((p) => Math.min(85, p + 5 + Math.round(Math.random() * 8)));
    }, 170);
    // Mensagens rotativas a cada 1,5s.
    messageTimerRef.current = window.setInterval(() => {
      setScanMsgIndex((i) => (i + 1) % SCAN_MESSAGES.length);
    }, 1500);

    // 1) Conversão imediata e segura para base64 (sem checagem de QR).
    let img: string | null = null;
    try {
      img = await imageToDataUrl(file, 1200, 0.82);
      console.log("[Leitor de Notas] Foto convertida para base64:", {
        ok: img.startsWith("data:image/jpeg"),
        tamanho: `${Math.round(img.length / 1024)} KB`,
        arquivo: file.name,
        bytes: file.size,
      });
    } catch (e) {
      console.error("[Leitor de Notas] Falha na conversão da imagem:", e);
    }
    if (runId !== runIdRef.current) return;
    if (!img) {
      // Sem imagem não há o que enviar ao modelo — erro final (único caso).
      clearScanTimers();
      setScanPhase("failed");
      setScanError("conversao-imagem-falhou");
      return;
    }
    setImages([img]);

    // 2) Envio DIRETO ao Gemini (sem QR, sem OCR local, sem scrape).
    let res: ReceiptResult | null = null;
    try {
      [res] = await Promise.all([
        extractReceipt({ image: img }),
        sleep(1400),
      ]);
    } catch (e) {
      console.error("[Leitor de Notas] Erro na chamada do Gemini:", e);
      res = null;
    }
    if (runId !== runIdRef.current) return;

    // 3) Preenchimento: o JSON estruturado abre o formulário unificado.
    // Respostas externas são verificadas em tempo de execução antes de acessar
    // itens opcionais, evitando que um payload parcial deixe o scanner parado.
    const hasItems = Array.isArray(res?.items) && res.items.length > 0;
    const hasScanData =
      typeof res?.total === "number" ||
      (typeof res?.store === "string" && res.store.trim().length > 0) ||
      hasItems;
    if (res?.ok && hasScanData) {
      clearScanTimers();
      setProgress(100);
      setScanPhase("success");

      let values: TransactionFormValues;
      try {
        values = buildPrefill(res, img);
      } catch (error) {
        console.error("[Leitor de Notas] Pré-preenchimento inválido:", error);
        values = buildSafeFallbackPrefill(img);
      }

      openFormTimerRef.current = window.setTimeout(() => {
        openFormTimerRef.current = null;
        if (runId === runIdRef.current) openReviewForm(values);
      }, 1000);
      return;
    }

    // 4) SÓ aqui (Gemini falhou ou imagem ilegível) → tela de erro.
    clearScanTimers();
    setScanPhase("failed");
    setScanError(res?.error ?? "resposta-vazia");
  };

  /** Aguarda `ms` milissegundos — evita que a leitura vire um flash quando o
   * modelo responde rápido demais. */
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  /** Traduz o código técnico de erro numa orientação clara. */
  const orientacaoErroIA = (raw: string): string => {
    if (/no-gemini-key/i.test(raw)) {
      return "A leitura por IA não está configurada: adicione GOOGLE_API_KEY na aba Keys do projeto e tente novamente.";
    }
    if (/timeout|timed out|deadline/i.test(raw)) {
      return "A leitura demorou demais para responder. Tente novamente.";
    }
    if (/gemini http 4|gemini http 5|rate limit|429/i.test(raw)) {
      return "O serviço de IA recusou a leitura no momento. Aguarde um instante e tente de novo.";
    }
    if (/nota-ilegivel|json-invalido|resposta-vazia/i.test(raw)) {
      return "A IA não conseguiu identificar um comprovante legível na imagem. Tente uma foto mais nítida e com boa iluminação.";
    }
    return "Ocorreu um erro na leitura. Tente outra foto mais nítida ou preencha manualmente.";
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Tudo acontece dentro de `lerComprovante`: base64 → Gemini →
    // formulário preenchido (ou erro final). Nenhum erro é disparado aqui.
    void lerComprovante(file);
  };

  const handleRetry = () => {
    const file = sourceFileRef.current;
    if (!file) return;
    void lerComprovante(file);
  };

  /** Volta à escolha da foto e cancela uma leitura em andamento. */
  const backToSource = () => {
    runIdRef.current += 1;
    clearScanTimers();
    setStep("source");
  };

  /** Falha na leitura: abre o formulário completo em branco para digitação. */
  const handleManualFill = () => {
    openReviewForm({
      type: "expense",
      cents: 0,
      title: "",
      categoryId: defaultCategoryId(),
      date: new Date().toISOString().slice(0, 10),
      time: "",
      note: "",
      attachments: images[0]
        ? [{ src: images[0], isImage: true, name: "Nota escaneada" }]
        : [],
      recurrence: "unica",
      frequency: "mensal",
      daysInterval: 15,
      installments: 2,
      currentInstallment: 1,
      paymentMethod: "",
      cardMode: "",
      cardId: null,
    });
  };

  /** Fecha a revisão e o sheet pai sem desmontar seletivamente o scanner.
   * As duas views continuam montadas; apenas recebem a classe `hidden`. */
  const handleReviewClose = () => {
    setStep("source");
    setPrefill(null);
    onClose();
  };

  return (
    <div className="contents">
      {/* Scanner e revisão ficam sempre montados. A troca por `hidden` evita
          que o React/Radix remova uma árvore enquanto a outra é exibida. */}
      <div className={open && step !== "review" ? "block" : "hidden"}>
        <motion.div
          initial={false}
          animate={{ y: open && step !== "review" ? 0 : "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className="glass glass-strong absolute inset-0 z-[56] flex flex-col bg-white dark:bg-[#f4f8ff]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                Escanear nota
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                {step === "source" && "Fotografe a nota ou escolha uma imagem"}
                {step === "scan" && "Isso leva alguns segundos"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
            >
              <X className="size-[18px]" />
            </button>
          </div>

          {/* ---------------- SOURCE ---------------- */}
          {step === "source" && (
            <div
              key="view-scanner"
              className="no-scrollbar flex flex-1 flex-col items-center overflow-y-auto px-5 pb-8 pt-6 text-center"
            >
              <div className="flex size-20 items-center justify-center rounded-[1.6rem] bg-[#1FBF4F]/15 shadow-[0_14px_34px_-14px_rgba(31,191,79,0.6)]">
                <ScanLine className="size-9 text-[#17a443]" strokeWidth={2.2} />
              </div>
              <p className="mt-5 max-w-[300px] text-[14px] leading-relaxed text-glass-sub">
                Aceitamos qualquer comprovante: nota fiscal com ou sem QR code,
                recibo de padaria, cupom de mercado… A inteligência artificial
                lê o texto da imagem e preenche tudo para você revisar.
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

          {/* ---------------- SCAN (leitura animada) ---------------- */}
          {step === "scan" && (
            <div
              key="view-loading"
              className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3"
            >
              <div className="mx-auto mt-3 w-full max-w-[250px]">
                {scanPhase !== "failed" && (
                  <button
                    type="button"
                    onClick={backToSource}
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
                  {scanPhase !== "failed" && (
                    <div key="view-scan-overlay">
                      <div className="pointer-events-none absolute inset-0 bg-[#0b1630]/10" />
                      <span className="pointer-events-none absolute left-3 top-3 h-5 w-5 rounded-tl-xl border-l-[3px] border-t-[3px] border-white/90" />
                      <span className="pointer-events-none absolute right-3 top-3 h-5 w-5 rounded-tr-xl border-r-[3px] border-t-[3px] border-white/90" />
                      <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 rounded-bl-xl border-b-[3px] border-l-[3px] border-white/90" />
                      <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 rounded-br-xl border-b-[3px] border-r-[3px] border-white/90" />
                      <div className="scan-line" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Status: mensagem rotativa + porcentagem + barra */}
                <div className="glass mt-3 rounded-2xl px-4 py-3">
                  {scanPhase === "success" ? (
                    <div
                      key="view-scan-success"
                      className="flex items-center gap-2.5"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1FBF4F]/15">
                        <Check
                          className="size-3.5 text-[#17a443]"
                          strokeWidth={3}
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-glass-ink">
                          Dados encontrados
                        </p>
                        <p className="text-[12px] text-glass-sub">
                          Abrindo a revisão…
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key="view-scan-status-active">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "size-2.5 shrink-0 animate-pulse rounded-full",
                            scanPhase === "failed"
                              ? "bg-[#FF3B30]"
                              : "bg-[#FF9500]",
                          )}
                        />
                        <p className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-glass-ink">
                          {scanPhase === "failed"
                            ? "Não conseguimos ler"
                            : SCAN_MESSAGES[scanMsgIndex]}
                        </p>
                      </div>

                      {scanPhase === "reading" && (
                        <div key="view-scan-progress">
                          <div className="mt-2.5 flex items-center justify-between gap-3">
                            <p className="truncate text-[12px] font-medium text-glass-sub">
                              Analisando a inteligência do comprovante…
                            </p>
                            <p className="amount-tabular shrink-0 text-[12.5px] font-bold text-primary">
                              {progress}%
                            </p>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary to-[#7AA7FF] shadow-[0_0_10px_rgba(47,107,255,0.55)] transition-[width] duration-200 ease-out"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {scanPhase === "failed" && (
                    <div key="view-scan-failed" className="mt-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="glass glass-soft flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                        >
                          <RefreshCw className="size-3.5" />
                          Tentar novamente
                        </button>
                        <button
                          type="button"
                          onClick={handleManualFill}
                          className="flex items-center justify-center rounded-full bg-primary py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(47,107,255,0.6)] transition-all hover:brightness-105 active:scale-[0.98]"
                        >
                          Preencher manualmente
                        </button>
                      </div>

                      {scanError && (
                        <div className="space-y-1.5">
                          <p className="rounded-xl bg-white/40 px-3 py-2 text-[12px] font-semibold leading-snug text-glass-ink">
                            {orientacaoErroIA(scanError)}
                          </p>
                          <p className="px-1 text-center text-[10.5px] font-medium text-glass-faint">
                            Detalhe técnico: {scanError}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </div>

      {/* A revisão também permanece montada desde a abertura do scanner.
          `initial` começa nulo e o formulário aplica seus próprios defaults
          seguros até a IA fornecer um pré-preenchimento válido. */}
      <div className={open && step === "review" ? "block" : "hidden"}>
        <AddTransactionSheet
          key="view-form"
          open={open && step === "review"}
          overlayParentId={overlay.overlayId}
          onClose={handleReviewClose}
          initial={prefill ?? null}
        />
      </div>
    </div>
  );
}
