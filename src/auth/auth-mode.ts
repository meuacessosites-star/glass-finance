import type { AppAuthMode } from "./auth-runtime";

const overrideKey = "glass-finance-auth-mode";
const viteEnv = import.meta.env ?? {};
export const firebaseAuthEnabledByDefault = viteEnv.VITE_AUTH_PROVIDER === "firebase";

function resolveAuthMode(): AppAuthMode {
  const defaultMode: AppAuthMode = firebaseAuthEnabledByDefault ? "firebase" : "convex";
  if (typeof window === "undefined") return defaultMode;
  try {
    const requested = new URLSearchParams(window.location.search).get("auth");
    if (requested === "legacy") window.localStorage.setItem(overrideKey, "convex");
    if (requested === "firebase") window.localStorage.setItem(overrideKey, "firebase");
    const saved = window.localStorage.getItem(overrideKey);
    if (saved === "convex" || saved === "firebase") return saved;
  } catch {
    // Se o armazenamento local não estiver disponível, use a configuração padrão.
  }
  return defaultMode;
}

export const appAuthMode = resolveAuthMode();
