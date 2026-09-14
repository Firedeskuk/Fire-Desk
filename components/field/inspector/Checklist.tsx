"use client";

import { useState, type KeyboardEvent } from "react";
import PillButton from "./PillButton";
import { hasAnswer, isFailValue, normaliseValue, selectOptions, type TemplateItemRow } from "./inspection";

type AnswerHandler = (item: TemplateItemRow, value: string | null) => void | Promise<void>;

type Props = {
  items: TemplateItemRow[];
  /* current answer value by template item id */
  values: Map<string, string | null>;
  /* read only (completed inspection) or a save in flight */
  disabled: boolean;
  onAnswer: AnswerHandler;
};

/*
  The checklist on the door screen: one row per question. yes_no questions
  get two pill buttons, number and text questions an input saved on blur or
  Enter, select questions a dropdown. A failing answer shows "Finding created".
*/
export default function Checklist({ items, values, disabled, onAnswer }: Props) {
  if (items.length === 0) {
    return <p className="muted">This checklist has no questions.</p>;
  }
  return (
    <div>
      {items.map((item) => (
        <QuestionRow
          key={item.id}
          item={item}
          value={values.get(item.id) ?? null}
          disabled={disabled}
          onAnswer={onAnswer}
        />
      ))}
    </div>
  );
}

type RowProps = {
  item: TemplateItemRow;
  value: string | null;
  disabled: boolean;
  onAnswer: AnswerHandler;
};

function QuestionRow({ item, value, disabled, onAnswer }: RowProps) {
  const failing = isFailValue(item, value);
  return (
    <div className="question">
      <div className="question-text">
        {item.question}
        {item.required ? null : <span className="muted small"> (optional)</span>}
      </div>
      {item.answer_type === "yes_no" ? (
        <YesNo item={item} value={value} disabled={disabled} onAnswer={onAnswer} />
      ) : item.answer_type === "select" && selectOptions(item) ? (
        <SelectAnswer item={item} value={value} disabled={disabled} onAnswer={onAnswer} />
      ) : (
        <TextAnswer item={item} value={value} disabled={disabled} onAnswer={onAnswer} />
      )}
      {failing ? (
        <p className="small muted" style={{ marginTop: 6, marginBottom: 0 }}>
          Finding created
        </p>
      ) : null}
    </div>
  );
}

function YesNo({ item, value, disabled, onAnswer }: RowProps) {
  const current = normaliseValue(value);
  return (
    <div className="answers">
      <PillButton tone="green" pressed={current === "yes"} disabled={disabled} onClick={() => void onAnswer(item, "yes")}>
        Yes
      </PillButton>
      <PillButton tone="red" pressed={current === "no"} disabled={disabled} onClick={() => void onAnswer(item, "no")}>
        No
      </PillButton>
    </div>
  );
}

function SelectAnswer({ item, value, disabled, onAnswer }: RowProps) {
  const options = selectOptions(item) ?? [];
  return (
    <select
      className="select"
      value={value ?? ""}
      disabled={disabled}
      aria-label={item.question}
      onChange={(e) => onAnswer(item, e.target.value || null)}
    >
      <option value="">Choose</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/*
  Uncontrolled input keyed by the saved value: after a save the row remounts
  with the new default, while typing nothing re-renders under the finger.
  Saved on blur or Enter. Numbers are checked before saving.
*/
function TextAnswer({ item, value, disabled, onAnswer }: RowProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const isNumber = item.answer_type === "number";
  const saved = value ?? "";

  function commit(raw: string) {
    const next = raw.trim();
    if (next === saved.trim()) return;
    if (isNumber && next && !Number.isFinite(Number(next))) {
      setProblem("Enter a number");
      return;
    }
    setProblem(null);
    void onAnswer(item, hasAnswer(next) ? next : null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  return (
    <div>
      <input
        key={`${item.id}:${saved}`}
        className="input"
        type="text"
        inputMode={isNumber ? "decimal" : "text"}
        defaultValue={saved}
        disabled={disabled}
        aria-label={item.question}
        placeholder={isNumber ? "Number" : "Answer"}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      {problem ? (
        <p className="error" style={{ marginBottom: 0 }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
