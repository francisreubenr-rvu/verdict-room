import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the OAuth `code` param for a session, per Supabase's Next.js App
// Router callback pattern: https://supabase.com/docs/guides/auth/server-side/nextjs
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed or no code present — send the user back to login with an
  // error flag rather than silently redirecting to the app.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
