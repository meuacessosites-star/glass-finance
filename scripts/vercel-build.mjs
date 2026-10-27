import { spawnSync } from "node:child_process";

const isProduction = process.env.VERCEL_ENV === "production";
const executable = isProduction ? "npx" : "npm";
const args = isProduction
  ? [
      "convex",
      "deploy",
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      "npm run build",
    ]
  : ["run", "build"];

console.log(
  isProduction
    ? "Production: publicando funções Convex e compilando o frontend."
    : "Preview/Development: compilando apenas o frontend; não publica no Convex Production.",
);

const result = spawnSync(executable, args, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(`Falha ao iniciar ${executable}:`, result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
