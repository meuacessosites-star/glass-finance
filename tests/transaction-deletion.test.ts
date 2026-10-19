import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppProfile, ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import {
  applyTransactionDeletion,
  captureTransactionDeletion,
  restoreTransactionDeletion,
} from "../src/lib/transaction-deletion";
import { getHomeBalance } from "../src/lib/home-balance";

const row = (
  id: string,
  amount = -100,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  categoryId: "outros",
  amount,
  date: "2026-10-17",
  ...patch,
});
const data = (
  transactions: Transaction[],
  patch: Partial<ProfileData> = {},
): ProfileData => ({
  transactions,
  categories: [],
  cards: [],
  loanReceivables: [],
  people: [],
  reserves: [],
  reservesInBalance: true,
  notifications: [],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
  ...patch,
});
const profile = (id: string, transactions: Transaction[]): AppProfile => ({
  id,
  name: id,
  avatar: {
    kind: "emoji",
    emoji: "🌿",
    image: null,
    bg: "#fff",
    crop: { scale: 1, panX: 0, panY: 0 },
  },
  data: data(transactions),
});

test("undo restores the exact transaction including status, card invoice, dates, notes and attachments", () => {
  const original = profile("a", [
    row("income", 1000),
    row("purchase", -250, {
      paymentStatus: "paid",
      paymentDate: "2026-10-17",
      dueDate: "2026-10-20",
      note: "Observação pessoal",
      attachments: ["data:image/png;base64,AA=="],
      paymentMethod: "cartao",
      cardId: "card",
      cardMode: "credito",
      cardInvoiceMonth: "2026-10",
      personId: "person",
    }),
  ]);
  const deletion = captureTransactionDeletion(original.data, "a", [
    "purchase",
  ])!;
  const removed = applyTransactionDeletion([original], deletion);
  assert.equal(removed[0].data.transactions.length, 1);
  assert.deepEqual(restoreTransactionDeletion(removed, deletion), [original]);
  assert.equal(original.data.transactions.length, 2);
});

test("bulk undo restores every selected transaction in its original order", () => {
  const original = profile("a", [row("a"), row("b"), row("c"), row("d")]);
  const deletion = captureTransactionDeletion(original.data, "a", [
    "d",
    "a",
    "b",
  ])!;
  const removed = applyTransactionDeletion([original], deletion);
  assert.deepEqual(
    removed[0].data.transactions.map((item) => item.id),
    ["c"],
  );
  assert.deepEqual(restoreTransactionDeletion(removed, deletion), [original]);
});

test("undo preserves new transactions, later edits and other profile settings", () => {
  const original = profile("a", [row("a"), row("b"), row("c")]);
  const deletion = captureTransactionDeletion(original.data, "a", ["b"])!;
  const [removed] = applyTransactionDeletion([original], deletion);
  const updated = {
    ...removed,
    data: {
      ...removed.data,
      homeBalanceMode: "accumulated" as const,
      transactions: [
        row("new", 1000),
        row("a", -75, { title: "Título alterado" }),
        row("c"),
      ],
    },
  };
  const restored = restoreTransactionDeletion([updated], deletion)[0];
  assert.deepEqual(
    restored.data.transactions.map((item) => item.id),
    ["new", "a", "b", "c"],
  );
  assert.equal(restored.data.transactions[1].title, "Título alterado");
  assert.equal(restored.data.homeBalanceMode, "accumulated");
});

test("undo targets its original profile even after navigating or switching profiles", () => {
  const a = profile("a", [row("same-id", 100)]);
  const b = profile("b", [row("same-id", 900)]);
  const deletion = captureTransactionDeletion(a.data, "a", ["same-id"])!;
  const restored = restoreTransactionDeletion(
    applyTransactionDeletion([a, b], deletion),
    deletion,
  );
  assert.deepEqual(restored[0], a);
  assert.equal(restored[1], b);
  assert.equal(restored[1].data.transactions[0].amount, 900);
  assert.deepEqual(restoreTransactionDeletion([b], deletion), [b]);
});

test("repeated undo never duplicates or overwrites an existing updated transaction", () => {
  const original = profile("a", [row("a")]);
  const deletion = captureTransactionDeletion(original.data, "a", ["a"])!;
  let restored = restoreTransactionDeletion(
    applyTransactionDeletion([original], deletion),
    deletion,
  );
  restored = restoreTransactionDeletion(restored, deletion);
  assert.equal(restored[0].data.transactions.length, 1);
  const updated = profile("a", [row("a", -50, { title: "Atualizada" })]);
  assert.equal(restoreTransactionDeletion([updated], deletion)[0], updated);
});

test("loans and linked receipts cannot be removed from Transactions and empty selections are harmless", () => {
  const saved = data(
    [
      row("loan", -500, { source: "loan" }),
      row("borrowed", -100, { operationType: "card" }),
      row("linked", 100),
      row("legacy", -300, { note: "Referência: l1" }),
      row("loan-receivable-free", 100),
    ],
    {
      loanReceivables: [
        {
          id: "r1",
          loanId: "l1",
          contact: "Pessoa",
          amount: 100,
          status: "open",
          transactionId: "linked",
          createdAt: "2026-10-01",
        },
      ],
    },
  );
  assert.equal(
    captureTransactionDeletion(
      saved,
      "a",
      saved.transactions.map((item) => item.id),
    ),
    undefined,
  );
  assert.equal(captureTransactionDeletion(saved, "a", []), undefined);
  assert.equal(captureTransactionDeletion(saved, "a", ["missing"]), undefined);
});

test("independent deletion notices can be undone in either order", () => {
  const original = profile("a", [row("a"), row("b"), row("c")]);
  const first = captureTransactionDeletion(original.data, "a", ["a"])!;
  const afterFirst = applyTransactionDeletion([original], first);
  const second = captureTransactionDeletion(afterFirst[0].data, "a", ["b"])!;
  const afterBoth = applyTransactionDeletion(afterFirst, second);
  assert.deepEqual(
    restoreTransactionDeletion(
      restoreTransactionDeletion(afterBoth, first),
      second,
    ),
    [original],
  );
  assert.deepEqual(
    restoreTransactionDeletion(
      restoreTransactionDeletion(afterBoth, second),
      first,
    ),
    [original],
  );
});

test("undo immediately restores the balances calculated from Transactions", () => {
  const original = profile("a", [row("income", 1000), row("bill", -250)]);
  const deletion = captureTransactionDeletion(original.data, "a", ["bill"])!;
  const removed = applyTransactionDeletion([original], deletion);
  assert.equal(
    getHomeBalance(removed[0].data, "2026-10", "monthly").balance,
    1000,
  );
  const restored = restoreTransactionDeletion(removed, deletion);
  assert.equal(
    getHomeBalance(restored[0].data, "2026-10", "monthly").balance,
    750,
  );
});
