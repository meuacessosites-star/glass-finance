import { localDateKey } from "./card-billing";
// ---------------------------------------------------------------------------
// Fictional finance data used to illustrate the UI. No real database yet.
// ---------------------------------------------------------------------------

export type Category = {
  id: string;
  label: string;
  color: string;
  icon: string;
  image?: string;
};

export const categories: Category[] = [
  { id: "salario", label: "Salário", color: "#34C759", icon: "salario" },
  { id: "freelance", label: "Freelance", color: "#AF52DE", icon: "freelance" },
  { id: "alimentacao", label: "Alimentação", color: "#FF9F0A", icon: "alimentacao" },
  { id: "transporte", label: "Transporte", color: "#0A84FF", icon: "transporte" },
  { id: "moradia", label: "Moradia", color: "#5856D6", icon: "moradia" },
  { id: "saude", label: "Saúde", color: "#FF2D55", icon: "saude" },
  { id: "lazer", label: "Lazer", color: "#FF3B30", icon: "lazer" },
  { id: "compras", label: "Compras", color: "#FF6482", icon: "compras" },
  { id: "assinaturas", label: "Assinaturas", color: "#00C7BE", icon: "assinaturas" },
  { id: "educacao", label: "Educação", color: "#32ADE6", icon: "educacao" },
  { id: "outros", label: "Outros", color: "#8E8E93", icon: "outros" },
];

export const categoryById = Object.fromEntries(
  categories.map((c) => [c.id, c]),
) as Record<string, Category>;

/** Repetição da transação: única, recorrente (todo mês/semana/ano) ou
 * parcelada (dividida em N parcelas). */
export type RecurrenceMode = "unica" | "recorrente" | "parcelada";

/** Frequência usada quando recurrence === "recorrente". "dias" é a cada
 * N dias (quantidade em `frequencyInterval`). */
export type RecurrenceFrequency = "mensal" | "semanal" | "anual" | "dias";

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  mensal: "Mensal",
  semanal: "Semanal",
  anual: "Anual",
  dias: "Dias",
};

/** Full frequency label: "Mensal", "Semanal", "Anual" or "A cada 15 dias". */
export function frequencyLabel(
  f?: RecurrenceFrequency,
  interval?: number,
): string {
  if (f === "dias") return `A cada ${interval ?? 30} dias`;
  return FREQUENCY_LABELS[f ?? "mensal"];
}

export type DraftDisplayMode = "hidden" | "multipleMedia";

export type LoanOperationType = "loan" | "card";

export type Transaction = {
  id: string;
  title: string;
  categoryId: string;
  amount: number; // positive = income, negative = expense
  date: string; // ISO yyyy-mm-dd
  /** Vencimento da conta; compras no crédito usam o vencimento da fatura. */
  dueDate?: string;
  time?: string; // HH:MM — set when scanned from a receipt
  note?: string; // free text (draft / observations)
  /** Regra de exibição do rascunho no card da transação. */
  draftDisplay?: DraftDisplayMode;
  attachments?: string[]; // photos / files attached (data URLs)
  /** Repetição: undefined = única. */
  recurrence?: RecurrenceMode;
  /** Frequência quando recurrence === "recorrente". */
  frequency?: RecurrenceFrequency;
  /** Nº de dias entre ocorrências quando frequency === "dias". */
  frequencyInterval?: number;
  /** Total de parcelas quando recurrence === "parcelada". */
  installments?: number;
  /** Parcela atual (1-based) quando recurrence === "parcelada". */
  currentInstallment?: number;
  /** Payment method id: pix | dinheiro | cartao | boleto | transferencia */
  paymentMethod?: string;
  /** Status manual de pagamento para transações comuns. */
  paymentStatus?: "paid" | "pending";
  /** Data em que a transação foi efetivamente marcada como paga. */
  paymentDate?: string;
  /** Define se a data de pagamento aparece no card da lista. */
  showPaymentDateOnCard?: boolean;
  /** Define se o card mostra o nome do cartão ou apenas os quatro últimos dígitos. */
  cardDisplayMode?: "name" | "last4";
  /** Saved card used (AppCard.id) when paymentMethod is "cartao". */
  cardId?: string;
  /** When paymentMethod is "cartao": "credito" | "debito". */
  cardMode?: string;
  /** Fatura escolhida para a compra, pelo mês de vencimento (YYYY-MM). */
  cardInvoiceMonth?: string;
  /** Convex people record linked to this transaction, when applicable. */
  personId?: string;
  /** Origem estrutural de lançamentos que não pertencem ao extrato normal. */
  source?: "loan";
  /** Tipo de operação quando source === "loan". */
  operationType?: LoanOperationType;
};

/** Short human label for the transaction's recurrence, or null when única. */
export function recurrenceLabel(t: Transaction): string | null {
  if (t.recurrence === "recorrente") {
    return `Recorrente · ${frequencyLabel(
      t.frequency,
      t.frequencyInterval,
    )}`;
  }
  if (t.recurrence === "parcelada") {
    return `Parcelado · ${t.currentInstallment ?? 1}/${t.installments ?? 2}`;
  }
  return null;
}

export const transactions: Transaction[] = [
  // ---- Agosto de 2026 ----
  { id: "t01", title: "iFood · Burguer", categoryId: "alimentacao", amount: -67.8, date: "2026-08-11", paymentMethod: "cartao", cardId: "card-1", cardMode: "credito" },
  { id: "t02", title: "Pão de Açúcar", categoryId: "alimentacao", amount: -284.9, date: "2026-08-10", paymentMethod: "cartao", cardId: "card-1", cardMode: "credito" },
  { id: "t03", title: "Uber · Centro", categoryId: "transporte", amount: -24.5, date: "2026-08-09", paymentMethod: "cartao", cardId: "card-1", cardMode: "debito" },
  { id: "t04", title: "Netflix", categoryId: "assinaturas", amount: -55.9, date: "2026-08-08", paymentMethod: "cartao", cardId: "card-1", cardMode: "credito" },
  { id: "t05", title: "Freelance · Site da agência", categoryId: "freelance", amount: 1200, date: "2026-08-08" },
  { id: "t06", title: "Bella Vista Trattoria", categoryId: "alimentacao", amount: -142, date: "2026-08-07", paymentMethod: "cartao", cardId: "card-1", cardMode: "credito" },
  { id: "t07", title: "Droga Raia", categoryId: "saude", amount: -78.4, date: "2026-08-06", paymentMethod: "cartao", cardId: "card-1", cardMode: "debito" },
  { id: "t08", title: "Salário", categoryId: "salario", amount: 6800, date: "2026-08-05" },
  { id: "t09", title: "Renner · Roupas", categoryId: "compras", amount: -185, date: "2026-08-05", paymentMethod: "cartao", cardId: "card-2", cardMode: "credito" },
  { id: "t10", title: "Energisa · Energia", categoryId: "moradia", amount: -189.35, date: "2026-08-04" },
  { id: "t11", title: "Aluguel", categoryId: "moradia", amount: -2100, date: "2026-08-03" },
  { id: "t12", title: "Spotify", categoryId: "assinaturas", amount: -21.9, date: "2026-08-02", paymentMethod: "cartao", cardId: "card-1", cardMode: "credito" },
  { id: "t13", title: "Smart Fit · Academia", categoryId: "saude", amount: -129.9, date: "2026-08-01" },
  // ---- Julho de 2026 ----
  { id: "t14", title: "Posto Shell", categoryId: "transporte", amount: -180, date: "2026-07-28" },
  { id: "t15", title: "Vó Maria · Restaurante", categoryId: "alimentacao", amount: -98, date: "2026-07-25" },
  { id: "t16", title: "Amazon · Fone", categoryId: "compras", amount: -215.5, date: "2026-07-22", paymentMethod: "cartao", cardId: "card-2", cardMode: "credito" },
  { id: "t17", title: "Cinema Kinoplex", categoryId: "lazer", amount: -72, date: "2026-07-20", paymentMethod: "cartao", cardId: "card-1", cardMode: "credito" },
  { id: "t18", title: "Farmácia +", categoryId: "saude", amount: -42.9, date: "2026-07-15" },
  { id: "t19", title: "iFood · Pizza", categoryId: "alimentacao", amount: -54.3, date: "2026-07-12" },
  { id: "t20", title: "Supermercado Carrefour", categoryId: "alimentacao", amount: -312, date: "2026-07-10" },
  { id: "t21", title: "Salário", categoryId: "salario", amount: 6800, date: "2026-07-05" },
  { id: "t22", title: "Aluguel", categoryId: "moradia", amount: -2100, date: "2026-07-03" },
  { id: "t23", title: "Smart Fit · Academia", categoryId: "saude", amount: -129.9, date: "2026-07-01" },
];

// ---------------------------------------------------------------------------
// Empréstimos (dinheiro) — quem me deve / para quem devo
// ---------------------------------------------------------------------------
export type Loan = {
  id: string;
  name: string;
  amount: number;
  date: string;
  status: "pago" | "pendente";
  direction: "receber" | "pagar";
};

export const loans: Loan[] = [
  { id: "l1", name: "Marcos Silva", amount: 150, date: "2026-07-12", status: "pendente", direction: "receber" },
  { id: "l2", name: "Júlia Ramos", amount: 80, date: "2026-07-20", status: "pago", direction: "receber" },
  { id: "l3", name: "Felipe Costa", amount: 220, date: "2026-07-28", status: "pendente", direction: "pagar" },
  { id: "l4", name: "Ana Paula", amount: 60, date: "2026-08-05", status: "pago", direction: "pagar" },
];

// ---------------------------------------------------------------------------
// Cartão emprestado — compras feitas no meu cartão por terceiros
// ---------------------------------------------------------------------------
export type CardLoan = {
  id: string;
  name: string;
  amount: number;
  installments: number;
  currentInstallment: number;
  status: "ativo" | "pago";
  nextDue: string;
};

export const cardLoans: CardLoan[] = [
  { id: "c1", name: "Ricardo Alves", amount: 250, installments: 3, currentInstallment: 1, status: "ativo", nextDue: "2026-08-20" },
  { id: "c2", name: "Carla Menezes", amount: 420, installments: 2, currentInstallment: 2, status: "ativo", nextDue: "2026-08-15" },
  { id: "c3", name: "Pedro Santos", amount: 150, installments: 1, currentInstallment: 1, status: "pago", nextDue: "2026-07-10" },
  { id: "c4", name: "Beatriz Lima", amount: 340, installments: 6, currentInstallment: 1, status: "ativo", nextDue: "2026-08-25" },
];

// ---------------------------------------------------------------------------
// Notificações de banco — avisos de compra no cartão que o usuário filtra e
// aprova para virar transação. Dados fictícios para ilustrar o fluxo.
// ---------------------------------------------------------------------------
export type BankNotification = {
  id: string;
  bank: string;
  merchant: string;
  amount: number; // BRL (sempre gasto positivo)
  date: string; // yyyy-mm-dd
  time?: string; // HH:MM
  categoryId?: string;
  cardId?: string;
  status: "pending" | "approved" | "ignored";
};

export const seedNotifications: BankNotification[] = [
  { id: "n01", bank: "Nubank", merchant: "iFood · Restaurante", amount: 84.9, date: "2026-08-15", time: "12:41", categoryId: "alimentacao", cardId: "card-1", status: "pending" },
  { id: "n02", bank: "Nubank", merchant: "Uber · Viagem", amount: 32.5, date: "2026-08-15", time: "09:15", categoryId: "transporte", cardId: "card-1", status: "pending" },
  { id: "n03", bank: "Inter", merchant: "Amazon.com.br", amount: 129.9, date: "2026-08-14", time: "21:02", categoryId: "compras", cardId: "card-2", status: "pending" },
  { id: "n04", bank: "Nubank", merchant: "Cinema Kinoplex", amount: 58, date: "2026-08-14", time: "19:47", categoryId: "lazer", cardId: "card-1", status: "pending" },
  { id: "n05", bank: "Inter", merchant: "Posto Shell", amount: 175, date: "2026-08-14", time: "08:20", categoryId: "transporte", cardId: "card-2", status: "pending" },
  { id: "n06", bank: "Nubank", merchant: "Smart Fit", amount: 129.9, date: "2026-08-13", time: "07:00", categoryId: "saude", cardId: "card-1", status: "pending" },
];

// ---------------------------------------------------------------------------
// Limites / metas por categoria (Agosto de 2026)
// ---------------------------------------------------------------------------
export type Budget = {
  categoryId: string;
  limit: number;
};

export const budgets: Budget[] = [
  { categoryId: "alimentacao", limit: 900 },
  { categoryId: "moradia", limit: 2500 },
  { categoryId: "transporte", limit: 400 },
  { categoryId: "compras", limit: 500 },
  { categoryId: "saude", limit: 250 },
  { categoryId: "assinaturas", limit: 100 },
  { categoryId: "lazer", limit: 300 },
];

// ---------------------------------------------------------------------------
// Série mensal para o gráfico (Março → Agosto 2026)
// ---------------------------------------------------------------------------
export const monthlySeries = [
  { month: "Mar", income: 6800, expense: 4120 },
  { month: "Abr", income: 6800, expense: 3850 },
  { month: "Mai", income: 7200, expense: 4490 },
  { month: "Jun", income: 6800, expense: 3980 },
  { month: "Jul", income: 6800, expense: 3205 },
  { month: "Ago", income: 8000, expense: 3279 },
];

export const openingBalance = 8400; // saldo no início de agosto

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function formatCurrency(value: number, withSign = false): string {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Math.abs(value));
  if (!withSign) return formatted;
  return value < 0 ? `- ${formatted}` : `+ ${formatted}`;
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function parseDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7); // yyyy-mm
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const name = MONTHS[(month - 1 + 12) % 12];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function monthShortLabel(key: string): string {
  const [, month] = key.split("-").map(Number);
  const name = MONTHS[(month - 1 + 12) % 12];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** "Hoje", "Ontem" or "10 de agosto" */
export function dayLabel(iso: string): string {
  const d = parseDate(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function shortDate(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function monthTotals(list: Transaction[], key: string) {
  const filtered = list.filter((t) => monthKey(t.date) === key);
  const income = filtered
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = filtered
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { income, expense, list: filtered };
}

export const currentMonthKey = monthKey(
  localDateKey(),
);
