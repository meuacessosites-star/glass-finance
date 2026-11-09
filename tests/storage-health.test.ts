import assert from "node:assert/strict";
import test from "node:test";
import { estimateStorageHealth, formatStorageBytes, LEGACY_SNAPSHOT_LIMIT_BYTES } from "../src/lib/storage-health";

test("storage estimate counts profiles, transactions and inline attachments locally", () => {
  const profiles = [{ data: {
    transactions: [
      { attachments: ["data:image/jpeg;base64,AAAA", "https://example.org/file"] },
      { attachments: [] },
    ],
    loanReceivables: [{ attachments: ["data:application/pdf;base64,AAAA"] }],
    categories: [{ image: "data:image/png;base64,AAAA" }],
  }, avatar: { image: "data:image/jpeg;base64,AAAA" } }];
  const result = estimateStorageHealth(profiles);
  assert.equal(result.transactionCount, 2);
  assert.equal(result.attachmentCount, 3);
  assert.ok(result.inlineAttachmentBytes > 0);
  assert.equal(result.level, "normal");
  assert.equal(result.usagePercent, 0);
  assert.ok(result.totalJsonBytes > result.inlineAttachmentBytes);
});

test("warns before snapshot reaches the old limit", () => {
  const huge = "a".repeat(Math.ceil(LEGACY_SNAPSHOT_LIMIT_BYTES * 0.87));
  const result = estimateStorageHealth([{ data: { transactions: [{ attachments: [huge] }] } }]);
  assert.equal(result.level, "critical");
  assert.ok(result.usagePercent >= 85);
});

test("formats sizes without transmitting any user data", () => {
  assert.equal(formatStorageBytes(1200), "1 KB");
  assert.equal(formatStorageBytes(1_230_000), "1.23 MB");
});
