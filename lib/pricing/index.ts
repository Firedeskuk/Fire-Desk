/*
  Pricing rules from SPEC.md section 5.
  price = default x client adjustment x building adjustment, multiplied.
  Percentages are stored as "100 = no change", so 90 means minus 10 percent.
  Pure functions, no data access. The database computes the same numbers in
  quote_lines.calculated_price, this is for the screen before saving.
*/

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* Same formula as the generated column in quote_lines. */
export function calculatedPrice(
  defaultPrice: number,
  qty: number,
  clientPct: number,
  buildingPct: number,
): number {
  return roundMoney(defaultPrice * qty * (clientPct / 100) * (buildingPct / 100));
}

export function finalPrice(
  defaultPrice: number,
  qty: number,
  clientPct: number,
  buildingPct: number,
  overridePrice: number | null | undefined,
): number {
  if (overridePrice !== null && overridePrice !== undefined && !Number.isNaN(overridePrice)) {
    return roundMoney(overridePrice);
  }
  return calculatedPrice(defaultPrice, qty, clientPct, buildingPct);
}

/* Q-YYYY-NNNN, NNNN is the count of quotes so far plus one. */
export function quoteNumber(year: number, countSoFar: number): string {
  return `Q-${year}-${String(countSoFar + 1).padStart(4, "0")}`;
}

export function formatGBP(value: number | null | undefined): string {
  const n = value ?? 0;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

/* Percent input helper: keeps values sensible, 100 when empty or invalid. */
export function normalisePct(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 100);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return roundMoney(n);
}
