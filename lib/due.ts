/*
  Due date rules and status colours (CLAUDE.md section 9, SPEC.md section 7).
  red = overdue more than 14 days, yellow = overdue 1 to 14 days,
  orange = remedial in progress, green = all ok. Nothing alarming before the
  due date. Pure functions, used by the dashboard and the field screens.
*/

export type Tone = "red" | "yellow" | "orange" | "green" | "grey";

const DAY_MS = 86_400_000;

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/* Whole days between the due date and today. Positive means overdue. */
export function daysOverdue(nextDueDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!nextDueDate) return null;
  const due = new Date(`${nextDueDate}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(`${todayIso(now)}T00:00:00Z`);
  return Math.floor((today.getTime() - due.getTime()) / DAY_MS);
}

export function isOverdue(nextDueDate: string | null | undefined, now: Date = new Date()): boolean {
  const d = daysOverdue(nextDueDate, now);
  return d !== null && d > 0;
}

/* Due today or overdue, as the alerts count "doors due". */
export function isDue(nextDueDate: string | null | undefined, now: Date = new Date()): boolean {
  const d = daysOverdue(nextDueDate, now);
  return d !== null && d >= 0;
}

/* Due within the next N days (default 30), for "doors due this month". */
export function isDueWithin(nextDueDate: string | null | undefined, days = 30, now: Date = new Date()): boolean {
  const d = daysOverdue(nextDueDate, now);
  return d !== null && d >= -days;
}

/* Colour for one asset from its due date alone. */
export function dueTone(nextDueDate: string | null | undefined, now: Date = new Date()): Tone {
  const d = daysOverdue(nextDueDate, now);
  if (d === null) return "grey";
  if (d > 14) return "red";
  if (d > 0) return "yellow";
  return "green";
}

export type BuildingAlertInput = {
  dueDates: (string | null | undefined)[];
  remedialInProgress: number;
};

/*
  One pill per building: red beats yellow beats orange beats green.
  Overdue doors are more urgent than works in progress.
*/
export function buildingTone(input: BuildingAlertInput, now: Date = new Date()): Tone {
  let worst: Tone = "green";
  for (const d of input.dueDates) {
    const t = dueTone(d, now);
    if (t === "red") return "red";
    if (t === "yellow") worst = "yellow";
  }
  if (worst === "yellow") return "yellow";
  if (input.remedialInProgress > 0) return "orange";
  return "green";
}

/* Provisional next due date shown after completing an inspection. The server recomputes it. */
export function provisionalNextDue(completedAt: string, cycleMonths: number | null | undefined): string | null {
  if (!cycleMonths) return null;
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + cycleMonths);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/*
  Date inputs are validated: a review date in the year 2101 must be
  impossible. Accepts YYYY-MM-DD between 2000 and 10 years from now.
*/
export function isSensibleDate(value: string | null | undefined, now: Date = new Date()): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getUTCFullYear();
  return year >= 2000 && year <= now.getUTCFullYear() + 10;
}
