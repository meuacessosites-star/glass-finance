import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), "granascan-billing-"));
const entries = ["card-billing.test", "card-installments.test", "transaction-status.test", "transaction-ledgers.test", "previous-month-debts.test", "navigation-pending.test", "payment-updates.test"];
try {
  await build({ entryPoints: entries.map((name) => path.join(root, "tests", `${name}.ts`)), outdir: output, outExtension: { ".js": ".mjs" }, bundle: true, platform: "node", format: "esm", tsconfig: path.join(root, "tsconfig.app.json") });
  const result = spawnSync(process.execPath, ["--test", ...entries.map((name) => path.join(output, `${name}.mjs`))], { cwd: root, env: { ...process.env, TZ: "America/Sao_Paulo" }, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally { await rm(output, { recursive: true, force: true }); }
