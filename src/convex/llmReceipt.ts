"use node";

// ---------------------------------------------------------------------------
// Refinamento do texto do OCR por LLM — o coração do fallback inteligente do
// Leitor de Notas. O Tesseract devolve texto BRUTO (cabeçalhos genéricos,
// CNPJ, endereços, chaves de acesso, colunas embaralhadas); este módulo manda
// esse texto para um LLM com um System Prompt rigoroso que:
//   1) ignora textos genéricos (Documento Auxiliar, NFC-e, CNPJ, DANFE…);
//   2) encontra o NOME FANTASIA real e os PRODUTOS reais;
//   3) devolve JSON estruturado aplicando a lógica condicional de Descrição
//      (1–2 itens → qtd + nome; 3+ → categoria) e Rascunho (nome da loja +
//      lista limpa de itens).
// A chamada vai pelo gateway VLY (endpoint OpenAI-compatível com a chave
// automática do ambiente) — sem depender de nenhuma chave extra do usuário.
// ---------------------------------------------------------------------------
import { action } from "./_generated/server";
import { v } from "convex/values";
import { normalizeQtyLabel } from "../lib/purchase-format";
import { parseGeminiJson } from "./aiVision";
import type { NfceScrapeResult } from "./nfceParser";

export type LlmReceiptResult = NfceScrapeResult & {
  type?: "income" | "expense";
  paymentMethod?: string;
  /** Descrição já aplicando a regra condicional (o cliente valida e usa). */
  description?: string;
  /** Rascunho já formatado (Estabelecimento + lista de itens). */
  draft?: string;
};

const SYSTEM_PROMPT = `Você é um processador de texto de notas fiscais brasileiras (NFC-e, cupom fiscal, comprovante Pix/depósito) extraído por OCR. Sua tarefa é transformar o texto BRUTO e impreciso do OCR em dados estruturados e CORRETOS.

REGRAS OBRIGATÓRIAS:
1. IGNORE textos genéricos de cabeçalho e rodapé: "Documento Auxiliar", "Nota Fiscal de Consumidor Eletrônica", "NFC-e", "NF-e", "DANFE", "CUPOM FISCAL", "CNPJ", "CPF", endereços, telefones, e-mails, sites, chaves de acesso (44 dígitos), protocolos, "SAC", "Ouvidoria", "Atendimento ao cliente", "Agradecemos a preferência", "Origem e destino", "Instituição de Pagamento". NUNCA use esses textos como nome do estabelecimento.
2. Nome do estabelecimento: use o NOME FANTASIA real da loja (ex.: "Centro de Jardinagem Junkes", "Pão de Açúcar"). Sem CNPJ, sem endereço, sem razão social se houver nome fantasia.
3. Produtos: liste TODOS os itens legíveis com quantidade, unidade e preço. Não invente nomes, não invente números, não adivinhe caracteres borrados. Ignore códigos numéricos longos, códigos de barras e códigos de produto sem nome.
4. Comprovante de depósito/Pix recebido → "type": "income"; pagamento/compra → "expense".
5. Forma de pagamento: "pix", "dinheiro", "cartao", "credito", "debito", "boleto" ou "transferencia" se o texto disser; senão null.
6. Descrição (aplique a lógica condicional):
   - 1 ou 2 itens → quantidade + nome do produto (ex.: "1x Pimenta CH", "2x Arroz 5kg").
   - 3 ou mais itens → categoria geral inteligente (ex.: "Mercado", "Farmácia", "Restaurante", "Café").
   - Comprovante de Pix/depósito → "Pix recebido de {pessoa/estabelecimento}" (receita) ou "Pix enviado para {pessoa/estabelecimento}" (despesa).
7. Rascunho: na primeira linha "Estabelecimento: {nome fantasia}", depois UMA linha por item no formato "Quantidade x Nome - R$ Valor" (ex.: "1x Pimenta CH - R$ 13,20", "2x Arroz 5kg - R$ 24,90").
8. Total: só use valores claramente rotulados como TOTAL / VALOR TOTAL / TOTAL A PAGAR. Nunca some itens nem adivinhe valores.

Responda SOMENTE com JSON válido, sem markdown, neste formato exato:
{
  "ok": true,
  "store": "nome fantasia" | null,
  "total": 123.45 | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "type": "income" | "expense" | null,
  "paymentMethod": "pix" | "dinheiro" | "cartao" | "credito" | "debito" | "boleto" | "transferencia" | null,
  "items": [ { "name": "produto", "qty": "1", "unit": "UN" | "KG" | null, "price": 13.20 | null } ],
  "description": "a descrição aplicando a regra 6",
  "draft": "o rascunho aplicando a regra 7"
}
Se o texto não contiver uma nota, cupom ou comprovante legível, responda apenas { "ok": false }.`;

function toNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Converte o JSON do modelo no formato do app (itens normalizados). */
function mapLlmResult(obj: Record<string, unknown>): LlmReceiptResult {
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
  const description = typeof obj.description === "string" ? obj.description.trim() : undefined;
  const draft = typeof obj.draft === "string" ? obj.draft.trim() : undefined;
  return {
    ok: obj.ok === true || items.length > 0,
    store: obj.store ? String(obj.store).slice(0, 60) : undefined,
    date: obj.date ? String(obj.date).slice(0, 10) : undefined,
    time: obj.time ? String(obj.time).slice(0, 5) : undefined,
    total: toNumber(obj.total) ?? undefined,
    type,
    paymentMethod: validMethod,
    description,
    draft,
    items,
  };
}

/**
 * Refina o texto bruto do OCR com um LLM (gpt-4o-mini via gateway VLY) e
 * devolve os dados estruturados. Qualquer falha (sem chave, rede, JSON
 * inválido) vira { ok: false } — o cliente cai no parser local conservador.
 */
export const refineReceiptText = action({
  args: { text: v.string() },
  handler: async (_ctx, { text }): Promise<LlmReceiptResult> => {
    const trimmed = text.trim().slice(0, 8000);
    if (!trimmed) {
      return { ok: false, items: [], error: "empty-text" };
    }
    const key = process.env.VLY_INTEGRATION_KEY;
    if (!key) {
      return { ok: false, items: [], error: "no-key" };
    }
    try {
      // Endpoint OpenAI-compatível do gateway VLY (o mesmo usado pelo pacote
      // @vly-ai/integrations: base + /chat/completions).
      const res = await fetch(
        "https://integrations.vly.ai/v1/llm/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.1,
            max_tokens: 1500,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Texto extraído por OCR da imagem (pode conter erros do OCR — use só o que estiver claro):\n\n${trimmed}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      if (!res.ok) {
        return { ok: false, items: [], error: `llm http ${res.status}` };
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const obj = parseGeminiJson(raw);
      if (!obj || obj.ok === false) {
        return { ok: false, items: [], error: "llm-rejected" };
      }
      const mapped = mapLlmResult(obj);
      if (!mapped.store && !mapped.total && !mapped.items.length) {
        return { ok: false, items: [], error: "llm-empty" };
      }
      return mapped;
    } catch (e) {
      return {
        ok: false,
        items: [],
        error: (e as Error).message ?? "llm-failed",
      };
    }
  },
});
