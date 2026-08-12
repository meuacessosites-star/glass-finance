// ---------------------------------------------------------------------------
// Parser do HTML das páginas de consulta de NFC-e (SEFAZ) — roda no backend
// (action Convex), nunca no navegador. Estratégia em camadas:
//   1) cheerio: seletores comuns dos portais (nome do estabelecimento, total,
//      data de emissão e a tabela de itens).
//   2) Regex no HTML bruto para os campos XML-ish embutidos (xNome/xFant,
//      dhEmi, vNF, xProd/qCom/uCom/vProd) quando os seletores não acham.
// Como cada estado tem um portal diferente (e alguns renderizam por JS), o
// resultado é sempre "best effort": ok=false → o cliente cai no fallback OCR.
// ---------------------------------------------------------------------------
import * as cheerio from "cheerio";
import { normalizeQtyLabel } from "../lib/purchase-format";

export type NfceItem = { name: string; qty: string; price: number };

export type NfceScrapeResult = {
  ok: boolean;
  store?: string;
  date?: string; // yyyy-mm-dd
  time?: string; // HH:MM
  total?: number;
  items: NfceItem[];
  error?: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const decodeHtml = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, (m) => {
      const c = parseInt(m.slice(2, -1), 10);
      return Number.isFinite(c) ? String.fromCharCode(c) : m;
    })
    .replace(/&[a-z]+;/gi, " ");

/** "R$ 1.234,56", "1234,56", "1.234.56" → 1234.56 (0 quando inválido). */
export function parseBRL(input: string): number {
  let t = clean(input).replace(/[^\d.,\-]/g, "");
  if (!t) return 0;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && hasDot) {
    // Ponto de milhar, vírgula decimal (pt-BR).
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    t = t.replace(",", ".");
  } else if (hasDot) {
    // "1.234" (um único ponto com 3 dígitos depois) é milhar pt-BR.
    const parts = t.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length === 3) t = t.replace(".", "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

const grabRe = (html: string, re: RegExp): string => {
  const m = html.match(re);
  return m ? clean(decodeHtml(m[1])) : "";
};

const STORE_SELECTORS = [
  "#nomeEstabelecimento",
  "#nomeEmpreendimento",
  "#xFant",
  "#xNome",
  ".xNome",
  ".xFant",
  ".fant",
  "#fant",
  "input[name='fant']",
  "input[name='xNome']",
  ".nome-empresa",
  "#nomeEmpresa",
];

function extractStore($: cheerio.CheerioAPI, html: string): string {
  for (const sel of STORE_SELECTORS) {
    const el = $(sel).first();
    if (!el.length) continue;
    const v = clean(el.is("input") ? (el.val() as string) ?? "" : el.text());
    if (v && v.length >= 3 && !/undefined|null/i.test(v)) return v.slice(0, 60);
  }
  const title = clean($("title").first().text());
  const t = title.replace(/^.*?[-–]\s*/, "").trim(); // "NFC-e - LOJA X"
  if (t && t.length >= 3 && !/nfc-e|nota fiscal/i.test(t)) return t.slice(0, 60);
  const og = $('meta[property="og:title"]').attr("content") ?? "";
  if (og && og.length >= 3) return clean(og).slice(0, 60);
  const x = grabRe(
    html,
    /(?:x(?:Fant|Nome))[^>]{0,120}>\s*([^<]{3,80})</i,
  );
  if (x) return x.slice(0, 60);
  return "";
}

function extractTotal($: cheerio.CheerioAPI, html: string): number {
  // Elementos com id/classe sugestivos de total.
  for (const sel of ["#totalNota", "#vNF", ".vNF", ".totalNota", "#valorTotal"]) {
    const v = clean($(sel).first().text());
    if (v) {
      const n = parseBRL(v);
      if (n > 0) return n;
    }
  }
  // Rótulo "VALOR TOTAL (R$)" com o valor na célula/linha ao lado/abaixo.
  const found: string[] = [];
  $("td, th, div, span, label, p, h1, h2, h3").each((_, el) => {
    const txt = clean($(el).text());
    if (/valor total|total da nota|total a pagar|^total$/i.test(txt) && txt.length < 40) {
      const row = $(el).closest("tr");
      const scope = row.length ? row : $(el).parent();
      scope.find("td, th, span, div, b, strong").each((_, c) => {
        const ct = clean($(c).text());
        if (/^[R$]?\s?[\d.,]{3,}$/.test(ct) && !/total/i.test(ct)) found.push(ct);
      });
    }
  });
  for (const f of found) {
    const n = parseBRL(f);
    if (n > 0) return n;
  }
  // Regex no HTML bruto (campos XML-ish / JSON embutidos).
  const r = grabRe(html, /(?:vNF|valorTotal|totalNota)["']?\s*[:=]\s*["']?\s*([\d.,]{3,})/i);
  if (r) {
    const n = parseBRL(r);
    if (n > 0) return n;
  }
  return 0;
}

function extractDate(html: string): { date: string; time: string } {
  const m = html.match(
    /dhEmi[^>]{0,120}>\s*(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/i,
  );
  if (m) {
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      time: `${m[4]}:${m[5]}`,
    };
  }
  const d = html.match(/\b(\d{2})\/(\d{2})\/(\d{4})[^\d]{0,20}(\d{2}):(\d{2})/);
  if (d) {
    return {
      date: `${d[3]}-${d[2]}-${d[1]}`,
      time: `${d[4]}:${d[5]}`,
    };
  }
  return { date: "", time: "" };
}

function extractItems($: cheerio.CheerioAPI, html: string): NfceItem[] {
  const items: NfceItem[] = [];
  // 1) Tabela com cabeçalho PRODUTO + QTD + VL. (UNIT./TOTAL).
  $("table").each((_, table) => {
    if (items.length) return; // só a primeira tabela de itens
    const $t = $(table);
    const rows = $t.find("tr");
    if (!rows.length) return;
    const cellsOf = (row: any): string[] =>
      row
        .find("td, th")
        .map((_: number, c: any) => clean($(c).text()))
        .get();
    const header = cellsOf(rows.first())
      .map((c) => c.toUpperCase())
      .join(" | ");
    if (!/PRODUTO|DESCRI|ITEM|DETALHE/.test(header)) return;
    const hc = cellsOf(rows.first());
    const idxName = hc.findIndex((c) => /PRODUTO|DESCRI|ITEM/.test(c.toUpperCase()));
    const idxQty = hc.findIndex((c) => /QTD/.test(c.toUpperCase()));
    const idxUnitTotal = hc.findIndex(
      (c) => /VL\.?\s*TOTAL|VALOR\s*TOTAL/.test(c.toUpperCase()),
    );
    // "VL. UNIT." é o PREÇO unitário (fallback quando não há coluna total);
    // a coluna de UNIDADE DE MEDIDA é a que tem cabeçalho curto (UNID./UND./KG).
    const idxUnitPrice = hc.findIndex(
      (c) => /UNIT/.test(c.toUpperCase()) && !/TOTAL/.test(c.toUpperCase()),
    );
    const idxMeasure = hc.findIndex((c) =>
      /^(UNID|UND|UN|CX|PCT|PC|KG|G|ML|L|LT|M|M2|M3|SC|DZ)\b/i.test(c.toUpperCase()),
    );
    rows.slice(1).each((_, row) => {
      const cs = cellsOf($(row));
      const name = cs[idxName] ?? "";
      if (name.length < 2 || /^(total|subtotal|desconto|troco|pagamento)/i.test(name)) return;
      const qtyRaw = idxQty >= 0 ? cs[idxQty] : "";
      const unitRaw = idxMeasure >= 0 ? cs[idxMeasure] : "";
      const priceRaw =
        (idxUnitTotal >= 0 ? cs[idxUnitTotal] : "") ||
        (idxUnitPrice >= 0 ? cs[idxUnitPrice] : "");
      const price = parseBRL(priceRaw);
      if (!(price > 0) && !/\d/.test(qtyRaw)) return;
      const qty = qtyLabel(qtyRaw, unitRaw);
      items.push({ name: name.slice(0, 80), qty, price });
    });
  });
  if (items.length) return items.slice(0, 30);
  // 2) Regex no HTML bruto para campos XML-ish (xProd/qCom/uCom/vProd).
  const re =
    /xProd[^>]*>\s*([^<]{2,120})<[\s\S]{0,400}?qCom[^>]*>\s*([\d.,]+)<[\s\S]{0,120}?uCom[^>]*>\s*([^<\s]{1,8})<[\s\S]{0,400}?vProd[^>]*>\s*([\d.,]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && items.length < 30) {
    const name = clean(decodeHtml(m[1]));
    const price = parseBRL(m[4]);
    if (name.length < 2 || /total|subtotal/i.test(name)) continue;
    const qty = qtyLabel(m[2], m[3]);
    items.push({ name: name.slice(0, 80), qty, price });
  }
  return items.slice(0, 30);
}

function qtyLabel(qtyRaw: string, unitRaw: string): string {
  const q = clean(qtyRaw);
  if (!q) return "";
  const u = clean(unitRaw);
  return normalizeQtyLabel(u ? `${q} ${u}` : q);
}

/** Raspa os dados da página de consulta da NFC-e. Nunca lança — qualquer
 * falha vira { ok: false } para o cliente cair no fallback de OCR. */
export function parseNfceHtml(html: string): NfceScrapeResult {
  try {
    const $ = cheerio.load(html);
    const store = extractStore($, html);
    const total = extractTotal($, html);
    const { date, time } = extractDate(html);
    const items = extractItems($, html);
    if (!store && !total && !items.length) {
      return { ok: false, items: [], error: "nenhum dado legível na página" };
    }
    return { ok: true, store, date, time, total: total || undefined, items };
  } catch (e) {
    return { ok: false, items: [], error: (e as Error).message ?? "parse-failed" };
  }
}
