import type { Tone } from "@/lib/due";

type Props = {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
};

/* Status pill. Colours come from theme.css variables only. */
export default function Pill({ tone = "grey", children, className, title }: Props) {
  return (
    <span className={`pill pill-${tone} ${className ?? ""}`} title={title}>
      {children}
    </span>
  );
}
