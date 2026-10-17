import { sanitizeDueDate } from "./transaction-status";
import { openUnpaidPurchaseInvoices, recordInvoicePayment, setInvoicePaymentStatus, setTransactionPaymentState } from "./payment-updates";
import { selectTransactionLedgers } from "./transaction-ledgers";
import { getTransactionInvoiceMonth, isCreditCardExpense, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  categories as seedCategories,
  currentMonthKey,
  seedNotifications,
  transactions as seedTransactions,
  type BankNotification,
  type DraftDisplayMode,
  type LoanOperationType,
  type Transaction,
} from "./mock-data";

// ---------------------------------------------------------------------------
// GranaScan client store — personalization data (categories, cards, profiles,
// PIN) persisted to localStorage. The finance numbers themselves remain mock
// data; this store powers the sidebar management screens.
//
// Isolation: every profile owns its own `data` (categories, cards and PIN).
// Switching profiles swaps the active data — nothing saved in one profile is
// ever shared with another.
// ---------------------------------------------------------------------------

export type AppCategory = {
  id: string;
  label: string;
  color: string;
  icon: string; // icon id (see categoryIconOptions in CategoryIcon.tsx)
  image?: string; // optional data URL for a custom category image
};

export type InvoicePaymentRecord = {
  totalAmount: number;
  paidAmount: number;
  paymentDate: string;
  installments?: number;
};

export type AppCard = {
  id: string;
  name: string;
  institution?: string;
  last4: string;
  totalLimit?: number;
  closingDay?: number;
  dueDay?: number;
  /** Status legado da fatura atual: true = paga, false/undefined = em aberto. */
  invoicePaid?: boolean;
  /** Status persistido por mês, indexado como YYYY-MM. */
  invoicePaidByMonth?: Record<string, boolean>;
  /** Pagamentos parciais/totais por fatura mensal. */
  invoicePaymentsByMonth?: Record<string, InvoicePaymentRecord>;
  /** Reajuste manual do total da fatura, indexado como YYYY-MM. */
  invoiceOverrideByMonth?: Record<string, number>;
  /** Conciliação concluída por fatura mensal. */
  invoiceReconciledByMonth?: Record<string, boolean>;
  /** Cartão arquivado, oculto das listas operacionais. */
  archived?: boolean;
  color: string;
};

/** Contato pessoal — nome + número de WhatsApp/telefone para cobrança. */
export type AppPerson = {
  id: string;
  name: string;
  /** Número normalizado (só dígitos). Vazio = ainda não informado. */
  phone: string;
  createdAt: string;
};

/** Cofrinho/reserva: dinheiro guardado para um objetivo (viagem, investimento…). */
export type AppReserve = {
  id: string;
  name: string;
  amount: number; // BRL (positivo)
  color: string;
  createdAt: string;
};

/** Notificação de banco que aguarda aprovação para virar transação. */
export type AppNotification = BankNotification;

/** Financiamento: parcelas mensais fixas (ex.: carro, casa, faculdade). */
export type AppFinancing = {
  id: string;
  name: string;
  totalAmount: number; // BRL (valor total financiado)
  installments: number; // total de parcelas N
  currentInstallment: number; // parcela atual (1-based)
  installmentValue: number; // valor mensal da parcela
  dueDay: number; // dia do vencimento (1-31)
  startDate: string; // yyyy-mm-dd (primeira parcela)
  categoryId?: string;
  color: string;
  createdAt: string;
};

/** Meta de economia: quanto quer guardar e quanto já guardou. */
export type AppGoal = {
  id: string;
  name: string;
  targetAmount: number; // BRL
  savedAmount: number; // BRL já guardado
  deadline?: string; // yyyy-mm-dd (opcional)
  color: string;
  createdAt: string;
};

/** Devolução vinculada a um valor emprestado a terceiros. */
export type LoanReceivable = {
  id: string;
  loanId: string;
  contact: string;
  amount: number;
  /** Ausente apenas quando a cobrança foi criada como dívida em aberto. */
  dueDate?: string;
  status: "scheduled" | "open" | "paid";
  installment?: number;
  installments?: number;
  transactionId?: string;
  description?: string;
  paymentMethod?: string;
  note?: string;
  draftDisplay?: DraftDisplayMode;
  attachments?: string[];
  operationType?: LoanOperationType;
  createdAt: string;
};

/** Data that belongs to a single profile — never shared between profiles. */
export type ProfileData = {
  categories: AppCategory[];
  cards: AppCard[];
  transactions: Transaction[];
  loanReceivables: LoanReceivable[];
  people: AppPerson[];
  reserves: AppReserve[];
  /** true = reservas aparecem junto com o saldo na tela inicial. */
  reservesInBalance: boolean;
  notifications: AppNotification[];
  financings: AppFinancing[];
  /** true = parcelas dos financiamentos aparecem junto com as transações. */
  financingsInFlow: boolean;
  /** true = o nome da categoria aparece abaixo do ícone no card. */
  showCategoryNameOnCard: boolean;
  goals: AppGoal[];
  pin: string | null; // 4-digit PIN, null = disabled
};

/** How a profile avatar is shown: an emoji over a background color, or an
 * uploaded photo with a zoom/pan crop (scale 1–4, pan −1..1 normalized to the
 * visible overflow). */
export type ProfileAvatar = {
  kind: "emoji" | "image";
  emoji: string;
  image: string | null; // data URL when kind === "image"
  bg: string; // background color (hex) behind the emoji / while loading
  crop: { scale: number; panX: number; panY: number };
};

export type AppProfile = {
  id: string;
  name: string;
  avatar: ProfileAvatar;
  data: ProfileData;
};

/** When the PIN should be asked: only on profile switch, or also on app open. */
export type PinUsage = "switch" | "open";

type AppStoreState = {
  exampleDataVersion?: number;
  profiles: AppProfile[];
  activeProfileId: string;
  pinUsage: PinUsage;
};

const STORAGE_KEY = "granascan.app.v1";

const DEFAULT_CARDS: AppCard[] = [
  { id: "card-1", name: "Nubank", last4: "4821", color: "#AF52DE" },
  { id: "card-2", name: "Inter", last4: "9173", color: "#2F6BFF" },
];

function defaultData(): ProfileData {
  return {
    categories: seedCategories.map((c) => ({ ...c })),
    cards: DEFAULT_CARDS.map((c) => ({ ...c })),
    transactions: seedTransactions.map((t) => ({ ...t })),
    loanReceivables: [],
    people: [],
    reserves: [],
    reservesInBalance: true,
    notifications: seedNotifications.map((n) => ({ ...n })),
    financings: [],
    financingsInFlow: false,
    showCategoryNameOnCard: true,
    goals: [],
    pin: null,
  };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Data da i-ésima parcela (1-based) a partir da data da primeira. */
function financingDueDate(startDate: string, index: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return startDate;
  const absolute = month - 1 + (index - 1);
  const y = year + Math.floor(absolute / 12);
  const m = ((absolute % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(
    Math.min(day, lastDay),
  ).padStart(2, "0")}`;
}

const str = (v: unknown, fallback: string) =>
  typeof v === "string" && v.trim() ? v : fallback;

const pin4 = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}$/.test(v) ? v : null;

export const DEFAULT_AVATAR_BG = "#DFE9FB";

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;

function sanitizeAvatar(v: unknown, fallbackEmoji: string): ProfileAvatar {
  const a = (v ?? {}) as Record<string, unknown>;
  const crop = (a.crop ?? {}) as Record<string, unknown>;
  const image =
    typeof a.image === "string" && a.image.startsWith("data:image")
      ? a.image
      : null;
  return {
    kind: image && a.kind === "image" ? "image" : "emoji",
    emoji: str(a.emoji, fallbackEmoji),
    image,
    bg: str(a.bg, DEFAULT_AVATAR_BG),
    crop: {
      scale: num(crop.scale, 1, 1, 4),
      panX: num(crop.panX, 0, -1, 1),
      panY: num(crop.panY, 0, -1, 1),
    },
  };
}

function sanitizeCategories(v: unknown): AppCategory[] {
  if (!Array.isArray(v)) return defaultData().categories;
  const list = v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      id: str(c.id, uid("cat")),
      label: str(c.label, "Categoria"),
      color: str(c.color, "#8E8E93"),
      icon: str(c.icon, "outros"),
      image:
        typeof c.image === "string" && c.image.startsWith("data:image/")
          ? c.image
          : undefined,
    }));
  return list.length > 0 ? list : defaultData().categories;
}

function sanitizeInvoicePaidByMonth(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([key, value]) => /^\d{4}-\d{2}$/.test(key) && typeof value === "boolean")
      .map(([key, value]) => [key, value as boolean]),
  );
}

function sanitizeInvoiceAmountByMonth(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(
        ([key, value]) =>
          /^\d{4}-\d{2}$/.test(key) &&
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0,
      )
      .map(([key, value]) => [key, value as number]),
  );
}

function sanitizeInvoicePaymentsByMonth(
  v: unknown,
): Record<string, InvoicePaymentRecord> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([key, value]) => {
        if (!/^\d{4}-\d{2}$/.test(key) || !value || typeof value !== "object") {
          return false;
        }
        const payment = value as Record<string, unknown>;
        return (
          typeof payment.totalAmount === "number" &&
          Number.isFinite(payment.totalAmount) &&
          payment.totalAmount >= 0 &&
          typeof payment.paidAmount === "number" &&
          Number.isFinite(payment.paidAmount) &&
          payment.paidAmount >= 0
        );
      })
      .map(([key, value]) => {
        const payment = value as Record<string, unknown>;
        return [
          key,
          {
            totalAmount: Math.max(0, Number(payment.totalAmount)),
            paidAmount: Math.max(0, Number(payment.paidAmount)),
            paymentDate:
              typeof payment.paymentDate === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(payment.paymentDate)
                ? payment.paymentDate
                : new Date().toISOString().slice(0, 10),
            installments:
              typeof payment.installments === "number" &&
              Number.isFinite(payment.installments) &&
              payment.installments > 1
                ? Math.min(48, Math.round(payment.installments))
                : undefined,
          } satisfies InvoicePaymentRecord,
        ];
      }),
  );
}

function sanitizeCards(v: unknown): AppCard[] {
  if (!Array.isArray(v)) return defaultData().cards;
  const list = v
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      id: str(c.id, uid("card")),
      name: str(c.name, "Cartão"),
      institution: str(c.institution, ""),
      last4: /^\d{4}$/.test(String(c.last4 ?? "")) ? String(c.last4) : "0000",
      totalLimit:
        typeof c.totalLimit === "number" && Number.isFinite(c.totalLimit)
          ? Math.max(0, c.totalLimit)
          : undefined,
      closingDay:
        typeof c.closingDay === "number" && Number.isFinite(c.closingDay)
          ? Math.min(31, Math.max(1, Math.round(c.closingDay)))
          : undefined,
      dueDay:
        typeof c.dueDay === "number" && Number.isFinite(c.dueDay)
          ? Math.min(31, Math.max(1, Math.round(c.dueDay)))
          : undefined,
      invoicePaid: c.invoicePaid === true,
      invoicePaidByMonth: sanitizeInvoicePaidByMonth(c.invoicePaidByMonth),
      invoicePaymentsByMonth: sanitizeInvoicePaymentsByMonth(c.invoicePaymentsByMonth),
      invoiceOverrideByMonth: sanitizeInvoiceAmountByMonth(c.invoiceOverrideByMonth),
      invoiceReconciledByMonth: sanitizeInvoicePaidByMonth(c.invoiceReconciledByMonth),
      archived: c.archived === true,
      color: str(c.color, "#2F6BFF"),
    }));
  return list;
}

function sanitizePeople(v: unknown): AppPerson[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      id: str(p.id, uid("person")),
      name: str(p.name, "Pessoa"),
      phone:
        typeof p.phone === "string"
          ? p.phone.replace(/\D/g, "").slice(0, 15)
          : "",
      createdAt:
        typeof p.createdAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.createdAt)
          ? p.createdAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
    }))
    .filter((p) => p.name !== "Pessoa" || p.phone.length > 0);
}

function sanitizeReserves(v: unknown): AppReserve[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: str(r.id, uid("reserve")),
      name: str(r.name, "Reserva"),
      amount:
        typeof r.amount === "number" && Number.isFinite(r.amount)
          ? Math.max(0.01, r.amount)
          : 0.01,
      color: str(r.color, "#2F6BFF"),
      createdAt:
        typeof r.createdAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.createdAt)
          ? r.createdAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
    }))
    .filter((r) => r.name !== "Reserva");
}

/** Notificações de banco. Quando o campo não existe no storage (migração),
 * semente com as fictícias para o usuário ver o fluxo de aprovação. */
function sanitizeNotifications(v: unknown): AppNotification[] {
  if (!Array.isArray(v)) return seedNotifications.map((n) => ({ ...n }));
  return v
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
    .map((n) => ({
      id: str(n.id, uid("notif")),
      bank: str(n.bank, "Banco"),
      merchant: str(n.merchant, "Compra"),
      amount:
        typeof n.amount === "number" && Number.isFinite(n.amount)
          ? Math.max(0.01, Math.abs(n.amount))
          : 0.01,
      date:
        typeof n.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(n.date)
          ? n.date.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      time:
        typeof n.time === "string" && /^\d{2}:\d{2}/.test(n.time)
          ? n.time.slice(0, 5)
          : undefined,
      categoryId: typeof n.categoryId === "string" ? n.categoryId : undefined,
      cardId: typeof n.cardId === "string" ? n.cardId : undefined,
      status:
        n.status === "approved" || n.status === "ignored"
          ? n.status
          : "pending",
    }));
}

function sanitizeFinancings(v: unknown): AppFinancing[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const installments = num(f.installments, 12, 1, 480);
      return {
        id: str(f.id, uid("fin")),
        name: str(f.name, "Financiamento"),
        totalAmount: num(f.totalAmount, 10000, 0.01, 1e9),
        installments,
        currentInstallment: Math.min(
          installments,
          num(f.currentInstallment, 1, 1, 480),
        ),
        installmentValue: num(f.installmentValue, 100, 0.01, 1e7),
        dueDay: Math.min(31, Math.max(1, num(f.dueDay, 5, 1, 31))),
        startDate:
          typeof f.startDate === "string" &&
          /^\d{4}-\d{2}-\d{2}/.test(f.startDate)
            ? f.startDate.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        categoryId:
          typeof f.categoryId === "string" && f.categoryId.trim()
            ? f.categoryId.trim().slice(0, 40)
            : undefined,
        color: str(f.color, "#2F6BFF"),
        createdAt:
          typeof f.createdAt === "string" &&
          /^\d{4}-\d{2}-\d{2}/.test(f.createdAt)
            ? f.createdAt.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
      };
    })
    .filter((f) => f.name !== "Financiamento");
}

function sanitizeGoals(v: unknown): AppGoal[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map((g) => ({
      id: str(g.id, uid("goal")),
      name: str(g.name, "Meta"),
      targetAmount: num(g.targetAmount, 1000, 0.01, 1e9),
      savedAmount: num(g.savedAmount, 0, 0, 1e9),
      deadline:
        typeof g.deadline === "string" && /^\d{4}-\d{2}-\d{2}/.test(g.deadline)
          ? g.deadline.slice(0, 10)
          : undefined,
      color: str(g.color, "#FF9500"),
      createdAt:
        typeof g.createdAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(g.createdAt)
          ? g.createdAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
    }))
    .filter((g) => g.name !== "Meta");
}

function sanitizeLoanReceivables(v: unknown): LoanReceivable[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const status =
        item.status === "open" ? "open" : item.status === "paid" ? "paid" : "scheduled";
      const dueDate =
        typeof item.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)
          ? item.dueDate
          : undefined;
      return {
        id: str(item.id, uid("receivable")),
        loanId: str(item.loanId, uid("loan")),
        contact: str(item.contact, "Contato"),
        amount:
          typeof item.amount === "number" && Number.isFinite(item.amount)
            ? Math.max(0.01, item.amount)
            : 0.01,
        dueDate: status === "open" ? undefined : dueDate,
        status,
        installment:
          typeof item.installment === "number" && Number.isFinite(item.installment)
            ? Math.max(1, Math.round(item.installment))
            : undefined,
        installments:
          typeof item.installments === "number" && Number.isFinite(item.installments)
            ? Math.max(1, Math.round(item.installments))
            : undefined,
        transactionId: typeof item.transactionId === "string" ? item.transactionId : undefined,
        description: typeof item.description === "string" ? item.description.slice(0, 120) : undefined,
        paymentMethod: typeof item.paymentMethod === "string" ? item.paymentMethod.slice(0, 20) : undefined,
        note: typeof item.note === "string" ? item.note.slice(0, 300) : undefined,
        draftDisplay: item.draftDisplay === "multipleMedia" ? "multipleMedia" : "hidden",
        attachments: Array.isArray(item.attachments)
          ? item.attachments.filter((attachment): attachment is string => typeof attachment === "string").slice(0, 6)
          : undefined,
        operationType: item.operationType === "card" ? "card" : "loan",
        createdAt:
          typeof item.createdAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(item.createdAt)
            ? item.createdAt.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
      };
    });
}

export function sanitizeTransactions(v: unknown, cards: AppCard[] = []): Transaction[] {
  if (!Array.isArray(v)) return seedTransactions.map((t) => ({ ...t }));
  const list = v
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t): Transaction => {
      const recurrenceRaw =
        typeof t.recurrence === "string" ? t.recurrence : "";
      const recurrence: Transaction["recurrence"] =
        recurrenceRaw === "recorrente" ||
        recurrenceRaw === "parcelada" ||
        recurrenceRaw === "unica"
          ? recurrenceRaw
          : undefined;
      const frequencyRaw =
        typeof t.frequency === "string" ? t.frequency : "";
      const frequency: Transaction["frequency"] =
        frequencyRaw === "mensal" ||
        frequencyRaw === "semanal" ||
        frequencyRaw === "anual" ||
        frequencyRaw === "dias"
          ? frequencyRaw
          : recurrence === "recorrente"
            ? "mensal"
            : undefined;
      const frequencyInterval: Transaction["frequencyInterval"] =
        frequency === "dias" &&
        typeof t.frequencyInterval === "number" &&
        Number.isFinite(t.frequencyInterval)
          ? Math.min(365, Math.max(1, Math.round(t.frequencyInterval)))
          : undefined;
      const installments =
        recurrence === "parcelada" &&
        typeof t.installments === "number" &&
        Number.isFinite(t.installments)
          ? Math.min(48, Math.max(2, Math.round(t.installments)))
          : undefined;
      const currentInstallment =
        recurrence === "parcelada" &&
        typeof t.currentInstallment === "number" &&
        Number.isFinite(t.currentInstallment)
          ? Math.min(
              typeof t.installments === "number" && t.installments > 0
                ? t.installments
                : 48,
              Math.max(1, Math.round(t.currentInstallment)),
            )
          : undefined;
      const normalizedDate =
        typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(t.date)
          ? t.date.slice(0, 10)
          : "2026-08-01";
      const normalizedCardId =
        typeof t.cardId === "string" && t.cardId.trim()
          ? t.cardId.trim().slice(0, 40)
          : undefined;
      const normalizedCardMode =
        t.cardMode === "credito" || t.cardMode === "debito"
          ? t.cardMode
          : t.paymentMethod === "credito" || t.paymentMethod === "debito"
            ? t.paymentMethod
            : undefined;
      const isLegacyCardPurchase =
        Boolean(normalizedCardId) &&
        (normalizedCardMode === "credito" || t.paymentMethod === "credito");
      const card = normalizedCardId
        ? cards.find((item) => item.id === normalizedCardId)
        : undefined;
      const cardInvoiceMonth = isLegacyCardPurchase && (t.paymentMethod === "cartao" || t.paymentMethod === "credito") &&
        typeof t.amount === "number" && t.amount < 0 && t.source !== "loan"
        ? sanitizeInvoiceMonth(t.cardInvoiceMonth)
        : undefined;
      const invoiceMonth = getTransactionInvoiceMonth({ date: normalizedDate, cardInvoiceMonth }, card);
      const legacyInvoicePaid = Boolean(
        card?.invoicePaidByMonth?.[invoiceMonth] ??
          (invoiceMonth === currentMonthKey ? card?.invoicePaid : false),
      );
      const paymentStatus: Transaction["paymentStatus"] =
        t.paymentStatus === "pending"
          ? "pending"
          : t.paymentStatus === "paid"
            ? "paid"
            : isLegacyCardPurchase
              ? legacyInvoicePaid
                ? "paid"
                : "pending"
              : "paid";
      return {
      id: str(t.id, uid("t")),
      title: str(t.title, "Transação"),
      categoryId: str(t.categoryId, "outros"),
      amount:
        typeof t.amount === "number" && Number.isFinite(t.amount)
          ? t.amount
          : 0,
      date: normalizedDate,
      dueDate: sanitizeDueDate(t.dueDate),
      time:
        typeof t.time === "string" && /^\d{2}:\d{2}/.test(t.time)
          ? t.time.slice(0, 5)
          : undefined,
      note:
        typeof t.note === "string" && t.note.trim()
          ? t.note.trim().slice(0, 300)
          : undefined,
      draftDisplay: t.draftDisplay === "multipleMedia" ? "multipleMedia" : "hidden",
      attachments: Array.isArray(t.attachments)
        ? t.attachments
            .filter(
              (a): a is string =>
                typeof a === "string" &&
                a.startsWith("data:") &&
                a.length < 3_000_000,
            )
            .slice(0, 6)
        : undefined,
      recurrence,
      frequency,
      frequencyInterval,
      installments,
      currentInstallment,
      paymentMethod:
        typeof t.paymentMethod === "string" && t.paymentMethod.trim()
          ? t.paymentMethod.trim().slice(0, 20)
          : undefined,
      paymentStatus,
      paymentDate:
        paymentStatus !== "pending" &&
        typeof t.paymentDate === "string" &&
        /^\d{4}-\d{2}-\d{2}/.test(t.paymentDate)
          ? t.paymentDate.slice(0, 10)
          : undefined,
      showPaymentDateOnCard:
        typeof t.showPaymentDateOnCard === "boolean"
          ? t.showPaymentDateOnCard
          : true,
      cardDisplayMode: t.cardDisplayMode === "name" ? "name" : "last4",
      cardId: normalizedCardId,
      cardMode: normalizedCardMode,
      cardInvoiceMonth,
      personId:
        typeof t.personId === "string" && t.personId.trim()
          ? t.personId.trim().slice(0, 80)
          : undefined,
      source: t.source === "loan" ? "loan" : undefined,
      operationType:
        t.operationType === "card" || t.operationType === "loan"
          ? t.operationType
          : undefined,
      };
    })
    .filter((t) => t.amount !== 0);
  return list.length > 0 ? list : seedTransactions.map((t) => ({ ...t }));
}

/**
 * Builds the profile list from persisted data, migrating the legacy flat shape
 * (top-level categories/cards/pin shared by all profiles) into per-profile
 * `data`. Fresh installs get the default Marina profile with clean defaults.
 */
function buildProfiles(raw: unknown): AppProfile[] {
  const parsed = (raw ?? {}) as Record<string, unknown>;
  const rawProfiles: unknown[] = Array.isArray(parsed.profiles)
    ? parsed.profiles
    : [];

  if (rawProfiles.length === 0) {
    return [
      {
        id: "profile-1",
        name: "Marina",
        avatar: {
          kind: "emoji",
          emoji: "🌿",
          image: null,
          bg: DEFAULT_AVATAR_BG,
          crop: { scale: 1, panX: 0, panY: 0 },
        },
        data: defaultData(),
      },
    ];
  }

  const legacy = Array.isArray(parsed.categories); // old flat format
  const sharedCategories = sanitizeCategories(legacy ? parsed.categories : undefined);
  const sharedCards = sanitizeCards(legacy ? parsed.cards : undefined);

  return rawProfiles.map((rawProfile) => {
    const p = (rawProfile ?? {}) as Record<string, unknown>;
    const base = {
      id: str(p.id, uid("profile")),
      name: str(p.name, "Perfil"),
      avatar: sanitizeAvatar(
        p.avatar,
        typeof p.emoji === "string" ? p.emoji : "👤",
      ),
    };
    const nested =
      p.data && typeof p.data === "object"
        ? (p.data as Record<string, unknown>)
        : null;

    if (nested) {
      const profileCards = sanitizeCards(nested.cards);
      return {
        ...base,
        data: {
          categories: sanitizeCategories(nested.categories),
          cards: profileCards,
          transactions: sanitizeTransactions(nested.transactions, profileCards),
          loanReceivables: sanitizeLoanReceivables(nested.loanReceivables),
          people: sanitizePeople(nested.people),
          reserves: sanitizeReserves(nested.reserves),
          reservesInBalance:
            typeof nested.reservesInBalance === "boolean"
              ? nested.reservesInBalance
              : true,
          notifications: sanitizeNotifications(nested.notifications),
          financings: sanitizeFinancings(nested.financings),
          financingsInFlow:
            typeof nested.financingsInFlow === "boolean"
              ? nested.financingsInFlow
              : false,
          showCategoryNameOnCard:
            typeof nested.showCategoryNameOnCard === "boolean"
              ? nested.showCategoryNameOnCard
              : true,
          goals: sanitizeGoals(nested.goals),
          pin: pin4(nested.pin),
        },
      };
    }

    return {
      ...base,
      data: {
        categories: sharedCategories.map((c) => ({ ...c })),
        cards: sharedCards.map((c) => ({ ...c })),
        transactions: seedTransactions.map((t) => ({ ...t })),
        loanReceivables: [],
        people: [],
        reserves: [],
        reservesInBalance: true,
        notifications: seedNotifications.map((n) => ({ ...n })),
        financings: [],
        financingsInFlow: false,
        showCategoryNameOnCard: true,
        goals: [],
        pin:
          legacy && base.id === parsed.activeProfileId
            ? pin4(parsed.pin)
            : null,
      },
    };
  });
}

function loadState(): AppStoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const profiles = buildProfiles(parsed);
    const activeProfileId =
      typeof (parsed as Record<string, unknown>)?.activeProfileId === "string" &&
      profiles.some((p) => p.id === (parsed as Record<string, unknown>).activeProfileId)
        ? ((parsed as Record<string, unknown>).activeProfileId as string)
        : profiles[0].id;
    return {
      profiles,
      activeProfileId,
      exampleDataVersion: Number((parsed as Record<string, unknown> | null)?.exampleDataVersion) || 0,
      pinUsage:
        (parsed as Record<string, unknown> | null)?.pinUsage === "switch"
          ? "switch"
          : "open",
    };
  } catch {
    return {
      profiles: [
        {
          id: "profile-1",
          name: "Marina",
          avatar: {
            kind: "emoji",
            emoji: "🌿",
            image: null,
            bg: DEFAULT_AVATAR_BG,
            crop: { scale: 1, panX: 0, panY: 0 },
          },
          data: defaultData(),
        },
      ],
      activeProfileId: "profile-1",
      pinUsage: "open",
    };
  }
}

type AppStoreValue = {
  profiles: AppProfile[];
  activeProfileId: string;
  pinUsage: PinUsage;
  activeProfile: AppProfile | undefined;
  // Active profile's isolated data (convenience getters):
  categories: AppCategory[];
  cards: AppCard[];
  transactions: Transaction[];
  /** Movimentações e recebimentos exibidos somente no extrato de empréstimos. */
  loanTransactions: Transaction[];
  loanReceivables: LoanReceivable[];
  people: AppPerson[];
  reserves: AppReserve[];
  reservesInBalance: boolean;
  notifications: AppNotification[];
  financings: AppFinancing[];
  financingsInFlow: boolean;
  showCategoryNameOnCard: boolean;
  goals: AppGoal[];
  /** Transações reais + parcelas de financiamento quando integradas ao fluxo. */
  visibleTransactions: Transaction[];
  pin: string | null;
  categoryById: Record<string, AppCategory>;
  /** Creates a category on the active profile and returns its id. */
  addCategory: (data: {
    label: string;
    color: string;
    icon: string;
    image?: string;
  }) => string;
  updateCategory: (id: string, patch: Partial<AppCategory>) => void;
  deleteCategory: (id: string) => void;
  addCard: (data: {
    name: string;
    institution?: string;
    last4: string;
    totalLimit?: number;
    closingDay?: number;
    dueDay?: number;
    invoicePaid?: boolean;
    invoicePaidByMonth?: Record<string, boolean>;
    color: string;
  }) => void;
  updateCard: (id: string, patch: Partial<Omit<AppCard, "id">>) => void;
  setCardInvoiceStatus: (cardId: string, month: string, paid: boolean) => void;
  setAllCardInvoiceStatus: (month: string, paid: boolean) => void;
  setCardInvoicePayment: (
    cardId: string,
    month: string,
    payment: InvoicePaymentRecord,
  ) => void;
  setCardInvoiceOverride: (
    cardId: string,
    month: string,
    amount: number | undefined,
  ) => void;
  setCardInvoiceReconciled: (cardId: string, month: string, reconciled: boolean) => void;
  deleteCard: (id: string) => void;
  addPerson: (data: { name: string; phone?: string }) => void;
  updatePerson: (
    id: string,
    patch: Partial<Pick<AppPerson, "name" | "phone">>,
  ) => void;
  deletePerson: (id: string) => void;
  addReserve: (data: { name: string; amount: number; color?: string }) => void;
  updateReserve: (
    id: string,
    patch: Partial<Pick<AppReserve, "name" | "amount" | "color">>,
  ) => void;
  deleteReserve: (id: string) => void;
  setReservesInBalance: (value: boolean) => void;
  /** Aprova a notificação: cria a transação no cartão e marca como aprovada. */
  approveNotification: (id: string) => void;
  ignoreNotification: (id: string) => void;
  /** Restaura todas as notificações para "pendente" (demo). */
  resetNotifications: () => void;
  addFinancing: (data: {
    name: string;
    totalAmount: number;
    installments: number;
    currentInstallment: number;
    installmentValue: number;
    dueDay: number;
    startDate: string;
    categoryId?: string;
    color: string;
  }) => void;
  updateFinancing: (
    id: string,
    patch: Partial<Omit<AppFinancing, "id" | "createdAt">>,
  ) => void;
  deleteFinancing: (id: string) => void;
  setFinancingsInFlow: (value: boolean) => void;
  setShowCategoryNameOnCard: (value: boolean) => void;
  addGoal: (data: {
    name: string;
    targetAmount: number;
    savedAmount: number;
    deadline?: string;
    color?: string;
  }) => void;
  updateGoal: (
    id: string,
    patch: Partial<
      Pick<AppGoal, "name" | "targetAmount" | "savedAmount" | "deadline" | "color">
    >,
  ) => void;
  deleteGoal: (id: string) => void;
  /** Serializa o estado atual (perfis + dados) para exportar/compartilhar. */
  exportState: () => string;
  /** Substitui o estado local por um backup/código compartilhado. */
  importState: (raw: string) => { ok: boolean; error?: string };
  addTransaction: (data: {
    title: string;
    categoryId: string;
    amount: number;
    date: string;
    time?: string;
    dueDate?: string;
    note?: string;
    attachments?: string[];
    recurrence?: "unica" | "recorrente" | "parcelada";
    frequency?: "mensal" | "semanal" | "anual" | "dias";
    frequencyInterval?: number;
    installments?: number;
    currentInstallment?: number;
    paymentMethod?: string;
    cardId?: string;
    cardMode?: "credito" | "debito";
    cardInvoiceMonth?: string;
    personId?: string;
    paymentStatus?: "paid" | "pending";
    paymentDate?: string;
    showPaymentDateOnCard?: boolean;
    cardDisplayMode?: "name" | "last4";
    draftDisplay?: "hidden" | "multipleMedia";
  }) => void;
  setTransactionPaymentStatus: (id: string, status: "paid" | "pending") => void;
  updateTransaction: (
    id: string,
    patch: Partial<
      Pick<
        Transaction,
        | "title"
        | "categoryId"
        | "amount"
        | "date"
        | "dueDate"
        | "time"
        | "note"
        | "draftDisplay"
        | "attachments"
        | "recurrence"
        | "frequency"
        | "frequencyInterval"
        | "installments"
        | "currentInstallment"
        | "paymentMethod"
        | "cardId"
        | "cardMode"
        | "cardInvoiceMonth"
        | "personId"
        | "paymentStatus"
        | "paymentDate"
        | "showPaymentDateOnCard"
        | "cardDisplayMode"
      >
    >,
  ) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => void;
  markLoanReceivablesPaid: (ids: string[]) => void;
  createLoanRecord: (data: {
    contact: string;
    description?: string;
    amount: number;
    date: string;
    categoryId: string;
    paymentMethod: string;
    operationType?: LoanOperationType;
    note?: string;
    draftDisplay?: DraftDisplayMode;
    attachments?: { src: string; isImage: boolean; name: string }[];
    collectionMode: "fixed" | "open";
    receivables?: { amount: number; dueDate: string; installment: number; installments: number }[];
  }) => void;
  addProfile: (data: { name: string; avatar: ProfileAvatar }) => void;
  updateProfile: (
    id: string,
    patch: Partial<Pick<AppProfile, "name" | "avatar">>,
  ) => void;
  /** Returns false when the profile could not be deleted (it was the last one). */
  deleteProfile: (id: string) => boolean;
  setActiveProfile: (id: string) => void;
  setPinUsage: (usage: PinUsage) => void;
  setPin: (pin: string) => void;
  removePin: () => void;
  verifyPin: (pin: string) => boolean;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStoreState>(loadState);

  // Persist on every change (try/catch so blocked localStorage never crashes).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable — keep in-memory state only
    }
  }, [state]);

  const value = useMemo<AppStoreValue>(() => {
    const active =
      state.profiles.find((p) => p.id === state.activeProfileId) ??
      state.profiles[0];
    const activeData = active?.data ?? {
      categories: [] as AppCategory[],
      cards: [] as AppCard[],
        transactions: [] as Transaction[],
        loanReceivables: [] as LoanReceivable[],
        people: [] as AppPerson[],
        reserves: [] as AppReserve[],
        reservesInBalance: true,
        notifications: [] as AppNotification[],
        financings: [] as AppFinancing[],
        financingsInFlow: false,
        showCategoryNameOnCard: true,
        goals: [] as AppGoal[],
        pin: null,
    };

    const categoryById: Record<string, AppCategory> = {};
    for (const c of activeData.categories) categoryById[c.id] = c;

    // Mutations only ever touch the ACTIVE profile's data.
    const patchActiveData = (fn: (d: ProfileData) => ProfileData) =>
      setState((s) => ({
        ...s,
        profiles: s.profiles.map((p) =>
          p.id === s.activeProfileId ? { ...p, data: fn(p.data) } : p,
        ),
      }));

    // Parcelas de financiamento injetadas no fluxo quando "junto com as
    // transações" está ativo: cada parcela vira uma despesa com data própria.
    const financingTransactions: Transaction[] = [];
    if (activeData.financingsInFlow) {
      const today = new Date().toISOString().slice(0, 10);
      for (const f of activeData.financings) {
        const total = Math.min(f.currentInstallment, f.installments);
        for (let i = 1; i <= total; i++) {
          const date = financingDueDate(f.startDate, i);
          if (date > today) continue;
          financingTransactions.push({
            id: `fin-${f.id}-${i}`,
            title: `${f.name} · Parcela ${i}/${f.installments}`,
            categoryId: f.categoryId ?? "moradia",
            amount: -Math.abs(f.installmentValue),
            date,
            note: "Parcela do financiamento",
            paymentMethod: "boleto",
          });
        }
      }
    }
    const { regularTransactions, loanTransactions } = selectTransactionLedgers(activeData.transactions, activeData.loanReceivables);
    const visibleTransactions: Transaction[] = [
      ...financingTransactions,
      ...regularTransactions,
    ];

    return {
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
      pinUsage: state.pinUsage,
      activeProfile: active,
      categories: activeData.categories,
      cards: activeData.cards,
      transactions: regularTransactions,
      loanTransactions,
      visibleTransactions,
      loanReceivables: activeData.loanReceivables,
      people: activeData.people,
      reserves: activeData.reserves,
      reservesInBalance: activeData.reservesInBalance,
      notifications: activeData.notifications,
      financings: activeData.financings,
      financingsInFlow: activeData.financingsInFlow,
      showCategoryNameOnCard: activeData.showCategoryNameOnCard,
      goals: activeData.goals,
      pin: activeData.pin,
      categoryById,
      addCategory: (data) => {
        const id = uid("cat");
        patchActiveData((d) => ({
          ...d,
          categories: [...d.categories, { id, ...data }],
        }));
        return id;
      },
      updateCategory: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          categories: d.categories.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),
      deleteCategory: (id) =>
        patchActiveData((d) => ({
          ...d,
          categories: d.categories.filter((c) => c.id !== id),
        })),
      addCard: (data) =>
        patchActiveData((d) => ({
          ...d,
          cards: [...d.cards, { id: uid("card"), ...data }],
        })),
      updateCard: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          cards: d.cards.map((card) =>
            card.id === id ? { ...card, ...patch } : card,
          ),
        })),
      setCardInvoiceStatus: (cardId, month, paid) =>
        patchActiveData((d) => setInvoicePaymentStatus(d, cardId, month, paid)),
      setAllCardInvoiceStatus: (month, paid) =>
        patchActiveData((d) => d.cards.reduce((next, card) => setInvoicePaymentStatus(next, card.id, month, paid), d)),
      setCardInvoicePayment: (cardId, month, payment) =>
        patchActiveData((d) => recordInvoicePayment(d, cardId, month, payment)),
      setCardInvoiceOverride: (cardId, month, amount) =>
        patchActiveData((d) => ({
          ...d,
          cards: d.cards.map((card) => {
            if (card.id !== cardId || !/^\d{4}-\d{2}$/.test(month)) return card;
            const invoiceOverrideByMonth = { ...(card.invoiceOverrideByMonth ?? {}) };
            if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
              invoiceOverrideByMonth[month] = amount;
            } else {
              delete invoiceOverrideByMonth[month];
            }
            return { ...card, invoiceOverrideByMonth };
          }),
        })),
      setCardInvoiceReconciled: (cardId, month, reconciled) =>
        patchActiveData((d) => ({
          ...d,
          cards: d.cards.map((card) =>
            card.id === cardId && /^\d{4}-\d{2}$/.test(month)
              ? {
                  ...card,
                  invoiceReconciledByMonth: {
                    ...(card.invoiceReconciledByMonth ?? {}),
                    [month]: reconciled,
                  },
                }
              : card,
          ),
        })),
      deleteCard: (id) =>
        patchActiveData((d) => ({
          ...d,
          cards: d.cards.filter((card) => card.id !== id),
        })),
      addPerson: (data) =>
        patchActiveData((d) => ({
          ...d,
          people: [
            {
              id: uid("person"),
              name: data.name,
              phone: data.phone ?? "",
              createdAt: new Date().toISOString().slice(0, 10),
            },
            ...d.people,
          ],
        })),
      updatePerson: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          people: d.people.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
      deletePerson: (id) =>
        patchActiveData((d) => ({
          ...d,
          people: d.people.filter((p) => p.id !== id),
        })),
      addReserve: (data) =>
        patchActiveData((d) => ({
          ...d,
          reserves: [
            {
              id: uid("reserve"),
              name: data.name,
              amount: Math.max(0.01, data.amount),
              color: data.color ?? "#2F6BFF",
              createdAt: new Date().toISOString().slice(0, 10),
            },
            ...d.reserves,
          ],
        })),
      updateReserve: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          reserves: d.reserves.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        })),
      deleteReserve: (id) =>
        patchActiveData((d) => ({
          ...d,
          reserves: d.reserves.filter((r) => r.id !== id),
        })),
      setReservesInBalance: (value) =>
        patchActiveData((d) => ({ ...d, reservesInBalance: value })),
      approveNotification: (id) =>
        patchActiveData((d) => {
          const n = d.notifications.find((x) => x.id === id);
          if (!n || n.status !== "pending") return d;
          const categoryId =
            n.categoryId && d.categories.some((c) => c.id === n.categoryId)
              ? n.categoryId
              : "outros";
          const cardId =
            n.cardId && d.cards.some((c) => c.id === n.cardId)
              ? n.cardId
              : undefined;
          const transaction: Transaction = {
            id: uid("t"),
            title: n.merchant,
            categoryId,
            amount: -Math.abs(n.amount),
            date: n.date,
            time: n.time,
            note: `Aprovado da notificação do ${n.bank}`,
            paymentMethod: "cartao",
            cardId,
            cardMode: "credito",
            paymentStatus: "pending",
          };
          return {
            ...openUnpaidPurchaseInvoices(d, transaction),
            transactions: [transaction, ...d.transactions],
            notifications: d.notifications.map((x) =>
              x.id === id ? { ...x, status: "approved" as const } : x,
            ),
          };
        }),
      ignoreNotification: (id) =>
        patchActiveData((d) => ({
          ...d,
          notifications: d.notifications.map((x) =>
            x.id === id && x.status === "pending"
              ? { ...x, status: "ignored" as const }
              : x,
          ),
        })),
      resetNotifications: () =>
        patchActiveData((d) => ({
          ...d,
          notifications: d.notifications.map((x) => ({
            ...x,
            status: "pending" as const,
          })),
        })),
      addFinancing: (data) =>
        patchActiveData((d) => ({
          ...d,
          financings: [
            {
              id: uid("fin"),
              createdAt: new Date().toISOString().slice(0, 10),
              ...data,
            },
            ...d.financings,
          ],
        })),
      updateFinancing: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          financings: d.financings.map((f) =>
            f.id === id ? { ...f, ...patch } : f,
          ),
        })),
      deleteFinancing: (id) =>
        patchActiveData((d) => ({
          ...d,
          financings: d.financings.filter((f) => f.id !== id),
        })),
      setFinancingsInFlow: (value) =>
        patchActiveData((d) => ({ ...d, financingsInFlow: value })),
      setShowCategoryNameOnCard: (value) =>
        patchActiveData((d) => ({ ...d, showCategoryNameOnCard: value })),
      addGoal: (data) =>
        patchActiveData((d) => ({
          ...d,
          goals: [
            {
              id: uid("goal"),
              name: data.name,
              targetAmount: Math.max(0.01, data.targetAmount),
              savedAmount: Math.max(0, data.savedAmount),
              deadline: data.deadline,
              color: data.color ?? "#FF9500",
              createdAt: new Date().toISOString().slice(0, 10),
            },
            ...d.goals,
          ],
        })),
      updateGoal: (id, patch) =>
        patchActiveData((d) => ({
          ...d,
          goals: d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      deleteGoal: (id) =>
        patchActiveData((d) => ({
          ...d,
          goals: d.goals.filter((g) => g.id !== id),
        })),
      exportState: () => JSON.stringify(state),
      importState: (raw) => {
        try {
          const parsed = JSON.parse(raw) as unknown;
          const profiles = buildProfiles(parsed);
          if (profiles.length === 0) {
            return { ok: false, error: "Nenhum perfil encontrado no arquivo." };
          }
          const p = (parsed ?? {}) as Record<string, unknown>;
          const next: AppStoreState = {
            exampleDataVersion: 2,
            profiles,
            activeProfileId:
              typeof p.activeProfileId === "string" &&
              profiles.some((x) => x.id === p.activeProfileId)
                ? p.activeProfileId
                : profiles[0].id,
            pinUsage: p.pinUsage === "switch" ? "switch" : "open",
          };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // storage unavailable — keep in-memory state only
          }
          setState(next);
          return { ok: true };
        } catch {
          return { ok: false, error: "Código ou arquivo inválido." };
        }
      },
      addTransaction: (data) =>
        patchActiveData((d) => {
          const paymentStatus = data.paymentStatus ?? (isCreditCardExpense(data) ? "pending" : "paid");
          const transaction: Transaction = {
            ...data, id: uid("t"), paymentStatus,
            paymentDate: paymentStatus === "pending" ? undefined : data.paymentDate ?? localDateKey(),
            showPaymentDateOnCard: data.showPaymentDateOnCard ?? true,
            cardDisplayMode: data.cardDisplayMode ?? "last4",
          };
          const cards = openUnpaidPurchaseInvoices(d, transaction).cards;
          return { ...d, cards, transactions: [transaction, ...d.transactions] };
        }),
      setTransactionPaymentStatus: (id, status) =>
        patchActiveData((d) => setTransactionPaymentState(d, id, status)),
      updateTransaction: (id, patch) =>
        patchActiveData((d) => {
          const previous = d.transactions.find((transaction) => transaction.id === id);
          const transactions = d.transactions.map((transaction) => {
            if (transaction.id !== id || transaction.source === "loan") return transaction;
            const nextPaymentStatus = patch.paymentStatus ?? transaction.paymentStatus ?? "paid";
            const nextPaymentDate =
              nextPaymentStatus === "paid"
                ? patch.paymentDate ??
                  (patch.paymentStatus ? new Date().toISOString().slice(0, 10) : transaction.paymentDate)
                : undefined;
            const nextShowPaymentDateOnCard =
              patch.showPaymentDateOnCard ?? transaction.showPaymentDateOnCard ?? true;
            const nextCardDisplayMode =
              patch.cardDisplayMode ?? transaction.cardDisplayMode ?? "last4";
            return {
              ...transaction,
              ...patch,
              id: transaction.id,
              source: transaction.source,
              paymentStatus: nextPaymentStatus,
              paymentDate: nextPaymentDate,
              showPaymentDateOnCard: nextShowPaymentDateOnCard,
              cardDisplayMode: nextCardDisplayMode,
            };
          });
          const updated = transactions.find((transaction) => transaction.id === id);
          const previousCard = d.cards.find((card) => card.id === previous?.cardId);
          const updatedCard = d.cards.find((card) => card.id === updated?.cardId);
          const movedPendingPurchase = previous && updated && isCreditCardExpense(updated) && updated.paymentStatus === "pending" &&
            (previous.cardId !== updated.cardId || previous.paymentStatus !== "pending" ||
              previous.amount !== updated.amount || previous.recurrence !== updated.recurrence || previous.installments !== updated.installments ||
              getTransactionInvoiceMonth(previous, previousCard) !== getTransactionInvoiceMonth(updated, updatedCard));
          const cards = movedPendingPurchase && updatedCard
            ? openUnpaidPurchaseInvoices(d, updated).cards
            : d.cards;
          return { ...d, cards, transactions };
        }),
      deleteTransaction: (id) =>
        patchActiveData((d) => ({
          ...d,
          transactions: d.transactions.filter(
            (transaction) => transaction.id !== id || transaction.source === "loan",
          ),
        })),
      deleteTransactions: (ids) => {
        const transactionIds = new Set(ids);
        if (transactionIds.size === 0) return;
        patchActiveData((d) => ({
          ...d,
          transactions: d.transactions.filter(
            (transaction) =>
              !transactionIds.has(transaction.id) || transaction.source === "loan",
          ),
        }));
      },
      markLoanReceivablesPaid: (ids) => {
        const receivableIds = new Set(ids);
        if (receivableIds.size === 0) return;
        patchActiveData((d) => ({
          ...d,
          loanReceivables: d.loanReceivables.map((receivable) =>
            receivableIds.has(receivable.id) && receivable.status === "open"
              ? { ...receivable, status: "paid" as const }
              : receivable,
          ),
        }));
      },
      createLoanRecord: (data) =>
        patchActiveData((d) => {
          const loanId = uid("loan");
          const createdAt = new Date().toISOString().slice(0, 10);
          const operationType: LoanOperationType = data.operationType === "card" ? "card" : "loan";
          const operationLabel = operationType === "card" ? "Cartão emprestado" : "Empréstimo";
          const collectionLabel =
            data.collectionMode === "fixed"
              ? `${data.receivables?.length ?? 0} parcela(s) agendada(s)`
              : "Dívida em aberto";
          const originalNote = [
            data.note?.trim() || undefined,
            data.description?.trim() || undefined,
            `Tipo: ${operationLabel}`,
            `Contato: ${data.contact}`,
            `Cobrança: ${collectionLabel}`,
            `Referência: ${loanId}`,
          ]
            .filter(Boolean)
            .join("\n");
          const original = {
            id: uid("t"),
            title:
              operationType === "card"
                ? `Cartão usado por ${data.contact}`
                : `Emprestei para ${data.contact}`,
            categoryId: data.categoryId,
            amount: -Math.abs(data.amount),
            date: data.date,
            note: originalNote,
            draftDisplay: data.draftDisplay ?? "hidden",
            attachments: data.attachments?.length ? data.attachments.map((attachment) => attachment.src) : undefined,
            paymentMethod: data.paymentMethod,
            source: "loan" as const,
            operationType,
          };

          if (data.collectionMode === "open") {
              const openDebt: LoanReceivable = {
              id: uid("receivable"),
              loanId,
              contact: data.contact,
              amount: Math.abs(data.amount),
              status: "open",
              description: data.description?.trim() || undefined,
              paymentMethod: data.paymentMethod,
              note: data.note?.trim() || undefined,
              draftDisplay: data.draftDisplay ?? "hidden",
              attachments: data.attachments?.length ? data.attachments.map((attachment) => attachment.src) : undefined,
              operationType,
              createdAt,
            };
            return {
              ...d,
              transactions: [original, ...d.transactions],
              loanReceivables: [openDebt, ...d.loanReceivables],
            };
          }

          const scheduled = (data.receivables ?? []).map((item) => {
            const transactionId = uid("t");
            const receivable: LoanReceivable = {
              id: uid("receivable"),
              loanId,
              contact: data.contact,
              amount: Math.abs(item.amount),
              dueDate: item.dueDate,
              status: "scheduled",
              installment: item.installment,
              installments: item.installments,
              transactionId,
              description: data.description?.trim() || undefined,
              paymentMethod: data.paymentMethod,
              note: data.note?.trim() || undefined,
              draftDisplay: data.draftDisplay ?? "hidden",
              attachments: data.attachments?.length ? data.attachments.map((attachment) => attachment.src) : undefined,
              operationType,
              createdAt,
            };
            return { receivable, transaction: {
              id: transactionId,
              title: `Devolução de ${data.contact} · ${item.installment}/${item.installments}`,
              categoryId: data.categoryId,
              amount: Math.abs(item.amount),
              date: item.dueDate,
              note: [
                data.note?.trim() || undefined,
                data.description?.trim() || undefined,
                `${operationLabel} para ${data.contact}`,
                `Parcela ${item.installment}/${item.installments}`,
                `Referência: ${loanId}`,
              ].filter(Boolean).join("\n"),
              draftDisplay: data.draftDisplay ?? "hidden",
              attachments: data.attachments?.length ? data.attachments.map((attachment) => attachment.src) : undefined,
              paymentMethod: data.paymentMethod,
              recurrence: "parcelada" as const,
              installments: item.installments,
              source: "loan" as const,
              operationType,
              currentInstallment: item.installment,
            } };
          });
          return {
            ...d,
            transactions: [original, ...scheduled.map((item) => item.transaction), ...d.transactions],
            loanReceivables: [
              ...scheduled.map((item) => item.receivable),
              ...d.loanReceivables,
            ],
          };
        }),
      addProfile: (data) =>
        setState((s) => {
          const profile: AppProfile = {
            id: uid("profile"),
            ...data,
            data: defaultData(),
          };
          return {
            ...s,
            profiles: [...s.profiles, profile],
            activeProfileId: profile.id,
          };
        }),
      updateProfile: (id, patch) =>
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
      deleteProfile: (id) => {
        if (state.profiles.length <= 1) return false;
        setState((s) => {
          const next = s.profiles.filter((p) => p.id !== id);
          return {
            ...s,
            profiles: next,
            activeProfileId:
              s.activeProfileId === id
                ? (next[0]?.id ?? s.activeProfileId)
                : s.activeProfileId,
          };
        });
        return true;
      },
      setActiveProfile: (id) =>
        setState((s) =>
          s.profiles.some((p) => p.id === id)
            ? { ...s, activeProfileId: id }
            : s,
        ),
      setPinUsage: (usage) => setState((s) => ({ ...s, pinUsage: usage })),
      setPin: (pin) => patchActiveData((d) => ({ ...d, pin })),
      removePin: () => patchActiveData((d) => ({ ...d, pin: null })),
      verifyPin: (pin) => activeData.pin !== null && activeData.pin === pin,
    };
  }, [state]);

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
