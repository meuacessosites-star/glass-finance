import { test } from "node:test";
import assert from "node:assert/strict";
import { appendRecurringInMonth, appendRecurringThrough, recurringOccurrenceId, stopRecurringEntries, stopRecurringEntriesFrom } from "../src/lib/recurring-transactions";
import { captureTransactionDeletion, applyTransactionDeletion, restoreTransactionDeletion } from "../src/lib/transaction-deletion";
import type { Transaction } from "../src/lib/mock-data";
import type { AppProfile, ProfileData } from "../src/lib/app-store";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "rent",
    title: "Aluguel",
    categoryId: "moradia",
    amount: -1350,
    date: "2026-11-10",
    recurrence: "recorrente",
    frequency: "mensal",
    paymentStatus: "paid",
    paymentDate: "2026-11-10",
    ...overrides,
  };
}

test("monthly recurrence appears in next month exactly once, not marked as paid", () => {
  const original = tx();
  const expanded = appendRecurringThrough([original], "2027-01");
  assert.deepEqual(expanded.map(x => x.date), ["2026-11-10", "2026-12-10", "2027-01-10"]);
  assert.equal(expanded[1].id, recurringOccurrenceId("rent", "2026-12-10"));
  assert.equal(expanded[1].recurrenceSourceId, "rent");
  assert.equal(expanded[1].paymentStatus, "pending");
  assert.equal(expanded[1].paymentDate, undefined);
  assert.deepEqual(appendRecurringThrough(expanded, "2027-01"), expanded);
  assert.equal(appendRecurringThrough(expanded, "2027-01"), expanded);
});

test("calendar-month recurrence preserves original day and clamps to shorter months", () => {
  const expanded = appendRecurringThrough([tx({date:"2027-01-31"})], "2027-04");
  assert.deepEqual(expanded.map(x => x.date), ["2027-01-31","2027-02-28","2027-03-31","2027-04-30"]);
});

test("weekly, fixed interval and yearly recurrence cross month/year boundaries correctly", () => {
  const weekly = appendRecurringThrough([tx({date:"2026-12-27",frequency:"semanal"})], "2027-01");
  assert.deepEqual(weekly.map(x => x.date), ["2026-12-27","2027-01-03","2027-01-10","2027-01-17","2027-01-24","2027-01-31"]);
  const fifteenDays = appendRecurringThrough([tx({date:"2026-12-25",frequency:"dias",frequencyInterval:15})], "2027-02");
  assert.deepEqual(fifteenDays.map(x => x.date), ["2026-12-25","2027-01-09","2027-01-24","2027-02-08","2027-02-23"]);
  const yearly = appendRecurringThrough([tx({date:"2024-02-29",frequency:"anual"})], "2028-02");
  assert.deepEqual(yearly.map(x => x.date), ["2024-02-29","2025-02-28","2026-02-28","2027-02-28","2028-02-29"]);
});

test("series end date, skipped dates, and independently persisted payments are honored", () => {
  const source = tx({recurrenceEndDate:"2027-01-12",recurrenceSkippedDates:["2026-12-10"]});
  const generated = appendRecurringThrough([source], "2027-05");
  assert.deepEqual(generated.map(x=>x.date),["2026-11-10","2027-01-10"]);
  const paid = {...generated[1], paymentStatus:"paid" as const, paymentDate:"2027-01-11"};
  const same = appendRecurringThrough([source,paid], "2027-10");
  assert.equal(same.length,2);
  assert.equal(same[1].paymentDate,"2027-01-11");
});

test("date offsets on due date and card invoice month move with each occurrence", () => {
  const base=tx({dueDate:"2026-11-13",cardInvoiceMonth:"2026-12"});
  const expanded=appendRecurringThrough([base], "2027-01");
  assert.equal(expanded[1].dueDate,"2026-12-13");
  assert.equal(expanded[1].cardInvoiceMonth,"2027-01");
  assert.equal(expanded[2].cardInvoiceMonth,"2027-02");
});

test("installments, unique transactions, and loan entries never produce recurrence instances", () => {
  const rows=[tx({recurrence:"parcelada"}),tx({id:"normal",recurrence:"unica"}),tx({id:"loan",source:"loan"})];
  assert.equal(appendRecurringThrough(rows,"2027-12"),rows);
});

test("deleting a recurring occurrence prevents its return and undo restores it", () => {
  const orig=tx();
  const expanded=appendRecurringThrough([orig],"2027-01");
  const data: ProfileData={
    categories:[], cards:[], transactions:expanded, people:[], loanReceivables:[],
    reserves:[], reservesInBalance:true, notifications:[], financings:[],
    financingsInFlow:false, showCategoryNameOnCard:true, goals:[], pin:null,
  };
  const profile={id:"profile",name:"Test",data} as AppProfile;
  const deletion=captureTransactionDeletion(data,profile.id,[expanded[1].id])!;
  const deleted=applyTransactionDeletion([profile],deletion);
  const after=deleted[0].data.transactions;
  assert.equal(after.length,2);
  assert.deepEqual(after[0].recurrenceSkippedDates,["2026-12-10"]);
  assert.equal(appendRecurringThrough(after,"2027-01").length,2);
  const restored=restoreTransactionDeletion(deleted,deletion);
  assert.equal(restored[0].data.transactions.length,3);
  assert.equal(restored[0].data.transactions[0].recurrenceSkippedDates?.length,0);
});

test("stopping recurrence removes future pending rows but keeps paid history", () => {
  const generated = appendRecurringThrough([tx()], "2027-03");
  const withSettledFuture = generated.map((row) =>
    row.date === "2027-01-10" ? { ...row, paymentStatus: "paid" as const, paymentDate: "2027-01-10" } : row
  );
  const stopped = stopRecurringEntries(withSettledFuture, generated[1].id, "2026-12-15");
  assert.equal(stopped.find((x) => x.id === "rent")?.recurrenceEndDate, "2026-12-15");
  assert.deepEqual(stopped.map((x) => x.date), ["2026-11-10", "2026-12-10", "2027-01-10"]);
  assert.equal(stopped[2].paymentStatus, "paid");
  assert.equal(appendRecurringThrough(stopped, "2028-12"), stopped);
});

test("stopping a recurrence twice cannot extend an earlier end date", () => {
  const original = tx({recurrenceEndDate:"2026-11-14"});
  const result=stopRecurringEntries([original],"rent","2026-12-20");
  assert.equal(result[0], original);
  assert.equal(result[0].recurrenceEndDate,"2026-11-14");
});

test("an indefinite monthly recurrence is visible in any requested year without pre-creating all years", () => {
  const original = tx();
  const later = appendRecurringInMonth([original], "2042-08");
  assert.deepEqual(later.map((row) => row.date), ["2026-11-10", "2042-08-10"]);
  assert.equal(later[1].paymentStatus, "pending");
  assert.equal(appendRecurringInMonth(later, "2042-08"), later);
  const earlier = appendRecurringInMonth(later, "2034-02");
  assert.deepEqual(earlier.map((row) => row.date), ["2026-11-10", "2042-08-10", "2034-02-10"]);
  const nearby = appendRecurringInMonth(earlier, "2042-09");
  assert.equal(nearby.filter((row) => row.date.startsWith("2042-09")).length, 1);
  assert.equal(nearby.filter((row) => row.date.startsWith("2042-08")).length, 1);
});

test("weekly recurrence creates all occurrences within a single requested month", () => {
  const expanded = appendRecurringInMonth([tx({ frequency: "semanal" })], "2027-01");
  assert.deepEqual(
    expanded.filter((row) => row.date.startsWith("2027-01")).map((row) => row.date),
    ["2027-01-05", "2027-01-12", "2027-01-19", "2027-01-26"],
  );
  assert.equal(appendRecurringInMonth(expanded, "2027-01"), expanded);
});

test("daily recurrence is bounded to a selected month even when many years ahead", () => {
  const result = appendRecurringInMonth([tx({ frequency: "dias", frequencyInterval: 1 })], "2047-03");
  assert.equal(result.length, 32);
  assert.equal(result[1].date, "2047-03-01");
  assert.equal(result[31].date, "2047-03-31");
});

test("an indefinitely repeating annual recurrence skips months with no due date", () => {
  const source = tx({ frequency: "anual" });
  const missing = appendRecurringInMonth([source], "2042-08");
  assert.equal(missing.length, 1);
  const due = appendRecurringInMonth(missing, "2042-11");
  assert.equal(due.length, 2);
  assert.equal(due[1].date, "2042-11-10");
});

test("a deactivated series never returns in later selected months", () => {
  const source = tx({recurrenceEndDate:"2027-01-01"});
  assert.equal(appendRecurringInMonth([source], "2050-12").length, 1);
});


test("stopping monthly recurrence from a selected month keeps earlier months and the source", () => {
  const generated = appendRecurringThrough([tx()], "2027-05");
  const result = stopRecurringEntriesFrom(generated, "rent", "2027-02-01");
  assert.equal(result[0].recurrenceEndDate, "2027-01-31");
  assert.deepEqual(result.map((row) => row.date), ["2026-11-10", "2026-12-10", "2027-01-10"]);
  assert.equal(appendRecurringInMonth(result, "2027-09"), result);
});

test("stopping weekly recurrence from a selected day keeps earlier occurrences and payments", () => {
  const generated = appendRecurringThrough([tx({ frequency: "semanal" })], "2026-12");
  const paid = generated.map(row => row.date === "2026-12-01"
    ? { ...row, paymentStatus: "paid" as const } : row);
  const result = stopRecurringEntriesFrom(paid, paid[1].id, "2026-11-25");
  assert.equal(result[0].recurrenceEndDate, "2026-11-24");
  assert.deepEqual(result.map(row => row.date), ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"]);
  assert.equal(result[3].paymentStatus, "paid");
});

test("a selected stop period cannot remove the original entry or reactivate an ended series", () => {
  const original = tx();
  assert.equal(stopRecurringEntriesFrom([original], "rent", "2026-11-01")[0], original);
  assert.equal(stopRecurringEntriesFrom([original], "rent", "invalid")[0], original);
  const stopped = stopRecurringEntriesFrom(appendRecurringThrough([original], "2027-03"), "rent", "2027-01-01");
  const earlier = stopRecurringEntriesFrom(stopped, "rent", "2026-12-01");
  assert.equal(earlier[0].recurrenceEndDate, "2026-11-30");
  const later = stopRecurringEntriesFrom(earlier, "rent", "2027-05-01");
  assert.equal(later, earlier);
});
