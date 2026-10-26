import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Copy, MessageCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { LoanReceivable } from "@/lib/app-store";
import {
  buildLoanReminder,
  reminderContacts,
  reminderWhatsAppUrl,
} from "@/lib/loan-reminder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LoanReminderDialog({
  item,
  installments,
  onClose,
}: {
  item: LoanReceivable;
  installments: LoanReceivable[];
  onClose: () => void;
}) {
  const people = useQuery(api.people.list);
  const contacts = reminderContacts<{
    _id: string;
    name: string;
    phone?: string;
  }>(item.contact, people ?? []);
  const [selectedId, setSelectedId] = useState("");
  const contact =
    contacts.length === 1
      ? contacts[0]
      : contacts.find((person) => person._id === selectedId);
  const original = buildLoanReminder(item, installments);
  const [message, setMessage] = useState(original);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [copying, setCopying] = useState(false);
  const whatsapp = reminderWhatsAppUrl(contact?.phone, message);
  const copy = async () => {
    setCopying(true);
    try {
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(message);
      } catch {
        textarea.current?.focus();
        textarea.current?.select();
        if (!document.execCommand("copy")) throw new Error("Copy failed");
      }
      toast.success("Mensagem copiada!", { duration: 1800 });
    } catch {
      toast.error(
        "Não foi possível copiar. Selecione a mensagem e copie manualmente.",
      );
    } finally {
      setCopying(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="glass-strong flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 text-glass-ink">
        <DialogHeader className="shrink-0 px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-emerald-700 dark:text-emerald-300" />
            Lembrete de pagamento
          </DialogTitle>
          <DialogDescription>
            Revise a mensagem para {item.contact}. Você pode editar antes de
            compartilhar.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4">
          {contacts.length > 1 && (
            <div className="space-y-2">
              <label
                htmlFor="reminder-contact"
                className="text-sm font-semibold"
              >
                Qual cadastro desta pessoa?
              </label>
              <select
                id="reminder-contact"
                className="glass-input min-h-11 w-full rounded-xl px-3"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">Escolher número cadastrado</option>
                {contacts.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name} · {person.phone || "Sem WhatsApp"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-glass-sub">
                Há mais de um cadastro com esse nome. Confira o número antes de
                abrir a conversa.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <label
              htmlFor="loan-reminder-message"
              className="text-sm font-semibold"
            >
              Mensagem
            </label>
            <textarea
              ref={textarea}
              id="loan-reminder-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={11}
              className="w-full resize-y rounded-2xl border border-black/10 bg-white/60 p-4 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/15 dark:bg-slate-950/30"
            />
            <button
              type="button"
              disabled={message === original}
              onClick={() => setMessage(original)}
              className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" />
              Restaurar mensagem sugerida
            </button>
          </div>
          <div className="rounded-2xl border border-emerald-700/15 bg-emerald-500/5 p-3 text-xs leading-relaxed text-glass-sub dark:border-emerald-300/20">
            {people === undefined ? (
              <p>Buscando o WhatsApp cadastrado…</p>
            ) : contact?.phone ? (
              <p>
                <strong className="text-glass-ink">WhatsApp cadastrado:</strong>{" "}
                {contact.phone}
                {!reminderWhatsAppUrl(contact.phone, "teste") &&
                  " — confira o número com DDD em Pessoas."}
              </p>
            ) : (
              <p>
                {contacts.length > 1 && !contact
                  ? "Selecione o cadastro acima para usar o WhatsApp."
                  : "Para abrir a conversa, adicione um número com DDD no cadastro dessa pessoa em Pessoas. Você já pode copiar a mensagem."}
              </p>
            )}
            <p className="mt-1">
              O WhatsApp abre com o texto preenchido. Confira o destinatário e
              toque em Enviar lá. Copiar ou abrir a conversa não marca o
              empréstimo como recebido.
            </p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-[auto_1fr] gap-2 border-t border-black/5 px-5 py-4 dark:border-white/10">
          <button
            type="button"
            disabled={!message.trim() || copying}
            onClick={copy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 text-sm font-semibold text-primary disabled:opacity-40"
          >
            <Copy className="size-4" />
            Copiar
          </button>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950"
            >
              <MessageCircle className="size-4 shrink-0" />
              Abrir no WhatsApp
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700/10 px-3 py-2 text-center text-sm font-semibold text-glass-sub opacity-50"
            >
              <MessageCircle className="size-4 shrink-0" />
              Abrir no WhatsApp
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
