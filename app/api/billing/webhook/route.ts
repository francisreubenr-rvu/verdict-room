import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// POST /api/billing/webhook — Stripe sends subscription lifecycle events here.
// Keeps the Subscription row in sync; this is the only place plan/status
// actually change (checkout/portal only redirect to Stripe-hosted pages).
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) break;

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      await prisma.subscription.update({
        where: { stripeCustomerId: session.customer as string },
        data: {
          plan: "pro",
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
        },
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: subscription.customer as string },
        data: {
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: subscription.customer as string },
        data: { plan: "free", status: "canceled" },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
