import type { AppCard, ProfileData } from "./app-store";

export type InvoiceCardDisplayMode = "expanded" | "collapsed";

export function sanitizeInvoiceCardDisplayMode(value: unknown): InvoiceCardDisplayMode | undefined {
  return value === "expanded" || value === "collapsed" ? value : undefined;
}

export function setInvoiceCardDisplayPreference(data: ProfileData, value: unknown): ProfileData {
  const mode = sanitizeInvoiceCardDisplayMode(value);
  return !mode || data.invoiceCardDisplayMode === mode ? data : { ...data, invoiceCardDisplayMode: mode };
}

/** Manual changes last for this page visit. An explicit initial mode takes
 * precedence over legacy per-card state; older profiles retain it until chosen. */
export function isInvoiceCardExpanded(card: Pick<AppCard, "id" | "invoiceCollapsed">, mode: InvoiceCardDisplayMode | undefined, overrides: Readonly<Record<string, boolean>> = {}): boolean {
  const manual = overrides[card.id];
  if (typeof manual === "boolean") return manual;
  return mode ? mode === "expanded" : !card.invoiceCollapsed;
}
