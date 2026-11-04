import { spawnSync } from "node:child_process";
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";

const convexCli = fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url));
const siteOrigin = "https://glass-finance-teal.vercel.app";
const backendName = "ceaseless-mallard-554";

function cliFailure(result) {
  // Convex or npm errors can contain credentials. Report only recognized categories.
  const message = result.stderr ?? "";
  const permission = message.match(/permission to perform this operation \(([a-z:._-]+)\)/i);
  if (permission) return "O Convex exige a permissão " + permission[1] + ".";
  if (/401|unauthenticated|not authenticated|invalid.{0,24}(key|token)|invaliddeploykey|unauthorized/i.test(message))
    return "O Convex rejeitou a credencial de publicação.";
  if (/403|forbidden|permission denied|do not have permission/i.test(message)) return "O Convex negou a permissão solicitada.";
  if (/unknown option|unknown command/i.test(message)) return "A CLI instalada não reconhece a operação.";
  if (/no convex deployment configuration|not logged in|not configured|no deployment|log in with/i.test(message))
    return "A CLI não encontrou a configuração de produção.";
  if (/already exist.+different value/i.test(message)) return "A configuração foi alterada por outra publicação. Repita a verificação.";
  if (/fetch failed|socket|ENOTFOUND|ECONN|ETIMEDOUT|timed out/i.test(message) || result.error?.code === "ETIMEDOUT")
    return "Falha na conexão com o Convex.";
  if (/module_not_found|cannot find module/i.test(message)) return "A instalação da CLI do Convex está incompleta.";
  if (/server error|internalservererror/i.test(message)) return "O Convex retornou um erro de servidor.";
  return "A CLI do Convex encerrou com código " + (result.status ?? "indisponível") + ".";
}

function convexEnv(args, input) {
  const result = spawnSync(process.execPath, [convexCli, "env", "--prod", ...args], {
    encoding: "utf8", input, timeout: 60_000, stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Falha em convex env " + args[0] + ". " + cliFailure(result));
  }
  return result.stdout.trim();
}

function validJwks(value) {
  try {
    const keys = JSON.parse(value).keys;
    return Array.isArray(keys) && keys.every(key => !key.d) && keys.some(key =>
      key.kty === "RSA" && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256") &&
      createPublicKey({ key, format: "jwk" }).asymmetricKeyType === "rsa");
  } catch {
    return false;
  }
}

function isGlassProject() {
  const { VERCEL_PROJECT_ID, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  return VERCEL_PROJECT_ID === "prj_4yWAvFx79yXZHGrbipapN22o8mQP" ||
    (!VERCEL_PROJECT_ID && VERCEL_PROJECT_PRODUCTION_URL === new URL(siteOrigin).host);
}

async function publicSessionProblems() {
  // These are the same public endpoints used by the browser and token verifier.
  const issuer = "https://" + backendName + ".convex.site";
  const options = { redirect: "manual", signal: AbortSignal.timeout(15_000) };
  const [keys, callback] = await Promise.allSettled([
    fetch(issuer + "/.well-known/jwks.json", options).then(async response =>
      response.ok && validJwks(await response.text())),
    fetch(issuer + "/api/auth/callback/google?error=access_denied", options).then(response => {
      const location = response.headers.get("location");
      return response.status === 302 && location && new URL(location).origin === siteOrigin;
    }),
  ]);
  const problems = [];
  if (keys.status !== "fulfilled" || !keys.value) problems.push("assinatura pública de sessão (JWKS)");
  if (callback.status !== "fulfilled" || !callback.value) problems.push("retorno do Google (SITE_URL)");
  return problems;
}

async function checkProductionAuth() {
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY ausente no build de produção.");
  const targetSite = isGlassProject();
  const fixedTarget = deployKey.startsWith("prod:" + backendName + "|");
  let problems = [];
  if (fixedTarget || process.env.VITE_CONVEX_URL === "https://" + backendName + ".convex.cloud") {
    problems = await publicSessionProblems();
    if (problems.length === 0) return;
    console.warn("Falha na verificação pública de produção: " + problems.join(", ") + ".");
  }
  let names;
  try {
    names = new Set(convexEnv(["list", "--names-only"]).split(/\s+/));
  } catch (error) {
    if (problems.length) throw new Error(error.message + " Confira esses itens no painel do Convex.");
    throw error;
  }
  const google = names.has("AUTH_GOOGLE_ID") && names.has("AUTH_GOOGLE_SECRET");
  const email = names.has("AUTH_EMAIL_API_KEY") || (names.has("RESEND_API_KEY") && names.has("AUTH_EMAIL_FROM"));
  if (!google && !email) throw new Error("Configure o Google ou um serviço de envio de e-mail no Convex.");

  // Only this project's confirmed production backend can receive initial settings.
  const additions = [];
  if (!names.has("SITE_URL")) additions.push("SITE_URL=" + siteOrigin);
  if (names.has("JWKS") !== names.has("JWT_PRIVATE_KEY")) {
    throw new Error("O par de assinatura está incompleto no Convex. Restaure a chave correspondente a JWT_PRIVATE_KEY ou JWKS.");
  }
  if (!names.has("JWKS")) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).trimEnd().replace(/\n/g, " ");
    additions.push("JWT_PRIVATE_KEY=" + pem,
      "JWKS=" + JSON.stringify({ keys: [{ use: "sig", ...publicKey.export({ format: "jwk" }) }] }));
  }
  if (additions.length) {
    if (!targetSite || !fixedTarget) throw new Error("Configure SITE_URL e as chaves de assinatura no Convex de produção indicado.");
    // A single stdin update without --force refuses to replace existing values.
    convexEnv(["set"], additions.join("\n") + "\n");
    console.log("Configuração inicial de sessão concluída no Convex do Glass Finance.");
  }

  let site;
  try { site = new URL(convexEnv(["get", "SITE_URL"])); } catch { throw new Error("Confira SITE_URL no Convex de produção."); }
  if (site.protocol !== "https:" || site.pathname !== "/" || site.search || site.hash || site.username || site.password ||
      (targetSite && site.origin !== siteOrigin)) throw new Error("SITE_URL deve apontar para a origem HTTPS pública do site.");
  if (!validJwks(convexEnv(["get", "JWKS"]))) throw new Error("Confira o conjunto de chaves públicas RSA em JWKS.");
  if (problems.length) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 2000));
      problems = await publicSessionProblems();
      if (!problems.length) break;
    }
    if (problems.length) throw new Error("Verificação pública pendente. Confira " + problems.join(", ") + ".");
  }
  if (!google) console.warn("O login com Google aguarda AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET no Convex.");
  if (!email) console.warn("O cadastro e a recuperação por e-mail aguardam um remetente configurado no Convex.");
}

const isProduction = process.env.VERCEL_ENV === "production";
if (isProduction) {
  try {
    await checkProductionAuth();
  } catch (error) {
    console.error("Publicação interrompida antes do deploy.", error.message);
    process.exit(1);
  }
}

const result = isProduction
  ? spawnSync(process.execPath, [convexCli, "deploy", "--cmd-url-env-var-name", "VITE_CONVEX_URL", "--cmd", "npm run build"], { stdio: "inherit" })
  : spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (result.error) console.error("Falha ao iniciar a compilação.", result.error.message);
process.exit(result.status ?? 1);
