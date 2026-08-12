// ---------------------------------------------------------------------------
// OCR local (Tesseract.js) — o último elo do fallback do Leitor de Notas.
// Quando o QR não decodifica e a visão por IA (Gemini) não está configurada
// ou falha, o texto do cupom é lido no navegador com os assets locais de
// /public/tesseract e /public/tessdata (nada de CDN).
//
// Regra de Ouro: não inventar números, não adivinhar caracteres borrados e
// ignorar códigos numéricos longos/chaves de acesso — extrair só o texto
// legível e útil (loja, total, data e itens com quantidade + preço). O
// usuário revisa tudo na tela de aprovação antes de salvar.
//
// O resultado é compatível com o formato do scrape da SEFAZ (NfceScrapeResult),
// então o mesmo `applyScraped` (Descrição/Rascunho com as regras universais)
// preenche o formulário.
// ---------------------------------------------------------------------------
import { createWorker } from "tesseract.js";
import type { PSM, Worker } from "tesseract.js";
import { normalizeQtyLabel } from "./purchase-format";
import { parseBrl } from "./receipt-scan";

export type OcrItem = { name: string; qty: string; price: number };

export type OcrReceiptResult = {
  ok: boolean;
  store?: string;
  date?: string; // yyyy-mm-dd
  time?: string; // HH:MM
  total?: number;
  items: OcrItem[];
  /** "income" quando o texto deixa claro (depósito/Pix recebido), "expense"
   * quando é pagamento/Pix enviado — indefinido se o texto é ambíguo. */
  kind?: "income" | "expense";
  paymentMethod?: string;
  error?: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Worker Tesseract — criado uma única vez e reutilizado (o primeiro uso
// carrega o core wasm local; os seguintes são rápidos).
// ---------------------------------------------------------------------------

let progressCb: ((label: string) => void) | undefined;
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("por", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
      langPath: "/tessdata",
      gzip: true,
      logger: (m) => {
        if (m.status !== "recognizing text") return;
        const pct = Math.floor(m.progress * 100);
        if (pct % 5 === 0) progressCb?.(`Lendo o texto do cupom… ${pct}%`);
      },
    })
      .then(async (worker) => {
        await worker.setParameters({
          // Coluna única de texto — cupom fiscal tem linhas de tamanhos
          // variados (nome da loja grande, itens menores, preços à direita).
          tessedit_pageseg_mode: "4" as unknown as PSM,
          preserve_interword_spaces: "1",
        });
        return worker;
      })
      .catch((e) => {
        workerPromise = null;
        throw e;
      });
  }
  return workerPromise;
}

/** Roda o OCR no navegador e devolve o texto cru (ou "" em qualquer falha —
 * nunca lança). `onProgress` recebe rótulos curtos em português. */
export async function ocrReceipt(
  dataUrl: string,
  onProgress?: (label: string) => void,
): Promise<string> {
  try {
    const worker = await getWorker();
    progressCb = onProgress;
    const { data } = await worker.recognize(dataUrl);
    return typeof data.text === "string" ? data.text : "";
  } catch {
    return "";
  } finally {
    progressCb = undefined;
  }
}

// ---------------------------------------------------------------------------
// Parser conservador do texto do cupom (Regra de Ouro: só o que está claro).
// ---------------------------------------------------------------------------

const ACCESS_KEY = /(?:\d[-\s]?){44}/;
const CNPJ_CPF =
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b(?:cnpj|cpf)\s*[:.]?\s*\d+/i;

/** Linhas que nunca são item nem loja (cabeçalhos, formas de pagamento,
 * seções de comprovante bancário). */
const NOISE_LINE =
  /^(produto|descricao|descrição|qtd|qtde|quant|quantidade|un|und|valor|total|subtotal|desconto|troco|pagamento|dinheiro|cartao|cr[ée]dito|d[ée]bito|pix|boleto|chave|protocolo|serie|numero|n[ºo]?\.|nota|cupom|data|hor|emiss|imposto|icms|pis|cofins|cfe|danfe|sada|observa|telefone|fone|cel|endereco|cep|site|www|sac|ouvidoria|atendimento|estabelecimento|razao|fantasia|cnpj|cpf|ie\b|inscricao|contador|origem|destino|favorecido|recebedor|pagador|beneficiario|operacao|operação|transacao|transação|instituicao|instituição|agencia|agência|conta|banco|deposit|depósito|comprovante|extrato)/i;

const STORE_BLOCK =
  /nota fiscal|danfe|nfc-e|nf-e|documento auxiliar|cupom fiscal|comprovante de|extrato banc|instituicao de|instituição de|id da transacao|n[ºo]?\.?\s*de\s+(operacao|transacao)/i;

function extractStore(lines: string[]): string {
  const candidates: string[] = [];
  for (const line of lines) {
    if (candidates.length >= 4) break;
    if (NOISE_LINE.test(line)) continue;
    if (STORE_BLOCK.test(line)) continue;
    if (CNPJ_CPF.test(line)) continue;
    if (ACCESS_KEY.test(line)) continue;
    if (/^\d{2}\/\d{2}\/\d{2,4}/.test(line)) continue;
    if (/^\d{1,4}\s*[/\-]\s*\d/.test(line)) continue; // artefato de endereço/OCR
    if (/\b\d{1,3}(?:\.\d{3})*,\d{2}\s*$/.test(line)) continue; // linha de preço
    const letters = line.replace(/[^a-zà-ú]/gi, "").length;
    if (letters < 4) continue;
    candidates.push(line);
  }
  if (!candidates.length) return "";
  // O nome do estabelecimento costuma ser a linha com mais letras no topo.
  const best = [...candidates].sort(
    (a, b) =>
      b.replace(/[^a-zà-ú]/gi, "").length - a.replace(/[^a-zà-ú]/gi, "").length,
  )[0];
  return best
    .replace(/^[\d\s\-.–|/:]+/, "")
    .replace(/["'“”]/g, "")
    .trim()
    .slice(0, 60);
}

function extractTotal(lines: string[]): number | undefined {
  let total: number | undefined;
  for (const line of lines) {
    // Só aceita o total quando a linha menciona total/valor — nada de chute.
    if (!/total|valor/i.test(line)) continue;
    const m = line.match(
      /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\b/,
    );
    if (!m) continue;
    const n = parseBrl(m[1]);
    if (n > 0) total = n; // a última linha com "total" vence (TOTAL vem depois)
  }
  return total;
}

/** Extrai os itens: linhas com um preço BRL no fim e um nome legível. A
 * quantidade no início vira "1x"/"1 kg" (normalizado) quando presente. */
function extractItems(lines: string[]): OcrItem[] {
  const items: OcrItem[] = [];
  for (const line of lines) {
    if (items.length >= 30) break;
    const l = clean(line);
    if (l.length < 4) continue;
    if (/^\d{2}\/\d{2}\/\d{2,4}/.test(l)) continue;
    if (CNPJ_CPF.test(l)) continue;
    if (ACCESS_KEY.test(l)) continue;
    if (/chave de acesso|protocolo|consulta|n[ºo]?\.?\s*(serie|numero)/i.test(l))
      continue;
    if (NOISE_LINE.test(l)) continue;
    const priceMatch = l.match(
      /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/,
    );
    if (!priceMatch) continue;
    const price = parseBrl(priceMatch[1]);
    if (!(price > 0)) continue;
    let body = l.slice(0, priceMatch.index ?? l.length).trim();
    body = body.replace(/^[\s\-–—:.]*/, "").replace(/[-\s]*$/, "").trim();
    if (body.length < 2) continue;
    if (NOISE_LINE.test(body)) continue;
    // Quantidade: no início ("2x", "1 UN", "0,500 KG"), número puro no
    // início ("1 ARROZ") ou DEPOIS do nome ("ARROZ 1") — o formato comum
    // dos cupons tem a quantidade entre o produto e o preço.
    let qty = "";
    const qm = body.match(
      /^(\d{1,3}(?:[.,]\d+)?)\s*(x|un|und|unid|unidade|cx|pct|pac|pacote|pc|pç|ct|dz|kg|g|ml|l|lt|m2|m²|m3|m³)\b/i,
    );
    if (qm) {
      qty = normalizeQtyLabel(`${qm[1]} ${qm[2]}`);
      body = body.slice(qm[0].length).trim().replace(/^[\s\-–—:.]*/, "").trim();
    } else {
      const bare = body.match(/^(\d{1,3})\s+/);
      const rest = bare ? body.slice(bare[0].length) : "";
      if (bare && rest && !/\d/.test(rest) && /[a-zà-ú]{3}/i.test(rest)) {
        qty = normalizeQtyLabel(bare[1]);
        body = rest.trim();
      }
    }
    if (!qty) {
      const tm = body.match(/\s+(\d{1,2})$/);
      if (tm) {
        const rest = body.slice(0, tm.index).trim();
        if (/[a-zà-ú]{3}/i.test(rest)) {
          qty = normalizeQtyLabel(tm[1]);
          body = rest;
        }
      }
    }
    if (body.length < 2) continue;
    if (/^\d+$/.test(body)) continue; // preço sem nome de produto
    items.push({ name: body.slice(0, 60), qty, price });
  }
  return items;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5,
  junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11,
  dezembro: 12,
};

function extractDate(text: string): { date?: string; time?: string } {
  // dd/mm/yyyy ou dd/mm/yy
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const yy = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return {
      date: `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      time: extractTime(text, m[0]),
    };
  }
  // "8/agosto/2026" ou "8 de agosto de 2026" (comprovantes)
  const mn =
    text.match(/\b(\d{1,2})\/([a-zç]{3,9})\/(\d{4})\b/i) ??
    text.match(/\b(\d{1,2})\s+de\s+([a-zç]{3,9})\s+de\s+(\d{4})\b/i);
  if (mn) {
    const month = MONTHS[mn[2].toLowerCase()];
    if (month) {
      const token = `${mn[1]}/${mn[2]}/${mn[3]}`;
      return {
        date: `${mn[3]}-${String(month).padStart(2, "0")}-${mn[1].padStart(2, "0")}`,
        time: extractTime(text, token),
      };
    }
  }
  return {};
}

function extractTime(text: string, dateToken: string): string | undefined {
  const escaped = dateToken.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`${escaped}[^\\d]{0,14}(\\d{1,2}):(\\d{2})`);
  const m = text.match(re);
  if (!m) return undefined;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
    return `${h.toString().padStart(2, "0")}:${m[2]}`;
  }
  return undefined;
}

/** Heurística leve para comprovantes: depósito/Pix recebido → receita;
 * pagamento/Pix enviado → despesa; forma de pagamento quando o texto diz. */
function detectKind(text: string): {
  kind?: "income" | "expense";
  paymentMethod?: string;
} {
  const t = text.toLowerCase();
  const income =
    /dep[óo]sito|recebido|recebimento|transfer[eê]ncia recebida|pix recebido|cr[ée]dito em conta|pagamento recebido|estorno|entrada de dinheiro/.test(
      t,
    );
  const expense =
    /enviado|pagamento (realizado|efetuado|aprovado)|transfer[eê]ncia enviada|pix enviado|d[ée]bito em conta|compra/.test(
      t,
    );
  let paymentMethod: string | undefined;
  if (/pix/.test(t)) paymentMethod = "pix";
  else if (/dinheiro|esp[ée]cie/.test(t)) paymentMethod = "dinheiro";
  else if (/cart[aã]o|cr[ée]dito|d[ée]bito/.test(t)) paymentMethod = "cartao";
  else if (/boleto/.test(t)) paymentMethod = "boleto";
  else if (/transfer[eê]ncia|\bted\b|\bdoc\b/.test(t))
    paymentMethod = "transferencia";
  return {
    kind: income ? "income" : expense ? "expense" : undefined,
    paymentMethod,
  };
}

/** Interpreta o texto do OCR num resultado compatível com o app. Nunca lança:
 * sem dados legíveis → { ok: false }. */
export function parseReceiptText(raw: string): OcrReceiptResult {
  const lines = raw
    .split("\n")
    .map(clean)
    .filter((l) => l.length > 0);
  if (!lines.length) {
    return { ok: false, items: [], error: "empty" };
  }
  const store = extractStore(lines);
  const total = extractTotal(lines);
  const { date, time } = extractDate(lines.join(" "));
  const items = extractItems(lines);
  const { kind, paymentMethod } = detectKind(raw);
  const hasData = Boolean(store || total || items.length || date);
  if (!hasData) {
    return { ok: false, items: [], error: "no-data" };
  }
  return { ok: true, store, date, time, total, items, kind, paymentMethod };
}
