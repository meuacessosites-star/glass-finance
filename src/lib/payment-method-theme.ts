import type { CSSProperties } from "react";

// Muted payment colors are separate from the bright category and status palette.
const tones: Record<string, string> = {
  pix: "border-[#9EC9BF] bg-[#DCEEEA] text-[#225E58] dark:border-[#35675C] dark:bg-[#183A35] dark:text-[#A7DCCD]",
  dinheiro: "border-[#BBC58A] bg-[#EBEFCF] text-[#59621D] dark:border-[#596642] dark:bg-[#30391B] dark:text-[#D1DCA2]",
  cartao: "border-[#D0BB77] bg-[#F3EACB] text-[#705B17] dark:border-[#746333] dark:bg-[#403619] dark:text-[#EAD49A]",
  boleto: "border-[#C6A0BA] bg-[#EEDFEA] text-[#713D63] dark:border-[#77516C] dark:bg-[#3E273A] dark:text-[#E3B4D0]",
  transferencia: "border-[#D6AE95] bg-[#F2E0D5] text-[#8A4B30] dark:border-[#7B5540] dark:bg-[#432D23] dark:text-[#EABCA1]",
  saldo: "border-[#BFA38D] bg-[#E9DCD1] text-[#6E4A32] dark:border-[#705540] dark:bg-[#372A21] dark:text-[#DAC1AA]",
};

export function paymentMethodTone(method: string): string {
  return tones[method] ?? tones.saldo;
}

export const cardPaymentTone = "border-[color:var(--card-payment-border)] bg-[var(--card-payment-bg)] text-[color:var(--card-payment-ink)] dark:border-[color:var(--card-payment-dark-border)] dark:bg-[var(--card-payment-dark-bg)] dark:text-[color:var(--card-payment-dark-ink)]";

type RGB = [number, number, number];
function rgb(value: string): RGB | undefined {
  const hex = value.trim().replace(/^#/, "");
  const full = /^[\da-f]{3}$/i.test(hex) ? hex.split("").map((digit) => digit + digit).join("") : hex;
  if (!/^[\da-f]{6}$/i.test(full)) return undefined;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as RGB;
}
function mix(color: RGB, base: RGB, weight: number): RGB {
  return color.map((channel, index) => Math.round(channel * weight + base[index] * (1 - weight))) as RGB;
}
function hex(color: RGB): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
function luminance(color: RGB): number {
  return color.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

/** Keep the saved card color intact and derive readable, distinct badge tones. */
export function cardPaymentStyle(cardColor: string, categoryColors: string[] = []): CSSProperties | undefined {
  const color = rgb(cardColor);
  if (!color) return undefined;
  const similarCategory = categoryColors.some((value) => {
    const category = rgb(value);
    return category && Math.hypot(...color.map((channel, index) => channel - category[index])) < 110;
  });
  const background = mix(color, [255, 255, 255], 0.13);
  const inkBase: RGB = [28, 18, 35];
  let weight = similarCategory ? 0.5 : 0.62;
  let ink = mix(color, inkBase, weight);
  while ((luminance(background) + 0.05) / (luminance(ink) + 0.05) < 4.5 && weight > 0) {
    weight = Math.max(0, weight - 0.05);
    ink = mix(color, inkBase, weight);
  }
  return {
    "--card-payment-bg": hex(background),
    "--card-payment-border": hex(mix(color, [255, 255, 255], similarCategory ? 0.55 : 0.45)),
    "--card-payment-ink": hex(ink),
    "--card-payment-dark-bg": hex(mix(color, [18, 24, 38], 0.25)),
    "--card-payment-dark-border": hex(mix(color, [32, 40, 56], 0.55)),
    "--card-payment-dark-ink": hex(mix(color, [255, 255, 255], 0.25)),
  } as CSSProperties;
}
