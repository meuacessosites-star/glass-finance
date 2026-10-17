import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTransactionLedgers } from "../src/lib/transaction-ledgers";
import { monthTotals, type Transaction } from "../src/lib/mock-data";
import { sanitizeTransactions, type LoanReceivable, type ProfileData } from "../src/lib/app-store";
import { createDemoProfile } from "../src/lib/demo-examples";

const row = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, amount, date: "2026-10-17", title: id, categoryId: "outros", paymentMethod: "pix", ...extra });
const receipt = (extra: Partial<LoanReceivable> = {}): LoanReceivable => ({ id: "r1", loanId: "loan-1", contact: "Pessoa", amount: 300, status: "scheduled", operationType: "loan", createdAt: "2026-10-17", ...extra });

test("loan advances and their repayments never change the regular balance, income or expenses", () => {
  const normal = [row("salary", 2000), row("bill", -200), row("card", -75, { cardId: "my-card", cardMode: "credito", paymentMethod: "cartao" })];
  const baseline = monthTotals(normal, "2026-10");
  const loans = [row("advance", -900, { source: "loan", operationType: "loan" }), row("received", 300, { source: "loan", paymentStatus: "paid" }), row("scheduled", 300, { source: "loan", paymentStatus: "pending" }), row("future", 300, { source: "loan", date: "2026-11-17" })];
  const { regularTransactions, loanTransactions } = selectTransactionLedgers([...normal, ...loans]);
  assert.deepEqual(regularTransactions, normal);
  assert.deepEqual(loanTransactions, loans);
  assert.deepEqual(monthTotals(regularTransactions, "2026-10"), baseline);
  assert.equal(baseline.income - baseline.expense, 1725);
});

test("card lending stays in the loan statement even when a saved personal card is linked", () => {
  const personal = row("my-purchase", -100, { cardId: "my-card", cardMode: "credito", paymentMethod: "cartao" });
  const lending = row("lent-card", -450, { source: "loan", operationType: "card", cardId: "my-card", cardMode: "credito", paymentMethod: "cartao" });
  const result = selectTransactionLedgers([personal, lending]);
  assert.deepEqual(result.regularTransactions, [personal]);
  assert.deepEqual(result.loanTransactions, [lending]);
});

test("legacy linked repayments and stored references are isolated without guessing from titles", () => {
  const linked = row("legacy-repayment", 300);
  const original = row("legacy-advance", -600, { note: "Contato: Pessoa\nReferência: loan-1" });
  const synthetic = row("loan-receivable-r2", 200);
  const ordinary = row("ordinary", -50, { title: "Aluguel de equipamento / empréstimo", note: "Observação pessoal" });
  const result = selectTransactionLedgers([linked, original, synthetic, ordinary], [receipt({ transactionId: linked.id })]);
  assert.deepEqual(result.regularTransactions, [ordinary]);
  assert.deepEqual(result.loanTransactions, [linked, original, synthetic]);
});

test("existing loan history, dates, observations and attachments survive a save and reload", () => {
  const original = row("advance", -900, { source: "loan", operationType: "loan", note: "Detalhes do empréstimo", attachments: ["data:image/png;base64,AA=="], draftDisplay: "multipleMedia" });
  const paid = row("paid-installment", 300, { source: "loan", paymentStatus: "paid", paymentDate: "2026-10-17" });
  const state = [row("regular", -50), original, paid];
  const snapshot = structuredClone(state);
  const reloaded = sanitizeTransactions(JSON.parse(JSON.stringify(state)));
  const result = selectTransactionLedgers(reloaded);
  assert.deepEqual(state, snapshot);
  assert.equal(reloaded.length, state.length);
  assert.equal(result.regularTransactions.length, 1);
  assert.equal(result.loanTransactions.length, 2);
  assert.equal(result.loanTransactions[0].amount, original.amount);
  assert.equal(result.loanTransactions[0].date, original.date);
  assert.equal(result.loanTransactions[0].note, original.note);
  assert.deepEqual(result.loanTransactions[0].attachments, original.attachments);
  assert.equal(result.loanTransactions[1].paymentStatus, "paid");
  assert.equal(result.loanTransactions[1].paymentDate, "2026-10-17");
});

test("open, scheduled and settled loans remain separate regardless of receipt status", () => {
  for (const status of ["open", "scheduled", "paid"] as const) {
    const linked = row("linked", 300);
    const result = selectTransactionLedgers([linked], [receipt({ transactionId: linked.id, status })]);
    assert.equal(result.regularTransactions.length, 0);
    assert.deepEqual(result.loanTransactions, [linked]);
  }
  assert.equal(selectTransactionLedgers([row("linked", 300)], []).regularTransactions.length, 1);
});

test("the demonstration preserves both loan types while ordinary transactions remain visible", () => {
  const base: ProfileData = { categories: [], cards: [], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null };
  const data = createDemoProfile(base, new Date(2026, 9, 17, 12)).data;
  const result = selectTransactionLedgers(data.transactions, data.loanReceivables);
  assert.ok(result.loanTransactions.some((item) => item.operationType === "loan"));
  assert.ok(result.loanTransactions.some((item) => item.operationType === "card"));
  assert.ok(result.regularTransactions.some((item) => item.amount > 0));
  assert.ok(result.regularTransactions.some((item) => item.paymentMethod === "cartao"));
  assert.equal(result.loanTransactions.length + result.regularTransactions.length, data.transactions.length);
});
