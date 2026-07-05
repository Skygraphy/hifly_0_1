// Erzeugt das für Auth.js' Apple-Provider benötigte "client secret": kein
// statischer String, sondern ein mit dem privaten Schlüssel (.p8 aus dem
// Apple Developer Portal) signiertes ES256-JWT. Läuft nach spätestens 6
// Monaten ab und muss dann erneut ausgeführt werden.
//
// Usage: node scripts/generate-apple-client-secret.mjs
// Erwartet AUTH_APPLE_TEAM_ID, AUTH_APPLE_ID, AUTH_APPLE_KEY_ID,
// AUTH_APPLE_PRIVATE_KEY in .env.local; gibt den fertigen JWT-String aus,
// der als AUTH_APPLE_SECRET in .env.local eingetragen werden muss.
import { config } from "dotenv";
import { SignJWT, importPKCS8 } from "jose";

config({ path: ".env.local", quiet: true });

const teamId = process.env.AUTH_APPLE_TEAM_ID;
const clientId = process.env.AUTH_APPLE_ID;
const keyId = process.env.AUTH_APPLE_KEY_ID;
const privateKey = process.env.AUTH_APPLE_PRIVATE_KEY;

if (!teamId || !clientId || !keyId || !privateKey) {
  console.error(
    "Fehlt: AUTH_APPLE_TEAM_ID, AUTH_APPLE_ID, AUTH_APPLE_KEY_ID und AUTH_APPLE_PRIVATE_KEY müssen in .env.local gesetzt sein."
  );
  process.exit(1);
}

const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");

const secret = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: keyId })
  .setIssuer(teamId)
  .setIssuedAt()
  .setExpirationTime("175days")
  .setAudience("https://appleid.apple.com")
  .setSubject(clientId)
  .sign(key);

console.log("AUTH_APPLE_SECRET=" + secret);
console.log("\nDiesen Wert als AUTH_APPLE_SECRET in .env.local eintragen (gültig ~175 Tage).");
