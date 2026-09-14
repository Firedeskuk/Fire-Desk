"use client";

type Props = {
  label: string;
  children: React.ReactNode;
  /* one short line under the input, for example "100 means list price" */
  hint?: string;
};

/* Label above an input, select or textarea. Classes come from theme.css. */
export default function Field({ label, children, hint }: Props) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint ? (
        <span className="muted small" style={{ display: "block", marginTop: 4 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
