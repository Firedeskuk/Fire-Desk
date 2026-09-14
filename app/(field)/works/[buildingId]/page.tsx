"use client";

import { useState } from "react";
import Link from "next/link";
import { useFieldParams } from "@/lib/useFieldParams";
import FieldHeader from "@/components/field/FieldHeader";
import RemedialStatusPill from "@/components/field/remedial/RemedialStatusPill";
import {
  countItems,
  describePlace,
  sortItems,
  summaryLine,
} from "@/components/field/remedial/remedialStatus";
import type { Asset, Building, Floor, RemedialItem } from "@/lib/supabase/types";
import type { SyncStateRow } from "@/lib/local/db";
import { get, getSyncState, list } from "@/lib/local";
import { describeAge, downloadBuildingNow } from "@/lib/sync";
import { useAsync } from "@/lib/useAsync";

type Loaded = {
  building: Building | null;
  state: SyncStateRow | null;
  items: RemedialItem[];
  assets: Map<string, Asset>;
  floors: Map<string, Floor>;
};

async function load(buildingId: string): Promise<Loaded> {
  const [building, state, items, assets, floors] = await Promise.all([
    get("buildings", buildingId),
    getSyncState(buildingId),
    list("remedial_items", { building_id: buildingId }),
    list("assets", { building_id: buildingId }),
    list("floors", { building_id: buildingId }),
  ]);
  return {
    building: building ?? null,
    state: state ?? null,
    items: sortItems(items),
    assets: new Map(assets.map((a) => [a.id, a])),
    floors: new Map(floors.map((f) => [f.id, f])),
  };
}

/*
  /works/[buildingId]: the works list of one building. Everything comes from
  the local mirror, so it opens with zero network once the building is
  downloaded. In progress items first, then to do, then done. The building id
  comes from the real URL (useFieldParams), so the offline shell /works/_
  still shows the right building.

  Known limit: download_building returns only todo and in_progress items, so
  items marked done leave this phone on the next refresh and the done count
  only covers items done here since the last refresh.
*/
export default function WorksListPage() {
  const { buildingId } = useFieldParams<{ buildingId: string }>();
  const state = useAsync(() => load(buildingId), [buildingId]);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setRefreshError(null);
    try {
      await downloadBuildingNow(buildingId);
      state.reload();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  const data = state.data;
  const building = data?.building ?? null;
  const items = data?.items ?? [];
  const counts = countItems(items);

  return (
    <>
      <FieldHeader title={building?.name ?? "Works"} back="/works" />
      <main className="page-narrow">
        {state.loading && !data ? <p className="muted">Loading</p> : null}
        {state.error ? <p className="error">{state.error}</p> : null}

        {data && !building ? (
          <section className="card stack">
            <p className="muted">This building is not on this phone yet. Download it while online.</p>
            <button type="button" className="btn btn-primary btn-block" onClick={refresh} disabled={busy}>
              {busy ? "Downloading" : "Download building"}
            </button>
            {refreshError ? <p className="error">{refreshError}</p> : null}
            <Link className="btn btn-block" href="/works">
              Back to buildings
            </Link>
          </section>
        ) : null}

        {building ? (
          <>
            <section className="card stack" aria-label="Summary">
              <div>
                <h2>{summaryLine(counts)}</h2>
                <div className="row-sub">
                  {building.postcode ? `${building.postcode}, ` : ""}
                  {describeAge(data?.state?.downloaded_at ?? null)}
                </div>
              </div>
              {counts.done > 0 ? (
                <p className="muted small">Done items leave this list on the next refresh</p>
              ) : null}
              <button type="button" className="btn btn-block" onClick={refresh} disabled={busy}>
                {busy ? "Refreshing" : "Refresh building"}
              </button>
              {refreshError ? <p className="error">{refreshError}</p> : null}
            </section>

            <section className="card" aria-label="Work items">
              <div className="card-title">Work items</div>
              {items.length === 0 ? <p className="muted">No work items in this building.</p> : null}
              {items.map((item) => {
                const asset = item.asset_id ? data?.assets.get(item.asset_id) : undefined;
                const floorId = item.floor_id ?? asset?.floor_id ?? null;
                const floor = floorId ? data?.floors.get(floorId) : undefined;
                const place = describePlace(asset, floor, item.detail);
                return (
                  <Link key={item.id} className="row-link" href={`/works/${buildingId}/items/${item.id}`}>
                    <div className="row-main">
                      <div className="row-title">{item.description}</div>
                      {place ? <div className="row-sub">{place}</div> : null}
                    </div>
                    <RemedialStatusPill status={item.status} />
                  </Link>
                );
              })}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
