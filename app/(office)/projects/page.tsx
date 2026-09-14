"use client";

import { useState, type FormEvent } from "react";
import Actions from "@/components/office/Actions";
import ErrorText from "@/components/office/ErrorText";
import Field from "@/components/office/Field";
import FormGrid from "@/components/office/FormGrid";
import PageHead from "@/components/office/PageHead";
import { assertOk, errorMessage, must, workTypeLabel } from "@/components/office/helpers";
import Pill from "@/components/ui/Pill";
import { formatDate, isSensibleDate, type Tone } from "@/lib/due";
import { newId, useLocalSession } from "@/lib/local/session";
import { getSupabase } from "@/lib/supabase/client";
import type { Project, ProjectStatus, WorkType } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type ClientOption = { id: string; name: string };
type BuildingOption = { id: string; name: string; client_id: string };

type ProjectsData = {
  projects: Project[];
  clients: ClientOption[];
  buildings: BuildingOption[];
};

type Draft = {
  id: string | null;
  client_id: string;
  building_id: string;
  work_type: WorkType;
  name: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
};

const STATUSES: { value: ProjectStatus; label: string; tone: Tone }[] = [
  { value: "planned", label: "Planned", tone: "grey" },
  { value: "in_progress", label: "In progress", tone: "orange" },
  { value: "completed", label: "Completed", tone: "green" },
  { value: "cancelled", label: "Cancelled", tone: "red" },
];

function statusOf(value: ProjectStatus) {
  return STATUSES.find((s) => s.value === value) ?? STATUSES[0];
}

async function loadProjects(): Promise<ProjectsData> {
  const supabase = getSupabase();
  const [projectsRes, clientsRes, buildingsRes] = await Promise.all([
    supabase.from("projects").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("buildings").select("id, name, client_id").is("deleted_at", null).order("name"),
  ]);
  return { projects: must(projectsRes), clients: must(clientsRes), buildings: must(buildingsRes) };
}

function blankDraft(): Draft {
  return {
    id: null,
    client_id: "",
    building_id: "",
    work_type: "doors",
    name: "",
    status: "planned",
    start_date: "",
    end_date: "",
  };
}

function draftFrom(p: Project): Draft {
  return {
    id: p.id,
    client_id: p.client_id,
    building_id: p.building_id,
    work_type: p.work_type,
    name: p.name,
    status: p.status,
    start_date: p.start_date ?? "",
    end_date: p.end_date ?? "",
  };
}

type FormProps = {
  initial: Draft;
  clients: ClientOption[];
  buildings: BuildingOption[];
  userId: string | null;
  onSaved: () => void;
  onCancel: () => void;
};

function ProjectForm({ initial, clients, buildings, userId, onSaved, onCancel }: FormProps) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const clientBuildings = buildings.filter((b) => b.client_id === draft.client_id);

  function onClientChange(clientId: string) {
    setDraft((d) => ({
      ...d,
      client_id: clientId,
      building_id: buildings.some((b) => b.id === d.building_id && b.client_id === clientId) ? d.building_id : "",
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = draft.name.trim();
    if (!draft.client_id) {
      setError("Pick a client.");
      return;
    }
    if (!draft.building_id) {
      setError("Pick a building.");
      return;
    }
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!isSensibleDate(draft.start_date) || !isSensibleDate(draft.end_date)) {
      setError("Dates must be between 2000 and ten years from now.");
      return;
    }
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      setError("End date cannot be before the start date.");
      return;
    }
    const payload = {
      client_id: draft.client_id,
      building_id: draft.building_id,
      work_type: draft.work_type,
      name,
      status: draft.status,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
    };
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (draft.id) {
        assertOk(await supabase.from("projects").update(payload).eq("id", draft.id));
      } else {
        assertOk(await supabase.from("projects").insert({ id: newId(), ...payload, created_by: userId }));
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function onArchive() {
    if (!draft.id) return;
    if (!window.confirm(`Archive project ${draft.name}? It disappears from the list, nothing is deleted.`)) return;
    setError(null);
    setBusy(true);
    try {
      assertOk(
        await getSupabase().from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", draft.id),
      );
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <div className="card-title">{draft.id ? "Edit project" : "New project"}</div>
      <FormGrid>
        <Field label="Client">
          <select className="select" value={draft.client_id} onChange={(e) => onClientChange(e.target.value)}>
            <option value="">Pick a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Building">
          <select
            className="select"
            value={draft.building_id}
            onChange={(e) => set("building_id", e.target.value)}
            disabled={!draft.client_id}
          >
            <option value="">{draft.client_id ? "Pick a building" : "Pick a client first"}</option>
            {clientBuildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Work type">
          <select
            className="select"
            value={draft.work_type}
            onChange={(e) => set("work_type", e.target.value as WorkType)}
          >
            <option value="doors">Doors</option>
            <option value="fs">Fire stopping</option>
          </select>
        </Field>
        <Field label="Name">
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Status">
          <select
            className="select"
            value={draft.status}
            onChange={(e) => set("status", e.target.value as ProjectStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input
            className="input"
            type="date"
            value={draft.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </Field>
        <Field label="End date">
          <input className="input" type="date" value={draft.end_date} onChange={(e) => set("end_date", e.target.value)} />
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

function datesText(p: Project): string {
  const start = formatDate(p.start_date);
  const end = formatDate(p.end_date);
  if (start && end) return `${start} to ${end}`;
  if (start) return `from ${start}`;
  if (end) return `until ${end}`;
  return "";
}

export default function ProjectsPage() {
  const session = useLocalSession();
  const { data, error, loading, reload } = useAsync(loadProjects, []);
  const [draft, setDraft] = useState<Draft | null>(null);

  const clientName = (id: string) => data?.clients.find((c) => c.id === id)?.name ?? "";
  const buildingName = (id: string) => data?.buildings.find((b) => b.id === id)?.name ?? "";

  return (
    <>
      <PageHead title="Projects">
        <button type="button" className="btn btn-primary" onClick={() => setDraft(blankDraft())}>
          Add project
        </button>
      </PageHead>
      {draft && data ? (
        <ProjectForm
          key={draft.id ?? "new"}
          initial={draft}
          clients={data.clients}
          buildings={data.buildings}
          userId={session?.user_id ?? null}
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
                  <th>Client</th>
                  <th>Building</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Dates</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.projects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No projects yet. Add the first one.
                    </td>
                  </tr>
                ) : null}
                {data.projects.map((p) => (
                  <tr key={p.id} onClick={() => setDraft(draftFrom(p))} style={{ cursor: "pointer" }}>
                    <td className="row-title">{p.name}</td>
                    <td>{clientName(p.client_id)}</td>
                    <td>{buildingName(p.building_id)}</td>
                    <td>{workTypeLabel(p.work_type)}</td>
                    <td>
                      <Pill tone={statusOf(p.status).tone}>{statusOf(p.status).label}</Pill>
                    </td>
                    <td>{datesText(p) || <span className="muted">No dates</span>}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraft(draftFrom(p));
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
