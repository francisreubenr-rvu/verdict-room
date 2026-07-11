import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client — used in Client Components (e.g. the login
// button's signInWithOAuth call). Reads the public URL/anon key, safe to
// bundle client-side.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
