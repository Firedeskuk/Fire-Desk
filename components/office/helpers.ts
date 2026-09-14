/*
  Small helpers shared by the office screens: error text, supabase-js
  result checks, number parsing and status colours. No data access here.
*/

import type { Tone } from "@/lib/due";
import type { QuoteStatus, WorkType } from "@/lib/supabase/types";

type ErrorLike = { message: string } | null;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Something went wrong";
}

/* Throws when a supabase-js read returned an error or no data. */
export function must<T>(result: { data: T; error: ErrorLike }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) throw new Error("No data returned");
  return result.data as NonNullable<T>;
}

/* Throws when a supabase-js write returned an error. */
export function assertOk(result: { error: ErrorLike }): void {
  if (result.error) throw new Error(result.error.message);
}

export function emptyToNull(value: string): string | null {
  const v = value.trim();
  return v === "" ? null : v;
}

/* Money input: empty gives null, a bad number gives NaN, otherwise 2 decimals. */
export function parseMoney(value: string): number | null {
  const v = value.trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function moneyText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

export function workTypeLabel(workType: WorkType | null | undefined): string {
  if (workType === "doors") return "Doors";
  if (workType === "fs") return "Fire stopping";
  return "Any";
}

export function quoteTone(status: QuoteStatus): Tone {
  switch (status) {
    case "accepted":
      return "green";
    case "sent":
      return "yellow";
    case "rejected":
      return "red";
    default:
      return "grey";
  }
}

export function quoteStatusLabel(status: QuoteStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Superseded";
    default:
      return status;
  }
}

/* Text on the dashboard pill for the building colour. */
export function alertLabel(tone: Tone): string {
  switch (tone) {
    case "red":
      return "Overdue";
    case "yellow":
      return "Due";
    case "orange":
      return "Remedial in progress";
    default:
      return "All ok";
  }
}

export function dueDoorsText(count: number): string {
  if (count === 0) return "no doors due";
  if (count === 1) return "1 door due";
  return `${count} doors due`;
}
