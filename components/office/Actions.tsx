"use client";

type Props = { children: React.ReactNode };

/* Row of buttons under a form. Wraps on a narrow window, buttons keep their own width. */
export default function Actions({ children }: Props) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>{children}</div>;
}
