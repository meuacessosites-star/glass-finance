import { test } from "node:test";
import assert from "node:assert/strict";
import { getInvoiceHeaderAppearances } from "../src/lib/card-header-appearance";
import type { AppCard } from "../src/lib/app-store";

const card = (id: string, color: string, patch: Partial<AppCard> = {}): AppCard => ({ id, name: id, last4: "1234", color, ...patch });
const luminance = (hex: string) => [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
  const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
}, 0);

test("gradient keeps the actual selected color as its center instead of automatically darkening it", () => {
  for (const color of ["#FF7A00", "#EC7000", "#F8CC46", "#820AD1", "#FFFFFF", "#000000", "#009EE3"]) {
    const view = getInvoiceHeaderAppearances([card("one", color)])["one"];
    assert.equal(view.foreground, "#FFFFFF");
    assert.equal(view.middle, color);
    assert.ok(luminance(view.top) >= luminance(view.middle));
    assert.ok(luminance(view.bottom) <= luminance(view.middle));
  }
});

test("bank orange remains vivid in both similar headers and the 3D gradient", () => {
  const cards = [card("inter", "#FF9500", { institution: "Inter" }), card("itau", "#007AFF", { institution: "Itaú" })];
  for (const view of Object.values(getInvoiceHeaderAppearances(cards))) {
    for (const color of [view.top, view.middle, view.bottom]) {
      assert.ok(parseInt(color.slice(1, 3), 16) >= 210, `${color} must not become brown`);
      assert.ok(parseInt(color.slice(3, 5), 16) >= 95, `${color} must retain orange intensity`);
    }
  }
});

test("similar bank colors get subtle nearby tones instead of a large darkening", () => {
  const cards = [card("inter", "#FF9500", { institution: "Inter" }), card("itau", "#007AFF", { institution: "Itaú" })];
  const views = getInvoiceHeaderAppearances(cards);
  assert.notEqual(views.inter.top, views.itau.top);
  const difference = Math.abs(luminance(views.inter.top) - luminance(views.itau.top));
  assert.ok(difference > 0.005 && difference < 0.09, `Subtle orange difference: ${difference}`);
  for (const { top } of Object.values(views)) {
    const red = parseInt(top.slice(1, 3), 16), green = parseInt(top.slice(3, 5), 16), blue = parseInt(top.slice(5, 7), 16);
    assert.ok(red > green && green > blue, `${top} retains an orange hue`);
  }
});

test("nearby custom colors and dark cards separate consistently after reorder, without including archived cards", () => {
  const cards = [card("b", "#8A20CE"), card("a", "#820AD1"), card("gray-a", "#111111"), card("gray-b", "#181818"), card("old", "#820AD1", { archived: true })];
  const expected = getInvoiceHeaderAppearances(cards);
  assert.deepEqual(getInvoiceHeaderAppearances([...cards].reverse()), expected);
  assert.notEqual(expected.a.top, expected.b.top);
  assert.notEqual(expected["gray-a"].top, expected["gray-b"].top);
  assert.equal(expected.old, undefined);
  assert.deepEqual(getInvoiceHeaderAppearances(cards.filter((item) => !item.archived)), expected);
});

test("display variants preserve saved colors, payment records, custom color preference and input order", () => {
  const cards = [card("a", "#009EE3", { institution: "Itaú", invoiceHeaderColorMode: "card", invoiceCollapsed: true, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 30, paymentDate: "2026-10-18" } } }), card("b", "invalid")];
  const before = structuredClone(cards);
  const view = getInvoiceHeaderAppearances(cards);
  const red = parseInt(view.a.top.slice(1, 3), 16), blue = parseInt(view.a.top.slice(5, 7), 16);
  assert.ok(blue > red, "saved custom blue is used instead of the orange bank preset");
  assert.match(view.b.background, /^linear-gradient\(/);
  assert.deepEqual(cards, before);
});
