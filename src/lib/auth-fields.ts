import { email as emailFormat } from "zod/mini";

export const USERNAME_PATTERN = "[a-zA-Z0-9_]{3,24}";
export const USERNAME_HELP = "Use de 3 a 24 letras sem acento, números ou sublinhados.";
const usernameFormat = new RegExp(`^${USERNAME_PATTERN}$`);
const emailAddress = emailFormat();

export function normalizeUsername(value: unknown) {
  if (typeof value !== "string" || !usernameFormat.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && emailAddress.safeParse(email).success ? email : null;
}

export function dashboardReturnTo(value: string | null, fallback = "/dashboard") {
  if (!value || !/^\/dashboard(?:[/?#]|$)/.test(value) || value.includes("\\")) return fallback;
  const base = "https://glass.invalid";
  const url = new URL(value, base);
  if (url.origin !== base || !/^\/dashboard(?:\/|$)/.test(url.pathname)) return fallback;
  return url.pathname + url.search + url.hash;
}
