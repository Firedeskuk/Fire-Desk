"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Actions from "./Actions";
import AssetsTable from "./AssetsTable";
import ErrorText from "./ErrorText";
import Field from "./Field";
import FloorsEditor from "./FloorsEditor";
import FormGrid from "./FormGrid";
import PageHead from "./PageHead";
import { assertOk, emptyToNull, errorMessage, must } from "./helpers";
import { newId, useLocalSession } from "@/lib/local/session";
import { normalisePct } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabase/client";
import type { Asset, Building, Floor } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type ClientOption = { id: string; name: string };

type EditorData = {
  clients: ClientOption[];
  building: Building | null;
  floors: Floor[];
  assets: Asset[];
};

async function loadEditor(buildingId: string | null): Promise<EditorData> {
  const supabase = getSupabase();
  const clients = must(await supabase.from("clients").select("id, name").is("deleted_at", null).order("name"));
  if (!buildingId) return { clients, building: null, floors: [], assets: [] };

  const [buildingRes, floorsRes, assetsRes] = await Promise.all([
    supabase.from("buildings").select("*").eq("id", buildingId).is("deleted_at", null).maybeSingle(),
    supabase.from("floors").select("*").eq("building_id", buildingId).order("sort_order").order("name"),
    supabase.from("assets").select("*").eq("building_id", buildingId).is("deleted_at", null).order("ref"),
  ]);
  if (buildingRes.error) throw new Error(buildingRes.error.message);
  if (!buildingRes.data) throw new Error("Building not found");
  return { clients, building: buildingRes.data, floors: must(floorsRes), assets: must(assetsRes) };
}

type Draft = {
  client_id: string;
  name: string;
  address: string;
  postcode: string;
  adjustment_pct: string;
  notes: string;
};

function draftFrom(b: Building | null): Draft {
  return {
    client_id: b?.client_id ?? "",
    name: b?.name ?? "",
    address: b?.address ?? "",
    postcode: b?.postcode ?? "",
    adjustment_pct: b ? String(b.adjustment_pct) : "100",
    notes: b?.notes ?? "",
  };
}

type FormProps = {
  building: Building | null;
  clients: ClientOption[];
  onSaved: (id: string, created: boolean) => void;
};

function BuildingForm({ building, clients, onSaved }: FormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(building));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const name = draft.name.trim();
    if (!draft.client_id) {
      setError("Pick a client.");
      return;
    }
    if (!name) {
      setError("Name is required.");
      return;
    }
    const pct = Number(draft.adjustment_pct);
    if (!Number.isFinite(pct) || pct <= 0) {
      setError("Adjustment must be a number above 0. 100 means list price.");
      return;
    }
    const payload = {
      client_id: draft.client_id,
      name,
      address: emptyToNull(draft.address),
      postcode: emptyToNull(draft.postcode),
      adjustment_pct: normalisePct(pct),
      notes: emptyToNull(draft.notes),
    };
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (building) {
        assertOk(await supabase.from("buildings").update(payload).eq("id", building.id));
        setNotice("Saved");
        setBusy(false);
        onSaved(building.id, false);
      } else {
        const id = newId();
        assertOk(await supabase.from("buildings").insert({ id, ...payload, active: true }));
        onSaved(id, true);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="card-title">{building ? "Building details" : "New building"}</div>
      <FormGrid>
        <Field label="Client">
          <select className="select" value={draft.client_id} onChange={(e) => set("client_id", e.target.value)}>
            <option value="">Pick a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Address">
          <input className="input" value={draft.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Postcode">
          <input
            className="input"
            value={draft.postcode}
            onChange={(e) => set("postcode", e.target.value)}
            autoCapitalize="characters"
          />
        </Field>
        <Field label="Adjustment %" hint="100 means the client price, 90 means minus 10 percent">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="1"
            value={draft.adjustment_pct}
            onChange={(e) => set("adjustment_pct", e.target.value)}
          />
        </Field>
      </FormGrid>
      <Field label="Notes">
        <textarea className="textarea" value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <Actions>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving" : "Save"}
        </button>
        <Link className="btn" href="/office/buildings">
          Cancel
        </Link>
        {notice ? <span className="notice">{notice}</span> : null}
      </Actions>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

type Props = {
  /* null on /office/buildings/new */
  buildingId: string | null;
};

/*
  One editor for a new and an existing building. Floors and assets appear
  only once the building row exists, they need its id.
*/
export default function BuildingEditor({ buildingId }: Props) {
  const router = useRouter();
  const session = useLocalSession();
  const { data, error, loading, reload } = useAsync(() => loadEditor(buildingId), [buildingId]);

  function onSaved(id: string, created: boolean) {
    if (created) router.push(`/office/buildings/${id}`);
    else reload();
  }

  const title = data?.building ? data.building.name : buildingId ? "Building" : "New building";

  return (
    <>
      <PageHead title={title}>
        <Link className="btn" href="/office/buildings">
          All buildings
        </Link>
      </PageHead>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <BuildingForm
            key={data.building?.id ?? "new"}
            building={data.building}
            clients={data.clients}
            onSaved={onSaved}
          />
          {data.building ? (
            <>
              <FloorsEditor buildingId={data.building.id} floors={data.floors} onChanged={reload} />
              <AssetsTable
                buildingId={data.building.id}
                floors={data.floors}
                assets={data.assets}
                userId={session?.user_id ?? null}
                onChanged={reload}
              />
            </>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>
              Save the building first, then add floors and assets.
            </p>
          )}
        </>
      ) : null}
    </>
  );
}
