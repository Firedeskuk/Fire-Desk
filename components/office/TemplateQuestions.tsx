"use client";

import { useState } from "react";
import ErrorText from "./ErrorText";
import Field from "./Field";
import { assertOk, errorMessage, must } from "./helpers";
import { newId } from "@/lib/local/session";
import { getSupabase } from "@/lib/supabase/client";
import type { AnswerType, SurveyTemplate, SurveyTemplateItem } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type Props = {
  template: SurveyTemplate | null;
};

type Draft = {
  question: string;
  answer_type: AnswerType;
  required: boolean;
  fail_values: string;
};

const BLANK: Draft = { question: "", answer_type: "yes_no", required: true, fail_values: "no" };

const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: "yes_no", label: "Yes or no" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "photo", label: "Photo" },
];

function answerLabel(t: AnswerType): string {
  return ANSWER_TYPES.find((a) => a.value === t)?.label ?? t;
}

function draftFrom(i: SurveyTemplateItem): Draft {
  return {
    question: i.question,
    answer_type: i.answer_type,
    required: i.required,
    fail_values: (i.fail_values ?? []).join(", "),
  };
}

/* "no, missing" becomes ["no", "missing"], empty text becomes null. */
function failValuesFrom(text: string): string[] | null {
  const values = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return values.length > 0 ? values : null;
}

async function loadItems(templateId: string): Promise<SurveyTemplateItem[]> {
  return must(
    await getSupabase()
      .from("survey_template_items")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order")
      .order("created_at"),
  );
}

type FieldsProps = {
  draft: Draft;
  onChange: (d: Draft) => void;
  disabled: boolean;
};

function DraftFields({ draft, onChange, disabled }: FieldsProps) {
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ flex: "3 1 220px" }}>
        <Field label="Question">
          <input
            className="input"
            value={draft.question}
            onChange={(e) => set("question", e.target.value)}
            disabled={disabled}
          />
        </Field>
      </div>
      <div style={{ flex: "1 1 130px" }}>
        <Field label="Answer type">
          <select
            className="select"
            value={draft.answer_type}
            onChange={(e) => set("answer_type", e.target.value as AnswerType)}
            disabled={disabled}
          >
            {ANSWER_TYPES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ flex: "2 1 160px" }}>
        <Field label="Fail values" hint="Comma separated answers that raise a finding">
          <input
            className="input"
            value={draft.fail_values}
            onChange={(e) => set("fail_values", e.target.value)}
            disabled={disabled}
            placeholder="no"
          />
        </Field>
      </div>
      <div style={{ flex: "0 0 auto", marginBottom: 12 }}>
        <label className="btn" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => set("required", e.target.checked)}
            disabled={disabled}
          />
          Required
        </label>
      </div>
    </div>
  );
}

/*
  Questions of the selected template: list in sort order, add, edit, move up
  and down. Moving swaps sort_order with the neighbour and saves both rows.
*/
export default function TemplateQuestions({ template }: Props) {
  const templateId = template?.id ?? null;
  const { data, error, loading, reload } = useAsync(
    () => (templateId ? loadItems(templateId) : Promise.resolve([] as SurveyTemplateItem[])),
    [templateId],
  );
  const [adding, setAdding] = useState<Draft>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const items = data ?? [];

  async function run(work: () => Promise<void>) {
    setActionError(null);
    setBusy(true);
    try {
      await work();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function validate(d: Draft): string | null {
    if (!d.question.trim()) return "Question text is required.";
    return null;
  }

  function addQuestion() {
    if (!templateId) return;
    const problem = validate(adding);
    if (problem) {
      setActionError(problem);
      return;
    }
    const sortOrder = items.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1;
    void run(async () => {
      assertOk(
        await getSupabase()
          .from("survey_template_items")
          .insert({
            id: newId(),
            template_id: templateId,
            question: adding.question.trim(),
            answer_type: adding.answer_type,
            required: adding.required,
            fail_values: failValuesFrom(adding.fail_values),
            sort_order: sortOrder,
          }),
      );
      setAdding({ ...BLANK, answer_type: adding.answer_type, fail_values: adding.fail_values });
    });
  }

  function saveEdit(id: string) {
    const problem = validate(editing);
    if (problem) {
      setActionError(problem);
      return;
    }
    void run(async () => {
      assertOk(
        await getSupabase()
          .from("survey_template_items")
          .update({
            question: editing.question.trim(),
            answer_type: editing.answer_type,
            required: editing.required,
            fail_values: failValuesFrom(editing.fail_values),
          })
          .eq("id", id),
      );
      setEditingId(null);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const j = index + direction;
    if (j < 0 || j >= items.length) return;
    const a = items[index];
    const b = items[j];
    const updates: { id: string; sort_order: number }[] = [];
    if (a.sort_order === b.sort_order) {
      // duplicate numbers, renumber the whole list after the swap
      const order = [...items];
      order[index] = b;
      order[j] = a;
      order.forEach((it, i) => {
        if (it.sort_order !== i) updates.push({ id: it.id, sort_order: i });
      });
    } else {
      updates.push({ id: a.id, sort_order: b.sort_order }, { id: b.id, sort_order: a.sort_order });
    }
    void run(async () => {
      const supabase = getSupabase();
      for (const u of updates) {
        assertOk(await supabase.from("survey_template_items").update({ sort_order: u.sort_order }).eq("id", u.id));
      }
    });
  }

  if (!template) {
    return (
      <section className="card" style={{ marginTop: 0 }} aria-label="Questions">
        <div className="card-title">Questions</div>
        <p className="muted">Pick a template on the left, or add one.</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ marginTop: 0 }} aria-label="Questions">
      <div className="card-title">
        Questions, {template.name} v{template.version}
      </div>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {items.length === 0 && data ? <p className="muted">No questions yet. Add the first one below.</p> : null}
      {items.map((item, index) =>
        editingId === item.id ? (
          <div className="row" key={item.id} style={{ flexWrap: "wrap" }}>
            <div className="row-main">
              <DraftFields draft={editing} onChange={setEditing} disabled={busy} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => saveEdit(item.id)}
                  disabled={busy}
                >
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditingId(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="row" key={item.id} style={{ flexWrap: "wrap" }}>
            <div className="muted" style={{ minWidth: 28 }}>
              {index + 1}
            </div>
            <div className="row-main">
              <div className="row-title">{item.question}</div>
              <div className="row-sub">
                {answerLabel(item.answer_type)}
                {item.required ? ", required" : ", optional"}
                {item.fail_values && item.fail_values.length > 0
                  ? `, fails on: ${item.fail_values.join(", ")}`
                  : ", never raises a finding"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn"
                onClick={() => move(index, -1)}
                disabled={busy || index === 0}
                aria-label={`Move question ${index + 1} up`}
              >
                Up
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => move(index, 1)}
                disabled={busy || index === items.length - 1}
                aria-label={`Move question ${index + 1} down`}
              >
                Down
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setActionError(null);
                  setEditingId(item.id);
                  setEditing(draftFrom(item));
                }}
                disabled={busy}
              >
                Edit
              </button>
            </div>
          </div>
        ),
      )}
      <hr className="hr" />
      <div className="label">Add question</div>
      <DraftFields draft={adding} onChange={setAdding} disabled={busy} />
      <button type="button" className="btn" onClick={addQuestion} disabled={busy}>
        Add question
      </button>
      <ErrorText>{actionError}</ErrorText>
    </section>
  );
}
