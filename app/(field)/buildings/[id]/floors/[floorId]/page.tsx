"use client";

import Link from "next/link";
import FieldHeader from "@/components/field/FieldHeader";
import Pill from "@/components/ui/Pill";
import { get, list, type Row } from "@/lib/local";
import { dueTone, formatDate, isDue } from "@/lib/due";
import { useAsync } from "@/lib/useAsync";
import { useFieldParams } from "@/lib/useFieldParams";
import {
  NO_FLOOR,
  assetHref,
  buildingHref,
  sortByRef,
  type AssetRow,
} from "@/components/field/inspector/inspection";

type Loaded = {
  floor: Row<"floors"> | undefined;
  assets: AssetRow[];
};

function pillText(asset: AssetRow): string {
  const tone = dueTone(asset.next_due_date);
  if (tone === "grey") return "No date";
  if (tone === "red" || tone === "yellow") return "Overdue";
  return isDue(asset.next_due_date) ? "Due today" : "OK";
}

/*
  /buildings/[id]/floors/[floorId]: the doors or items on one floor, in
  reference order, each with its due date and colour. floorId "none" lists
  the assets that have no floor.
*/
export default function FloorPage() {
  const { id, floorId } = useFieldParams<{ id: string; floorId: string }>();
  const noFloor = floorId === NO_FLOOR;

  const data = useAsync<Loaded>(async () => {
    const [floor, rows] = await Promise.all([
      noFloor ? Promise.resolve(undefined) : get("floors", floorId),
      noFloor ? list("assets", { building_id: id, floor_id: null }) : list("assets", { floor_id: floorId }),
    ]);
    return { floor, assets: sortByRef(rows) };
  }, [id, floorId, noFloor]);

  const loaded = data.data;
  const title = noFloor ? "No floor" : (loaded?.floor?.name ?? "Floor");

  return (
    <>
      <FieldHeader title={title} back={buildingHref(id)} />
      <main className="page-narrow stack">
        {data.error ? <p className="error">{data.error}</p> : null}
        {!loaded && data.loading ? <p className="muted">Loading</p> : null}
        {loaded && !noFloor && !loaded.floor ? (
          <section className="card stack">
            <p className="muted">This floor is not on this phone.</p>
            <Link className="btn btn-block" href={buildingHref(id)}>
              Back to building
            </Link>
          </section>
        ) : null}
        {loaded && (noFloor || loaded.floor) ? (
          <section className="card" aria-label="Assets">
            <div className="card-title">{loaded.assets.length} assets</div>
            {loaded.assets.length === 0 ? <p className="muted">No assets on this floor.</p> : null}
            {loaded.assets.map((a) => {
              const sub = [a.subtype, a.location, a.next_due_date ? `Due ${formatDate(a.next_due_date)}` : null]
                .filter(Boolean)
                .join(", ");
              return (
                <Link key={a.id} className="row-link" href={assetHref(id, a.id)}>
                  <div className="row-main">
                    <div className="row-title">{a.ref}</div>
                    <div className="row-sub">{sub || "No details"}</div>
                  </div>
                  <Pill tone={dueTone(a.next_due_date)}>{pillText(a)}</Pill>
                </Link>
              );
            })}
          </section>
        ) : null}
      </main>
    </>
  );
}
