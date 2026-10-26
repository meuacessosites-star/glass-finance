import type { LoanReceivable } from "./app-store";
import { getLoanHistoryGroup } from "./loan-history";
import {
  getLoanOutstandingAmount,
  getSuggestedLoanReceiptAmount,
  isFreeLoan,
} from "./loan-repayments";
import { formatCurrency } from "./mock-data";
import { contactKey } from "./people-summary";
import { sanitizeDueDate } from "./transaction-status";

export function reminderContacts<T extends { name: string }>(
  contact: string,
  people: T[],
): T[] {
  const key = contactKey(contact);
  return key ? people.filter((person) => contactKey(person.name) === key) : [];
}

/** Local Brazilian numbers require DDD. International numbers require + and country code. */
export function reminderPhone(phone?: string): string | null {
  if (!phone || /[^\d\s()+.\-]/.test(phone)) return null;
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  const number = raw.startsWith("+")
    ? digits
    : digits.length === 10 || digits.length === 11
      ? `55${digits}`
      : digits;
  if (!/^[1-9]\d{9,14}$/.test(number)) return null;
  if (number.startsWith("55") && !/^55[1-9]\d{9,10}$/.test(number)) return null;
  if (!raw.startsWith("+") && !number.startsWith("55")) return null;
  return number;
}

export function reminderWhatsAppUrl(
  phone: string | undefined,
  message: string,
): string | null {
  const number = reminderPhone(phone);
  return number && message.trim()
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : null;
}

export function buildLoanReminder(
  item: LoanReceivable,
  installments: LoanReceivable[],
): string {
  const remaining = getLoanOutstandingAmount(item);
  if (remaining <= 0) return "";
  const free = isFreeLoan(item);
  const card = item.operationType === "card";
  const due = sanitizeDueDate(item.dueDate);
  const group = getLoanHistoryGroup(item, installments);
  const totalCents = [
    ...new Map(group.map((row) => [row.id, row])).values(),
  ].reduce(
    (sum, row) => sum + Math.round(getLoanOutstandingAmount(row) * 100),
    0,
  );
  const numbered = !free && (item.installments ?? 1) > 1;
  const subject = numbered
    ? `parcela ${item.installment ?? 1}/${item.installments}`
    : card
      ? "compra no cartão"
      : "empréstimo";
  const lines = [
    `Olá, ${item.contact.trim()}! Tudo bem?`,
    "",
    `Passando para lembrar ${subject === "empréstimo" ? "do seu empréstimo" : `da ${subject}`}${item.description?.trim() ? `: ${item.description.trim()}` : "."}`,
  ];
  if (free && item.freePaymentMode === "installments") {
    lines.push(
      `Valor combinado para este pagamento: ${formatCurrency(getSuggestedLoanReceiptAmount(item))}`,
    );
  } else {
    lines.push(
      `${numbered ? "Falta receber nesta parcela" : "Valor pendente"}: ${formatCurrency(remaining)}`,
    );
  }
  lines.push(
    `Vencimento: ${free || !due ? "a combinar" : due.split("-").reverse().join("/")}`,
  );
  lines.push(
    `Total restante ${card ? "desta compra" : "deste empréstimo"}: ${formatCurrency(totalCents / 100)}`,
  );
  lines.push("", "Se já fez o pagamento, me avise para eu conferir. Obrigado!");
  return lines.join("\n");
}
