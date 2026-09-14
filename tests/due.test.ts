import { describe, expect, it } from "vitest";
import {
  buildingTone,
  daysOverdue,
  dueTone,
  isDue,
  isDueWithin,
  isSensibleDate,
  provisionalNextDue,
} from "@/lib/due";

const now = new Date("2026-09-13T12:00:00Z");

describe("due dates and colours", () => {
  it("counts days overdue", () => {
    expect(daysOverdue("2026-09-13", now)).toBe(0);
    expect(daysOverdue("2026-09-01", now)).toBe(12);
    expect(daysOverdue("2026-10-01", now)).toBe(-18);
    expect(daysOverdue(null, now)).toBeNull();
  });

  it("red after 14 days, yellow from 1 to 14, green before, grey without a date", () => {
    expect(dueTone("2026-08-01", now)).toBe("red");
    expect(dueTone("2026-08-29", now)).toBe("red");
    expect(dueTone("2026-08-30", now)).toBe("yellow");
    expect(dueTone("2026-09-12", now)).toBe("yellow");
    expect(dueTone("2026-09-13", now)).toBe("green");
    expect(dueTone("2026-12-01", now)).toBe("green");
    expect(dueTone(null, now)).toBe("grey");
  });

  it("due means today or overdue, due within counts the next 30 days", () => {
    expect(isDue("2026-09-13", now)).toBe(true);
    expect(isDue("2026-09-14", now)).toBe(false);
    expect(isDueWithin("2026-10-10", 30, now)).toBe(true);
    expect(isDueWithin("2026-10-20", 30, now)).toBe(false);
  });

  it("building pill: red beats yellow beats orange beats green", () => {
    expect(buildingTone({ dueDates: ["2026-08-01", "2026-12-01"], remedialInProgress: 3 }, now)).toBe("red");
    expect(buildingTone({ dueDates: ["2026-09-10", "2026-12-01"], remedialInProgress: 3 }, now)).toBe("yellow");
    expect(buildingTone({ dueDates: ["2026-12-01"], remedialInProgress: 1 }, now)).toBe("orange");
    expect(buildingTone({ dueDates: ["2026-12-01", null], remedialInProgress: 0 }, now)).toBe("green");
    expect(buildingTone({ dueDates: [], remedialInProgress: 0 }, now)).toBe("green");
  });

  it("provisional next due adds the cycle in months and clamps the day", () => {
    expect(provisionalNextDue("2026-09-13T10:00:00Z", 6)).toBe("2027-03-13");
    expect(provisionalNextDue("2026-08-31T10:00:00Z", 6)).toBe("2027-02-28");
    expect(provisionalNextDue("2026-09-13T10:00:00Z", null)).toBeNull();
  });

  it("refuses silly dates", () => {
    expect(isSensibleDate("2026-09-13", now)).toBe(true);
    expect(isSensibleDate("2101-01-01", now)).toBe(false);
    expect(isSensibleDate("1999-12-31", now)).toBe(false);
    expect(isSensibleDate("13/09/2026", now)).toBe(false);
    expect(isSensibleDate("", now)).toBe(true);
  });
});
