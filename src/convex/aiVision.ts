// ---------------------------------------------------------------------------
// Prioridade 2 do Leitor de Notas — extração de dados da imagem por IA
// (Google Gemini, multimodal). Acionada automaticamente quando o QR não
// existe / não decodifica ou a raspagem da SEFAZ falhou.
//
// A chave é lida do ambiente no servidor (process.env.GOOGLE_API_KEY) — nunca
// vai para o navegador. Sem chave configurada o retorno é imediato
// ({ ok: false, error: "no-key" }) e o fluxo segue para o OCR local.
// ---------------------------------------------------------------------------
import { action } from "./_generated/server";
import { v } from "convex/values";
import { normalizeQtyLabel } from "../lib/purchase-format";
import type { NfceScrapeResult } from "./nfceParser";

export type AiReceiptResult = NfceScrapeResult & {
  type?: "income" | "expense";
  paymentMethod?: string;
};

const PROMPT = `Você é um leitor de notas fiscais brasileiras (NFC-e, cupom fiscal, comprovante PIX/depósito). Analise a imagem e responda SOMENTE com JSON válido, sem markdown, neste formato exato:
{
  "ok": true,
  "store": "nome do estabelecimento" | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "total": 123.45 | null,
  "type": "income" | "expense" | null,
  "paymentMethod": "pix" | "dinheiro" | "cartao" | "credito" | "debito" | "boleto" | "transferencia" | null,
  "items": [ { "name": "nome do produto", "qty": "1" | null, "unit": "UN" | "KG" | null, "price": 13.20 | null } ]
}
Regras:
- NÃO invente números, não adivinhe caracteres borrados, ignore códigos numéricos longos e chaves de acesso de 44 dígitos.
- "store" é o nome fantasia/razão social do estabelecimento (sem CNPJ, endereço ou telefone).
- Inclua todos os itens legíveis (nome, quantidade, unidade e preço).
- Comprovante de depósito/PIX recebido → type "income"; pagamento/compra → "expense".
- Se a imagem NÃO for uma nota ou comprovante, responda { "ok": false }.`;

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type GeminiContent = { role?: string; parts: GeminiPart[] };

/** Converte uma data URL ("data:image/jpeg;base64,...") em { mime, b64 }. */
function splitDataUrl(image: string): { mime: string; b64: string } {
  const m = image.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!m) return { mime: "image/jpeg", b64: image.replace(/^data:[^,]+,?/, "") };
  return { mime: m[1], b64: m[2] };
}

function toNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Interpreta o texto de resposta do Gemini (remove fences de markdown). */
export function parseGeminiJson(raw: string): Record<string, unknown> | null {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

/** Converte o JSON do modelo no formato do app (itens normalizados). */
export function mapAiResult(
  obj: Record<string, unknown>,
): AiReceiptResult {
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: NfceScrapeResult["items"] = [];
  for (const it of rawItems.slice(0, 30)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    if (name.length < 2) continue;
    const qtyRaw = r.qty != null ? String(r.qty) : "";
    const unitRaw = r.unit != null ? String(r.unit) : "";
    items.push({
      name: name.slice(0, 80),
      qty: normalizeQtyLabel(unitRaw ? `${qtyRaw} ${unitRaw}` : qtyRaw),
      price: toNumber(r.price) ?? 0,
    });
  }
  const type = obj.type === "income" || obj.type === "expense" ? obj.type : undefined;
  const method = obj.paymentMethod;
  const validMethod =
    typeof method === "string" &&
    /^(pix|dinheiro|cartao|credito|debito|boleto|transferencia)$/.test(method)
      ? method
      : undefined;
  return {
    ok: obj.ok === true || items.length > 0,
    store: obj.store ? String(obj.store).slice(0, 60) : undefined,
    date: obj.date ? String(obj.date).slice(0, 10) : undefined,
    time: obj.time ? String(obj.time).slice(0, 5) : undefined,
    total: toNumber(obj.total) ?? undefined,
    type,
    paymentMethod: validMethod,
    items,
  };
}

/**
 * Extrai os dados de uma nota a partir da imagem (data URL). Roda no backend:
 * chama o Gemini com a imagem em base64 e pede JSON estruturado. Qualquer
 * falha (sem chave, rede, JSON inválido, captcha) vira { ok: false }.
 */
export const extractReceipt = action({
  args: { image: v.string(), hint: v.optional(v.string()) },
  handler: async (_ctx, { image, hint }): Promise<AiReceiptResult> => {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      return { ok: false, items: [], error: "no-key" };
    }
    const { mime, b64 } = splitDataUrl(image);
    const parts: GeminiPart[] = [{ text: PROMPT }];
    if (hint && hint.trim()) {
      parts.push({
        text: `Texto lido por OCR (use apenas como apoio, não repita números inventados):\n${hint.slice(0, 2000)}`,
      });
    }
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
    const body: { contents: GeminiContent[]; generationConfig: unknown } = {
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json" },
    };
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent" +
          `?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!res.ok) {
        return { ok: false, items: [], error: `gemini http ${res.status}` };
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const obj = parseGeminiJson(text);
      if (!obj || obj.ok === false) {
        return { ok: false, items: [], error: "ai-rejected" };
      }
      const mapped = mapAiResult(obj);
      if (!mapped.store && !mapped.total && !mapped.items.length) {
        return { ok: false, items: [], error: "ai-empty" };
      }
      return mapped;
    } catch (e) {
      return { ok: false, items: [], error: (e as Error).message ?? "ai-failed" };
    }
  },
});
