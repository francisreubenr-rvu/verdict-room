import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Server-side Supabase client — used in Server Components, Route Handlers,
// and Server Actions. Reads/writes the session via Next.js's cookie store per
// the standard @supabase/ssr Next.js App Router pattern.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is called from a Server Component in some cases (e.g.
            // during a page render triggered by middleware refreshing the
            // session). This can be ignored if middleware is also refreshing
            // sessions on every request.
          }
        },
      },
    }
  );
}
