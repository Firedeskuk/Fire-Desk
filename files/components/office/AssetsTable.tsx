"use client";

import { useState } from "react";
import Link from "next/link";
import ErrorText from "./ErrorText";
import { assertOk, emptyToNull, errorMessage } from "./helpers";
import { formatDate } from "@/lib/due";
import { getDeviceId, newId } from "@/lib/local/session";
import { needsCode, qrCodeFor } from "@/lib/qr/codes";
import { getSupabase } from "@/lib/supabase/client";
import type { Asset, Floor, WorkType } from "@/lib/supabase/types";

type Props = {
  buildingId: string;
  floors: Floor[];
  assets: Asset[];
  /* signed in profile id, written to created_by on insert */
  userId: string | null;
  onChanged: () => void;
};

type Cycle = 3 | 6 | 12 | null;

type Draft = {
  ref: string;
  work_type: WorkType;
  subtype: string;
  floor_id: string;
  location: string;
  cycle: string;
  qr_code: string;
};

const BLANK: Draft = { ref: "", work_type: "doors", subtype: "", floor_id: "", location: "", cycle: "12", qr_code: "" };

function draftFrom(a: Asset): Draft {
  return {
    ref: a.ref,
    work_type: a.work_type,
    subtype: a.subtype ?? "",
    floor_id: a.floor_id ?? "",
    location: a.location ?? "",
    cycle: a.cycle_months === null ? "" : String(a.cycle_months),
    qr_code: a.qr_code ?? "",
  };
}

function cycleFrom(value: string): Cycle {
  if (value === "3") return 3;
  if (value === "6") return 6;
  if (value === "12") return 12;
  return null;
}

function toPayload(d: Draft) {
  return {
    ref: d.ref.trim(),
    work_type: d.work_type,
    subtype: emptyToNull(d.subtype),
    floor_id: d.floor_id || null,
    location: emptyToNull(d.location),
    cycle_months: cycleFrom(d.cycle),
    qr_code: emptyToNull(d.qr_code),
  };
}

type CellsProps = {
  draft: Draft;
  floors: Floor[];
  onChange: (d: Draft) => void;
  disabled: boolean;
};

/* The seven editable cells, used by the add row and by a row in edit mode. */
function DraftCells({ draft, floors, onChange, disabled }: CellsProps) {
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <>
      <td>
        <input
          className="input"
          aria-label="Ref"
          value={draft.ref}
          onChange={(e) => set("ref", e.target.value)}
          disabled={disabled}
          placeholder="GF-01"
          style={{ minWidth: 90 }}
        />
      </td>
      <td>
        <select
          className="select"
          aria-label="Type"
          value={draft.work_type}
          onChange={(e) => set("work_type", e.target.value as WorkType)}
          disabled={disabled}
        >
          <option value="doors">Doors</option>
          <option value="fs">FS</option>
        </select>
      </td>
      <td>
        <input
          className="input"
          aria-label="Subtype"
          value={draft.subtype}
          onChange={(e) => set("subtype", e.target.value)}
          disabled={disabled}
          placeholder="FD30"
          style={{ minWidth: 90 }}
        />
      </td>
      <td>
        <select
          className="select"
          aria-label="Floor"
          value={draft.floor_id}
          onChange={(e) => set("floor_id", e.target.value)}
          disabled={disabled}
        >
          <option value="">No floor</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          className="input"
          aria-label="Location"
          value={draft.location}
          onChange={(e) => set("location", e.target.value)}
          disabled={disabled}
          style={{ minWidth: 120 }}
        />
      </td>
      <td>
        <select
          className="select"
          aria-label="Cycle"
          value={draft.cycle}
          onChange={(e) => set("cycle", e.target.value)}
          disabled={disabled}
        >
          <option value="3">3 months</option>
          <option value="6">6 months</option>
          <option value="12">12 months</option>
          <option value="">NA</option>
        </select>
      </td>
      <td>
        <input
          className="input"
          aria-label="QR code"
          value={draft.qr_code}
          onChange={(e) => set("qr_code", e.target.value)}
          disabled={disabled}
          style={{ minWidth: 100 }}
        />
      </td>
    </>
  );
}

/*
  Assets of one building: add row at the top, inline edit per row.
  next_due_date is read only, a database trigger sets it when an inspection
  is completed. "Assign QR codes" fills qr_code for every asset that has
  none (FD-{building short code}-{ref}, see lib/qr/codes.ts), existing codes
  are never overwritten. "Labels" opens the printable sheet.
*/
export default function AssetsTable({ buildingId, floors, assets, userId, onChanged }: Props) {
  const [adding, setAdding] = useState<Draft>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const missingCodes = assets.filter(needsCode).length;

  async function assignCodes() {
    const missing = assets.filter(needsCode);
    setError(null);
    setNotice(null);
    if (missing.length === 0) {
      setNotice("Every asset already has a code.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      let done = 0;
      for (const a of missing) {
        assertOk(await supabase.from("assets").update({ qr_code: qrCodeFor(buildingId, a.ref) }).eq("id", a.id));
        done += 1;
      }
      setNotice(`${done} ${done === 1 ? "code" : "codes"} assigned.`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function validate(d: Draft): string | null {
    if (!d.ref.trim()) return "Ref is required.";
    return null;
  }

  async function add() {
    const problem = validate(adding);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      assertOk(
        await getSupabase()
          .from("assets")
          .insert({
            id: newId(),
            building_id: buildingId,
            ...toPayload(adding),
            status: "active",
            created_by: userId,
            device_id: getDeviceId(),
          }),
      );
      // keep type, floor and cycle for the next row, they usually repeat
      setAdding({ ...BLANK, work_type: adding.work_type, floor_id: adding.floor_id, cycle: adding.cycle });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const problem = validate(editing);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      assertOk(await getSupabase().from("assets").update(toPayload(editing)).eq("id", id));
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function floorName(id: string | null): string {
    return floors.find((f) => f.id === id)?.name ?? "";
  }

  return (
    <section className="card" style={{ marginTop: 12 }} aria-label="Assets">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="card-title" style={{ flex: "1 1 auto", marginBottom: 0 }}>
          Assets
        </div>
        <button type="button" className="btn" onClick={assignCodes} disabled={busy || assets.length === 0}>
          Assign QR codes{missingCodes > 0 ? ` (${missingCodes})` : ""}
        </button>
        <Link className="btn" href={`/office/buildings/${buildingId}/labels`}>
          Labels
        </Link>
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Type</th>
              <th>Subtype</th>
              <th>Floor</th>
              <th>Location</th>
              <th>Cycle</th>
              <th>QR code</th>
              <th>Next due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <DraftCells draft={adding} floors={floors} onChange={setAdding} disabled={busy} />
              <td className="muted small">Set after inspection</td>
              <td>
                <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
                  Add
                </button>
              </td>
            </tr>
            {assets.map((a) =>
              editingId === a.id ? (
                <tr key={a.id}>
                  <DraftCells draft={editing} floors={floors} onChange={setEditing} disabled={busy} />
                  <td>{formatDate(a.next_due_date) || <span className="muted">Not set</span>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => saveEdit(a.id)}
                        disabled={busy}
                      >
                        Save
                      </button>
                      <button type="button" className="btn" onClick={() => setEditingId(null)} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={a.id}>
                  <td className="row-title">{a.ref}</td>
                  <td>{a.work_type === "doors" ? "Doors" : "FS"}</td>
                  <td>{a.subtype ?? ""}</td>
                  <td>{floorName(a.floor_id) || <span className="muted">No floor</span>}</td>
                  <td>{a.location ?? ""}</td>
                  <td>{a.cycle_months === null ? "NA" : `${a.cycle_months} months`}</td>
                  <td>{a.qr_code ?? ""}</td>
                  <td>{formatDate(a.next_due_date) || <span className="muted">Not set</span>}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setError(null);
                        setEditingId(a.id);
                        setEditing(draftFrom(a));
                      }}
                      disabled={busy}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ),
            )}
            {assets.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No assets yet. Add the first door or penetration in the row above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
