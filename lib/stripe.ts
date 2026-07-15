import Stripe from "stripe";

// Lazy singleton — constructing eagerly at module load crashes Next.js's build-time
// page-data collection (which imports every route module) when STRIPE_SECRET_KEY isn't
// set yet, e.g. no .env.local. Matches lib/supabase/client.ts's factory pattern.
let client: Stripe | undefined;

// Billing is skipped for now (DEPLOY.md §h — Stripe doesn't support India-based merchants);
// no STRIPE_* env vars exist locally or in Vercel. The Pro card is a disabled "Coming soon"
// state in the UI, but the checkout/portal routes are still live endpoints — without this check
// they throw `new Stripe(undefined!)` and return an opaque 500 instead of a clear "not available"
// response (S5 finding).
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}
