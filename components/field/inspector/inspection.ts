/*
  Pure helpers for the inspector field screens. No data access, no React.
  Routes, labels, template choice, fail value matching and pill tones live
  here so the page files stay small.
*/

import type { Row } from "@/lib/local";
import { dueTone, type Tone } from "@/lib/due";

export type AssetRow = Row<"assets">;
export type TemplateRow = Row<"survey_templates">;
export type TemplateItemRow = Row<"survey_template_items">;
export type InspectionRow = Row<"inspections">;
export type AnswerRow = Row<"inspection_answers">;
export type FindingRow = Row<"findings">;
export type FindingPhotoRow = Row<"finding_photos">;
export type Severity = FindingRow["severity"];

/* Route segment used for assets that have no floor. */
export const NO_FLOOR = "none";

/* "Door 2F-05" for doors, "Item P-01" for fire stopping. */
export function assetLabel(asset: Pick<AssetRow, "work_type" | "ref">): string {
  return `${asset.work_type === "fs" ? "Item" : "Door"} ${asset.ref}`;
}

export function assetNoun(asset: Pick<AssetRow, "work_type">): string {
  return asset.work_type === "fs" ? "item" : "door";
}

export function workTypeLabel(workType: AssetRow["work_type"]): string {
  return workType === "fs" ? "fire stopping" : "doors";
}

export function buildingHref(buildingId: string): string {
  return `/buildings/${buildingId}`;
}

export function floorHref(buildingId: string, floorId: string | null): string {
  return `/buildings/${buildingId}/floors/${floorId ?? NO_FLOOR}`;
}

export function assetHref(buildingId: string, assetId: string): string {
  return `/buildings/${buildingId}/assets/${assetId}`;
}

export function findingHref(buildingId: string, findingId: string): string {
  return `/buildings/${buildingId}/findings/${findingId}`;
}

/* Natural order, so 2F-05 comes before 2F-10. */
export function compareRef(a: { ref: string }, b: { ref: string }): number {
  return a.ref.localeCompare(b.ref, "en", { numeric: true, sensitivity: "base" });
}

export function sortByRef<T extends { ref: string }>(rows: T[]): T[] {
  return [...rows].sort(compareRef);
}

export function sortFloors<T extends { sort_order: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/* The active template with the highest version, then by name. */
export function pickTemplate(templates: TemplateRow[]): TemplateRow | null {
  const active = templates.filter((t) => t.active);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => b.version - a.version || a.name.localeCompare(b.name))[0];
}

export function sortItems(items: TemplateItemRow[]): TemplateItemRow[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.question.localeCompare(b.question));
}

export function normaliseValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function hasAnswer(value: string | null | undefined): boolean {
  return normaliseValue(value).length > 0;
}

/* Trimmed, case insensitive match against the item's fail values. */
export function isFailValue(item: Pick<TemplateItemRow, "fail_values">, value: string | null | undefined): boolean {
  const v = normaliseValue(value);
  if (!v) return false;
  return (item.fail_values ?? []).some((f) => normaliseValue(f) === v);
}

/* Options of a select question when they are an array of strings, else null. */
export function selectOptions(item: Pick<TemplateItemRow, "options">): string[] | null {
  const options = item.options;
  if (!Array.isArray(options)) return null;
  const strings = options.filter((o): o is string => typeof o === "string");
  return strings.length === options.length && strings.length > 0 ? strings : null;
}

/* A finding still counts unless the answer was changed back or it was removed. */
export function isLiveFinding(finding: Pick<FindingRow, "status" | "deleted_at">): boolean {
  return finding.status !== "cancelled" && !finding.deleted_at;
}

export function severityTone(severity: Severity): Tone {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "yellow";
    default:
      return "grey";
  }
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/* One pill for a group of assets: red beats yellow beats green, grey when empty. */
export function groupTone(assets: Pick<AssetRow, "next_due_date">[]): Tone {
  if (assets.length === 0) return "grey";
  let worst: Tone = "green";
  for (const a of assets) {
    const t = dueTone(a.next_due_date);
    if (t === "red") return "red";
    if (t === "yellow") worst = "yellow";
  }
  return worst;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* Newest first by an ISO timestamp column. */
export function newestFirst<T>(rows: T[], pick: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((a, b) => (pick(b) ?? "").localeCompare(pick(a) ?? ""));
}
