import Stripe from "stripe";

// Lazy singleton — constructing eagerly at module load crashes Next.js's build-time
// page-data collection (which imports every route module) when STRIPE_SECRET_KEY isn't
// set yet, e.g. no .env.local. Matches lib/supabase/client.ts's factory pattern.
let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}
