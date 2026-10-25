import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), "granascan-billing-"));
const entries = ["card-billing.test", "card-installments.test", "transaction-status.test", "transaction-ledgers.test", "previous-month-debts.test", "navigation-pending.test", "payment-updates.test", "loan-repayments.test", "home-balance.test", "transaction-deletion.test", "loan-view.test", "card-loans.test", "loan-record-actions.test", "loan-history.test", "record-order.test", "loan-value-display.test", "report-view.test", "category-catalog.test", "card-appearance.test"];
entries.push("card-invoice-view.test");
entries.push("card-menu-flows.test");
entries.push("card-invoice-interactions.test");
entries.push("card-header-appearance.test");
entries.push("invoice-card-display.test");
entries.push("card-invoice-summary.test");
entries.push("notification-actions.test", "payment-notifications.test");
entries.push("notification-history.test");
entries.push("notification-redo.test");
entries.push("notification-search.test");
entries.push("home-alerts.test");
entries.push("home-alert-preferences.test");
entries.push("home-alert-rotation.test", "payment-notice-session.test");
entries.push("reserves.test", "balance-privacy.test", "reserve-bank-presets.test");
entries.push("planning-suite.test");
try {
  await build({ entryPoints: entries.map((name) => path.join(root, "tests", `${name}.ts`)), outdir: output, outExtension: { ".js": ".mjs" }, bundle: true, platform: "node", format: "esm", tsconfig: path.join(root, "tsconfig.app.json") });
  const result = spawnSync(process.execPath, ["--test", ...entries.map((name) => path.join(output, `${name}.mjs`))], { cwd: root, env: { ...process.env, TZ: "America/Sao_Paulo" }, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
