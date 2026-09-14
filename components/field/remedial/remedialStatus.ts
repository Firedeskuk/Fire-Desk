/*
  Labels, colours and sort order for remedial item statuses.
  Pure helpers, no data access, shared by the works list and the item screen.
  Colours follow CLAUDE.md section 9: orange = remedial in progress,
  green = done, grey for everything that needs no alarm.
*/

import type { Tone } from "@/lib/due";
import type { Asset, Floor, RemedialItem, RemedialStatus } from "@/lib/supabase/types";

export function statusLabel(status: RemedialStatus): string {
  switch (status) {
    case "todo":
      return "To do";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function statusTone(status: RemedialStatus): Tone {
  switch (status) {
    case "in_progress":
      return "orange";
    case "done":
      return "green";
    default:
      return "grey";
  }
}

/* in_progress first, then todo, then done, cancelled last. */
function statusRank(status: RemedialStatus): number {
  switch (status) {
    case "in_progress":
      return 0;
    case "todo":
      return 1;
    case "done":
      return 2;
    default:
      return 3;
  }
}

export function sortItems<T extends Pick<RemedialItem, "status" | "created_at">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

export type ItemCounts = {
  total: number;
  done: number;
  left: number;
};

/*
  "{total} items, {done} done, {left} left". Cancelled items are not counted,
  so total is always done plus left.
*/
export function countItems(items: Pick<RemedialItem, "status">[]): ItemCounts {
  let done = 0;
  let left = 0;
  for (const item of items) {
    if (item.status === "done") done += 1;
    else if (item.status === "todo" || item.status === "in_progress") left += 1;
  }
  return { total: done + left, done, left };
}

export function summaryLine(counts: ItemCounts): string {
  return `${counts.total} ${counts.total === 1 ? "item" : "items"}, ${counts.done} done, ${counts.left} left`;
}

/*
  Detail line under an item: asset ref, floor name and the item detail
  (product or method), joined with commas, empty parts left out.
*/
export function describePlace(
  asset: Pick<Asset, "ref" | "location"> | null | undefined,
  floor: Pick<Floor, "name"> | null | undefined,
  detail: string | null | undefined,
): string {
  const parts: string[] = [];
  if (asset) parts.push(asset.location ? `${asset.ref}, ${asset.location}` : asset.ref);
  if (floor) parts.push(floor.name);
  if (detail && detail.trim()) parts.push(detail.trim());
  return parts.join(", ");
}

/* Short label for the outbox, so a failed row reads as "Work 2F-05". */
export function workLabel(asset: Pick<Asset, "ref"> | null | undefined, item: Pick<RemedialItem, "description">): string {
  if (asset) return `Work ${asset.ref}`;
  const text = item.description.trim();
  return `Work ${text.length > 40 ? `${text.slice(0, 40)}...` : text}`;
}
