import { spawnSync } from "node:child_process";
import { createPublicKey } from "node:crypto";

function readConvexSetting(args) {
  const result = spawnSync("npx", ["--no-install", "convex", "env", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Verifique a CONVEX_DEPLOY_KEY de produção e a conexão com o Convex.");
  }
  return result.stdout.trim();
}

function checkProductionAuth() {
  // Only names and public metadata are read. Keep the live release serving
  // traffic if the target backend cannot support both sign-in methods.
  const names = new Set(readConvexSetting(["list", "--names-only"]).split(/\s+/));
  const required = ["SITE_URL", "JWT_PRIVATE_KEY", "JWKS", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"];
  const missing = required.filter(name => !names.has(name));
  if (!names.has("AUTH_EMAIL_API_KEY") && !(names.has("RESEND_API_KEY") && names.has("AUTH_EMAIL_FROM"))) {
    missing.push("AUTH_EMAIL_API_KEY ou o par RESEND_API_KEY + AUTH_EMAIL_FROM");
  }
  if (missing.length) throw new Error("Configure no Convex de produção: " + missing.join(", "));

  const site = new URL(readConvexSetting(["get", "SITE_URL"]));
  if (site.protocol !== "https:" || site.pathname !== "/" || site.search || site.hash || site.username || site.password) {
    throw new Error("SITE_URL deve ser a origem HTTPS pública do Glass Finance.");
  }
  try {
    const jwks = JSON.parse(readConvexSetting(["get", "JWKS"]));
    const valid = jwks.keys?.some(key => key.kty === "RSA" && !key.d &&
      (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256") &&
      createPublicKey({ key, format: "jwk" }).asymmetricKeyType === "rsa");
    if (!valid) throw new Error();
  } catch {
    throw new Error("Confira JWKS no Convex. É necessário um conjunto válido de chaves públicas de assinatura RSA.");
  }
}

const isProduction = process.env.VERCEL_ENV === "production";
if (isProduction) {
  try {
    checkProductionAuth();
  } catch (error) {
    console.error("Publicação interrompida antes do deploy.", error.message);
    process.exit(1);
  }
}
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
