"use client";

import { useState } from "react";
import ThemeToggle from "@/components/shared/ThemeToggle";
import LogoutButton from "@/components/shared/LogoutButton";
import { listSyncState, removeBuilding, storageUsage, type StorageUsage } from "@/lib/local";
import type { SyncStateRow } from "@/lib/local/db";
import { roleLabel, useLocalSession } from "@/lib/local/session";
import { useAsync } from "@/lib/useAsync";

function formatBytes(n: number | null): string {
  if (n === null) return "unknown";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  /* called after a building was removed, so the list above can refresh */
  onChanged?: () => void;
};

/*
  Settings section at the bottom of the field lists: theme toggle, storage in
  use, "Remove building from this phone", logout.
*/
export default function FieldSettings({ onChanged }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const profile = useLocalSession()?.profile ?? null;

  const info = useAsync<{ usage: StorageUsage; downloaded: SyncStateRow[] }>(async () => {
    const [usage, downloaded] = await Promise.all([storageUsage(), listSyncState()]);
    return { usage, downloaded };
  }, []);
  const usage = info.data?.usage ?? null;
  const downloaded = info.data?.downloaded ?? [];

  async function remove(buildingId: string, name: string) {
    if (typeof window !== "undefined" && !window.confirm(`Remove ${name} from this phone?`)) return;
    setMessage(null);
    setBusy(buildingId);
    try {
      await removeBuilding(buildingId);
      info.reload();
      onChanged?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove the building");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card stack" aria-label="Settings">
      <div className="card-title">Settings</div>
      <div className="row">
        <div className="row-main">
          <div className="row-title">{profile?.full_name ?? "Signed in"}</div>
          <div className="row-sub">{roleLabel(profile?.role)}</div>
        </div>
        <ThemeToggle />
      </div>
      <div className="row">
        <div className="row-main">
          <div className="row-title">Storage in use</div>
          <div className="row-sub">
            {usage
              ? `Photos ${formatBytes(usage.photos)}, floor plans ${formatBytes(usage.floorplans)}, total ${formatBytes(
                  usage.usage,
                )}${usage.quota ? ` of ${formatBytes(usage.quota)}` : ""}`
              : "Reading"}
          </div>
        </div>
      </div>
      {downloaded.length > 0 ? (
        <div>
          <div className="label">Remove building from this phone</div>
          {downloaded.map((s) => (
            <div className="row" key={s.building_id}>
              <div className="row-main">
                <div className="row-title">{s.building_name || s.building_id}</div>
              </div>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => remove(s.building_id, s.building_name || "this building")}
                disabled={busy === s.building_id}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {message ? <p className="error">{message}</p> : null}
      <LogoutButton block />
    </section>
  );
}
