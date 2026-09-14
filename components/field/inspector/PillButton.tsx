"use client";

import type { ReactNode } from "react";
import type { Tone } from "@/lib/due";

type Props = {
  /* colour while pressed, outline otherwise */
  tone: Tone;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

/*
  A pill shaped toggle button: Yes and No on the checklist, Low, Medium and
  High on the finding screen. Coloured with the given tone while pressed,
  outlined otherwise. The height comes from the button token so these most
  tapped controls meet the 48 px rule (theme.css .pill-button stops at 44 px).
*/
export default function PillButton({ tone, pressed, disabled = false, onClick, children }: Props) {
  return (
    <button
      type="button"
      className={`pill pill-button ${pressed ? `pill-${tone}` : "pill-outline"}`}
      style={{ minHeight: "var(--btn-height)" }}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
