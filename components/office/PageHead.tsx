"use client";

type Props = {
  title: string;
  /* buttons or links on the right, they wrap under the title on a phone */
  children?: React.ReactNode;
};

export default function PageHead({ title, children }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <h1 style={{ margin: 0, flex: "1 1 auto" }}>{title}</h1>
      {children}
    </div>
  );
}
