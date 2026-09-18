"use client";

import { useState } from "react";
import Link from "next/link";
import FieldHeader from "@/components/field/FieldHeader";
import Pill from "@/components/ui/Pill";
import ScanQrButton from "@/components/field/inspector/ScanQrButton";
import { get, getSyncState, list, type Row } from "@/lib/local";
import type { SyncStateRow } from "@/lib/local/db";
import { describeAge, downloadBuildingNow, useSyncStatus } from "@/lib/sync";
import { isDue } from "@/lib/due";
import { useAsync } from "@/lib/useAsync";
import { useFieldParams } from "@/lib/useFieldParams";
import {
  NO_FLOOR,
  floorHref,
  groupTone,
  plural,
  sortFloors,
  type AssetRow,
} from "@/components/field/inspector/inspection";

type Group = {
  key: string;
  name: string;
  assets: AssetRow[];
};

type Loaded = {
  building: Row<"buildings"> | undefined;
  groups: Group[];
  state: SyncStateRow | undefined;
};

/*
  /buildings/[id]: the floors of one building with asset and due counts.
  Assets without a floor appear under "No floor". Everything is read from
  the local tables, so it works with zero network.
*/
export default function BuildingPage() {
  const { id } = useFieldParams<{ id: string }>();
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = useAsync<Loaded>(async () => {
    const [building, floors, assets, state] = await Promise.all([
      get("buildings", id),
      list("floors", { building_id: id }),
      list("assets", { building_id: id }),
      getSyncState(id),
    ]);
    const groups: Group[] = sortFloors(floors).map((f) => ({
      key: f.id,
      name: f.name,
      assets: assets.filter((a) => a.floor_id === f.id),
    }));
    const noFloor = assets.filter((a) => !a.floor_id);
    if (noFloor.length > 0) groups.push({ key: NO_FLOOR, name: "No floor", assets: noFloor });
    return { building, groups, state };
  }, [id]);

  async function refresh() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await downloadBuildingNow(id);
      setMessage(result.warnings.length > 0 ? result.warnings.join(". ") : "Building refreshed.");
      data.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  const loaded = data.data;
  const building = loaded?.building;

  return (
    <>
      <FieldHeader title={building?.name ?? "Building"} back="/buildings" />
      <main className="page-narrow stack">
        {data.error ? <p className="error">{data.error}</p> : null}
        {!loaded && data.loading ? <p className="muted">Loading</p> : null}
        {loaded && !building ? (
          <section className="card stack">
            <p className="muted">This building is not on this phone.</p>
            <Link className="btn btn-block" href="/buildings">
              Back to buildings
            </Link>
          </section>
        ) : null}
        {loaded && building ? (
          <>
            <ScanQrButton currentBuildingId={id} className="btn btn-block" />
            <section className="card" aria-label="Floors">
              <div className="card-title">Floors</div>
              {loaded.groups.length === 0 ? (
                <p className="muted">
                  {loaded.state
                    ? "No floors or assets in this building yet."
                    : "This building is not downloaded yet. Tap Download building below."}
                </p>
              ) : null}
              {loaded.groups.map((g) => {
                const due = g.assets.filter((a) => isDue(a.next_due_date)).length;
                const tone = groupTone(g.assets);
                return (
                  <Link key={g.key} className="row-link" href={floorHref(id, g.key === NO_FLOOR ? null : g.key)}>
                    <div className="row-main">
                      <div className="row-title">{g.name}</div>
                      <div className="row-sub">
                        {plural(g.assets.length, "asset", "assets")}, {due} due
                      </div>
                    </div>
                    <Pill tone={tone}>{g.assets.length === 0 ? "No assets" : due > 0 ? `${due} due` : "OK"}</Pill>
                  </Link>
                );
              })}
            </section>
            <section className="card stack" aria-label="Download">
              <div className="row-sub">
                {describeAge(loaded.state?.downloaded_at)}
                {building.postcode ? `, ${building.postcode}` : ""}
              </div>
              <button type="button" className="btn btn-block" onClick={refresh} disabled={busy || !status.online}>
                {busy ? "Refreshing" : loaded.state ? "Refresh building" : "Download building"}
              </button>
              {!status.online ? <p className="muted small">Refreshing a building needs a connection.</p> : null}
              {message ? <p className="notice">{message}</p> : null}
              {error ? <p className="error">{error}</p> : null}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
