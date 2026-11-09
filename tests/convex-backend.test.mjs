import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";

const modules = import.meta.glob("../src/convex/**/*.{ts,js}");

function makeSnapshot(transactions) {
  return JSON.stringify({
    activeProfileId: "personal",
    profiles: [{
      id: "personal", name: "Principal",
      data: { transactions, cards: [], loanReceivables: [], categories: [] },
    }],
  });
}
const transaction = (id, amount) => ({
  id, title: id, date: "2026-11-09", amount,
});

test("unauthenticated requests cannot write or read other accounts", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([transaction("private", 25)]),
    expectedRevision: 0,
  })).rejects.toThrow();
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  await alice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([transaction("private", 25)]),
    expectedRevision: 0,
  });
  expect(await bob.query(api.financeState.getMine, {})).toBeNull();
});

test("migration copies only authorized original records and allows idempotent retries", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const row = transaction("income-1", 12.34);
  const saved = await alice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([row]), expectedRevision: 0,
  });
  expect(saved.ok).toBe(true);
  const operation = {
    profileId: "personal", sourceRevision: 1,
    items: [{ id: row.id, amount: row.amount, date: row.date, payload: row }],
  };
  await expect(alice.mutation(api.transactionMigration.copyBatch, {
    ...operation, items: [{ ...operation.items[0], amount: 99 }],
  })).rejects.toThrow();
  const first = await alice.mutation(api.transactionMigration.copyBatch, operation);
  expect(first.copied).toBe(1);
  const again = await alice.mutation(api.transactionMigration.copyBatch, operation);
  expect(again.alreadyPresent).toBe(1);
  const verified = await alice.query(api.transactionMigration.verifyProfile, {
    profileId: "personal", sourceRevision: 1,
  });
  expect(verified.verified).toBe(true);
});

test("v2 activation requires verified migration and prevents old clients overwriting it", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const row = transaction("income-1", 0.1);
  await alice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([row]), expectedRevision: 0,
  });
  await expect(alice.mutation(api.financeV2.activateFromLegacy, {
    sourceRevision: 1,
  })).rejects.toThrow();
  await alice.mutation(api.transactionMigration.copyBatch, {
    profileId: "personal", sourceRevision: 1,
    items: [{ id: row.id, amount: row.amount, date: row.date, payload: row }],
  });
  await alice.mutation(api.transactionMigration.confirmProfile, {
    profileId: "personal", sourceRevision: 1,
  });
  const activated = await alice.mutation(api.financeV2.activateFromLegacy, {
    sourceRevision: 1,
  });
  expect(activated.activated).toBe(true);
  expect((await alice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([]), expectedRevision: 1,
  })).ok).toBe(false);
  const metadata = await alice.query(api.financeV2.getMine, {});
  expect(metadata.revision).toBe(1);
});

test("normalized writes preserve per-user isolation and reject concurrent stale edits", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const original = transaction("income-1", 50);
  await alice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([original]), expectedRevision: 0,
  });
  await alice.mutation(api.transactionMigration.copyBatch, {
    profileId: "personal", sourceRevision: 1,
    items: [{ id: original.id, amount: original.amount, date: original.date, payload: original }],
  });
  await alice.mutation(api.transactionMigration.confirmProfile, {
    profileId: "personal", sourceRevision: 1,
  });
  await alice.mutation(api.financeV2.activateFromLegacy, { sourceRevision: 1 });
  const v2 = await alice.query(api.financeV2.getMine, {});
  const updated = transaction("income-1", 75);
  const result = await alice.mutation(api.financeV2.saveMine, {
    expectedRevision: 1, metadataPayload: v2.metadataPayload,
    operations: [{ type: "upsert", profileId: "personal", transactionId: "income-1", payload: updated }],
  });
  expect(result.ok).toBe(true);
  const stale = await alice.mutation(api.financeV2.saveMine, {
    expectedRevision: 1, metadataPayload: v2.metadataPayload, operations: [],
  });
  expect(stale.ok).toBe(false);
  expect((await alice.query(api.financeV2.listProfilePage, { profileId: "personal" })).page)
    .toMatchObject([{ amount: 75 }]);
  expect((await bob.query(api.financeV2.listProfilePage, { profileId: "personal" })).page)
    .toHaveLength(0);
});

test("a registered receipt cannot be read or claimed by another account", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const storageId = await t.action(async ctx =>
    await ctx.storage.store(new Blob(["private example"], { type: "image/png" })));
  await alice.mutation(api.financeFiles.register, {
    storageId, profileId: "personal", fileName: "private.png", contentType: "image/png",
  });
  expect(await bob.query(api.financeFiles.getDownloadUrl, { storageId })).toBeNull();
  expect(await bob.query(api.financeFiles.getMetadata, { storageId })).toBeNull();
  await expect(bob.mutation(api.financeFiles.register, {
    storageId, profileId: "personal", fileName: "stolen.png", contentType: "image/png",
  })).rejects.toThrow();
  const metadata = await alice.query(api.financeFiles.getMetadata, { storageId });
  expect(metadata.name).toBe("private.png");
});

test("committed receipt remains accessible after orphan cleanup", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const storageId = await t.action(async ctx =>
    await ctx.storage.store(new Blob(["receipt"], { type: "image/png" })));
  await alice.mutation(api.financeFiles.register, {
    storageId, profileId: "personal", fileName: "receipt.png", contentType: "image/png",
  });
  const transactionWithAttachment = {
    ...transaction("attached", -1),
    attachments: [`glass-file:${storageId}:image`],
  };
  const snapshot = makeSnapshot([transactionWithAttachment]);
  await alice.mutation(api.financeState.saveMine, { payload: snapshot, expectedRevision: 0 });
  await t.run(async ctx => {
    const file = await ctx.db.query("financeFiles").first();
    await ctx.db.patch(file._id, { createdAt: Date.now() - 40 * 24 * 60 * 60 * 1000 });
  });
  await t.mutation(internal.financeFiles.cleanupAbandonedUploads, {});
  expect(await alice.query(api.financeFiles.getMetadata, { storageId })).not.toBeNull();
});
