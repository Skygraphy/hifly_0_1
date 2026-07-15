import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { administrativeUnits, regions } from "@/db/schema";
import { setPersonalSetting } from "@/app/settings/actions";
import { PersistGuestStandortAndRedirect } from "@/components/persist-guest-standort-and-redirect";
import type { StandortRef } from "@/lib/standort";

const SETTING_KEY = "default_administrative_unit";

// administrativeUnits.id/regions.id sind echte Postgres-uuid-Spalten — ein
// ungültiges Literal löst dort einen Query-Fehler aus, keine leere
// Ergebnismenge. Muss daher VOR dem Query geprüft werden, damit ein
// Tippfehler im QR-Code/Pfad ganz normal 404't statt einen ungefangenen
// DB-Fehler zu werfen.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deep-Link (QR-Code, Link von anderer Seite): übernimmt den per URL
 * vorgegebenen Standort — Verwaltungseinheit ODER Region — als
 * default_administrative_unit, immer überschreibend, unabhängig von einem
 * eventuell schon vorhandenen Wert — und leitet auf "/" weiter, wo das
 * bestehende AdministrativeLevelWidget ihn automatisch anzeigt.
 */
export default async function AdministrativeUnitDeepLinkPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;

  if (!UUID_RE.test(unitId)) {
    notFound();
  }

  const [unit] = await db
    .select({ id: administrativeUnits.id })
    .from(administrativeUnits)
    .where(eq(administrativeUnits.id, unitId))
    .limit(1);

  let standort: StandortRef | null = null;
  if (unit) {
    standort = { type: "unit", id: unit.id };
  } else {
    // Kein Treffer in administrative_units — dieselbe id könnte trotzdem
    // eine Region sein.
    const [region] = await db.select({ id: regions.id }).from(regions).where(eq(regions.id, unitId)).limit(1);
    if (region) standort = { type: "region", id: region.id };
  }

  if (!standort) {
    notFound();
  }

  const session = await auth();

  if (session?.user) {
    // Ergebnis bewusst nicht geprüft: die Registry-Schwelle für diesen Key
    // ist minRoleToView "user" (siehe settings-registry.ts) — ein
    // Fehlschlag ist praktisch nur möglich, wenn ein super_admin die
    // Schwelle gezielt angehoben hat. Der Besucher landet so oder so
    // korrekt auf "/". revalidate: false, da direkt während des Renderns
    // dieser Seite aufgerufen (nicht über eine Server Action/Client-
    // Interaktion) — revalidatePath ist dort nicht erlaubt, und wird hier
    // ohnehin nicht gebraucht (redirect() wechselt sofort die Route).
    await setPersonalSetting(SETTING_KEY, standort, { revalidate: false });
    redirect("/");
  }

  return <PersistGuestStandortAndRedirect standort={standort} />;
}
