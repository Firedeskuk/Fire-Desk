/*
  Local session: who is signed in on this device, their profile and the
  device id. Everything here is synchronous and local, so field screens can
  read it with zero network. Signing in and out (which needs Supabase) lives
  in lib/supabase/auth.ts and calls setLocalSession / clearLocalSession.

  The Supabase tokens themselves are kept by supabase-js in localStorage under
  the key firedesk-auth. This module only keeps what the UI needs.
*/

import { useSyncExternalStore } from "react";
import type { UserRole } from "@/lib/supabase/types";
import { readPref, subscribePrefs, writePref } from "./prefs";

export const SESSION_KEY = "firedesk.session";
export const DEVICE_ID_KEY = "firedesk.device_id";

export interface LocalProfile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface LocalSession {
  user_id: string;
  email: string | null;
  profile: LocalProfile;
  signed_in_at: string;
}

export const OFFICE_ROLES: UserRole[] = ["manager", "admin"];
export const FIELD_INSPECTOR_ROLES: UserRole[] = ["inspector", "manager", "admin"];
export const FIELD_REMEDIAL_ROLES: UserRole[] = ["remedial", "manager", "admin"];

let cached: LocalSession | null | undefined;

function fallbackUuid(): string {
  // RFC 4122 v4 from Math.random, used only where crypto.randomUUID is missing
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return fallbackUuid();
}

/* Created once per device and never changed. */
export function getDeviceId(): string {
  const existing = readPref(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = newId();
  writePref(DEVICE_ID_KEY, id);
  return id;
}

export function getLocalSession(): LocalSession | null {
  if (cached !== undefined) return cached;
  const raw = readPref(SESSION_KEY);
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as LocalSession;
    if (!parsed || !parsed.user_id || !parsed.profile || !parsed.profile.role) {
      cached = null;
      return null;
    }
    cached = parsed;
    return parsed;
  } catch {
    cached = null;
    return null;
  }
}

export function setLocalSession(session: LocalSession): void {
  cached = session;
  writePref(SESSION_KEY, JSON.stringify(session));
}

export function clearLocalSession(): void {
  cached = null;
  writePref(SESSION_KEY, null);
}

export function getProfile(): LocalProfile | null {
  return getLocalSession()?.profile ?? null;
}

export function getCurrentUserId(): string | null {
  return getLocalSession()?.user_id ?? null;
}

export function getRole(): UserRole | null {
  return getProfile()?.role ?? null;
}

/* Subscribe to session changes, for useSyncExternalStore. */
export function subscribeSession(listener: () => void): () => void {
  return subscribePrefs(listener);
}

/* Where each role lands after login. */
export function roleHome(role: UserRole | null | undefined): string {
  switch (role) {
    case "manager":
    case "admin":
      return "/dashboard";
    case "inspector":
      return "/buildings";
    case "remedial":
      return "/works";
    default:
      return "/login";
  }
}

export function roleLabel(role: UserRole | null | undefined): string {
  switch (role) {
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    case "inspector":
      return "Inspector";
    case "remedial":
      return "Remedial";
    default:
      return "";
  }
}

function noSession(): LocalSession | null {
  return null;
}

/* Read the local session from a component without hydration mismatches. */
export function useLocalSession(): LocalSession | null {
  return useSyncExternalStore(subscribeSession, getLocalSession, noSession);
}
