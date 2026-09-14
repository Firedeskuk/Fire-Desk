"use client";

import Link from "next/link";
import type { Building } from "@/lib/supabase/types";
import type { SyncStateRow } from "@/lib/local/db";
import { describeAge } from "@/lib/sync";

type Props = {
  building: Building;
  state: SyncStateRow | undefined;
  busy: boolean;
  error: string | null;
  onDownload: (buildingId: string) => void;
};

/*
  One building in the works building list: name, postcode, download state
  and a 48 px Download or Refresh button. The row opens the works list only
  when the building is on this phone, otherwise it is plain grey text.
*/
export default function WorksBuildingRow({ building, state, busy, error, onDownload }: Props) {
  const downloaded = Boolean(state);
  const age = describeAge(state?.downloaded_at ?? null);
  const sub = building.postcode ? `${building.postcode}, ${age}` : age;

  return (
    <>
      <div className="row">
        {downloaded ? (
          <Link
            className="row-link"
            href={`/works/${building.id}`}
            style={{ flex: 1, borderBottom: "none", padding: 0, minHeight: 0 }}
          >
            <div className="row-main">
              <div className="row-title">{building.name}</div>
              <div className="row-sub">{sub}</div>
            </div>
          </Link>
        ) : (
          <div className="row-main muted">
            <div className="row-title">{building.name}</div>
            <div className="row-sub">{sub}</div>
          </div>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => onDownload(building.id)}
          disabled={busy}
          aria-label={`${downloaded ? "Refresh" : "Download"} ${building.name}`}
        >
          {busy ? "Working" : downloaded ? "Refresh" : "Download"}
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
