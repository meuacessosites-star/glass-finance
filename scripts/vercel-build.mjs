import { spawnSync } from "node:child_process";

const isProduction = process.env.VERCEL_ENV === "production";

// Validate the Convex backend *before* attempting to publish it.
// The frontend's `tsc -b` does not check the separate Convex tsconfig.
if (isProduction) {
  console.log("Preflight: validando TypeScript do backend Convex antes de publicar...");
  const preflight = spawnSync("npm", ["run", "typecheck:convex"], {
    stdio: "inherit",
    env: process.env,
  });
  if (preflight.error) {
    console.error("Não foi possível validar as funções Convex:", preflight.error.message);
    process.exit(1);
  }
  if (preflight.status !== 0) {
    console.error("Publicação bloqueada: corrija os erros do backend antes de atualizar o Convex Production.");
    process.exit(preflight.status ?? 1);
  }
}

const executable = isProduction ? "npx" : "npm";
const args = isProduction
  ? [
      // Convex 1.44 can require deployment:data:view during an index change.
      // The CLI bug is fixed in 1.46+. Pin a fixed CLI for production builds
      // without silently changing the runtime dependency or lockfile.
      "--yes",
      "convex@1.49.0",
      "deploy",
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      "npm run build",
    ]
  : ["run", "build"];

console.log(
  isProduction
    ? "Production: publicando funções com Convex CLI 1.49.0 e compilando o frontend."
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
