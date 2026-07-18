import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

// POST /api/billing/checkout — creates (or reuses) a Stripe customer for the
// signed-in user, then a Checkout Session for the Pro monthly subscription.
// The Subscription row's plan stays "free" until the webhook confirms payment
// (checkout.session.completed) — this route only sets up the customer link.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not available yet" }, { status: 503 });
  }

  const stripe = getStripe();
  const existing = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: { stripeCustomerId: true },
  });

  const customerId =
    existing?.stripeCustomerId ??
    (
      await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
    ).id;

  if (!existing) {
    await prisma.subscription.create({
      data: { userId: user.id, stripeCustomerId: customerId },
    });
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    success_url: `${origin}/app`,
    cancel_url: `${origin}/pricing`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
