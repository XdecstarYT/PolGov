/**
 * supabase.ts — optional backend.
 *
 * Statecraft is designed to be fully playable with no backend at all: without
 * these environment variables the game runs in the browser and saves to
 * localStorage. When they are present the client additionally gets accounts,
 * cloud saves, server-authoritative turn resolution and the AI narrator.
 *
 * Only publishable values are read here. The Groq key is never present in the
 * client — it lives in Supabase's encrypted secret store and is read only
 * inside the ai-narrator edge function.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isCloudConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Throws if called when the backend is not configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return supabase;
}
