import test from "node:test";
import assert from "node:assert/strict";
import { auditFinancialProfiles } from "../src/lib/financial-integrity";
import { requestedRecurrenceMonths, MAX_RECURRING_FILTER_MONTHS } from "../src/lib/recurrence-months";

const rows = [
  { id: "rent", title: "Aluguel", amount: -800, date: "2026-11-10", recurrence: "recorrente" },
  { id: "next", title: "Aluguel", amount: -800, date: "2026-12-10", recurrenceSourceId: "rent" },
];

test("audit recognizes consistent source and generated recurrence", () => {
  const result = auditFinancialProfiles([{ id: "a", data: { transactions: rows } }]);
  assert.equal(result.issues, 0);
  assert.equal(result.transactionCount, 2);
});
test("audit reports duplicate, broken link, invalid date, fractional cent and incomplete row without changing data", () => {
  const payload = [
    ...rows,
    { id: "rent", title: "", amount: 0.001, date: "2026-02-30", recurrenceSourceId: "missing" },
  ];
  const original = JSON.stringify(payload);
  const result = auditFinancialProfiles([{ id: "a", data: { transactions: payload } }]);
  assert.equal(result.duplicateIds, 1);
  assert.equal(result.brokenRecurrenceLinks, 1);
  assert.equal(result.invalidAmounts, 1);
  assert.equal(result.invalidDates, 1);
  assert.equal(result.incompleteRows, 1);
  assert.equal(JSON.stringify(payload), original);
});
test("identical IDs in separate profiles are not collisions", () => {
  assert.equal(auditFinancialProfiles([
    { id: "a", data: { transactions: [rows[0]] } },
    { id: "b", data: { transactions: [rows[0]] } },
  ]).duplicateIds, 0);
});
test("recurrence selection covers all selected months, not only the latest", () => {
  assert.deepEqual(requestedRecurrenceMonths("2026-11", ["2027-02", "2027-01", "2027-02"], null, null, false).months, ["2027-01", "2027-02"]);
});
test("recurrence selection covers all months of a date range and year boundary", () => {
  assert.deepEqual(requestedRecurrenceMonths("2026-11", [], "2026-11-18", "2027-02-10", true).months, ["2026-11", "2026-12", "2027-01", "2027-02"]);
});
test("long custom range is bounded and flagged, rather than exhausting storage", () => {
  const result = requestedRecurrenceMonths("2026-11", [], "2026-11-18", "2099-01-01", true);
  assert.equal(result.months.length, MAX_RECURRING_FILTER_MONTHS);
  assert.equal(result.truncated, true);
});
test("single month filter and invalid selection remain safe", () => {
  assert.deepEqual(requestedRecurrenceMonths("2026-11", [], null, null, false).months, ["2026-11"]);
  assert.deepEqual(requestedRecurrenceMonths("bad", [], null, null, false).months, []);
});
