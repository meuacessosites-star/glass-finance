import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const server = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
const serverErrors = [];
server.stderr.on("data", chunk => serverErrors.push(String(chunk)));
const baseUrl = "http://127.0.0.1:4173";

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) break;
    try { const result = await fetch(baseUrl); if (result.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Could not start preview server: " + serverErrors.join("\n"));
}
let browser;
try {
  await waitForServer();
  await mkdir("playstore-screenshots", { recursive: true });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 432, height: 768 },
    deviceScaleFactor: 2.5,
    locale: "pt-BR",
    timezoneId: "America/Recife",
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const pages = [
    ["01-painel-inicial.png", "/dashboard", "Resumo financeiro"],
    ["02-transacoes.png", "/dashboard/transacoes", "Transações"],
    ["03-cartoes.png", "/dashboard/cartoes", "Cartões"],
    ["04-reservas.png", "/dashboard/reservas", "Reservas"],
  ];
  const problems = [];
  for (const [filename, path, description] of pages) {
    const page = await context.newPage();
    page.on("pageerror", err => problems.push(path + ": " + err.message));
    await page.goto(baseUrl + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    if (/Preview runtime error|Configuração pendente|Conectando à sua conta e carregando/.test(body)) {
      throw new Error("Page did not render " + path + "\n" + body.slice(0, 1500) + "\n" + problems.join("\n"));
    }
    const screenshotPath = "playstore-screenshots/" + filename;
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
    console.log(filename, description, "rendered:", body.slice(0, 180).replace(/\s+/g, " "));
    if (body.trim().length < 40) throw new Error("Too little page content at " + path);
    await page.close();
  }
  await writeFile("playstore-screenshots/README.txt", "Capturas diretas da interface do Glass Finance via Chromium, com dados fictícios do perfil de demonstração presente no código original. Não são capturas da conta de um usuário e não há acesso ao Convex real.\n");
  if (problems.length) console.log("Non-fatal client errors:", problems.slice(0, 20).join("\n"));
} finally {
  await browser?.close();
  server.kill();
}
