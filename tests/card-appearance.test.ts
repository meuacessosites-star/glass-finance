import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectCardBrand,
  findBankPreset,
  getBankSuggestions,
  getInvoiceHeaderColor,
  sanitizeCardBrand,
} from "../src/lib/card-appearance";

test("legacy card colors resolve to the same bank identity without overwriting the saved color", () => {
  for (const [institution, color, expected] of [
    ["Nubank", "#AF52DE", "#820AD1"],
    ["Inter", "#FF9500", "#FF7A00"],
    ["Itaú", "#007AFF", "#EC7000"],
  ]) {
    const card = { institution, color, totalLimit: 3500, invoicePaidByMonth: { "2026-10": true } };
    const before = structuredClone(card);
    assert.equal(getInvoiceHeaderColor(card), expected);
    assert.deepEqual(card, before);
    assert.equal(getInvoiceHeaderColor({ ...card, invoiceHeaderColorMode: "card" }), color);
  }
});

test("a chosen custom color survives saving and reload even for a recognized bank", () => {
  const card = { institution: "Itaú", color: "#007AFF", invoiceHeaderColorMode: "bank" as const, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 30, paymentDate: "2026-10-18" } } };
  const custom = { ...card, color: "#28ABDC", invoiceHeaderColorMode: "card" as const };
  const restored = JSON.parse(JSON.stringify(custom));
  assert.equal(getInvoiceHeaderColor(restored), "#28ABDC");
  assert.equal(getInvoiceHeaderColor({ ...restored, invoiceHeaderColorMode: "bank" }), "#EC7000");
  assert.equal(restored.color, "#28ABDC");
  assert.deepEqual(restored.invoicePaymentsByMonth, card.invoicePaymentsByMonth);
  assert.equal(card.color, "#007AFF");
});

test("bank suggestions filter partial names, spacing, accents and aliases without choosing an unrelated bank", () => {
  assert.deepEqual(
    getBankSuggestions("merc").map((bank) => bank.name),
    ["Mercado Pago"],
  );
  assert.deepEqual(
    getBankSuggestions(" ITAÚ ").map((bank) => bank.name),
    ["Itaú"],
  );
  assert.equal(getBankSuggestions("banco inter")[0]?.name, "Inter");
  assert.equal(getBankSuggestions("my unknown bank").length, 0);
  assert.equal(getBankSuggestions("").length, 12);
});

test("bank appearance is applied only for a complete recognized name or alias", () => {
  assert.equal(findBankPreset("merc"), undefined);
  assert.equal(findBankPreset("  MERCADO   PAGO  ")?.name, "Mercado Pago");
  assert.equal(findBankPreset("mercadopago")?.brand, "visa");
  assert.equal(findBankPreset("pic pay")?.brand, "mastercard");
  assert.equal(findBankPreset("Neon")?.brand, "visa");
  assert.equal(findBankPreset("Itaú")?.brand, undefined);
});

test("explicit saved brands and an intentional unknown override bank or card-name inference", () => {
  assert.equal(
    detectCardBrand({
      name: "Nubank Mastercard",
      institution: "Nubank",
      brand: "elo",
    }),
    "elo",
  );
  assert.equal(
    detectCardBrand({ name: "Visa", institution: "Inter", brand: "card" }),
    "card",
  );
  assert.equal(
    detectCardBrand({
      name: "Pessoal",
      institution: "Mercado Pago",
      brand: "mastercard",
    }),
    "mastercard",
  );
  assert.equal(detectCardBrand({ name: "PicPay", brand: "amex" }), "amex");
});

test("brand selections survive serialization and unsupported imported values are rejected", () => {
  for (const brand of [
    "visa",
    "mastercard",
    "elo",
    "amex",
    "hipercard",
    "card",
  ]) {
    const restored = JSON.parse(
      JSON.stringify({ name: "Meu cartão", institution: "Inter", brand }),
    );
    assert.equal(sanitizeCardBrand(restored.brand), brand);
    assert.equal(detectCardBrand(restored), brand);
  }
  for (const bad of [
    null,
    false,
    {},
    [],
    "invented",
    "constructor",
    "__proto__",
  ])
    assert.equal(sanitizeCardBrand(bad), undefined);
});

test("legacy detection preserves existing marks while appearance lookup never edits financial fields", () => {
  const card = {
    name: "Nubank (exemplo)",
    institution: "Nubank",
    last4: "4821",
    color: "#AF52DE",
    totalLimit: 3500,
    invoicePaidByMonth: { "2026-10": true },
  };
  const before = JSON.stringify(card);
  assert.equal(detectCardBrand(card), "mastercard");
  assert.equal(detectCardBrand({ name: "Meu Visa" }), "visa");
  assert.equal(
    detectCardBrand({ name: "Meu cartão", institution: "Banco sem cadastro" }),
    "card",
  );
  findBankPreset("Nubank");
  getBankSuggestions("nu");
  assert.equal(JSON.stringify(card), before);
});
