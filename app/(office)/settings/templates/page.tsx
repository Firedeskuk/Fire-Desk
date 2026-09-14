"use client";

import { useState, type FormEvent } from "react";
import Actions from "@/components/office/Actions";
import ErrorText from "@/components/office/ErrorText";
import Field from "@/components/office/Field";
import TemplateQuestions from "@/components/office/TemplateQuestions";
import { assertOk, errorMessage, must, workTypeLabel } from "@/components/office/helpers";
import Pill from "@/components/ui/Pill";
import { newId } from "@/lib/local/session";
import { getSupabase } from "@/lib/supabase/client";
import type { SurveyTemplate, WorkType } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

async function loadTemplates(): Promise<SurveyTemplate[]> {
  return must(
    await getSupabase().from("survey_templates").select("*").order("work_type").order("name").order("version"),
  );
}

export default function TemplatesPage() {
  const { data, error, loading, reload } = useAsync(loadTemplates, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<WorkType>("doors");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const templates = data ?? [];
  const selectedId =
    selected && templates.some((t) => t.id === selected) ? selected : (templates[0]?.id ?? null);
  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  async function addTemplate(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    const name = newName.trim();
    if (!name) {
      setActionError("Template name is required.");
      return;
    }
    setBusy(true);
    try {
      const id = newId();
      assertOk(
        await getSupabase()
          .from("survey_templates")
          .insert({ id, name, work_type: newType, version: 1, active: true }),
      );
      setSelected(id);
      setNewName("");
      setShowAdd(false);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: SurveyTemplate) {
    setActionError(null);
    setBusy(true);
    try {
      assertOk(await getSupabase().from("survey_templates").update({ active: !t.active }).eq("id", t.id));
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Survey templates</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section className="card" style={{ flex: "1 1 260px", marginTop: 0 }} aria-label="Templates">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="card-title" style={{ flex: 1, marginBottom: 0 }}>
              Templates
            </div>
            <button type="button" className="btn" onClick={() => setShowAdd((s) => !s)}>
              {showAdd ? "Close" : "Add template"}
            </button>
          </div>
          {showAdd ? (
            <form onSubmit={addTemplate} noValidate style={{ marginTop: 12 }}>
              <Field label="Name">
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </Field>
              <Field label="Work type">
                <select className="select" value={newType} onChange={(e) => setNewType(e.target.value as WorkType)}>
                  <option value="doors">Doors</option>
                  <option value="fs">Fire stopping</option>
                </select>
              </Field>
              <Actions>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Save
                </button>
              </Actions>
            </form>
          ) : null}
          {loading && !data ? <p className="muted">Loading</p> : null}
          <ErrorText>{error}</ErrorText>
          {data && templates.length === 0 ? <p className="muted">No templates yet.</p> : null}
          {templates.map((t) => (
            <div className="row" key={t.id} style={{ flexWrap: "wrap" }}>
              <div className="row-main">
                <div className="row-title">{t.name}</div>
                <div className="row-sub">
                  {workTypeLabel(t.work_type)}, version {t.version}
                </div>
              </div>
              <label className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={t.active}
                  onChange={() => toggleActive(t)}
                  disabled={busy}
                  style={{ width: 22, height: 22 }}
                />
                Active
              </label>
              {t.id === selectedId ? (
                <Pill tone="green">Selected</Pill>
              ) : (
                <button type="button" className="btn" onClick={() => setSelected(t.id)}>
                  Open
                </button>
              )}
            </div>
          ))}
          <ErrorText>{actionError}</ErrorText>
        </section>
        <div style={{ flex: "3 1 420px", minWidth: 0 }}>
          <TemplateQuestions template={selectedTemplate} />
        </div>
      </div>
    </>
  );
}
