import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  administrativeUnits,
  regions as regionsTable,
  regionAdministrativeUnits,
  adminLocationGrants,
} from "@/db/schema";
import type { Role } from "@/lib/authorization";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region, RegionAdministrativeUnitLink } from "@/lib/regions";

export interface ImageUploadLocationData {
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
  /** super_admin: alle vorhandenen IDs (keine echte Einschränkung). admin:
   * exakt die über admin_location_grants freigegebenen IDs. */
  grantedUnitIds: string[];
  grantedRegionIds: string[];
}

/**
 * Lädt den vollständigen (ungefilterten, wie im Admin-Bereich üblich —
 * Entwürfe eingeschlossen) Verwaltungsgliederungs-/Regionen-Baum PLUS die
 * für den aktuellen Admin freigegebene Teilmenge — Grundlage für die
 * Standort-Picker auf der Bild-Upload-Seite (voller Baum fürs Navigieren,
 * Freigabe-Menge fürs Ein-/Ausblenden der Klickbarkeit pro Zeile, siehe
 * canAssignImageLocation in src/lib/authorization.ts).
 */
export async function getImageUploadLocationData(userId: string, role: Role): Promise<ImageUploadLocationData> {
  const [units, regionRows, linkRows] = await Promise.all([
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
      .orderBy(regionsTable.name),
    db
      .select({
        regionId: regionAdministrativeUnits.regionId,
        administrativeUnitId: regionAdministrativeUnits.administrativeUnitId,
      })
      .from(regionAdministrativeUnits),
  ]);

  if (role === "super_admin") {
    return {
      units,
      regions: regionRows,
      regionLinks: linkRows,
      grantedUnitIds: units.map((unit) => unit.id),
      grantedRegionIds: regionRows.map((region) => region.id),
    };
  }

  const grants = await db
    .select({
      administrativeUnitId: adminLocationGrants.administrativeUnitId,
      regionId: adminLocationGrants.regionId,
    })
    .from(adminLocationGrants)
    .where(eq(adminLocationGrants.adminUserId, userId));

  return {
    units,
    regions: regionRows,
    regionLinks: linkRows,
    grantedUnitIds: grants
      .map((grant) => grant.administrativeUnitId)
      .filter((id): id is string => id !== null),
    grantedRegionIds: grants.map((grant) => grant.regionId).filter((id): id is string => id !== null),
  };
}
