import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, ProfileData } from "../src/lib/app-store";
import { isInvoiceCardExpanded, sanitizeInvoiceCardDisplayMode, setInvoiceCardDisplayPreference } from "../src/lib/invoice-card-display";

const card: AppCard = { id: "main", name: "Meu cartão", last4: "1234", color: "#FF7A00", invoiceCollapsed: true, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 30, paymentDate: "2026-10-18" } } };
const profile = (): ProfileData => ({ cards: [card], categories: [], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null });

test("only supported initial-view preferences survive load/import sanitization", () => {
  assert.equal(sanitizeInvoiceCardDisplayMode("expanded"), "expanded");
  assert.equal(sanitizeInvoiceCardDisplayMode("collapsed"), "collapsed");
  for (const invalid of [undefined, null, "", "EXPANDED", "other", true, {}, []]) assert.equal(sanitizeInvoiceCardDisplayMode(invalid), undefined);
});

test("chosen initial view overrides old card state and applies to newly created cards", () => {
  assert.equal(isInvoiceCardExpanded(card, "expanded"), true);
  assert.equal(isInvoiceCardExpanded({ ...card, invoiceCollapsed: false }, "collapsed"), false);
  const newCard = { id: "new" };
  assert.equal(isInvoiceCardExpanded(newCard, "collapsed"), false);
  assert.equal(isInvoiceCardExpanded(newCard, "expanded"), true);
});

test("individual toggles and opening a statement do not change the saved opening preference", () => {
  const data = setInvoiceCardDisplayPreference(profile(), "expanded");
  const duringVisit = { [card.id]: false };
  assert.equal(isInvoiceCardExpanded(card, data.invoiceCardDisplayMode, duringVisit), false);
  assert.equal(isInvoiceCardExpanded({ id: "other" }, data.invoiceCardDisplayMode, duringVisit), true);
  assert.equal(data.invoiceCardDisplayMode, "expanded");
  assert.equal(isInvoiceCardExpanded(card, data.invoiceCardDisplayMode, {}), true, "returning to the page restores the preferred initial view");
  assert.equal(isInvoiceCardExpanded(card, "collapsed", { main: true }), true);
});

test("saving a preference retains payment records, card order and every financial collection", () => {
  const original = profile();
  const snapshot = structuredClone(original);
  const saved = setInvoiceCardDisplayPreference(original, "collapsed");
  assert.equal(saved.invoiceCardDisplayMode, "collapsed");
  assert.equal(saved.cards, original.cards);
  assert.equal(saved.transactions, original.transactions);
  assert.equal(saved.loanReceivables, original.loanReceivables);
  assert.equal(saved.cards[0].invoicePaymentsByMonth, original.cards[0].invoicePaymentsByMonth);
  assert.deepEqual(original, snapshot);
  assert.equal(setInvoiceCardDisplayPreference(saved, "collapsed"), saved);
  assert.equal(setInvoiceCardDisplayPreference(saved, "invalid"), saved);
});

test("the chosen view survives serialization and remains isolated between profiles", () => {
  const first = profile(), second = profile();
  const saved = setInvoiceCardDisplayPreference(first, "collapsed");
  const restored = JSON.parse(JSON.stringify(saved)) as ProfileData;
  const mode = sanitizeInvoiceCardDisplayMode(restored.invoiceCardDisplayMode);
  assert.equal(mode, "collapsed");
  assert.equal(isInvoiceCardExpanded(restored.cards[0], mode), false);
  assert.equal(first.invoiceCardDisplayMode, undefined);
  assert.equal(second.invoiceCardDisplayMode, undefined);
  assert.equal(setInvoiceCardDisplayPreference(saved, "expanded").invoiceCardDisplayMode, "expanded");
});

test("older profiles retain their individual state until an initial view is explicitly chosen", () => {
  assert.equal(isInvoiceCardExpanded(card, undefined), false);
  assert.equal(isInvoiceCardExpanded({ ...card, invoiceCollapsed: false }, undefined), true);
  assert.equal(isInvoiceCardExpanded({ id: "new" }, undefined), true);
  assert.equal(isInvoiceCardExpanded({ id: "toString" }, "collapsed"), false);
});

test("temporary expansion follows card IDs when cards are reordered", () => {
  const cards = [card, { ...card, id: "other" }];
  const temporary = { main: false, other: true };
  assert.deepEqual([...cards].reverse().map((item) => [item.id, isInvoiceCardExpanded(item, "expanded", temporary)]), [["other", true], ["main", false]]);
});
