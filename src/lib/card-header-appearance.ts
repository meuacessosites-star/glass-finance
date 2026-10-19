import type { AppCard } from "./app-store";
import { getInvoiceHeaderColor } from "./card-appearance";

type HeaderCard = Pick<AppCard, "id" | "color" | "institution" | "invoiceHeaderColorMode" | "archived">;
type Hsl = { h: number; s: number; l: number };
export type InvoiceHeaderAppearance = {
  top: string;
  middle: string;
  bottom: string;
  foreground: "#FFFFFF";
  background: string;
};

/** One opaque glass base for both the full card and its invoice strip. */
export function getCardGlassBackground(appearance: Pick<InvoiceHeaderAppearance, "background">): string {
  return `linear-gradient(90deg, rgba(16,24,40,0.48) 0%, rgba(16,24,40,0.42) 18%, rgba(16,24,40,0.14) 32%, transparent 48%), ${appearance.background}`;
}

function toHsl(hex: string): Hsl {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min, l = (max + min) / 2;
  if (!delta) return { h: 0, s: 0, l };
  const h = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: h * 60, s: delta / (1 - Math.abs(2 * l - 1)), l };
}

function fromHsl({ h, s, l }: Hsl): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

function similar(a: Hsl, b: Hsl): boolean {
  if (a.s < 0.12 && b.s < 0.12) return Math.abs(a.l - b.l) <= 0.22;
  const hueDistance = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  return hueDistance <= 20 && Math.abs(a.s - b.s) <= 0.3 && Math.abs(a.l - b.l) <= 0.22;
}

/** Display-only tones: preserve the chosen bank/card color and
 * distinguish similar active cards. Stable IDs prevent colors swapping on reorder. */
export function getInvoiceHeaderAppearances(cards: readonly HeaderCard[]): Record<string, InvoiceHeaderAppearance> {
  const active = cards.filter((card) => !card.archived)
    .map((card) => ({ card, hsl: toHsl(getInvoiceHeaderColor(card)) }))
    .sort((a, b) => a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0);
  const result: Record<string, InvoiceHeaderAppearance> = {};
  const visited = new Set<number>();
  for (let start = 0; start < active.length; start++) {
    if (visited.has(start)) continue;
    const group = [start];
    visited.add(start);
    for (let cursor = 0; cursor < group.length; cursor++) {
      for (let i = 0; i < active.length; i++) {
        if (!visited.has(i) && similar(active[group[cursor]].hsl, active[i].hsl)) {
          visited.add(i); group.push(i);
        }
      }
    }
    group.sort((a, b) => a - b);
    group.forEach((index, rank) => {
      const { card, hsl } = active[index];
      const offset = group.length > 1 ? 0.012 * rank / (group.length - 1) : 0;
      const lightness = Math.max(0, hsl.l - offset);
      const top = fromHsl({ ...hsl, l: Math.min(1, lightness + 0.055) });
      const middle = fromHsl({ ...hsl, l: lightness });
      const bottom = fromHsl({ ...hsl, l: Math.max(0, lightness - 0.025) });
      result[card.id] = { top, middle, bottom, foreground: "#FFFFFF", background: `linear-gradient(135deg, ${top} 0%, ${middle} 48%, ${bottom} 100%)` };
    });
  }
  return result;
}
