"use client";

import { useRef, type ChangeEvent } from "react";

type Props = {
  onFile: (file: File) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
};

/*
  A 48 px button that opens the phone camera through a hidden file input
  with capture="environment". The caller compresses and stores the file.
*/
export default function PhotoCapture({ onFile, disabled, label = "Take photo" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) void onFile(file);
  }

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        disabled={disabled}
        onChange={onChange}
        aria-hidden="true"
      />
      <button type="button" className="btn btn-block" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
    </>
  );
}
