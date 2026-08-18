import { headers } from "next/headers";

// Absolute Basis-URL der laufenden Anfrage — für Stripe Checkout Session
// return_url (siehe getCheckoutClientSecret in src/app/checkout/actions.ts),
// die zwingend absolut sein muss. Aus dem Host-Header der aktuellen Anfrage
// abgeleitet statt einer fest hinterlegten Env-Var, damit lokale
// Entwicklung/Preview-Deployments/Produktion ohne eigene Konfiguration je
// Umgebung funktionieren.
export async function getBaseUrl(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}`;
}
