import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getReportCategoryDetails,
  getReportPeriodLimit,
  getReportView,
  normalizeReportMonths,
  searchReportCategoryExpenses,
} from "../src/lib/report-view";
import type { Transaction } from "../src/lib/mock-data";
import {
  getCategoryMonthlyLimit,
  getCategoryHistoryReference,
  parseCategoryMonthlyLimit,
  sanitizeCategoryLimits,
  updateCategoryLimit,
} from "../src/lib/report-budgets";

const categories = {
  food: { label: "Alimentação", color: "#ff9900" },
  travel: { label: "Transporte", color: "#0088ff" },
  salary: { label: "Salário", color: "#00aa55" },
};
const row = (
  id: string,
  amount: number,
  date = "2026-10-18",
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  amount,
  date,
  categoryId: "food",
  ...patch,
});

test("report month selection uses only that month's actual transactions and cent-exact category totals", () => {
  const rows = [
    row("first", -100.1, "2026-10-01"),
    row("last", -0.2, "2026-10-31"),
    row("salary", 1500, "2026-10-18", { categoryId: "salary" }),
    row("old", -999, "2026-09-30"),
    row("future", -888, "2026-11-01"),
  ];
  const report = getReportView(rows, categories, "2026-10", "");
  assert.equal(report.totalExpense, 100.3);
  assert.equal(report.totalIncome, 1500);
  assert.deepEqual(
    report.list.map((row) => row.id),
    ["first", "last", "salary"],
  );
  assert.deepEqual(report.byCategory, [
    { categoryId: "food", name: "Alimentação", color: "#ff9900", value: 100.3 },
  ]);
  assert.equal(report.series.at(-1)?.expense, report.totalExpense);
  assert.equal(report.series.at(-1)?.income, report.totalIncome);
});

test("report search matches category names, transaction titles and observations ignoring accents and case", () => {
  const rows = [
    row("Café Mercado", -25, undefined, { note: "Almoço" }),
    row("Uber", -15, undefined, { categoryId: "travel", note: "Consulta" }),
    row("Empresa", 1000, undefined, { categoryId: "salary" }),
  ];
  for (const query of [" ALIMENTACAO ", "cafe", "ALMOCO"])
    assert.deepEqual(
      getReportView(rows, categories, "2026-10", query).list.map(
        (item) => item.id,
      ),
      ["Café Mercado"],
    );
  assert.equal(
    getReportView(rows, categories, "2026-10", "CONSULTA").totalExpense,
    15,
  );
  const incomeOnly = getReportView(rows, categories, "2026-10", "salario");
  assert.equal(incomeOnly.totalIncome, 1000);
  assert.equal(incomeOnly.totalExpense, 0);
  assert.deepEqual(incomeOnly.byCategory, []);
});

test("six-month report history ends in the selected month, crosses years and fills empty months without sample values", () => {
  const rows = [
    row("outside", -999, "2026-07-31"),
    row("first", -10, "2026-08-01"),
    row("salary", 20000, "2027-01-02", { categoryId: "salary" }),
    row("expense", -0.1, "2027-01-31"),
    row("later", -500, "2027-02-01"),
  ];
  const report = getReportView(rows, categories, "2027-01", "");
  assert.deepEqual(
    report.series.map((point) => point.monthKey),
    ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"],
  );
  assert.deepEqual(
    report.series.map((point) => point.expense),
    [10, 0, 0, 0, 0, 0.1],
  );
  assert.deepEqual(
    report.series.map((point) => point.income),
    [0, 0, 0, 0, 0, 20000],
  );
  assert.equal(report.series.at(-1)?.month, "Jan 27");
  assert.equal(report.totalExpense, 0.1);
});

test("the same search filters selected-month categories and historical bars, with category IDs for matching limits", () => {
  const rows = [
    row("Loja atual", -12),
    row("Loja anterior", -4, "2026-09-15"),
    row("Outro gasto", -8, "2026-09-15"),
    row("Loja de fora", -30, "2026-09-15", { categoryId: "travel" }),
  ];
  const report = getReportView(rows, categories, "2026-10", "loja");
  assert.equal(report.totalExpense, 12);
  assert.deepEqual(report.matchedCategoryIds, ["food"]);
  assert.equal(
    report.series.find((point) => point.monthKey === "2026-09")?.expense,
    34,
  );
  assert.equal(
    report.series.find((point) => point.monthKey === "2026-10")?.expense,
    12,
  );
});

test("unknown categories keep their value and searchable fallback while invalid financial rows are ignored", () => {
  const rows = [
    row("known", -10),
    row("missing", -0.2, undefined, { categoryId: "removed" }),
    row("invalid-date", -100, "2026-10-99"),
    row("invalid-amount", Number.NaN),
    row("infinite", Number.POSITIVE_INFINITY),
  ];
  const snapshot = structuredClone(rows);
  const report = getReportView(rows, categories, "2026-10", "outros");
  assert.equal(report.totalExpense, 0.2);
  assert.deepEqual(report.byCategory, [
    { categoryId: "removed", name: "Outros", color: "#8E8E93", value: 0.2 },
  ]);
  assert.equal(
    getReportView(rows, categories, "2026-10", "").totalExpense,
    10.2,
  );
  assert.deepEqual(rows, snapshot);
});

test("clearing report search and switching months restores the correct existing data without mutation or profile mixing", () => {
  const rows = [
    row("food", -20),
    row("travel", -40, undefined, { categoryId: "travel" }),
    row("old", -60, "2026-09-01"),
  ];
  const snapshot = structuredClone(rows);
  assert.equal(
    getReportView(rows, categories, "2026-10", "food").totalExpense,
    20,
  );
  const restored = getReportView(rows, categories, "2026-10", "");
  assert.equal(restored.totalExpense, 60);
  assert.deepEqual(
    restored.byCategory.map((entry) => entry.categoryId),
    ["travel", "food"],
  );
  assert.equal(getReportView(rows, categories, "2026-09", "").totalExpense, 60);
  assert.equal(
    getReportView([row("other-profile", -5)], categories, "2026-10", "")
      .totalExpense,
    5,
  );
  assert.deepEqual(rows, snapshot);
});

test("empty months and unmatched searches stay empty, with six zero-valued history points and no fabricated totals", () => {
  for (const report of [
    getReportView([], categories, "2026-10", ""),
    getReportView([row("expense", -10)], categories, "2026-10", "missing"),
  ]) {
    assert.equal(report.totalExpense, 0);
    assert.equal(report.totalIncome, 0);
    assert.deepEqual(report.byCategory, []);
    assert.deepEqual(report.list, []);
    assert.equal(report.series.length, 6);
    assert.ok(
      report.series.every((point) => point.income === 0 && point.expense === 0),
    );
  }
  assert.deepEqual(
    getReportView([row("expense", -10)], categories, "2026-99", "").series,
    [],
  );
});

test("multiple selected months sum each transaction once and leave unselected gaps out of categories and bars", () => {
  const rows = [
    row("sep-expense", -100.1, "2026-09-10"),
    row("sep-income", 500, "2026-09-15", { categoryId: "salary" }),
    row("gap", -700, "2026-10-10"),
    row("nov-expense", -200.2, "2026-11-10"),
    row("nov-income", 1000, "2026-11-15", { categoryId: "salary" }),
  ];
  const selected = ["2026-11", "2026-09", "2026-11", "2026-99"];
  const originalRows = structuredClone(rows);
  const originalSelection = [...selected];
  const report = getReportView(rows, categories, selected, "");
  assert.deepEqual(report.months, ["2026-09", "2026-11"]);
  assert.equal(report.totalExpense, 300.3);
  assert.equal(report.totalIncome, 1500);
  assert.equal(report.list.length, 4);
  assert.deepEqual(
    report.series.map((point) => point.monthKey),
    report.months,
  );
  assert.deepEqual(
    report.series.map((point) => point.expense),
    [100.1, 200.2],
  );
  assert.equal(getReportPeriodLimit(900, selected), 1800);
  assert.deepEqual(rows, originalRows);
  assert.deepEqual(selected, originalSelection);
});

test("multi-month search works across years and retains selected empty months without including other periods", () => {
  const rows = [
    row("Mercado", -100, "2026-12-10", { note: "Almoço de família" }),
    row("Café", -50, "2027-02-10", { note: "Almoço" }),
    row("Outra compra", -80, "2027-01-10", { categoryId: "travel" }),
    row("Almoço fora da seleção", -900, "2027-03-01"),
  ];
  const report = getReportView(
    rows,
    categories,
    ["2027-02", "2026-12", "2027-01"],
    " ALMOCO ",
  );
  assert.equal(report.totalExpense, 150);
  assert.deepEqual(report.matchedCategoryIds, ["food"]);
  assert.deepEqual(
    report.series.map((point) => point.month),
    ["Dez 26", "Jan 27", "Fev 27"],
  );
  assert.deepEqual(
    report.series.map((point) => point.expense),
    [100, 0, 50],
  );
  assert.equal(getReportPeriodLimit(900, report.months), 2700);
});

test("clearing a search retains the selected months and restores only their totals", () => {
  const rows = [
    row("Salário A", 1000, "2026-09-01", { categoryId: "salary" }),
    row("Salário B", 1200, "2026-10-01", { categoryId: "salary" }),
    row("Conta", -250, "2026-09-10"),
    row("Conta", -300, "2026-10-10"),
    row("Conta de fora", -999, "2026-11-10"),
  ];
  const months = ["2026-09", "2026-10"];
  const income = getReportView(rows, categories, months, "SALARIO");
  assert.equal(income.totalIncome, 2200);
  assert.equal(income.totalExpense, 0);
  assert.deepEqual(
    income.series.map((point) => point.income),
    [1000, 1200],
  );
  assert.ok(income.series.every((point) => point.expense === 0));
  const cleared = getReportView(rows, categories, months, "");
  assert.equal(cleared.totalExpense, 550);
  assert.deepEqual(cleared.months, months);
  assert.equal(
    getReportPeriodLimit(400, income.months),
    getReportPeriodLimit(400, cleared.months),
  );
});

test("twelve selected months retain all twelve bar groups including zero months", () => {
  const months = Array.from(
    { length: 12 },
    (_, index) => `2026-${String(index + 1).padStart(2, "0")}`,
  );
  const report = getReportView(
    [row("January", -10, "2026-01-10"), row("December", -20, "2026-12-10")],
    categories,
    months,
    "",
  );
  assert.equal(report.series.length, 12);
  assert.deepEqual(
    report.series.map((point) => point.monthKey),
    months,
  );
  assert.equal(report.totalExpense, 30);
  assert.equal(report.series.filter((point) => point.expense === 0).length, 10);
  assert.equal(getReportPeriodLimit(900, months), 10800);
});

test("period limits use unique valid months and exact cents, with no fabricated amount for empty selection", () => {
  assert.equal(
    getReportPeriodLimit(200.1, ["2026-09", "2026-10", "2026-11"]),
    600.3,
  );
  assert.equal(
    getReportPeriodLimit(200.1, ["2026-09", "2026-09", "2026-10", "bad"]),
    400.2,
  );
  assert.equal(getReportPeriodLimit(900, []), 0);
  assert.equal(getReportPeriodLimit(Number.NaN, ["2026-09"]), 0);
  const empty = getReportView([row("expense", -100)], categories, [], "");
  assert.deepEqual(empty.months, []);
  assert.deepEqual(empty.list, []);
  assert.deepEqual(empty.series, []);
  assert.equal(empty.totalExpense, 0);
});

test("a one-month array preserves the existing single-month history and month normalization never changes caller arrays", () => {
  const rows = [row("Oct", -20), row("Sep", -10, "2026-09-10")];
  assert.deepEqual(
    getReportView(rows, categories, "2026-10", ""),
    getReportView(rows, categories, ["2026-10", "2026-10"], ""),
  );
  const input = ["2027-01", "invalid", "2026-12", "2027-01"];
  const before = [...input];
  assert.deepEqual(normalizeReportMonths(input), ["2026-12", "2027-01"]);
  assert.deepEqual(input, before);
});

test("category details contain exactly the expense records behind the card, excluding same-category income and other categories", () => {
  const rows = [
    row("food", -100),
    row("income", 500),
    row("travel", -50, undefined, { categoryId: "travel" }),
    row("outside", -900, "2026-09-01"),
  ];
  const report = getReportView(rows, categories, "2026-10", "");
  const details = getReportCategoryDetails(report, "food", 300);
  assert.deepEqual(
    details.transactions.map((item) => item.id),
    ["food"],
  );
  assert.equal(
    details.used,
    report.byCategory.find((entry) => entry.categoryId === "food")?.value,
  );
  assert.equal(details.limit, 300);
  assert.equal(details.remaining, 200);
  assert.equal(details.overage, 0);
});

test("category drill-down follows nonconsecutive selected months and search while comparing with their combined limits", () => {
  const rows = [
    row("Mercado A", -250, "2026-09-15"),
    row("Mercado B", -250, "2027-01-15"),
    row("Mercado gap", -999, "2026-10-15"),
    row("Outra loja", -50, "2027-01-15"),
    row("Mercado viagem", -30, "2027-01-15", { categoryId: "travel" }),
  ];
  const report = getReportView(
    rows,
    categories,
    ["2027-01", "2026-09", "2026-09"],
    "MERCADO",
  );
  const details = getReportCategoryDetails(report, "food", 200);
  assert.deepEqual(
    details.transactions.map((item) => item.id),
    ["Mercado B", "Mercado A"],
  );
  assert.deepEqual(details.months, ["2026-09", "2027-01"]);
  assert.equal(details.used, 500);
  assert.equal(details.limit, 400);
  assert.equal(details.remaining, 0);
  assert.equal(details.overage, 100);
  assert.equal(details.percentage, 125);
});

test("empty category details keep the selected-period allowance and never fabricate expenses", () => {
  const report = getReportView(
    [],
    categories,
    ["2026-09", "2026-10", "2026-11"],
    "",
  );
  const details = getReportCategoryDetails(report, "food", 300);
  assert.deepEqual(details.transactions, []);
  assert.equal(details.used, 0);
  assert.equal(details.limit, 900);
  assert.equal(details.remaining, 900);
  assert.equal(details.percentage, 0);
  assert.equal(getReportCategoryDetails(report, "food", 0).percentage, 0);
});

test("category details order newest dates first while preserving same-day insertion, observations and attachment references without mutation", () => {
  const attachments = [
    "data:image/jpeg;base64,photo",
    "data:application/pdf;base64,file",
  ];
  const rows = [
    row("old", -10, "2026-10-01"),
    row("new-a", -20, "2026-10-20", {
      note: "Observação guardada",
      attachments,
    }),
    row("new-b", -30, "2026-10-20"),
  ];
  const report = getReportView(rows, categories, "2026-10", "");
  const snapshot = structuredClone({ rows, report });
  const details = getReportCategoryDetails(report, "food", 200);
  assert.deepEqual(
    details.transactions.map((item) => item.id),
    ["new-a", "new-b", "old"],
  );
  assert.equal(details.transactions[0], rows[1]);
  assert.equal(details.transactions[0].attachments, attachments);
  assert.equal(details.transactions[0].note, "Observação guardada");
  assert.deepEqual({ rows, report }, snapshot);
});

test("category remaining and excess values use exact cents and reconcile with the displayed category total", () => {
  const report = getReportView(
    [row("a", -0.1), row("b", -0.2)],
    categories,
    "2026-10",
    "",
  );
  const over = getReportCategoryDetails(report, "food", 0.29);
  assert.equal(over.used, 0.3);
  assert.equal(over.used, report.byCategory[0].value);
  assert.equal(over.overage, 0.01);
  assert.equal(over.remaining, 0);
  const under = getReportCategoryDetails(report, "food", 0.31);
  assert.equal(under.remaining, 0.01);
  assert.equal(under.overage, 0);
});

test("category limits preserve existing defaults and allow explicit no-limit and custom categories", () => {
  assert.equal(getCategoryMonthlyLimit("moradia", {}), 2500);
  assert.equal(getCategoryMonthlyLimit("moradia", { moradia: null }), null);
  assert.equal(getCategoryMonthlyLimit("moradia", { moradia: 1500.5 }), 1500.5);
  assert.equal(getCategoryMonthlyLimit("custom", {}), null);
  assert.equal(getCategoryMonthlyLimit("custom", { custom: 300 }), 300);
});

test("category setting round-trip retains no-limit and exact cents without changing other profiles or rows", () => {
  const transactions = [row("gasto", -20)];
  const original = { moradia: 500, food: null };
  const untouched = { moradia: 120 };
  const profiles = [
    { categoryLimits: original, transactions },
    { categoryLimits: untouched, transactions: [] },
  ];
  const changed = profiles.map((profile, index) =>
    index === 0
      ? {
          ...profile,
          categoryLimits: updateCategoryLimit(
            profile.categoryLimits,
            "moradia",
            null,
          ),
        }
      : profile,
  );
  assert.equal(changed[0].transactions, transactions);
  assert.equal(changed[1], profiles[1]);
  assert.deepEqual(original, { moradia: 500, food: null });
  const restored = sanitizeCategoryLimits(
    JSON.parse(JSON.stringify(changed[0].categoryLimits)),
  );
  assert.equal(getCategoryMonthlyLimit("moradia", restored), null);
  const fixed = updateCategoryLimit(restored, "moradia", 123.456);
  assert.equal(fixed.moradia, 123.46);
  assert.equal(restored.moradia, null);
  assert.equal(fixed.food, null);
});

test("category limit sanitization rejects malformed settings and invalid financial inputs", () => {
  assert.deepEqual(
    sanitizeCategoryLimits({
      ok: 50.555,
      none: null,
      zero: 0,
      negative: -1,
      nan: NaN,
      infinite: Infinity,
      text: "100",
      nested: {},
      "": 20,
      tiny: 0.001,
    }),
    { ok: 50.56, none: null },
  );
  for (const value of [null, undefined, [], "bad"])
    assert.deepEqual(sanitizeCategoryLimits(value), {});
  assert.equal(getCategoryMonthlyLimit("moradia", { moradia: NaN }), 2500);
  assert.deepEqual(updateCategoryLimit({ food: 100 }, "food", -1), {
    food: 100,
  });
});

test("monthly limit entry accepts Brazilian money and rejects blank, zero, scientific or malformed amounts", () => {
  for (const [input, amount] of [
    ["1.234,56", 1234.56],
    [" 500,50 ", 500.5],
    ["1.000", 1000],
    ["500", 500],
    ["99.90", 99.9],
    ["0,01", 0.01],
  ] as const)
    assert.equal(parseCategoryMonthlyLimit(input), amount, input);
  for (const input of [
    "",
    " ",
    "0",
    "0,00",
    "-10",
    "Infinity",
    "NaN",
    "1e3",
    "1,2,3",
    "1.23,45",
    "0,001",
  ])
    assert.equal(parseCategoryMonthlyLimit(input), null, input);
});

test("without a limit, expenses and details stay unchanged and never report a limit overrun", () => {
  const report = getReportView(
    [row("bill", -300)],
    categories,
    ["2026-10", "2026-11"],
    "",
  );
  const unlimited = getReportCategoryDetails(report, "food", null);
  const fixed = getReportCategoryDetails(report, "food", 100);
  assert.equal(unlimited.hasLimit, false);
  assert.equal(unlimited.used, fixed.used);
  assert.deepEqual(unlimited.transactions, fixed.transactions);
  assert.equal(unlimited.overage, 0);
  assert.equal(unlimited.percentage, 0);
  assert.equal(fixed.hasLimit, true);
  assert.equal(fixed.limit, 200);
  assert.equal(fixed.overage, 100);
});

test("history reference averages only prior closed months with category expenses, excluding gaps, income and other categories", () => {
  const rows = [
    row("old1", -100, "2026-07-01"),
    row("old2", -200, "2026-09-01"),
    row("extra", -100, "2026-09-12"),
    row("income", 999, "2026-08-01"),
    row("other", -999, "2026-08-02", { categoryId: "travel" }),
    row("current", -888, "2026-10-01"),
    row("future", -777, "2026-11-01"),
    row("bad", -NaN, "2026-09-01"),
    row("bad date", -99, "2026-02-30"),
  ];
  const snapshot = rows.slice();
  const history = getCategoryHistoryReference(
    rows,
    "food",
    ["2026-10"],
    "2026-10",
  );
  assert.deepEqual(history.months, [
    { month: "2026-07", spent: 100 },
    { month: "2026-09", spent: 300 },
  ]);
  assert.equal(history.total, 400);
  assert.equal(history.monthlyAverage, 200);
  assert.equal(history.periodReference, 200);
  assert.deepEqual(rows, snapshot);
});

test("historical multi-month reference excludes all selected months, deduplicates the period and rounds exact cents", () => {
  const rows = [
    row("first", -0.1, "2025-11-01"),
    row("second", -0.2, "2025-12-01"),
    row("third", -0.2, "2026-01-01"),
    row("selected", -999, "2026-02-01"),
    row("gap", -999, "2026-03-01"),
  ];
  const result = getCategoryHistoryReference(
    rows,
    "food",
    ["2026-04", "2026-02", "2026-04"],
    "2026-10",
  );
  assert.equal(result.months.length, 3);
  assert.equal(result.total, 0.5);
  assert.equal(result.monthlyAverage, 0.17);
  assert.equal(result.periodReference, 0.34);
});

test("reference is empty without past expenses and never includes the current month even for future selection", () => {
  const rows = [
    row("current", -50, "2026-10-01"),
    row("past", -20, "2026-09-01"),
  ];
  assert.equal(
    getCategoryHistoryReference(rows, "food", ["2026-12"], "2026-10")
      .monthlyAverage,
    20,
  );
  assert.deepEqual(
    getCategoryHistoryReference(rows, "food", ["2026-09"], "2026-10"),
    { months: [], total: 0, monthlyAverage: 0, periodReference: 0 },
  );
  assert.equal(
    getCategoryHistoryReference(rows, "food", [], "2026-10").months.length,
    0,
  );
  assert.equal(
    getCategoryHistoryReference(rows, "custom", ["2026-10"], "2026-10").months
      .length,
    0,
  );
});


test("category detail search matches titles and observations ignoring case, accents and spaces", () => {
  const rows = [row("Café da manhã", -10.1, undefined, { note: "Reunião" }), row("Mercado", -20.2, undefined, { note: "Almoço de domingo" })];
  for (const query of [" CAFE ", "REUNIAO"])
    assert.deepEqual(searchReportCategoryExpenses(rows, query).list.map((item) => item.id), ["Café da manhã"]);
  assert.deepEqual(searchReportCategoryExpenses(rows, "almoco").list.map((item) => item.id), ["Mercado"]);
  assert.equal(searchReportCategoryExpenses(rows, "almoco").total, 20.2);
});

test("detail search stays within category, selected months and outer report filter without changing limits or totals", () => {
  const rows = [row("Mercado compra", -30), row("Mercado extra", -99, undefined, { categoryId: "travel" }), row("Mercado antigo", -999, "2026-09-01"), row("Compra padaria", -15), row("Reembolso mercado", 5)];
  const report = getReportView(rows, categories, "2026-10", "compra");
  const details = getReportCategoryDetails(report, "food", 200);
  const result = searchReportCategoryExpenses(details.transactions, "mercado");
  assert.deepEqual(result.list.map((item) => item.id), ["Mercado compra"]);
  assert.equal(result.total, 30);
  assert.equal(details.used, 45);
  assert.equal(details.limit, 200);
  assert.equal(details.transactions.length, 2);
  assert.deepEqual(searchReportCategoryExpenses(details.transactions, "nenhuma"), { list: [], total: 0 });
});

test("clearing category search restores every expense in original order with exact cents and saved attachments", () => {
  const attachments = ["data:image/png;base64,saved"];
  const details = getReportCategoryDetails(getReportView([row("one", -0.1, "2026-10-01", { attachments }), row("two", -0.2, "2026-10-18")], categories, "2026-10", ""), "food", null);
  const before = details.transactions.slice();
  searchReportCategoryExpenses(details.transactions, "one");
  const cleared = searchReportCategoryExpenses(details.transactions, "   ");
  assert.equal(cleared.total, 0.3);
  assert.deepEqual(cleared.list.map((item) => item.id), ["two", "one"]);
  assert.equal(cleared.list[1].attachments, attachments);
  assert.deepEqual(details.transactions, before);
  assert.equal(details.hasLimit, false);
});
