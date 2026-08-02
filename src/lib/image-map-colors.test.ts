import { describe, expect, it } from "vitest";
import { resolveTargetLevel, resolveImageColor } from "./image-map-colors";
import type { AdministrativeUnit } from "./administrative-units";
import type { Region } from "./regions";

function makeUnit(overrides: Partial<AdministrativeUnit> & Pick<AdministrativeUnit, "id" | "parentId" | "level">): AdministrativeUnit {
  return {
    code: overrides.id,
    name: overrides.id,
    shortName: null,
    color: null,
    published: true,
    ...overrides,
  };
}

function makeRegion(overrides: Partial<Region> & Pick<Region, "id" | "homeLevel">): Region {
  return {
    name: overrides.id,
    description: null,
    color: null,
    parentId: null,
    published: true,
    ...overrides,
  };
}

// Bund -> NÖ -> Tulln -> Klosterneuburg -> Klbg Stadt -> Gebiet A / Gebiet B
const federal = makeUnit({ id: "federal-1", parentId: null, level: "federal", color: "#federal" });
const state = makeUnit({ id: "state-1", parentId: "federal-1", level: "state", color: "#state" });
const district = makeUnit({ id: "district-1", parentId: "state-1", level: "district", color: "#district" });
const municipality = makeUnit({ id: "muni-1", parentId: "district-1", level: "municipality", color: "#muni" });
const cadastral = makeUnit({ id: "kg-1", parentId: "muni-1", level: "cadastral_municipality", color: "#kg" });
const areaA = makeUnit({ id: "area-a", parentId: "kg-1", level: "area", color: "#areaA" });
const areaB = makeUnit({ id: "area-b", parentId: "kg-1", level: "area", color: "#areaB" });
// Zweite Gemeinde ohne eigene Katastralgemeinde/Gebiets-Unterteilung (kein
// Abgleich gelaufen) — Grundlage für den "gröber zugeordnet"-Fallback-Test.
const municipalityNoChildren = makeUnit({ id: "muni-2", parentId: "district-1", level: "municipality", color: "#muni2" });

const units: AdministrativeUnit[] = [federal, state, district, municipality, cadastral, areaA, areaB, municipalityNoChildren];
const unitsById = new Map(units.map((u) => [u.id, u]));

const regionAtState = makeRegion({ id: "region-1", homeLevel: "state", color: "#region1" });
const regionAtArea = makeRegion({ id: "region-2", homeLevel: "area", color: "#region2" });
const regions: Region[] = [regionAtState, regionAtArea];
const regionsById = new Map(regions.map((r) => [r.id, r]));

describe("resolveTargetLevel", () => {
  it("ohne Standort-Auswahl: Default area (volle Farbvielfalt in der Übersicht)", () => {
    expect(resolveTargetLevel(null, units, regions)).toBe("area");
  });

  it("area ausgewählt -> area selbst (keine tiefere Ebene mehr)", () => {
    expect(resolveTargetLevel({ type: "unit", id: "area-a" }, units, regions)).toBe("area");
  });

  it("cadastral_municipality ausgewählt -> area (Kind-Ebene)", () => {
    expect(resolveTargetLevel({ type: "unit", id: "kg-1" }, units, regions)).toBe("area");
  });

  it("municipality ausgewählt -> cadastral_municipality (Kind-Ebene)", () => {
    expect(resolveTargetLevel({ type: "unit", id: "muni-1" }, units, regions)).toBe("cadastral_municipality");
  });

  it("district ausgewählt -> municipality (Kind-Ebene)", () => {
    expect(resolveTargetLevel({ type: "unit", id: "district-1" }, units, regions)).toBe("municipality");
  });

  it("state ausgewählt -> district (Kind-Ebene)", () => {
    expect(resolveTargetLevel({ type: "unit", id: "state-1" }, units, regions)).toBe("district");
  });

  it("federal ausgewählt -> state (Kind-Ebene)", () => {
    expect(resolveTargetLevel({ type: "unit", id: "federal-1" }, units, regions)).toBe("state");
  });

  it("Region ausgewählt: homeLevel wird wie eine Einheiten-Ebene behandelt (Kind-Ebene)", () => {
    expect(resolveTargetLevel({ type: "region", id: "region-1" }, units, regions)).toBe("district");
  });

  it("Region ausgewählt mit homeLevel area -> area selbst", () => {
    expect(resolveTargetLevel({ type: "region", id: "region-2" }, units, regions)).toBe("area");
  });
});

describe("resolveImageColor", () => {
  it("Bild mit regionId nutzt direkt die (flache) Farbe der Region, unabhängig von targetLevel", () => {
    const color = resolveImageColor({ administrativeUnitId: null, regionId: "region-1" }, "area", unitsById, regionsById);
    expect(color).toBe("#region1");
  });

  it("Bild auf area-Ebene, Ziel-Ebene area -> eigene Farbe", () => {
    const color = resolveImageColor({ administrativeUnitId: "area-a", regionId: null }, "area", unitsById, regionsById);
    expect(color).toBe("#areaA");
  });

  it("Bild auf area-Ebene, Ziel-Ebene cadastral_municipality -> Farbe des Vorfahren auf dieser Ebene", () => {
    const color = resolveImageColor(
      { administrativeUnitId: "area-a", regionId: null },
      "cadastral_municipality",
      unitsById,
      regionsById
    );
    expect(color).toBe("#kg");
  });

  it("Bild auf area-Ebene, Ziel-Ebene district -> Farbe des Vorfahren auf district-Ebene", () => {
    const color = resolveImageColor({ administrativeUnitId: "area-b", regionId: null }, "district", unitsById, regionsById);
    expect(color).toBe("#district");
  });

  it("Fallback: Bild gröber zugeordnet als Ziel-Ebene (kein Vorfahre auf genau dieser Ebene) -> eigene Einheit", () => {
    const color = resolveImageColor(
      { administrativeUnitId: "muni-2", regionId: null },
      "cadastral_municipality",
      unitsById,
      regionsById
    );
    expect(color).toBe("#muni2");
  });

  it("weder administrativeUnitId noch regionId gesetzt -> null", () => {
    const color = resolveImageColor({ administrativeUnitId: null, regionId: null }, "area", unitsById, regionsById);
    expect(color).toBeNull();
  });
});
