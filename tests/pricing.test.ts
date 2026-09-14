import { describe, expect, it } from "vitest";
import { calculatedPrice, finalPrice, formatGBP, normalisePct, quoteNumber } from "@/lib/pricing";

describe("pricing", () => {
  it("multiplies default by client and building percentages", () => {
    expect(calculatedPrice(100, 1, 90, 110)).toBe(99);
    expect(calculatedPrice(45, 2, 100, 100)).toBe(90);
    expect(calculatedPrice(33.33, 3, 95, 100)).toBe(94.99);
  });

  it("override wins when set", () => {
    expect(finalPrice(100, 1, 90, 110, null)).toBe(99);
    expect(finalPrice(100, 1, 90, 110, 80)).toBe(80);
    expect(finalPrice(100, 1, 90, 110, undefined)).toBe(99);
  });

  it("quote numbers are Q-YYYY-NNNN", () => {
    expect(quoteNumber(2026, 0)).toBe("Q-2026-0001");
    expect(quoteNumber(2026, 41)).toBe("Q-2026-0042");
  });

  it("formats pounds", () => {
    expect(formatGBP(99)).toBe("£99.00");
    expect(formatGBP(1234.5)).toBe("£1,234.50");
  });

  it("normalises percentages to 100 when empty or invalid", () => {
    expect(normalisePct("")).toBe(100);
    expect(normalisePct("abc")).toBe(100);
    expect(normalisePct(0)).toBe(100);
    expect(normalisePct("90")).toBe(90);
    expect(normalisePct(112.5)).toBe(112.5);
  });
});
