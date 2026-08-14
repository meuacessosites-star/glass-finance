"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Leitor de Comprovantes — Google Gemini via REST.
//
// O frontend envia uma imagem como data URL. Esta action remove o prefixo da
// data URL, envia somente o base64 em `inline_data` e devolve um contrato
// estável para a tela: { ok, store, date, time, total, items, error }.
//
// Os nomes de modelos do Gemini mudam e alguns aliases são descontinuados.
// Por isso, antes de gerar conteúdo, a action consulta `models.list` com a
// própria chave configurada e usa apenas modelos que anunciam
// `generateContent`. A lista local existe apenas como contingência caso a
// descoberta fique temporariamente indisponível.
// ---------------------------------------------------------------------------

export type ReceiptItem = { name: string; qty: string; price: number };

export type ReceiptResult = {
  ok: boolean;
  store?: string;
  date?: string; // yyyy-mm-dd (input date nativo)
  time?: string; // HH:MM
  total?: number;
  items: ReceiptItem[];
  error?: string;
};

type GeminiItem = { qtd?: number | string; produto?: string; valor?: number | string };
type GeminiReceipt = {
  estabelecimento?: string;
  valor_total?: number | string;
  data?: string;
  itens?: GeminiItem[];
};

type GeminiModel = {
  name?: string;
  supportedGenerationMethods?: string[];
};

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Ordem usada somente se a consulta de modelos não puder ser concluída.
 * `gemini-1.5-pro-latest` é mantido como fallback compatível para projetos
 * antigos; modelos efetivamente publicados pela chave sempre têm prioridade.
 */
const FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-pro-latest",
];

let modelCache: { expiresAt: number; models: string[] } | null = null;

/** Instrução para extrair somente campos que a tela já sabe consumir. */
const RECEIPT_PROMPT = [
  "Analise esta imagem de comprovante, recibo ou nota fiscal brasileira.",
  "Extraia somente informações que estejam visíveis na imagem; não invente dados.",
  "Retorne um único objeto JSON com exatamente esta estrutura:",
  '{ "estabelecimento": "Nome Fantasia limpo ou vazio", "valor_total": 0.00, "data": "DD/MM/AAAA ou vazio", "itens": [{ "qtd": "1", "produto": "Nome do produto", "valor": 0.00 }] }.',
  "Use números em valor_total e valor. Se um campo não puder ser identificado, use string vazia, 0 ou uma lista vazia conforme o tipo.",
].join(" ");

/** Schema aplicado pelo Gemini quando o modelo o suporta. */
const RECEIPT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    estabelecimento: { type: "string" },
    valor_total: { type: "number" },
    data: { type: "string" },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qtd: { type: "string" },
          produto: { type: "string" },
          valor: { type: "number" },
        },
        required: ["qtd", "produto", "valor"],
      },
    },
  },
  required: ["estabelecimento", "valor_total", "data", "itens"],
} as const;

const stripMarkdown = (value: string) =>
  value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

/** "1.234,56" / "1234.56" / "123,45" / 1234.5 → number (0 quando inválido). */
function parseNumber(input: unknown): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input !== "string") return 0;
  let value = input.replace(/[^\d.,-]/g, "");
  if (!value) return 0;
  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  if (hasComma && hasDot) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    value = value.replace(",", ".");
  } else if (hasDot) {
    const parts = value.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length === 3) value = value.replace(".", "");
  }
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "DD/MM/AAAA" (ou "AAAA-MM-DD") → "AAAA-MM-DD" para o input date. */
function toIsoDate(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const br = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

/** Normaliza o JSON devolvido pelo modelo na forma usada pela tela. */
function normalizeGemini(text: string): ReceiptResult {
  try {
    const parsed = JSON.parse(stripMarkdown(text)) as GeminiReceipt;
    const items: ReceiptItem[] = (Array.isArray(parsed.itens) ? parsed.itens : [])
      .slice(0, 30)
      .map((item) => ({
        name: String(item.produto ?? "").trim().slice(0, 80),
        qty: String(item.qtd ?? 1).trim() || "1",
        price: parseNumber(item.valor),
      }))
      .filter((item) => item.name.length >= 2 && !/total|subtotal/i.test(item.name));
    const store = String(parsed.estabelecimento ?? "").trim().slice(0, 120);
    const total =
      parseNumber(parsed.valor_total) ||
      items.reduce((sum, item) => sum + item.price, 0) ||
      undefined;

    if (!store && !total && !items.length) {
      return { ok: false, items: [], error: "nota-ilegivel" };
    }

    return {
      ok: true,
      store: store || undefined,
      date: toIsoDate(String(parsed.data ?? "")) || undefined,
      total: total || undefined,
      items,
    };
  } catch {
    return { ok: false, items: [], error: "json-invalido" };
  }
}

function withoutModelPrefix(name: string): string {
  return name.replace(/^models\//, "");
}

function isReceiptCapableModel(name: string): boolean {
  return (
    name.startsWith("gemini-") &&
    !/(?:embedding|aqa|tts|live|image|robotics|computer-use)/i.test(name)
  );
}

function modelPriority(name: string): number {
  const preferredIndex = FALLBACK_MODELS.indexOf(name);
  if (preferredIndex >= 0) return preferredIndex;
  if (/flash/i.test(name)) return 20;
  if (/pro/i.test(name)) return 30;
  return 40;
}

/**
 * Consulta os modelos que a chave atual realmente pode chamar. Isso evita a
 * dependência de um ID de modelo descontinuado e elimina o 404 recorrente.
 */
async function getAvailableModels(apiKey: string): Promise<string[]> {
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.models;

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return FALLBACK_MODELS;

    const payload = (await response.json()) as { models?: GeminiModel[] };
    const discovered = (payload.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => withoutModelPrefix(model.name ?? ""))
      .filter(isReceiptCapableModel)
      .sort((left, right) => modelPriority(left) - modelPriority(right));

    const models = [...new Set(discovered)];
    if (models.length) {
      modelCache = { models, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
      return models;
    }
  } catch {
    // A chamada de geração abaixo ainda terá os nomes de contingência.
  }

  return FALLBACK_MODELS;
}

function createRequestBody(
  mimeType: string,
  b64: string,
  includeSchema: boolean,
) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: RECEIPT_PROMPT },
          // O endpoint generateContent recebe imagem inline como base64 sem o
          // prefixo `data:` da URL de origem.
          { inline_data: { mime_type: mimeType, data: b64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      ...(includeSchema ? { responseSchema: RECEIPT_RESPONSE_SCHEMA } : {}),
    },
  };
}

async function generateWithModel(
  apiKey: string,
  model: string,
  mimeType: string,
  b64: string,
  includeSchema: boolean,
): Promise<{ response: Response; body: string }> {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequestBody(mimeType, b64, includeSchema)),
      signal: AbortSignal.timeout(60_000),
    },
  );
  return { response, body: await response.text() };
}

/**
 * Envia o payload multimodal a um modelo disponível. Em contas que ainda
 * expõem modelos antigos sem suporte a responseSchema, repete a mesma chamada
 * com JSON mode, preservando a instrução textual e o contrato do frontend.
 */
async function callGemini(
  apiKey: string,
  mimeType: string,
  b64: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const errors: string[] = [];
  const models = await getAvailableModels(apiKey);

  for (const model of models) {
    try {
      let attempt = await generateWithModel(apiKey, model, mimeType, b64, true);

      if (
        attempt.response.status === 400 &&
        /responseSchema|responseMimeType|schema/i.test(attempt.body)
      ) {
        attempt = await generateWithModel(apiKey, model, mimeType, b64, false);
      }

      if (!attempt.response.ok) {
        errors.push(
          `gemini ${model} → http ${attempt.response.status}${
            attempt.body ? `: ${attempt.body.slice(0, 180)}` : ""
          }`,
        );
        // Um modelo pode ser removido entre models.list e generateContent.
        // Para falhas de credencial ou limite, não adianta testar outro ID.
        if ([401, 403, 429].includes(attempt.response.status)) break;
        continue;
      }

      const data = JSON.parse(attempt.body) as GeminiResponse;
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("") ?? "";

      if (text.trim()) return { ok: true, text };

      const blocked =
        data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason;
      errors.push(`gemini ${model} → ${blocked ? `bloqueado (${blocked})` : "resposta-vazia"}`);
    } catch (error) {
      errors.push(`gemini ${model} → ${(error as Error).message || "falhou"}`);
    }
  }

  return { ok: false, error: errors.join(" | ") || "gemini-falhou" };
}

/**
 * Lê qualquer imagem de comprovante com Gemini e sempre devolve o contrato
 * ReceiptResult; erros de API nunca vazam como exceções para a interface.
 */
export const extractReceipt = action({
  args: { image: v.string() },
  handler: async (_ctx, { image }): Promise<ReceiptResult> => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { ok: false, items: [], error: "no-gemini-key" };
    }

    // O Google recebe somente os bytes base64. A regex ainda preserva o MIME
    // real da foto JPEG, PNG ou WebP produzida no navegador.
    const match = image.match(/^data:(image\/[\w.+-]+);base64,([^\s]+)$/i);
    if (!match) {
      return { ok: false, items: [], error: "imagem-invalida" };
    }

    const mimeType = match[1] as string;
    const b64 = match[2];
    const result = await callGemini(apiKey, mimeType, b64);
    if (!result.ok) {
      return { ok: false, items: [], error: result.error };
    }

    return normalizeGemini(result.text);
  },
});
