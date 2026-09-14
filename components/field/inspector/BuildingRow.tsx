"use client";

import { useState } from "react";
import Link from "next/link";
import type { Row } from "@/lib/local";
import type { SyncStateRow } from "@/lib/local/db";
import { describeAge, downloadBuildingNow, useSyncStatus } from "@/lib/sync";
import { buildingHref } from "./inspection";

type Props = {
  building: Row<"buildings">;
  /* download state of this building on this phone, undefined when never downloaded */
  state: SyncStateRow | undefined;
  /* called after a download so the list can re-read the local state */
  onChanged: () => void;
};

/*
  One row of the building list: name, postcode, download age and a 48 px
  Download or Refresh button. The row opens the building only once it is
  downloaded, before that it is plain muted text.
*/
export default function BuildingRow({ building, state, onChanged }: Props) {
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const downloaded = Boolean(state);

  async function download() {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await downloadBuildingNow(building.id);
      setWarnings(result.warnings);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  const subline = [building.postcode, describeAge(state?.downloaded_at)].filter(Boolean).join(", ");
  const content = (
    <>
      <div className="row-title">{building.name}</div>
      <div className="row-sub">{subline}</div>
    </>
  );

  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      {downloaded ? (
        <Link className="row-main" href={buildingHref(building.id)} style={{ textDecoration: "none" }}>
          {content}
        </Link>
      ) : (
        <div className="row-main muted">{content}</div>
      )}
      <button type="button" className="btn" onClick={download} disabled={busy || !status.online}>
        {busy ? "Downloading" : downloaded ? "Refresh" : "Download"}
      </button>
      {error ? (
        <p className="error" style={{ flexBasis: "100%", margin: 0 }}>
          {error}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <p className="muted small" style={{ flexBasis: "100%", margin: 0 }}>
          {warnings.join(". ")}
        </p>
      ) : null}
    </div>
  );
}
