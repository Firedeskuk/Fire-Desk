"use client";

type Props = { children: React.ReactNode };

/* Two columns of fields on a laptop, one column at phone width. */
export default function FormGrid({ children }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", columnGap: 12 }}>
      {children}
    </div>
  );
}
