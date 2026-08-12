import { action } from "./_generated/server";
import { v } from "convex/values";
import { parseNfceHtml } from "./nfceParser";

/** Somente URLs https de portais de nota fiscal (SEFAZ e afins) — evita que a
 * action vire um proxy aberto para qualquer endereço. */
function isAllowedNfceUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host.includes("sefaz") ||
    host.endsWith(".gov.br") ||
    host.endsWith("fazenda.sp.gov.br") ||
    host.includes("nfce") ||
    host.includes("nfe")
  );
}

/**
 * Prioridade 1 do Leitor de Notas: dado o QR (URL de consulta da NFC-e),
 * faz um HTTP GET com User-Agent de navegador (Chrome), raspa o HTML com
 * cheerio e devolve valor, data, estabelecimento e lista de itens. Qualquer
 * erro (rede, captcha, portal JS-only, host não permitido) vira
 * { ok: false } — o cliente então cai no fallback de OCR/visão.
 */
export const scrapeNfce = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }): Promise<ReturnType<typeof parseNfceHtml>> => {
    if (!isAllowedNfceUrl(url)) {
      return { ok: false, items: [], error: "url não permitida" };
    }
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return { ok: false, items: [], error: `http ${res.status}` };
      }
      const html = await res.text();
      return parseNfceHtml(html);
    } catch (e) {
      return {
        ok: false,
        items: [],
        error: (e as Error).message ?? "scrape-failed",
      };
    }
  },
});
