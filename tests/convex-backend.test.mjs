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
  await alice.mutation(api.financeOwnership.ensureMine, {});
  const bob = t.withIdentity({ subject: "bob" });
  await bob.mutation(api.financeOwnership.ensureMine, {});
  await alice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([transaction("private", 25)]),
    expectedRevision: 0,
  });
  expect(await bob.query(api.financeState.getMine, {})).toBeNull();
});

test("migration copies only authorized original records and allows idempotent retries", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  await alice.mutation(api.financeOwnership.ensureMine, {});
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
  await alice.mutation(api.financeOwnership.ensureMine, {});
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
  await alice.mutation(api.financeOwnership.ensureMine, {});
  const bob = t.withIdentity({ subject: "bob" });
  await bob.mutation(api.financeOwnership.ensureMine, {});
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
  await alice.mutation(api.financeOwnership.ensureMine, {});
  const bob = t.withIdentity({ subject: "bob" });
  await bob.mutation(api.financeOwnership.ensureMine, {});
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
  await alice.mutation(api.financeOwnership.ensureMine, {});
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

test("push subscriptions require login and stay isolated between accounts", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  await alice.mutation(api.financeOwnership.ensureMine, {});
  const bob = t.withIdentity({ subject: "bob" });
  await bob.mutation(api.financeOwnership.ensureMine, {});
  const endpoint = "https://fcm.googleapis.com/fcm/send/device-1";
  const input = {
    endpoint, profileId: "personal",
    p256dh: Buffer.alloc(65, 1).toString("base64url"),
    auth: Buffer.alloc(16, 2).toString("base64url"),
    timeZone: "America/Recife",
  };
  await expect(t.mutation(api.pushNotifications.registerDevice, input)).rejects.toThrow();
  await expect(alice.mutation(api.pushNotifications.registerDevice, {
    ...input, endpoint: "https://localhost/internal",
  })).rejects.toThrow();
  expect((await alice.mutation(api.pushNotifications.registerDevice, input)).registered).toBe(true);
  await expect(bob.mutation(api.pushNotifications.registerDevice, input)).rejects.toThrow();
  await bob.mutation(api.pushNotifications.removeDevice, { endpoint });
  const devices = await t.run(ctx => ctx.db.query("pushDevices").collect());
  expect(devices).toHaveLength(1);
  expect(devices[0].userSubject).toBe("account:alice");
  await alice.mutation(api.pushNotifications.removeDevice, { endpoint });
  expect(await t.run(ctx => ctx.db.query("pushDevices").collect())).toHaveLength(0);
});

test("private reminder schedules contain only dates and types; deleting account removes push data", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  await alice.mutation(api.financeOwnership.ensureMine, {});
  const bob = t.withIdentity({ subject: "bob" });
  await bob.mutation(api.financeOwnership.ensureMine, {});
  const items = [
    { key: "invoice:a:2026-12", date: "2026-12-15", kind: "invoice" },
    { key: "review", date: "2026-11-09", kind: "review" },
  ];
  await alice.mutation(api.pushNotifications.syncSchedule, { profileId: "personal", items });
  await expect(alice.mutation(api.pushNotifications.syncSchedule, {
    profileId: "personal", items: [...items, items[0]],
  })).rejects.toThrow();
  await bob.mutation(api.pushNotifications.syncSchedule, { profileId: "personal", items: [] });
  const all = await t.run(ctx => ctx.db.query("pushSchedules").collect());
  expect(all).toHaveLength(2);
  expect(all.find(item => item.userSubject === "account:alice").items).toEqual(items);
  await alice.mutation(api.financeState.deleteMine, {});
  expect((await t.run(ctx => ctx.db.query("pushSchedules").collect()))
    .map(item => item.userSubject)).toEqual(["account:bob"]);
});

test("two sessions of one account share the same live financial data", async () => {
  const t = convexTest(schema, modules);
  const firstDevice = t.withIdentity({ subject: "multiuser|session-one" });
  const secondDevice = t.withIdentity({ subject: "multiuser|session-two" });
  await firstDevice.mutation(api.financeOwnership.ensureMine, {});
  await firstDevice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([transaction("shared", 42)]), expectedRevision: 0,
  });
  await secondDevice.mutation(api.financeOwnership.ensureMine, {});
  const received = await secondDevice.query(api.financeState.getMine, {});
  expect(JSON.parse(received.payload).profiles[0].data.transactions[0].id).toBe("shared");
  const secondWrite = await secondDevice.mutation(api.financeState.saveMine, {
    payload: makeSnapshot([transaction("shared", 43)]), expectedRevision: 1,
  });
  expect(secondWrite.ok).toBe(true);
  expect(JSON.parse((await firstDevice.query(api.financeState.getMine, {})).payload)
    .profiles[0].data.transactions[0].amount).toBe(43);
});

test("old financial history belonging to one session is preserved without copying", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    await ctx.db.insert("financeStates", {
      userSubject: "existinguser|old-session", revision: 1, chunkCount: 1, updatedAt: 1,
    });
    await ctx.db.insert("financeStateChunks", {
      userSubject: "existinguser|old-session", revision: 1, chunkIndex: 0,
      payload: makeSnapshot([transaction("kept", 19)]),
    });
  });
  const newDevice = t.withIdentity({ subject: "existinguser|new-session" });
  await newDevice.mutation(api.financeOwnership.ensureMine, {});
  const received = await newDevice.query(api.financeState.getMine, {});
  expect(received.revision).toBe(1);
  expect(received.payload).toContain('"kept"');
  const maps = await t.run(ctx => ctx.db.query("financeOwners").collect());
  expect(maps[0].storageSubject).toBe("existinguser|old-session");
});

test("independent legacy histories are never silently merged or overwritten", async () => {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    for (const suffix of ["old-one", "old-two"]) {
      await ctx.db.insert("financeStates", {
        userSubject: `splituser|${suffix}`, revision: 1, chunkCount: 1, updatedAt: 1,
      });
      await ctx.db.insert("financeStateChunks", {
        userSubject: `splituser|${suffix}`, revision: 1, chunkIndex: 0,
        payload: makeSnapshot([transaction(suffix, 100)]),
      });
    }
  });
  const device = t.withIdentity({ subject: "splituser|new-device" });
  const result = await device.mutation(api.financeOwnership.ensureMine, {});
  expect(result.ready).toBe(false);
  expect(result.sources).toHaveLength(2);
  expect(await t.run(ctx => ctx.db.query("financeOwners").collect())).toHaveLength(0);
  const selected = await device.mutation(api.financeOwnership.selectMine, { subject: "splituser|old-one" });
  expect(selected.ready).toBe(true);
  const active = await device.query(api.financeState.getMine, {});
  expect(active.payload).toContain('"old-one"');
  expect(await t.run(ctx => ctx.db.query("financeStates").collect())).toHaveLength(2);
  expect(await t.run(ctx => ctx.db.query("financeOwners").collect())).toHaveLength(1);
  await expect(t.withIdentity({ subject: "otheruser|session" }).mutation(
    api.financeOwnership.selectMine, { subject: "splituser|old-two" },
  )).rejects.toThrow("não pertence a esta conta");
});

test("signup check distinguishes registered email without returning account details", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { email: "registered@example.com" });
  });
  expect(await t.query(api.registration.emailAlreadyRegistered, { email: "Registered@Example.com " })).toBe(true);
  expect(await t.query(api.registration.emailAlreadyRegistered, { email: "new@example.com" })).toBe(false);
  expect(await t.query(api.registration.emailAlreadyRegistered, { email: "invalid" })).toBe(false);
});
