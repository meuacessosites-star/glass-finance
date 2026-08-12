import { useCallback } from "react";
import { useAppStore } from "@/lib/app-store";
import type { ScanCategory } from "@/lib/receipt-scan";

/**
 * Resolves a suggested category (from the receipt scanner or the voice
 * command): reuses the existing one when it matches by id or label, and
 * otherwise creates it automatically on the ACTIVE profile. Returns the
 * resolved id and whether a new category was created.
 */
export function useSuggestedCategory() {
  const { categories, addCategory } = useAppStore();

  return useCallback(
    (cat: ScanCategory): { id: string; created: boolean } => {
      const existing = categories.find(
        (c) =>
          c.id === cat.id ||
          c.label.toLowerCase() === cat.label.toLowerCase(),
      );
      if (existing) return { id: existing.id, created: false };
      const id = addCategory({
        label: cat.label,
        color: cat.color,
        icon: cat.icon,
      });
      return { id, created: true };
    },
    [categories, addCategory],
  );
}
