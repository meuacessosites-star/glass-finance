import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Mic, Send, X } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  FinanceChatMessage,
  FinanceChatResult,
  FinanceTransactionDraft,
} from "@/convex/aiVision";
import { useSuggestedCategory } from "@/hooks/use-suggested-category";
import { SCAN_CATEGORIES } from "@/lib/receipt-scan";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";
import { normalizePaymentMethod } from "./PaymentMethodSelector";
import {
  AddTransactionSheet,
  type TransactionFormValues,
  type TxType,
} from "./AddTransactionSheet";

// ---------------------------------------------------------------------------
// Assistente financeiro — conversa por texto ou voz e usa Gemini para coletar
// os dados necessários antes de encaminhá-los ao formulário unificado.
// ---------------------------------------------------------------------------

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

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

const INCOME_CATEGORY_IDS = new Set(["salario", "freelance", "transferencias"]);
const initialAssistantMessage: ChatMessage = {
  id: "assistant-welcome",
  role: "assistant",
  text: "Olá! Me conte uma receita ou despesa, por texto ou voz. Ex.: “gastei 32 reais no almoço”.",
};

const QUICK_SUGGESTIONS = [
  "Gastei R$ 45 no almoço",
  "Recebi R$ 2.500 de salário",
  "Comprei no mercado R$ 150",
  "Paguei a conta de luz R$ 120",
] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);
const newMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function VoiceCommandSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories } = useAppStore();
  const applySuggestedCategory = useSuggestedCategory();
  const converseFinancialTransaction = useAction(
    api.aiVision.converseFinancialTransaction,
  );
  const overlay = useExclusiveOverlay({
    name: "voice-command-sheet",
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
  });

  const [supported] = useState(() => getSRCtor() !== null);
  const [messages, setMessages] = useState<ChatMessage[]>([initialAssistantMessage]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<TransactionFormValues | null>(
    null,
  );

  const recRef = useRef<SRInstance | null>(null);
  const transcriptRef = useRef("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultCategoryId = (type: TxType) => {
    const category = categories.find((item) =>
      type === "income"
        ? INCOME_CATEGORY_IDS.has(item.id)
        : !INCOME_CATEGORY_IDS.has(item.id),
    );
    return category?.id ?? categories[0]?.id ?? "outros";
  };

  const toFormInitial = (
    transaction: FinanceTransactionDraft,
  ): TransactionFormValues => {
    const type: TxType =
      transaction.transactionType === "income" ? "income" : "expense";
    let categoryId = defaultCategoryId(type);
    const suggested = SCAN_CATEGORIES.find(
      (category) => category.id === transaction.categorySuggestion,
    );

    if (suggested) {
      categoryId = applySuggestedCategory(suggested).id;
    } else if (
      transaction.categorySuggestion &&
      categories.some((category) => category.id === transaction.categorySuggestion)
    ) {
      categoryId = transaction.categorySuggestion;
    }

    const payment = normalizePaymentMethod(transaction.paymentMethod);
    const cents = Math.min(
      999_999_999,
      Math.max(0, Math.round(Number(transaction.total) * 100) || 0),
    );

    return {
      type,
      cents,
      title: transaction.title.trim().slice(0, 120) || "Transação",
      categoryId,
      date: transaction.date || todayIso(),
      time: transaction.time || "",
      note: "",
      attachments: [],
      recurrence: "unica",
      frequency: "mensal",
      daysInterval: 15,
      installments: 2,
      currentInstallment: 1,
      paymentMethod: payment.method,
      cardMode: payment.cardMode,
      cardId: null,
    };
  };

  // The sheet is unmounted whenever it closes, so useState naturally creates
  // a fresh conversation on the next opening. This effect only releases
  // external browser resources and pending handoffs on unmount.
  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, waiting]);

  const sendMessage = async (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 1000);
    if (!text || waiting || reviewOpen) return;

    const userMessage: ChatMessage = { id: newMessageId(), role: "user", text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setWaiting(true);

    try {
      const result = (await converseFinancialTransaction({
        messages: nextMessages.map(
          (message): FinanceChatMessage => ({
            role: message.role,
            text: message.text,
          }),
        ),
      })) as FinanceChatResult;

      if (!result.ok) {
        setMessages((current) => [
          ...current,
          {
            id: newMessageId(),
            role: "assistant",
            text: result.message,
          },
        ]);
        return;
      }

      if (result.kind === "question") {
        setMessages((current) => [
          ...current,
          {
            id: newMessageId(),
            role: "assistant",
            text: result.message,
          },
        ]);
        return;
      }

      const initial = toFormInitial(result.transaction);
      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          text: "Tudo certo! Verifique os dados abaixo:",
        },
      ]);
      setFormInitial(initial);
      handoffTimerRef.current = setTimeout(() => {
        handoffTimerRef.current = null;
        setReviewOpen(true);
      }, 700);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          text: "Não consegui analisar agora. Tente novamente em instantes.",
        },
      ]);
    } finally {
      setWaiting(false);
    }
  };

  const startListening = () => {
    const Ctor = getSRCtor();
    if (!Ctor || waiting || reviewOpen) {
      if (!Ctor) {
        setMessages((current) => [
          ...current,
          {
            id: newMessageId(),
            role: "assistant",
            text: "Seu navegador não liberou o microfone. Você pode digitar a transação abaixo.",
          },
        ]);
      }
      return;
    }

    transcriptRef.current = "";
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      transcriptRef.current = transcript;
      setDraft(transcript);
    };
    rec.onerror = (event) => {
      if (event.error !== "aborted") {
        setMessages((current) => [
          ...current,
          {
            id: newMessageId(),
            role: "assistant",
            text:
              event.error === "not-allowed" || event.error === "service-not-allowed"
                ? "Não consegui acessar o microfone. Você pode digitar a transação abaixo."
                : "Não consegui ouvir agora. Tente novamente ou escreva sua mensagem.",
          },
        ]);
      }
    };
    rec.onend = () => {
      setListening(false);
      const finalTranscript = transcriptRef.current.trim();
      recRef.current = null;
      if (finalTranscript) void sendMessage(finalTranscript);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const stopListening = () => {
    try {
      recRef.current?.stop();
    } catch {
      setListening(false);
    }
  };

  const handleFormClose = () => {
    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
    setReviewOpen(false);
    setFormInitial(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-[57]">
          <motion.div
            key="financial-assistant-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 330 }}
            className={cn(
              "glass glass-strong absolute inset-0 flex flex-col bg-white dark:bg-[#f4f8ff]",
              reviewOpen ? "hidden" : "flex",
            )}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                  Assistente financeiro
                </h3>
                <p className="text-[12.5px] text-glass-sub">
                  Registre receitas e despesas conversando
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

            <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4 pt-2">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <p
                      className={cn(
                        "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] font-medium leading-relaxed shadow-sm",
                        message.role === "user"
                          ? "rounded-br-md bg-blue-500 text-white"
                          : "rounded-bl-md bg-gray-100 text-glass-ink",
                      )}
                    >
                      {message.text}
                    </p>
                  </div>
                ))}
                {messages.length === 1 && !waiting && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {QUICK_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void sendMessage(suggestion)}
                        className="glass glass-soft min-h-11 rounded-full px-3 py-2 text-left text-[12px] font-semibold leading-tight text-glass-sub transition-transform active:scale-[0.98]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                {waiting && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md bg-gray-100 px-3.5 py-3 text-[13px] font-semibold text-glass-sub">
                      Analisando sua transação…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-black/5 bg-white/50 px-4 pb-7 pt-3">
              <div className="flex items-end gap-2 rounded-2xl bg-white/80 p-1.5 shadow-sm ring-1 ring-black/5">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void sendMessage(draft);
                    }
                  }}
                  placeholder="Digite uma receita ou despesa"
                  maxLength={1000}
                  disabled={waiting || reviewOpen}
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[14px] font-medium text-glass-ink outline-none placeholder:text-glass-faint disabled:opacity-60"
                />
                <button
                  type="button"
                  aria-label={listening ? "Parar gravação" : "Gravar áudio"}
                  onClick={listening ? stopListening : startListening}
                  disabled={waiting || reviewOpen}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-90 disabled:opacity-40",
                    listening
                      ? "bg-[#AF52DE] text-white"
                      : "bg-gray-100 text-glass-sub",
                  )}
                >
                  <Mic className="size-[18px]" />
                </button>
                <button
                  type="button"
                  aria-label="Enviar mensagem"
                  onClick={() => void sendMessage(draft)}
                  disabled={waiting || !draft.trim() || reviewOpen}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white transition-transform active:scale-90 disabled:opacity-40"
                >
                  {waiting ? <ArrowUp className="size-[18px]" /> : <Send className="size-[17px]" />}
                </button>
              </div>
              {!supported && (
                <p className="px-1 pt-2 text-[11.5px] font-medium text-glass-faint">
                  Microfone indisponível neste navegador; use o campo de texto.
                </p>
              )}
            </div>
          </motion.div>

          <div className={reviewOpen ? "block" : "hidden"}>
            <AddTransactionSheet
              open={open && reviewOpen}
              overlayParentId={overlay.overlayId}
              onClose={handleFormClose}
              initial={formInitial ?? null}
            />
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
