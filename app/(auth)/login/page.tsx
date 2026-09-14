"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/supabase/auth";
import { supabaseConfigured } from "@/lib/supabase/client";
import { roleHome } from "@/lib/local/session";

function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (next === "/login" || next === "/") return null;
  return next;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!supabaseConfigured()) {
      setError("Supabase is not configured. Add the keys to .env.local and restart.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You are offline. The first sign in needs a connection.");
      return;
    }

    setBusy(true);
    try {
      const session = await signIn(email.trim(), password);
      const next = safeNext(params.get("next"));
      router.replace(next ?? roleHome(session.profile.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span className="label">Email</span>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span className="label">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email || !password}>
        {busy ? "Signing in" : "Sign in"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="page-narrow">
      <div className="center" style={{ padding: "32px 0 20px" }}>
        <div className="brand" style={{ fontSize: 28 }}>
          Fire Desk
        </div>
        <p className="muted">Fire door and fire stopping compliance</p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
