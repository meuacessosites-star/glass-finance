"use node";

// ---------------------------------------------------------------------------
// Leitor de Notas — Prioridade 2 (a SOLUÇÃO DEFINITIVA): extração de dados da
// imagem por um modelo Vision LLM. Quando o QR não existe / não decodifica ou
// o scrape da SEFAZ falhou, a imagem da nota é enviada DIRETAMENTE ao modelo
// de visão com um System Prompt estrito que devolve APENAS o JSON estruturado
// ({ estabelecimento, valor_total, data, itens }) — sem OCR de texto, sem
// parser heurístico que lê pedaços do cabeçalho como nome da loja.
//
// O cliente recebe esse JSON e aplica as regras condicionais: Descrição com
// 3+ itens → categoria inteligente; com 1–2 itens → quantidade + nome do
// primeiro produto; Rascunho → estabelecimento + lista limpa dos itens.
//
// Provedores tentados em ordem, com prazo único (~30s):
//   1) Gateway VLY (OpenAI-compatível, VLY_INTEGRATION_KEY automática do
//      ambiente);
//   2) Google Gemini (GOOGLE_API_KEY — tier gratuito, recomendado);
//   3) OpenAI direto (OPENAI_API_KEY — chave própria do usuário).
// ---------------------------------------------------------------------------
import { action } from "./_generated/server";
import { v } from "convex/values";
import { normalizeQtyLabel } from "../lib/purchase-format";
import type { NfceScrapeResult } from "./nfceParser";

export type AiReceiptResult = NfceScrapeResult & {
  type?: "income" | "expense";
  paymentMethod?: string;
};

const PROMPT = `Você é um sistema de extração de dados de notas fiscais (NFC-e). Analise a imagem e retorne EXATAMENTE e APENAS um objeto JSON válido com a seguinte estrutura: { "estabelecimento": "Nome fantasia limpo da loja", "valor_total": "apenas numeros", "data": "DD/MM/AAAA", "itens": [ { "qtd": 1, "produto": "Nome real e limpo do produto", "valor": 0.00 } ] }. É estritamente proibido incluir textos genéricos de cabeçalho, CNPJ, chaves de acesso, ou frases como Documento Auxiliar. Comprovantes de Pix/depósito: "estabelecimento" é o nome da OUTRA PARTE (favorecido/recebedor para dinheiro recebido; pagador para dinheiro enviado), nunca a instituição de pagamento (ex.: "Mercado Pago"); "itens" fica vazio e "valor_total" é o valor do comprovante.`;

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type GeminiContent = { role?: string; parts: GeminiPart[] };

/** Converte uma data URL ("data:image/jpeg;base64,...") em { mime, b64 }. */
function splitDataUrl(image: string): { mime: string; b64: string } {
  const m = image.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!m) return { mime: "image/jpeg", b64: image.replace(/^data:[^,]+,?/, "") };
  return { mime: m[1], b64: m[2] };
}

/** Número pt-BR: "1.234,56", "13,20", "13.20", "R$ 13,20" → number | null. */
function toNumber(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) && x > 0 ? x : null;
  const s = String(x ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let t = s;
  if (hasComma && hasDot) t = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) t = s.replace(",", ".");
  else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length === 3) t = s.replace(".", "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "DD/MM/AAAA" (e "YYYY-MM-DD") → "YYYY-MM-DD" | undefined. */
function parseDateBR(x: unknown): string | undefined {
  const t = String(x ?? "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
}

/** Interpreta o texto de resposta do modelo (remove fences de markdown). */
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

/**
 * Converte o JSON do modelo no formato do app. Aceita o formato estrito
 * ({ estabelecimento, valor_total, data, itens: [{qtd, produto, valor}] }) e,
 * por robustez, também os nomes antigos ({ store, total, date, items }).
 */
export function mapAiResult(obj: Record<string, unknown>): AiReceiptResult {
  const storeRaw =
    String(obj.estabelecimento ?? obj.store ?? "").trim().slice(0, 60) || undefined;
  const total = toNumber(obj.valor_total ?? obj.total) ?? undefined;
  const date = parseDateBR(obj.data ?? obj.date);
  const time =
    obj.time && String(obj.time).trim()
      ? String(obj.time).trim().slice(0, 5)
      : undefined;
  const rawItems = Array.isArray(obj.itens)
    ? obj.itens
    : Array.isArray(obj.items)
      ? obj.items
      : [];
  const items: NfceScrapeResult["items"] = [];
  for (const it of rawItems.slice(0, 30)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const name = String(r.produto ?? r.name ?? "").trim();
    if (name.length < 2) continue;
    const qtyRaw =
      r.qtd != null ? String(r.qtd) : r.qty != null ? String(r.qty) : "";
    const unitRaw = r.unit != null ? String(r.unit) : "";
    items.push({
      name: name.slice(0, 80),
      qty: normalizeQtyLabel(unitRaw ? `${qtyRaw} ${unitRaw}` : qtyRaw),
      price: toNumber(r.valor ?? r.price) ?? 0,
    });
  }
  const type =
    obj.type === "income" || obj.type === "expense" ? obj.type : undefined;
  const method = obj.paymentMethod;
  const validMethod =
    typeof method === "string" &&
    /^(pix|dinheiro|cartao|credito|debito|boleto|transferencia)$/.test(method)
      ? method
      : undefined;
  return {
    ok: obj.ok === true || items.length > 0 || !!storeRaw || !!total,
    store: storeRaw,
    date,
    time,
    total,
    type,
    paymentMethod: validMethod,
    items,
  };
}

/** Valida a resposta crua do modelo: JSON válido + algum dado útil. */
function finalizeAi(
  raw: string,
  source: string,
): { ok: true; result: AiReceiptResult } | { ok: false; error: string } {
  const obj = parseGeminiJson(raw);
  if (!obj || obj.ok === false) return { ok: false, error: `${source}-rejected` };
  const mapped = mapAiResult(obj);
  if (!mapped.store && !mapped.total && !mapped.items.length) {
    return { ok: false, error: `${source}-empty` };
  }
  return { ok: true, result: mapped };
}

/** Candidatos do endpoint OpenAI-compatível do gateway VLY, em ordem: o
 * endpoint conhecido primeiro (integrations.vly.ai — o host documentado
 * integrations.freebuff.com não responde mais), depois derivados de
 * VLY_INTEGRATION_BASE_URL quando o env define (desduplicados). */
function vlyChatUrls(): string[] {
  const base = (process.env.VLY_INTEGRATION_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const candidates = [
    "https://integrations.vly.ai/v1/llm/chat/completions",
    ...(base
      ? [
          base.endsWith("/chat/completions")
            ? base
            : base.endsWith("/v1/llm")
              ? `${base}/chat/completions`
              : `${base}/v1/llm/chat/completions`,
        ]
      : []),
  ];
  return candidates.filter((u, i, a) => a.indexOf(u) === i);
}

/** Provedor 1 — gateway VLY com modelo multimodal (chave automática). Tenta
 * os endpoints candidatos em ordem; o primeiro que responder 2xx vence. */
async function tryVly(
  image: string,
  key: string,
  deadline: number,
): Promise<{ ok: true; result: AiReceiptResult } | { ok: false; error: string }> {
  let lastError = "vly-failed";
  for (const url of vlyChatUrls()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, error: "timeout" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 1500,
          messages: [
            { role: "system", content: PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extraia os dados desta nota fiscal." },
                { type: "image_url", image_url: { url: image } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(Math.min(18_000, remaining)),
      });
      if (!res.ok) {
        lastError = `vly http ${res.status}`;
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return finalizeAi(data.choices?.[0]?.message?.content ?? "", "vly");
    } catch (e) {
      lastError = (e as Error).message ?? "vly-failed";
    }
  }
  return { ok: false, error: lastError };
}

/** Provedor 3 — OpenAI direto (OPENAI_API_KEY), alternativa quando o gateway
 * VLY está indisponível e o usuário tem chave própria. */
async function tryOpenAI(
  image: string,
  key: string,
  deadline: number,
): Promise<{ ok: true; result: AiReceiptResult } | { ok: false; error: string }> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { ok: false, error: "timeout" };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados desta nota fiscal." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(Math.min(18_000, remaining)),
    });
    if (!res.ok) return { ok: false, error: `openai http ${res.status}` };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return finalizeAi(data.choices?.[0]?.message?.content ?? "", "openai");
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "openai-failed" };
  }
}

/** Provedor 2 — Google Gemini (GOOGLE_API_KEY). */
async function tryGemini(
  image: string,
  key: string,
  deadline: number,
): Promise<{ ok: true; result: AiReceiptResult } | { ok: false; error: string }> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { ok: false, error: "timeout" };
  const { mime, b64 } = splitDataUrl(image);
  const body: { contents: GeminiContent[]; generationConfig: unknown } = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
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
        signal: AbortSignal.timeout(Math.min(18_000, remaining)),
      },
    );
    if (!res.ok) return { ok: false, error: `gemini http ${res.status}` };
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return finalizeAi(text, "gemini");
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "gemini-failed" };
  }
}

/**
 * Extrai os dados de uma nota a partir da imagem (data URL) com um modelo
 * Vision LLM. A imagem vai DIRETA para o modelo com o System Prompt estrito —
 * sem OCR de texto, sem parser burro. Qualquer falha (sem chave, rede, JSON
 * inválido, imagem ilegível) vira { ok: false } → o cliente mostra a tela de
 * erro com opções de nova tentativa / colar código / preenchimento manual.
 */
export const extractReceipt = action({
  args: { image: v.string() },
  handler: async (_ctx, { image }): Promise<AiReceiptResult> => {
    const deadline = Date.now() + 30_000;
    const errors: string[] = [];

    // 1) Gateway VLY — chave automática do ambiente, sem setup do usuário.
    const vlyKey = process.env.VLY_INTEGRATION_KEY;
    if (vlyKey) {
      const attempt = await tryVly(image, vlyKey, deadline);
      if (attempt.ok) return attempt.result;
      errors.push(attempt.error);
    } else {
      errors.push("no-vly-key");
    }

    // 2) Google Gemini (modelo de visão com tier gratuito).
    const geminiKey = process.env.GOOGLE_API_KEY;
    if (geminiKey) {
      const attempt = await tryGemini(image, geminiKey, deadline);
      if (attempt.ok) return attempt.result;
      errors.push(attempt.error);
    } else {
      errors.push("no-gemini-key");
    }

    // 3) OpenAI direto (chave própria do usuário).
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const attempt = await tryOpenAI(image, openaiKey, deadline);
      if (attempt.ok) return attempt.result;
      errors.push(attempt.error);
    } else {
      errors.push("no-openai-key");
    }

    return { ok: false, items: [], error: errors.join("; ") || "no-provider" };
  },
});
