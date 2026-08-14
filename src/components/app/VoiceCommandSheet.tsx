import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock,
  Mic,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useSuggestedCategory } from "@/hooks/use-suggested-category";
import { useAppStore } from "@/lib/app-store";
import { SCAN_CATEGORIES } from "@/lib/receipt-scan";
import { parseVoiceCommand, todayIso } from "@/lib/voice-command";
import { cn } from "@/lib/utils";
import { HorizontalScroll } from "./HorizontalScroll";

// ---------------------------------------------------------------------------
// Comando de Voz — dictates a transaction using the browser's Web Speech API
// (pt-BR). Shows the live transcript, parses "gastei cinquenta reais no
// mercado" into value/description/category/date, then lets the user review
// and edit before saving. Falls back to typing or example commands when the
// microphone is unavailable.
// ---------------------------------------------------------------------------

type Step = "listen" | "review";
type TxType = "expense" | "income";

// Minimal typings — the Web Speech API is not in the standard TS lib.
type SRResult = { isFinal: boolean; [index: number]: { transcript: string } };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
type SRInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getSRCtor(): (new () => SRInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as (new () => SRInstance) | undefined) ??
    (w.webkitSpeechRecognition as (new () => SRInstance) | undefined) ??
    null
  );
}

const EXAMPLES = [
  "Gastei cinquenta reais no mercado",
  "Uber quarenta e dois reais e cinquenta",
  "Netflix vinte e sete reais e noventa",
  "Recebi mil e duzentos reais do cliente",
  "Farmácia trinta reais ontem",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

const INCOME_IDS = new Set(["salario", "freelance"]);

export function VoiceCommandSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories, addTransaction } = useAppStore();
  const applySuggestedCategory = useSuggestedCategory();

  const [supported] = useState(() => getSRCtor() !== null);
  const [step, setStep] = useState<Step>("listen");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [manualInput, setManualInput] = useState("");

  // Review fields
  const [type, setType] = useState<TxType>("expense");
  const [cents, setCents] = useState(0);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("");

  const recRef = useRef<SRInstance | null>(null);
  const transcriptRef = useRef("");
  const errorRef = useRef(false);

  // Fresh state + cleanup every time the sheet opens/closes.
  useEffect(() => {
    if (!open) return;
    setStep("listen");
    setListening(false);
    setTranscript("");
    setError("");
    setManualInput("");
    setTitle("");
    setCents(0);
    setCategoryId("");
    setType("expense");
    setDate(todayIso());
    setTime("");
    transcriptRef.current = "";
    errorRef.current = false;
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, [open]);

  // Cleanup on unmount.
  useEffect(() => () => recRef.current?.abort(), []);

  const defaultCategoryId = () => {
    const fallback = categories.find((c) => !INCOME_IDS.has(c.id));
    return fallback?.id ?? categories[0]?.id ?? "outros";
  };

  const goReview = (raw: string) => {
    const parsed = parseVoiceCommand(raw);
    setTitle(parsed.title);
    setCents(Math.round(parsed.amount * 100));
    setType(parsed.isIncome ? "income" : "expense");
    setDate(parsed.date || todayIso());
    setTime(parsed.time);
    if (parsed.categoryId && parsed.categoryId !== "outros") {
      const suggested = SCAN_CATEGORIES.find(
        (c) => c.id === parsed.categoryId,
      );
      if (suggested) {
        const { id, created } = applySuggestedCategory(suggested);
        setCategoryId(id);
        if (created) {
          toast(`Categoria "${suggested.label}" criada`, {
            description: "Você pode renomeá-la em Categorias a qualquer momento.",
          });
        }
        setStep("review");
        return;
      }
    }
    setCategoryId(parsed.categoryId || defaultCategoryId());
    setStep("review");
  };

  const startListening = () => {
    const Ctor = getSRCtor();
    if (!Ctor) return;
    setError("");
    setTranscript("");
    transcriptRef.current = "";
    errorRef.current = false;

    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0]?.transcript ?? "";
      }
      transcriptRef.current = t;
      setTranscript(t);
    };
    rec.onerror = (e) => {
      errorRef.current = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permissão do microfone negada — permita o acesso ou use um exemplo acima.");
      } else if (e.error === "no-speech") {
        setError("Não ouvi nada. Aproxime o microfone e tente de novo.");
      } else if (e.error !== "aborted") {
        setError("Não foi possível ouvir agora. Tente de novo ou digite o comando.");
      }
    };
    rec.onend = () => {
      setListening(false);
      const final = transcriptRef.current.trim();
      if (final) goReview(final);
      else if (!errorRef.current) {
        setError("Não entendi o que foi dito — tente de novo ou use um exemplo.");
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Não foi possível iniciar o microfone. Tente de novo ou digite o comando.");
    }
  };

  const stopListening = () => {
    try {
      recRef.current?.stop();
    } catch {
      setListening(false);
    }
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
      amount: type === "expense" ? -cents / 100 : cents / 100,
      date,
      time: time || undefined,
    });
    toast(type === "expense" ? "Despesa registrada" : "Receita registrada", {
      description: `“${title.trim()}” já está no seu histórico.`,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="voice-sheet"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className="glass glass-strong absolute inset-0 z-[57] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                Comando de voz
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                {step === "listen"
                  ? "Dite o gasto e pronto"
                  : "Confira o que entendemos"}
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

          {/* ---------------- LISTEN ---------------- */}
          {step === "listen" && (
            <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-2 text-center">
              {/* Mic */}
              <div className="relative mx-auto mt-4 flex size-28 items-center justify-center">
                {listening && (
                  <>
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#AF52DE]/30" />
                    <span className="absolute -inset-3 animate-pulse rounded-full bg-[#AF52DE]/15" />
                  </>
                )}
                <button
                  type="button"
                  aria-label={listening ? "Parar" : "Começar a falar"}
                  onClick={listening ? stopListening : startListening}
                  className={cn(
                    "relative flex size-28 items-center justify-center rounded-full text-white shadow-[0_20px_50px_-16px_rgba(175,82,222,0.65)] transition-transform active:scale-95",
                    listening
                      ? "bg-gradient-to-br from-[#c86bff] to-[#AF52DE]"
                      : "bg-gradient-to-br from-[#c86bff] to-[#7d3fd1]",
                  )}
                >
                  <Mic className="size-11" strokeWidth={2} />
                </button>
              </div>

              <p className="mt-6 text-[16px] font-bold text-glass-ink">
                {listening
                  ? "Estou ouvindo…"
                  : supported
                    ? "Toque no microfone e dite"
                    : "Microfone indisponível neste navegador"}
              </p>
              <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed text-glass-sub">
                Diga algo como “gastei cinquenta reais no mercado” — valor,
                descrição e categoria entram sozinhos.
              </p>

              {/* Live transcript */}
              {transcript && (
                <div className="glass mx-auto mt-5 w-full max-w-[320px] rounded-2xl px-4 py-3 text-left">
                  <p className="text-[14px] font-medium leading-relaxed text-glass-ink">
                    “{transcript}”
                  </p>
                </div>
              )}

              {error && (
                <p className="mx-auto mt-3 max-w-[300px] text-[13px] font-semibold leading-relaxed text-[#FF3B30]">
                  {error}
                </p>
              )}

              {/* Example commands (simulate the mic) */}
              <p className="mt-6 text-[11.5px] font-semibold uppercase tracking-wide text-glass-faint">
                Exemplos prontos
              </p>
              <div className="mx-auto mt-2 flex max-w-[320px] flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => goReview(ex)}
                    className="glass rounded-full px-3.5 py-2 text-[12px] font-semibold text-glass-sub transition-colors hover:bg-white/60 active:scale-95"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {/* Manual input */}
              <div className="mx-auto mt-6 w-full max-w-[320px]">
                <input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualInput.trim()) {
                      goReview(manualInput.trim());
                    }
                  }}
                  placeholder="Ou digite: gastei 40 reais na padaria"
                  maxLength={120}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualInput.trim()) goReview(manualInput.trim());
                  }}
                  className="glass glass-soft mt-2 w-full rounded-full py-2.5 text-[13.5px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  Analisar comando
                </button>
              </div>
            </div>
          )}

          {/* ---------------- REVIEW ---------------- */}
          {step === "review" && (
            <>
              <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
                {/* Type */}
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
                  {(["expense", "income"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
                        type === t ? "bg-white shadow-sm" : "text-glass-sub",
                      )}
                    >
                      {t === "expense" ? (
                        <ArrowDownLeft className="size-4 text-[#FF3B30]" />
                      ) : (
                        <ArrowUpRight className="size-4 text-[#17a443]" />
                      )}
                      <span
                        className={
                          type === t
                            ? t === "expense"
                              ? "text-[#FF3B30]"
                              : "text-[#17a443]"
                            : "text-glass-sub"
                        }
                      >
                        {t === "expense" ? "Despesa" : "Receita"}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Amount */}
                <div className="mt-6 text-center">
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
                      type === "expense" ? "text-[#FF3B30]" : "text-[#17a443]",
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
                    placeholder="Ex.: Mercado"
                    maxLength={40}
                    className={cn(inputClass, "mt-2")}
                  />
                </div>

                {/* Category */}
                <div className="mt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Categoria
                  </p>
                  <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">
                    {categories.map((c) => {
                      const selected = categoryId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoryId(c.id)}
                          className={cn(
                            "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all",
                            selected ? "text-glass-ink" : "glass text-glass-sub",
                          )}
                          style={
                            selected
                              ? {
                                  backgroundColor: `${c.color}1f`,
                                  boxShadow: `0 0 0 2px ${c.color}`,
                                }
                              : undefined
                          }
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.label}
                        </button>
                      );
                    })}
                  </HorizontalScroll>
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
                        onChange={(e) => setDate(e.target.value)}
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
                <button
                  type="button"
                  onClick={() => setStep("listen")}
                  className="glass glass-soft w-full rounded-full py-3 text-[14px] font-semibold text-glass-ink transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  Falar de novo
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
