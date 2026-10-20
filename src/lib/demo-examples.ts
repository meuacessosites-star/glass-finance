import type { AppProfile, ProfileData } from "./app-store";
import type { Transaction } from "./mock-data";
import { calendarDate, getCardBillingCycle, getInvoiceDates, getTransactionInvoiceMonth, localDateKey } from "./card-billing";

export const DEMO_PROFILE_ID = "profile-granascan-examples-v1";
export const OVERDUE_DEMO_ID = "demo-conta-vencida-v2";
export function createOverdueExample(now = new Date()): Transaction {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return { id: OVERDUE_DEMO_ID, title: "Internet · conta vencida (exemplo)", categoryId: "moradia", amount: -149.90,
    date: localDateKey(now), dueDate: localDateKey(yesterday), paymentMethod: "boleto", paymentStatus: "pending",
    note: "Dado de demonstração: boleto com vencimento ontem, ainda não pago." };
}
export function createDemoProfile(base: ProfileData, now = new Date()): AppProfile {
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  const today = localDateKey(now);
  const at = (d: number, offset = 0) => calendarDate(year, month + offset, d);
  const before = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() - days); return localDateKey(date); };
  const cards: ProfileData["cards"] = [
    { id: "demo-card-nubank", name: "Nubank (exemplo)", institution: "Nubank", last4: "4821", totalLimit: 3500, closingDay: ((day + 23) % 31) + 1, dueDay: day, color: "#AF52DE" },
    { id: "demo-card-inter", name: "Inter (exemplo)", institution: "Inter", last4: "9173", totalLimit: 2500, closingDay: day, dueDay: ((day + 7) % 31) + 1, color: "#FF9500" },
    { id: "demo-card-itau", name: "Itaú (exemplo)", institution: "Itaú", last4: "2056", totalLimit: 5000, closingDay: 25, dueDay: 5, color: "#0075D5" },
  ];
  const borrowedPurchaseDate = at(Math.max(1, day - 3));
  const borrowedCycle = getCardBillingCycle(cards[1], borrowedPurchaseDate)!;
  const firstClosing = getInvoiceDates(cards[0], today.slice(0, 7))!.closingDate;
  const row = (id: string, title: string, categoryId: string, amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id: `demo-${id}`, title, categoryId, amount, date, note: "Dado de demonstração", paymentStatus: "paid", paymentDate: date, ...extra });
  const credit = (card: number) => ({ paymentMethod: "cartao", cardMode: "credito", cardId: cards[card].id, paymentStatus: "pending" as const, paymentDate: undefined });
  const transactions: Transaction[] = [
    createOverdueExample(now),
    row("salario", "Salário · exemplo", "salario", 4200, at(5), { paymentMethod: "transferencia" }),
    row("freelance", "Serviço recebido · exemplo", "freelance", 650, at(Math.min(12, day)), { paymentMethod: "pix" }),
    row("receita-pendente", "Reembolso a receber · exemplo", "outros", 120, today, { paymentMethod: "pix", paymentStatus: "pending", paymentDate: undefined }),
    row("mercado-credito", "Mercado · crédito", "alimentacao", -286.70, before(firstClosing, 1), credit(0)),
    row("fatura-atrasada", "Fatura em atraso · exemplo", "compras", -120.50, at(1, -1), credit(0)),
    row("farmacia-credito", "Farmácia · crédito", "saude", -89.90, firstClosing, credit(0)),
    row("apos-fechamento", "Compra após fechamento · exemplo", "compras", -179.90, today, credit(0)),
    row("restaurante-credito", "Restaurante · crédito", "alimentacao", -67.80, today, credit(1)),
    row("assinatura-credito", "Assinatura · crédito", "assinaturas", -29.90, at(Math.max(1, day - 2)), credit(1)),
    row("outra-fatura", "Compra na próxima fatura · exemplo", "compras", -249.90, at(28, -1), credit(2)),
    row("combustivel-debito", "Combustível · débito", "transporte", -160, at(Math.max(1, day - 1)), { paymentMethod: "cartao", cardMode: "debito", cardId: cards[1].id }),
    row("aluguel", "Aluguel · Pix", "moradia", -1200, at(3), { paymentMethod: "pix" }),
    row("padaria", "Padaria · dinheiro", "alimentacao", -26.50, at(Math.max(1, day - 2)), { paymentMethod: "dinheiro" }),
    row("energia", "Energia · boleto pendente", "moradia", -190.35, today, { paymentMethod: "boleto", paymentStatus: "pending", paymentDate: undefined }),
    row("internet", "Internet · exemplo", "moradia", -99.90, at(10), { paymentMethod: "boleto" }),
    row("agua", "Água · vencimento futuro", "moradia", -88.20, at(Math.min(day + 3, 31)), { paymentMethod: "boleto", paymentStatus: "pending", paymentDate: undefined }),
    row("loan-money", "Emprestei para Luiza (exemplo)", "outros", -600, at(Math.max(1, day - 5)), { source: "loan", operationType: "loan", paymentMethod: "pix", note: "Tipo: Empréstimo\nContato: Luiza (exemplo)\nCobrança: 2 parcela(s) agendada(s)\nReferência: demo-loan-money" }),
    row("loan-card", "Cartão usado por Carlos (exemplo)", "compras", -450, borrowedPurchaseDate, { ...credit(1), source: "loan", operationType: "card", paymentMethod: "cartao", note: "Tipo: Cartão emprestado\nContato: Carlos (exemplo)\nCobrança: 1 parcela(s) agendada(s)\nReferência: demo-loan-card" }),
    row("paid-last-month", "Compra paga · exemplo", "compras", -75, at(1, -1), { paymentMethod: "cartao", cardMode: "credito", cardId: cards[2].id }),
  ];
  const paidMonth = getTransactionInvoiceMonth(transactions[transactions.length - 1], cards[2]);
  cards[2].invoicePaidByMonth = { [paidMonth]: true };
  return { id: DEMO_PROFILE_ID, name: "Demonstração", avatar: { kind: "emoji", emoji: "🧪", image: null, bg: "#DDEBFF", crop: { scale: 1, panX: 0, panY: 0 } }, data: {
    ...base, cards, transactions,
    people: [{ id: "demo-person-luiza", name: "Luiza (exemplo)", phone: "", createdAt: today }, { id: "demo-person-carlos", name: "Carlos (exemplo)", phone: "", createdAt: today }],
    loanReceivables: [
      { id: "demo-receivable-1", loanId: "demo-loan-money", contact: "Luiza (exemplo)", amount: 300, dueDate: today, status: "scheduled", installment: 1, installments: 2, operationType: "loan", paymentMethod: "pix", createdAt: today, description: "Empréstimo de demonstração" },
      { id: "demo-receivable-2", loanId: "demo-loan-money", contact: "Luiza (exemplo)", amount: 300, dueDate: at(day, 1), status: "scheduled", installment: 2, installments: 2, operationType: "loan", paymentMethod: "pix", createdAt: today },
      { id: "demo-receivable-card", loanId: "demo-loan-card", contact: "Carlos (exemplo)", amount: 450, status: "scheduled", collectionMode: "fixed", dueDate: borrowedCycle.dueDate, cardId: cards[1].id, cardInvoiceMonth: borrowedCycle.month, cardClosingDate: borrowedCycle.closingDate, startDate: borrowedPurchaseDate, installment: 1, installments: 1, operationType: "card", paymentMethod: "cartao", createdAt: today, description: "Cartão emprestado de demonstração" },
      { id: "demo-receivable-paid", loanId: "demo-loan-settled", contact: "Luiza (exemplo)", amount: 150, dueDate: at(10), status: "paid", operationType: "loan", paymentMethod: "pix", createdAt: today, description: "Parcela já recebida · exemplo" },
    ],
    notifications: [
      { id: "demo-bank-1", bank: "Nubank", merchant: "Mercado · exemplo para aprovar", amount: 54.90, date: today, time: "10:30", categoryId: "alimentacao", cardId: cards[0].id, status: "pending" },
      { id: "demo-bank-2", bank: "Inter", merchant: "Farmácia · exemplo para aprovar", amount: 32, date: today, time: "11:15", categoryId: "saude", cardId: cards[1].id, status: "pending" },
    ],
    reserves: [{ id: "demo-reserve", name: "Viagem · exemplo", amount: 350, color: "#2F6BFF", createdAt: today }],
    goals: [{ id: "demo-goal", name: "Reserva de emergência · exemplo", targetAmount: 2000, savedAmount: 500, deadline: at(day, 6), color: "#1FBF4F", createdAt: today }],
    financings: [], pin: null,
  } };
}

export const NOTIFICATION_EXAMPLE_VERSION = 3;
export const NOTIFICATION_EXAMPLE_PAYMENT = "demo-notification-payment-v3";
export const NOTIFICATION_EXAMPLE_RECEIPT = "demo-notification-receipt-v3";
export const NOTIFICATION_EXAMPLE_APPROVED = "demo-notification-approved-v3";
export const NOTIFICATION_EXAMPLE_TRANSACTION =
  "demo-notification-approved-transaction-v3";

export function addNotificationReviewExamples(
  data: ProfileData,
  now = new Date(),
): ProfileData {
  const today = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const category =
    data.categories.find((row) => row.id === "alimentacao")?.id ??
    data.categories[0]?.id ??
    "outros";
  const examples: Transaction[] = [
    {
      id: NOTIFICATION_EXAMPLE_PAYMENT,
      title: "Pagamento de energia · exemplo",
      categoryId: category,
      amount: -88.2,
      date: today,
      dueDate: today,
      paymentMethod: "boleto",
      paymentStatus: "pending",
      note: "Exemplo no perfil Demonstração.",
    },
    {
      id: NOTIFICATION_EXAMPLE_RECEIPT,
      title: "Recebimento de serviço · exemplo",
      categoryId: category,
      amount: 150,
      date: today,
      dueDate: localDateKey(tomorrow),
      paymentMethod: "pix",
      paymentStatus: "pending",
      note: "Exemplo no perfil Demonstração.",
    },
    {
      id: NOTIFICATION_EXAMPLE_TRANSACTION,
      title: "Mercado · exemplo aprovado",
      categoryId: category,
      amount: -54.9,
      date: today,
      paymentMethod: "pix",
      paymentStatus: "paid",
      paymentDate: today,
      note: "Exemplo aprovado e salvo em Transações.",
    },
  ];
  return {
    ...data,
    transactions: [
      ...examples.filter(
        (item) => !data.transactions.some((row) => row.id === item.id),
      ),
      ...data.transactions,
    ],
    notifications: [
      ...(!data.notifications.some(
        (n) => n.id === NOTIFICATION_EXAMPLE_APPROVED,
      )
        ? [
            {
              id: NOTIFICATION_EXAMPLE_APPROVED,
              bank: "Nubank",
              merchant: "Mercado · exemplo aprovado",
              amount: 54.9,
              date: today,
              time: now.toTimeString().slice(0, 5),
              categoryId: category,
              status: "approved" as const,
              approvedAt: now.toISOString(),
              recordKind: "transaction" as const,
              transactionId: NOTIFICATION_EXAMPLE_TRANSACTION,
            },
          ]
        : []),
      ...(!data.notifications.some(
        (n) => n.id === "demo-notification-pending-v3",
      )
        ? [
            {
              id: "demo-notification-pending-v3",
              bank: "Inter",
              merchant: "Compra · exemplo para revisar",
              amount: 42.5,
              date: today,
              categoryId: category,
              status: "pending" as const,
            },
          ]
        : []),
      ...data.notifications,
    ],
  };
}

export function installDemoExamples<
  T extends {
    profiles: AppProfile[];
    activeProfileId: string;
    exampleDataVersion?: number;
  },
>(state: T, base: ProfileData, now = new Date()): T {
  const version = state.exampleDataVersion ?? 0;
  if (version >= NOTIFICATION_EXAMPLE_VERSION) return state;
  const existing = state.profiles.some(
    (profile) => profile.id === DEMO_PROFILE_ID,
  );
  let profiles = state.profiles;
  if (version < 1 && !existing)
    profiles = [...profiles, createDemoProfile(base, now)];
  else if (version < 2)
    profiles = profiles.map((profile) =>
      profile.id === DEMO_PROFILE_ID &&
      !profile.data.transactions.some(
        (transaction) => transaction.id === OVERDUE_DEMO_ID,
      )
        ? {
            ...profile,
            data: {
              ...profile.data,
              transactions: [
                createOverdueExample(now),
                ...profile.data.transactions,
              ],
            },
          }
        : profile,
    );
  profiles = profiles.map((profile) =>
    profile.id === DEMO_PROFILE_ID
      ? { ...profile, data: addNotificationReviewExamples(profile.data, now) }
      : profile,
  );
  return {
    ...state,
    profiles,
    activeProfileId: version < 1 ? DEMO_PROFILE_ID : state.activeProfileId,
    exampleDataVersion: NOTIFICATION_EXAMPLE_VERSION,
  };
}
