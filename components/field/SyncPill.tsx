"use client";

import { useState } from "react";
import Link from "next/link";
import type { OutboxRow } from "@/lib/local/db";
import { describeSyncStatus, listFailedRows, retryFailedRows, syncNow, useSyncStatus } from "@/lib/sync";

/*
  The sync indicator on every field screen (docs/SYNC-PROTOCOL.md section 9):
  green Online, grey Offline N to sync, amber Syncing, red Sync problem.
  Tapping opens a panel with the failed rows, a retry button and Sync now.
*/
export default function SyncPill() {
  const status = useSyncStatus();
  const { text, tone } = describeSyncStatus(status);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<OutboxRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rows = await listFailedRows();
    setFailed(rows);
    setOpen(true);
  }

  async function retry() {
    setBusy(true);
    try {
      await retryFailedRows();
      setFailed(await listFailedRows());
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      await syncNow();
      setFailed(await listFailedRows());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`pill pill-${tone} pill-button`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Sync status: ${text}`}
      >
        {text}
      </button>
      {open ? (
        <div className="sync-panel" role="dialog" aria-label="Sync details">
          <div className="card stack">
            <div className="row" style={{ borderBottom: "none", padding: 0 }}>
              <div className="row-main">
                <div className="row-title">{text}</div>
                <div className="row-sub">
                  {status.pendingCount} waiting, {status.failedCount} failed
                  {status.lastSyncAt ? `, last sync ${new Date(status.lastSyncAt).toLocaleTimeString("en-GB")}` : ""}
                </div>
              </div>
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {status.lastError ? <p className="error">{status.lastError}</p> : null}
            {status.authProblem ? (
              <Link className="btn btn-primary" href="/login?next=/buildings">
                Sign in again
              </Link>
            ) : null}
            {failed.length > 0 ? (
              <div>
                <div className="label">Failed changes</div>
                {failed.map((row) => (
                  <div className="row" key={row.id}>
                    <div className="row-main">
                      <div className="row-title">{row.label ?? row.entity}</div>
                      <div className="row-sub">
                        {row.op} {row.entity}: {row.last_error ?? "unknown error"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No failed changes.</p>
            )}
            <div className="btn-row">
              {failed.length > 0 ? (
                <button type="button" className="btn btn-primary" onClick={retry} disabled={busy}>
                  Retry failed
                </button>
              ) : null}
              <button type="button" className="btn" onClick={sync} disabled={busy || !status.online}>
                Sync now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
