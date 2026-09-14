"use client";

import { useState, type FormEvent } from "react";
import Actions from "@/components/office/Actions";
import ErrorText from "@/components/office/ErrorText";
import Field from "@/components/office/Field";
import FormGrid from "@/components/office/FormGrid";
import PageHead from "@/components/office/PageHead";
import { assertOk, emptyToNull, errorMessage, must } from "@/components/office/helpers";
import { newId } from "@/lib/local/session";
import { normalisePct } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type ClientsData = {
  clients: Client[];
  buildingCounts: Record<string, number>;
};

type Draft = {
  id: string | null;
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  adjustment_pct: string;
};

async function loadClients(): Promise<ClientsData> {
  const supabase = getSupabase();
  const [clientsRes, buildingsRes] = await Promise.all([
    supabase.from("clients").select("*").is("deleted_at", null).order("name"),
    supabase.from("buildings").select("client_id").is("deleted_at", null),
  ]);
  const buildingCounts: Record<string, number> = {};
  for (const b of must(buildingsRes)) {
    buildingCounts[b.client_id] = (buildingCounts[b.client_id] ?? 0) + 1;
  }
  return { clients: must(clientsRes), buildingCounts };
}

function blankDraft(): Draft {
  return { id: null, name: "", contact_name: "", contact_email: "", contact_phone: "", adjustment_pct: "100" };
}

function draftFrom(c: Client): Draft {
  return {
    id: c.id,
    name: c.name,
    contact_name: c.contact_name ?? "",
    contact_email: c.contact_email ?? "",
    contact_phone: c.contact_phone ?? "",
    adjustment_pct: String(c.adjustment_pct),
  };
}

function contactText(c: Client): string {
  return [c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(", ");
}

type FormProps = {
  initial: Draft;
  onSaved: () => void;
  onCancel: () => void;
};

function ClientForm({ initial, onSaved, onCancel }: FormProps) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = draft.name.trim();
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
      name,
      contact_name: emptyToNull(draft.contact_name),
      contact_email: emptyToNull(draft.contact_email),
      contact_phone: emptyToNull(draft.contact_phone),
      adjustment_pct: normalisePct(pct),
    };
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (draft.id) {
        assertOk(await supabase.from("clients").update(payload).eq("id", draft.id));
      } else {
        assertOk(await supabase.from("clients").insert({ id: newId(), ...payload, active: true }));
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onArchive() {
    if (!draft.id) return;
    if (!window.confirm(`Archive ${draft.name}? It disappears from the lists, nothing is deleted.`)) return;
    setError(null);
    setBusy(true);
    try {
      assertOk(
        await getSupabase().from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id),
      );
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="card-title">{draft.id ? "Edit client" : "New client"}</div>
      <FormGrid>
        <Field label="Name">
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Contact name">
          <input className="input" value={draft.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
        </Field>
        <Field label="Contact email">
          <input
            className="input"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={draft.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
          />
        </Field>
        <Field label="Contact phone">
          <input
            className="input"
            type="tel"
            inputMode="tel"
            value={draft.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
          />
        </Field>
        <Field label="Adjustment %" hint="100 means list price, 90 means minus 10 percent">
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
      <Actions>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving" : "Save"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {draft.id ? (
          <button type="button" className="btn" onClick={onArchive} disabled={busy}>
            Archive
          </button>
        ) : null}
      </Actions>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

export default function ClientsPage() {
  const { data, error, loading, reload } = useAsync(loadClients, []);
  const [draft, setDraft] = useState<Draft | null>(null);

  function edit(c: Client) {
    setDraft(draftFrom(c));
  }

  return (
    <>
      <PageHead title="Clients">
        <button type="button" className="btn btn-primary" onClick={() => setDraft(blankDraft())}>
          Add client
        </button>
      </PageHead>
      {draft ? (
        <ClientForm
          key={draft.id ?? "new"}
          initial={draft}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th className="num">Adjustment %</th>
                  <th className="num">Buildings</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.clients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No clients yet. Add the first one.
                    </td>
                  </tr>
                ) : null}
                {data.clients.map((c) => (
                  <tr key={c.id} onClick={() => edit(c)} style={{ cursor: "pointer" }}>
                    <td className="row-title">{c.name}</td>
                    <td>{contactText(c) || <span className="muted">No contact</span>}</td>
                    <td className="num">{Number(c.adjustment_pct)}</td>
                    <td className="num">{data.buildingCounts[c.id] ?? 0}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          edit(c);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
