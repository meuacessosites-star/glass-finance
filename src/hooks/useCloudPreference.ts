import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";

/** Remembers actual interface choices, not form drafts, payments or open dialogs.
 * Cache is account-isolated; cloud state is authoritative between devices. */
export function useCloudPreference<T extends string>(key: string, fallback: T, legacyKey?: string) {
  const { user } = useAuth();
  const accountId = user?._id ? String(user._id) : null;
  const cacheKey = accountId ? `glass:preference:${accountId}:${key}` : "";
  const cached = useMemo(() => {
    if (!cacheKey) return null;
    try {
      const current = localStorage.getItem(cacheKey);
      if (current !== null) return current;
      const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
      if (legacy === "hidden") return "true";
      if (legacy === "visible") return "false";
      return legacy;
    } catch { return null; }
  }, [cacheKey, legacyKey]);
  const remote = useQuery(api.userPreferences.getMine, user?.username ? { key } : "skip");
  const save = useMutation(api.userPreferences.setMine).withOptimisticUpdate(
    (store, args) => {
      store.setQuery(api.userPreferences.getMine, { key: args.key }, args.value);
    }
  );
  const [pending, setPending] = useState<{ cacheKey: string; value: string } | null>(null);
  const currentValue = pending?.cacheKey === cacheKey ? pending.value : (remote ?? cached ?? fallback);
  // A local setting made before cloud storage existed is migrated exactly once.
  useEffect(() => {
    if (!user?.username || remote !== null || cached === null) return;
    void save({ key, value: cached }).catch(() => {
      console.warn("Não foi possível sincronizar a preferência antiga.");
    });
  }, [user?.username, remote, cached, key, save]);
  useEffect(() => {
    if (!cacheKey || remote === undefined || remote === null) return;
    try { localStorage.setItem(cacheKey, remote); } catch { /* Storage optional. */ }
    if (pending?.cacheKey === cacheKey && pending.value === remote) {
      setPending(null);
    }
  }, [remote, cacheKey, pending]);
  const setValue = useCallback((next: T) => {
    if (!cacheKey || !user?.username) return;
    setPending({ cacheKey, value: next });
    try { localStorage.setItem(cacheKey, next); } catch { /* Cloud remains authoritative. */ }
    void save({ key, value: next }).catch(() => {
      console.warn("Falha ao salvar uma preferência na nuvem.");
    });
  }, [cacheKey, user?.username, save, key]);
  return { value: currentValue as T, setValue, ready: remote !== undefined };
}
