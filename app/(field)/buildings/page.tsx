"use client";

import { useEffect } from "react";
import FieldHeader from "@/components/field/FieldHeader";
import FieldSettings from "@/components/field/FieldSettings";
import BuildingRow from "@/components/field/inspector/BuildingRow";
import { list, listSyncState, type Row } from "@/lib/local";
import type { SyncStateRow } from "@/lib/local/db";
import { refreshBuildingList } from "@/lib/sync";
import { useAsync } from "@/lib/useAsync";

type Loaded = {
  buildings: Row<"buildings">[];
  states: Map<string, SyncStateRow>;
};

/*
  /buildings: the buildings the inspector may see. Rows come from the local
  table, refreshed from the server once when online. Each row has a Download
  or Refresh button and opens the building only once it is on this phone.
*/
export default function BuildingsPage() {
  const data = useAsync<Loaded>(async () => {
    const [rows, states] = await Promise.all([list("buildings"), listSyncState()]);
    const buildings = rows.filter((b) => b.active).sort((a, b) => a.name.localeCompare(b.name));
    return { buildings, states: new Map(states.map((s) => [s.building_id, s])) };
  }, []);
  const { reload } = data;

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    let cancelled = false;
    refreshBuildingList()
      .then(() => {
        if (!cancelled) reload();
      })
      .catch(() => {
        // offline or server not reachable: the local list stands
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const loaded = data.data;

  return (
    <>
      <FieldHeader title="Buildings" />
      <main className="page-narrow stack">
        <section className="card" aria-label="Buildings">
          {data.error ? <p className="error">{data.error}</p> : null}
          {!loaded && data.loading ? <p className="muted">Loading</p> : null}
          {loaded && loaded.buildings.length === 0 ? (
            <p className="muted">No buildings on this phone yet. Connect to the internet and open this screen again.</p>
          ) : null}
          {loaded
            ? loaded.buildings.map((b) => (
                <BuildingRow key={b.id} building={b} state={loaded.states.get(b.id)} onChanged={reload} />
              ))
            : null}
        </section>
        <FieldSettings onChanged={reload} />
      </main>
    </>
  );
}
