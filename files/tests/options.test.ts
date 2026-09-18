import { describe, expect, it } from "vitest";
import { optionStrings, optionsFrom, optionsText } from "@/components/office/helpers";

describe("select question options", () => {
  it("turns editor text into a clean array of strings", () => {
    expect(optionsFrom("Good\n Worn \n\nMissing\nGood\r\n")).toEqual(["Good", "Worn", "Missing"]);
    expect(optionsFrom("   \n\n")).toBeNull();
  });

  it("shows stored options one per line and ignores anything that is not a string", () => {
    expect(optionsText(["Good", "Worn"])).toBe("Good\nWorn");
    expect(optionStrings(["Good", 3, null, "", "Worn"])).toEqual(["Good", "Worn"]);
    expect(optionStrings({ a: 1 })).toEqual([]);
    expect(optionsText(null)).toBe("");
  });
});
