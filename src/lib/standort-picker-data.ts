import { eq } from "drizzle-orm";
import { db } from "@/db";
import { administrativeUnits, regions as regionsTable, regionAdministrativeUnits } from "@/db/schema";
import { getPersonalSettings } from "@/lib/settings-service";
import { parseStandortValue, type StandortRef } from "@/lib/standort";
import type { Role } from "@/lib/authorization";
import { filterPublishedUnits, type AdministrativeUnit } from "@/lib/administrative-units";
import type { Region, RegionAdministrativeUnitLink } from "@/lib/regions";

const SETTING_KEY = "default_administrative_unit";

/**
 * Lädt die vollständigen Auswahl-Daten für den öffentlichen Standort-
 * Picker ("/", "/images"): Verwaltungseinheiten-Baum (flach), die Liste der
 * Regionen, deren Verknüpfungen zu Einheiten (regionLinks — flach, damit
 * clientseitig via groupRegionsByParent eine Map berechnet werden kann,
 * ohne eine Map über die RSC-Grenze serialisieren zu müssen), plus den
 * serverseitig bekannten Standort (Unit ODER Region) für eingeloggte User
 * (vermeidet Flackern beim ersten Render). Anonyme Besucher lösen ihren
 * Standort clientseitig aus localStorage auf — initialStandort ist für sie
 * null.
 */
export async function getStandortPickerData(
  userId: string | undefined,
  role: Role | undefined
): Promise<{
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
  initialStandort: StandortRef | null;
}> {
  const [rawUnits, regionRows, linkRows] = await Promise.all([
    db
      .select({
        id: administrativeUnits.id,
        parentId: administrativeUnits.parentId,
        level: administrativeUnits.level,
        code: administrativeUnits.code,
        name: administrativeUnits.name,
        shortName: administrativeUnits.shortName,
        color: administrativeUnits.color,
        published: administrativeUnits.published,
      })
      .from(administrativeUnits)
      .orderBy(administrativeUnits.name),
    db
      .select({
        id: regionsTable.id,
        name: regionsTable.name,
        description: regionsTable.description,
        color: regionsTable.color,
        parentId: regionsTable.parentId,
        homeLevel: regionsTable.homeLevel,
        published: regionsTable.published,
      })
      .from(regionsTable)
      .where(eq(regionsTable.published, true))
      .orderBy(regionsTable.name),
    db
      .select({
        regionId: regionAdministrativeUnits.regionId,
        administrativeUnitId: regionAdministrativeUnits.administrativeUnitId,
      })
      .from(regionAdministrativeUnits),
  ]);

  const initialStandort =
    userId && role ? parseStandortValue((await getPersonalSettings(userId, role))[SETTING_KEY]) : null;

  // Kaskadierend gefiltert: eine nicht freigegebene Einheit blockiert auch
  // ihren gesamten Unterbaum, siehe filterPublishedUnits. Regionen, die nur
  // an (dadurch entfernte) Einheiten hängen, verschwinden danach von selbst
  // aus groupRegionsByParent (bestehende unitById.has-Prüfung dort).
  const units = filterPublishedUnits(rawUnits);

  return { units, regions: regionRows, regionLinks: linkRows, initialStandort };
}
