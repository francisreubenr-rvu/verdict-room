import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

// POST /api/billing/portal — Stripe Billing Portal session so a subscriber
// can manage or cancel their own subscription. Necessary counterpart to
// /api/billing/checkout: a real subscription needs a real way off it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: { stripeCustomerId: true },
  });

  if (!subscription) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const portalSession = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${origin}/app`,
  });

  return NextResponse.json({ url: portalSession.url });
}
