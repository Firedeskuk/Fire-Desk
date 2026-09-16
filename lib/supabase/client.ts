/*
  Browser Supabase client. One instance per tab. The session lives in
  localStorage (supabase-js default), never in cookies, so the same code runs
  inside a native shell later. No @supabase/ssr on purpose.

  Field screens under app/(field) must not import this file. They talk to
  lib/local, and lib/sync is the only field side code that reaches the server.
*/

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type FireDeskSupabase = SupabaseClient<Database>;

let client: FireDeskSupabase | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase(): FireDeskSupabase {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "firedesk-auth",
    },
    global: {
      headers: { "x-application-name": "fire-desk" },
    },
  });

  return client;
}
