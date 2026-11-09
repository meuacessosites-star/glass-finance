import assert from "node:assert/strict";
import test from "node:test";
import { metadataWithoutTransactions, inflateTransactionPages, transactionChanges, splitTransactionBatches, applyTransactionBatch } from "../src/lib/finance-v2-state";

const base = (transactions: unknown[], other: Record<string, unknown> = {}) =>
  JSON.stringify({ activeProfileId: "a", profiles: [{ id: "a", data: { transactions, cards: [], ...other } }] });
const row = (id: string, amount: number) => ({ id, amount, title: id, date: "2026-11-09" });

test("metadata removes transactions but preserves all other account settings", () => {
  const original = base([row("a", -10)], { includeBorrowedCardInvoices: true });
  const cleaned = JSON.parse(metadataWithoutTransactions(original));
  assert.deepEqual(cleaned.profiles[0].data.transactions, []);
  assert.equal(cleaned.profiles[0].data.includeBorrowedCardInvoices, true);
  assert.equal(cleaned.activeProfileId, "a");
});

test("paged hydration restores every row without merging it into the metadata", () => {
  const originalRows = [row("a", 10), row("b", -20)];
  const restored = JSON.parse(inflateTransactionPages(metadataWithoutTransactions(base(originalRows)), { a: originalRows }));
  assert.deepEqual(restored.profiles[0].data.transactions, originalRows);
});

test("only changed records are saved, and deletions are explicit", () => {
  const original = base([row("a", 10), row("b", 20)]);
  const updated = base([row("a", 11), row("c", 30)]);
  const ops = transactionChanges(original, updated);
  assert.equal(ops.length, 3);
  assert.deepEqual(ops.find(x=>x.transactionId==="b"), { type:"delete", profileId:"a",transactionId:"b" });
  assert.equal(ops.find(x=>x.transactionId==="a")?.payload?.amount, 11);
  assert.equal(ops.find(x=>x.transactionId==="c")?.payload?.amount, 30);
});

test("equal financial rows are not rewritten when user preferences change", () => {
  assert.deepEqual(transactionChanges(base([row("a",100)]),base([row("a",100)], { homeBalanceMode:"monthly" })),[]);
});

test("cross-profile identifiers cannot overwrite each other", () => {
  const prior=JSON.stringify({profiles:[{id:"a",data:{transactions:[row("same",10)]}},{id:"b",data:{transactions:[row("same",20)]}}]});
  const next=JSON.stringify({profiles:[{id:"a",data:{transactions:[row("same",30)]}},{id:"b",data:{transactions:[row("same",20)]}}]});
  const ops=transactionChanges(prior,next);
  assert.equal(ops.length,1);
  assert.equal(ops[0].profileId,"a");
});

test("duplicate financial IDs and corrupt metadata are rejected", () => {
  assert.throws(()=>transactionChanges(base([row("a",10),row("a",20)]),base([])));
  assert.throws(()=>metadataWithoutTransactions('{"profiles":[]}'));
});

test("normalized hydration preserves legacy array order even when pages arrive reversed", () => {
  const ordered = [row("newest", 10), row("middle", 20), row("oldest", 30)];
  const metadata = metadataWithoutTransactions(base(ordered));
  const restored = JSON.parse(inflateTransactionPages(metadata, { a: [...ordered].reverse() }));
  assert.deepEqual(restored.profiles[0].data.transactions, ordered);
});

test("normalized hydration fails closed when a paged record is missing", () => {
  const ordered = [row("one", 10), row("two", 20)];
  const metadata = metadataWithoutTransactions(base(ordered));
  assert.throws(() => inflateTransactionPages(metadata, { a: [ordered[0]] }), /incompleto/);
  assert.throws(() => inflateTransactionPages(metadata, { a: [...ordered, row("three", 30)] }), /incompleto/);
});

test("large imports are split into bounded revisions without dropping records", () => {
  const records = Array.from({ length: 93 }, (_, i) => row(`tx-${i}`, i + 0.25));
  const original = base([row("old", 25)]);
  const target = base(records);
  const batches = splitTransactionBatches(transactionChanges(original, target));
  assert.ok(batches.length >= 5);
  assert.ok(batches.every(batch => batch.length <= 20));
  let intermediate = original;
  batches.forEach((batch, index) => {
    intermediate = applyTransactionBatch(intermediate, target, batch, index === batches.length - 1);
    // All interim manifests have exactly the locally committed record set.
    assert.doesNotThrow(() => inflateTransactionPages(
      metadataWithoutTransactions(intermediate),
      { a: JSON.parse(intermediate).profiles[0].data.transactions },
    ));
  });
  assert.deepEqual(JSON.parse(intermediate), JSON.parse(target));
});

test("batching catches oversized individual transaction payloads before remote writes", () => {
  assert.throws(() => splitTransactionBatches([{
    type: "upsert", profileId: "a", transactionId: "huge",
    payload: { id: "huge", image: "x".repeat(810_000) },
  }]), /grande demais/);
});
