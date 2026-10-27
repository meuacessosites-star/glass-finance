/** Convert a finite decimal amount to integer cents without IEEE-754 addition drift. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new RangeError("O valor monetário precisa ser finito");

  const source = amount.toString().toLowerCase();
  const negative = source.startsWith("-");
  const unsigned = negative ? source.slice(1) : source;
  const [coefficient, exponentText] = unsigned.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [integerPart, fractionPart = ""] = coefficient.split(".");
  const digitsText = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "");
  const digits = BigInt(digitsText || "0");
  const centsScale = 2 + exponent - fractionPart.length;

  let absoluteCents: bigint;
  if (centsScale >= 0) {
    absoluteCents = digits * 10n ** BigInt(centsScale);
  } else {
    const divisor = 10n ** BigInt(-centsScale);
    // Round half up at the exact decimal midpoint (and symmetrically away from zero).
    absoluteCents = (digits + divisor / 2n) / divisor;
  }
  const signedCents = negative ? -absoluteCents : absoluteCents;
  const result = Number(signedCents);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("O valor ultrapassa a precisão monetária segura");
  }
  return result;
}

export function fromCents(cents: number): number {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("Os centavos precisam ser um inteiro seguro");
  }
  return cents / 100;
}

export function sumCents(amounts: readonly number[]): number {
  let total = 0n;
  for (const amount of amounts) total += BigInt(toCents(amount));
  const result = Number(total);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("A soma ultrapassa a precisão monetária segura");
  }
  return result;
}
