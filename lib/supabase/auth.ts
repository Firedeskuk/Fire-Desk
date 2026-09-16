/*
  Sign in and sign out against Supabase Auth, plus loading the profile.
  Office and login code call this. The local mirror of the session is kept
  in lib/local/session.ts so field screens never need this module.
*/

import { getSupabase } from "./client";
import type { Profile } from "./types";
import {
  clearLocalSession,
  setLocalSession,
  type LocalProfile,
  type LocalSession,
} from "@/lib/local/session";

export class AuthError extends Error {}

function toLocalProfile(p: Pick<Profile, "id" | "full_name" | "role">): LocalProfile {
  return { id: p.id, full_name: p.full_name, role: p.role };
}

/* Email and password sign in. Loads the profile and stores it locally. */
export async function signIn(email: string, password: string): Promise<LocalSession> {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new AuthError(error?.message || "Sign in failed");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut({ scope: "local" });
    throw new AuthError("No profile found for this user. Ask a manager to set it up.");
  }
  if (!profile.active) {
    await supabase.auth.signOut({ scope: "local" });
    throw new AuthError("This account is disabled.");
  }

  const session: LocalSession = {
    user_id: data.user.id,
    email: data.user.email ?? email,
    profile: toLocalProfile(profile),
    signed_in_at: new Date().toISOString(),
  };
  setLocalSession(session);
  return session;
}

/* Re-reads the profile (role may have changed in the office). Online only. */
export async function refreshProfile(): Promise<LocalProfile | null> {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.active) return null;

  setLocalSession({
    user_id: user.id,
    email: user.email ?? null,
    profile: toLocalProfile(profile),
    signed_in_at: new Date().toISOString(),
  });
  return toLocalProfile(profile);
}

export interface SignOutOptions {
  /* Number of outbox rows not yet sent. Logout is refused when above zero. */
  pendingCount: number;
  /* Called after the Supabase session is gone, to wipe local data. */
  wipeLocal?: () => Promise<void>;
}

export function logoutBlockedMessage(pendingCount: number): string {
  return `${pendingCount} ${pendingCount === 1 ? "change is" : "changes are"} not yet sent. Sync first.`;
}

/* Signs out. Refuses while the outbox is not empty. */
export async function signOut(options: SignOutOptions): Promise<void> {
  if (options.pendingCount > 0) {
    throw new AuthError(logoutBlockedMessage(options.pendingCount));
  }
  try {
    const supabase = getSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // offline or not configured: local sign out still happens
  }
  clearLocalSession();
  if (options.wipeLocal) {
    await options.wipeLocal();
  }
}

/* True when supabase-js still holds a session on this device. No network. */
export async function hasSupabaseSession(): Promise<boolean> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}
