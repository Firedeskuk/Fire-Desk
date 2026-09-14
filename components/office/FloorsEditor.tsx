"use client";

import { useState, type ChangeEvent } from "react";
import Pill from "@/components/ui/Pill";
import ErrorText from "./ErrorText";
import Field from "./Field";
import { assertOk, errorMessage } from "./helpers";
import { newId } from "@/lib/local/session";
import { getSupabase } from "@/lib/supabase/client";
import type { Floor } from "@/lib/supabase/types";

type Props = {
  buildingId: string;
  floors: Floor[];
  onChanged: () => void;
};

/*
  Only image types the phone can draw in an img tag. A PDF plan must be
  exported as an image first, until a PDF renderer is added.
*/
const PLAN_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/*
  Floors of one building: list, add, rename, floor plan upload to the
  floorplans bucket. Every upload gets a new path,
  floorplans/{building_id}/{floor_id}/{upload_id}.{ext}, stored in
  floors.floor_plan_path. A new path means a plain storage insert (the bucket
  has no update policy) and a phone that cached the old plan fetches the new
  one on its next Refresh, because the field download skips paths it already
  holds. The old object stays in the bucket, nothing is hard deleted.
*/
export default function FloorsEditor({ buildingId, floors, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function nextOrder(): number {
    return floors.reduce((max, f) => Math.max(max, f.sort_order), -1) + 1;
  }

  async function run(key: string, work: () => Promise<void>) {
    setError(null);
    setBusy(key);
    try {
      await work();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function addFloor() {
    const name = newName.trim();
    if (!name) {
      setError("Floor name is required.");
      return;
    }
    const order = newOrder.trim() === "" ? nextOrder() : Number(newOrder);
    if (!Number.isInteger(order)) {
      setError("Order must be a whole number.");
      return;
    }
    void run("add", async () => {
      assertOk(
        await getSupabase().from("floors").insert({ id: newId(), building_id: buildingId, name, sort_order: order }),
      );
      setNewName("");
      setNewOrder("");
    });
  }

  function startEdit(f: Floor) {
    setError(null);
    setEditingId(f.id);
    setEditName(f.name);
    setEditOrder(String(f.sort_order));
  }

  function saveEdit(f: Floor) {
    const name = editName.trim();
    const order = Number(editOrder);
    if (!name) {
      setError("Floor name is required.");
      return;
    }
    if (!Number.isInteger(order)) {
      setError("Order must be a whole number.");
      return;
    }
    void run(f.id, async () => {
      assertOk(await getSupabase().from("floors").update({ name, sort_order: order }).eq("id", f.id));
      setEditingId(null);
    });
  }

  function onPlanPicked(f: Floor, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = PLAN_EXTENSIONS[file.type];
    if (!ext) {
      setError("Floor plans must be a PNG or JPEG image. Export the PDF page as an image first.");
      return;
    }
    void run(`plan-${f.id}`, async () => {
      const supabase = getSupabase();
      const path = `floorplans/${buildingId}/${f.id}/${newId()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("floorplans")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      assertOk(await supabase.from("floors").update({ floor_plan_path: path }).eq("id", f.id));
    });
  }

  return (
    <section className="card" style={{ marginTop: 12 }} aria-label="Floors">
      <div className="card-title">Floors</div>
      {floors.length === 0 ? <p className="muted">No floors yet. Assets can also live without a floor.</p> : null}
      {floors.map((f) => (
        <div className="row" key={f.id} style={{ flexWrap: "wrap" }}>
          {editingId === f.id ? (
            <>
              <div className="row-main" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  aria-label="Floor name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ flex: "2 1 160px" }}
                />
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  aria-label="Order"
                  value={editOrder}
                  onChange={(e) => setEditOrder(e.target.value)}
                  style={{ flex: "1 1 80px" }}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => saveEdit(f)}
                disabled={busy !== null}
              >
                Save
              </button>
              <button type="button" className="btn" onClick={() => setEditingId(null)} disabled={busy !== null}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <div className="row-main">
                <div className="row-title">{f.name}</div>
                <div className="row-sub">Order {f.sort_order}</div>
              </div>
              <Pill tone={f.floor_plan_path ? "green" : "grey"}>{f.floor_plan_path ? "Plan uploaded" : "No plan"}</Pill>
              <label className="btn">
                {busy === `plan-${f.id}` ? "Uploading" : f.floor_plan_path ? "Replace plan" : "Upload plan"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={(e) => onPlanPicked(f, e)}
                  disabled={busy !== null}
                />
              </label>
              <button type="button" className="btn" onClick={() => startEdit(f)} disabled={busy !== null}>
                Rename
              </button>
            </>
          )}
        </div>
      ))}
      <hr className="hr" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 180px" }}>
          <Field label="New floor">
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ground floor"
            />
          </Field>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <Field label="Order">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
              placeholder={String(nextOrder())}
            />
          </Field>
        </div>
        <div style={{ flex: "0 0 auto", marginBottom: 12 }}>
          <button type="button" className="btn" onClick={addFloor} disabled={busy !== null}>
            Add floor
          </button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
