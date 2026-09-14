"use client";

import { useEffect, useState } from "react";
import FieldHeader from "@/components/field/FieldHeader";
import FieldSettings from "@/components/field/FieldSettings";
import WorksBuildingRow from "@/components/field/remedial/WorksBuildingRow";
import type { Building } from "@/lib/supabase/types";
import type { SyncStateRow } from "@/lib/local/db";
import { list, listSyncState } from "@/lib/local";
import { downloadBuildingNow, refreshBuildingList } from "@/lib/sync";
import { useAsync } from "@/lib/useAsync";

type Loaded = {
  buildings: Building[];
  states: Map<string, SyncStateRow>;
};

async function loadLocal(): Promise<Loaded> {
  const [rows, states] = await Promise.all([list("buildings"), listSyncState()]);
  const buildings = rows
    .filter((b) => b.active)
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  return { buildings, states: new Map(states.map((s) => [s.building_id, s])) };
}

/*
  /works: the buildings the remedial user is assigned to. The server only
  returns assigned buildings for this role (RLS), so the local list is shown
  as it is. Online, the list is refreshed once on mount. Offline, the local
  copy is all there is and that is fine.
*/
export default function WorksBuildingsPage() {
  const state = useAsync(loadLocal, []);
  const { reload } = state;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || navigator.onLine === false) return;
    let cancelled = false;
    refreshBuildingList()
      .then(() => {
        if (!cancelled) reload();
      })
      .catch((err: unknown) => {
        // offline after all, or not configured: keep the local list
        if (!cancelled && err instanceof Error && err.message.includes("not configured")) {
          setListError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function download(buildingId: string) {
    setBusyId(buildingId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[buildingId];
      return next;
    });
    try {
      await downloadBuildingNow(buildingId);
      reload();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [buildingId]: err instanceof Error ? err.message : "Download failed",
      }));
    } finally {
      setBusyId(null);
    }
  }

  const buildings = state.data?.buildings ?? [];
  const states = state.data?.states ?? new Map<string, SyncStateRow>();

  return (
    <>
      <FieldHeader title="Works" />
      <main className="page-narrow">
        <section className="card" aria-label="Buildings">
          <div className="card-title">Buildings</div>
          {state.loading && !state.data ? <p className="muted">Loading</p> : null}
          {state.error ? <p className="error">{state.error}</p> : null}
          {listError ? <p className="error">{listError}</p> : null}
          {state.data && buildings.length === 0 ? (
            <p className="muted">
              No buildings assigned to you yet. Ask a manager to assign you to a building, then open this
              screen while online.
            </p>
          ) : null}
          {buildings.map((b) => (
            <WorksBuildingRow
              key={b.id}
              building={b}
              state={states.get(b.id)}
              busy={busyId === b.id}
              error={errors[b.id] ?? null}
              onDownload={download}
            />
          ))}
        </section>
        <FieldSettings onChanged={reload} />
      </main>
    </>
  );
}
