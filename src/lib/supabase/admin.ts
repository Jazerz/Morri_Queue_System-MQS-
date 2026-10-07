import "server-only";
import { createClient } from "@supabase/supabase-js";

// Never use this client for normal data access, or expose its key to the browser.
export function supabaseAuthAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("ADMIN_KEY_MISSING");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
