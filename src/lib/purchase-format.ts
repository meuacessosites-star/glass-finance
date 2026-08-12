// ---------------------------------------------------------------------------
// Regras universais de preenchimento do Leitor de Notas (valem para o
// scraping via QR/SEFAZ E para o fallback de OCR):
//   1. Descrição: 3+ itens → categoria geral (Mercado/Farmácia/Restaurante);
//      1–2 itens → quantidade x nome do produto ("1x Pimenta CH").
//   2. Rascunho: "Estabelecimento: {nome}" no topo + lista
//      "Quantidade x Nome - R$ Valor" de cada item.
// Este módulo é puro (sem dependências de UI/backend) para poder rodar no
// cliente e nas actions do Convex.
// ---------------------------------------------------------------------------

export type PurchaseItem = { name: string; qty: string; price: number };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** "1 un" → "1x", "1,5 kg" → "1,5 kg", "" → "". Unidades de contagem viram
 * "x" (1x, 2x); peso/volume/medida mantêm a unidade. */
export function normalizeQtyLabel(qty: string): string {
  const t = qty.trim();
  const m = t.match(/^([\d.,]+)\s*([a-zçáàâãéêíóôõúü0-9²³]*)$/i);
  if (!m || !m[1]) return t;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return t;
  const numStr = Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const unit = (m[2] ?? "").toLowerCase();
  const COUNT = new Set([
    "un", "und", "unid", "unidade", "qtd", "qtde", "x", "cx", "pct", "pac",
    "pacote", "pc", "pç", "ct", "unidade", "duz", "dz",
  ]);
  if (!unit || COUNT.has(unit)) return `${numStr}x`;
  const UNITS: Record<string, string> = {
    kg: "kg", g: "g", gr: "g", mg: "mg", ml: "ml", l: "l", lt: "l",
    m: "m", mt: "m", m2: "m²", m3: "m³", sc: "sc", saca: "sc", ton: "t",
  };
  return `${numStr} ${UNITS[unit] ?? unit}`;
}

/** Classifica a compra pela lista de itens + nome do estabelecimento.
 * Retorna o rótulo para a Descrição e o id de categoria do app ("" quando a
 * classificação não é confiável — aí não se mexe na categoria). */
export function classifyPurchase(
  items: PurchaseItem[],
  storeName = "",
): { label: string; categoryId: string } {
  const text = norm([storeName, ...items.map((i) => i.name)].join(" "));
  const PHARMACY =
    /farmac|remedi|paracetamol|dipirona|ibuprofen|vitamin|pomada|xarope|curativo|colirio|analgesic|antitermic|antibiot|anti[- ]?inflam|protetor solar|soro|alergi|enxaqueca|dor de cabeca|termometro|tensiometro|higiene bucal|enxaguante/i;
  const RESTAURANT =
    /restaurante|lanch|pizza|hamburguer|hamburger|refeicao|marmita|pastel|acai|comida|prato (feito|do dia)|self[- ]?service|japa|sushi|sashimi|dogao|cachorro quente|churrasco|feijoada|espetinho|lasanha|strogonoff|salada (pronta|de frutas)|salgado assado|risoto/i;
  const MARKET =
    /mercado|supermercado|hipermercado|hortifruti|arroz|feijao|leite|pao|pão|cafe|café|carne|frango|peixe|verdura|legume|fruta|banana|tomate|cebola|alho|batata|mandioca|macarrao|oleo|acucar|sal|farinha|fuba|sabao|detergente|sabonete|shampoo|condicionador|refrigerante|suco|biscoito|chocolate|cerveja|agua (mineral|tonica|de coco)|limpeza|frios|laticinio|iogurte|queijo|presunto|margarina|ovo|molho|tempero|enlatado|conserva|fralda|papel higienico|guardanapo|esponja|saco de lixo|amaciante|desodorante|creme dental|pasta de dente|feijoada pronta|torrada|granola|aveia|nescau|achocolatado/i;
  if (PHARMACY.test(text)) return { label: "Farmácia", categoryId: "saude" };
  if (RESTAURANT.test(text)) return { label: "Restaurante", categoryId: "alimentacao" };
  if (MARKET.test(text)) return { label: "Mercado", categoryId: "alimentacao" };
  // Sem palavras-chave: usa o nome da loja quando ele entrega o tipo.
  const s = norm(storeName);
  if (/farmac/i.test(s)) return { label: "Farmácia", categoryId: "saude" };
  if (/restaurante|lanch|pizza|bar e|conveniencia/i.test(s))
    return { label: "Restaurante", categoryId: "alimentacao" };
  if (/mercado|supermercado|hortifruti|emporio|atacado/i.test(s))
    return { label: "Mercado", categoryId: "alimentacao" };
  return { label: storeName || "Compras", categoryId: "" };
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Regra 1 — Descrição: 3+ itens → categoria geral; 1–2 itens → quantidade e
 * nome do PRIMEIRO produto; sem itens → o fallback (nome da loja / título). */
export function describePurchase(
  items: PurchaseItem[],
  storeName = "",
  fallback = "",
): string {
  if (items.length === 0) return fallback || storeName;
  if (items.length >= 3) return classifyPurchase(items, storeName).label;
  const it = items[0];
  const q = normalizeQtyLabel(it.qty);
  return `${q ? q + " " : ""}${it.name}`.trim().slice(0, 60);
}

/** Regra 2 — Rascunho: "Estabelecimento: {nome}" no topo e abaixo a lista
 * limpa "Quantidade x Nome - R$ Valor". */
export function draftPurchase(storeName: string, items: PurchaseItem[]): string {
  const lines: string[] = [];
  if (storeName.trim()) lines.push(`Estabelecimento: ${storeName.trim()}`);
  for (const it of items.slice(0, 12)) {
    const q = normalizeQtyLabel(it.qty);
    lines.push(`${q ? q + " " : ""}${it.name} - ${brl(it.price)}`.trim());
  }
  if (!lines.length) return "";
  let out = lines.join("\n");
  if (out.length > 600) out = out.slice(0, 597) + "…";
  return out;
}
