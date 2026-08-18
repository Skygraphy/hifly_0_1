import Stripe from "stripe";

// Einziger Ort mit Stripe-Client-Instanziierung — gleiches Singleton-Muster
// wie getS3Client() in src/lib/s3.ts.
let client: Stripe | undefined;

export function getStripeClient(): Stripe {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY ist nicht gesetzt.");
    // Explizit gepinnte API-Version statt des SDK-Defaults — verhindert, dass
    // ein zukünftiges Stripe-Account-Update (Dashboard-seitige Standard-
    // Version) unbemerkt das Antwortformat verändert.
    client = new Stripe(secretKey, { apiVersion: "2026-07-29.dahlia" });
  }
  return client;
}
