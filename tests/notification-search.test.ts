import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppNotification, ProfileData } from "../src/lib/app-store";
import { searchApprovedNotifications } from "../src/lib/notification-search";

const message = (id: string, patch: Partial<AppNotification> = {}): AppNotification => ({
  id, bank: "Nubank", merchant: "Café da Praça", amount: 54.9,
  date: "2026-10-20", categoryId: "alimentacao", status: "approved", ...patch,
});
const data: Pick<ProfileData, "notifications" | "transactions" | "loanReceivables" | "categories" | "cards"> = {
  notifications: [
    message("approved", { transactionId: "saved" }),
    message("loan", { merchant: "Compra antiga", receivableId: "loan-part", amount: 90 }),
    message("pending", { status: "pending" }),
    message("ignored", { status: "ignored" }),
  ],
  transactions: [{
    id: "saved", title: "Almoço revisado", amount: -59.9, date: "2026-10-21",
    categoryId: "alimentacao", note: "Encontro de família", cardId: "card",
  }],
  loanReceivables: [{
    id: "loan-part", loanId: "loan", contact: "João", amount: 90,
    status: "open", description: "Material escolar", note: "Caderno novo",
    createdAt: "2026-10-20T12:00:00Z",
  }],
  categories: [{ id: "alimentacao", label: "Alimentação", color: "#ff9000", icon: "outros" }],
  cards: [{ id: "card", name: "Meu cartão", institution: "Banco Inter", color: "#ff9000", last4: "1234" }],
};
const ids = (query: string) => searchApprovedNotifications(data, query).map((n) => n.id);

test("empty search keeps approved order and excludes pending and ignored messages", () => {
  assert.deepEqual(ids("   "), ["approved", "loan"]);
});
test("approved search ignores accents and case and combines terms across fields", () => {
  assert.deepEqual(ids("  CAFE  NUBANK   alimentacao "), ["approved"]);
  assert.deepEqual(ids("nubank inexistente"), []);
});
test("approved search finds edited registration titles and notes as well as original messages", () => {
  assert.deepEqual(ids("almoco familia"), ["approved"]);
  assert.deepEqual(ids("praca"), ["approved"]);
});
test("approved search finds linked loans without including unrelated transactions", () => {
  assert.deepEqual(ids("joao caderno"), ["loan"]);
  assert.deepEqual(ids("escolar familia"), []);
});
test("approved search accepts Brazilian amounts, decimal points and message or saved dates", () => {
  assert.deepEqual(ids("54,90"), ["approved"]);
  assert.deepEqual(ids("59.90"), ["approved"]);
  assert.deepEqual(ids("21/10/2026"), ["approved"]);
  assert.deepEqual(ids("2026-10-21"), ["approved"]);
});
test("approved search includes the saved card name, institution and last digits", () => {
  assert.deepEqual(ids("inter 1234"), ["approved"]);
});
test("search does not mutate messages, saved records or other profile data", () => {
  const before = structuredClone(data);
  ids("familia");
  ids("sem resultado");
  assert.deepEqual(data, before);
  assert.deepEqual(searchApprovedNotifications({ ...data, notifications: [] }, "cafe"), []);
});
