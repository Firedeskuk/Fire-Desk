"use client";

type Props = { children?: React.ReactNode };

/* Error line under a form or a table. Renders nothing when there is no error. */
export default function ErrorText({ children }: Props) {
  if (!children) return null;
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}
