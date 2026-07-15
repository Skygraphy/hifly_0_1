import { describe, expect, it } from "vitest";
import { groupRegionsByParent, type Region, type RegionAdministrativeUnitLink } from "@/lib/regions";
import type { AdministrativeUnit } from "@/lib/administrative-units";

const at: AdministrativeUnit = {
  id: "at",
  parentId: null,
  level: "federal",
  code: "AT",
  name: "Österreich",
  shortName: null,
  color: null,
};
const salzburg: AdministrativeUnit = {
  id: "salzburg",
  parentId: "at",
  level: "state",
  code: "S",
  name: "Salzburg",
  shortName: null,
  color: null,
};
const tirol: AdministrativeUnit = {
  id: "tirol",
  parentId: "at",
  level: "state",
  code: "T",
  name: "Tirol",
  shortName: null,
  color: null,
};
const kaernten: AdministrativeUnit = {
  id: "kaernten",
  parentId: "at",
  level: "state",
  code: "K",
  name: "Kärnten",
  shortName: null,
  color: null,
};
const zellAmSee: AdministrativeUnit = {
  id: "zell-am-see",
  parentId: salzburg.id,
  level: "district",
  code: "ZE",
  name: "Zell am See",
  shortName: null,
  color: null,
};
const lienz: AdministrativeUnit = {
  id: "lienz",
  parentId: tirol.id,
  level: "district",
  code: "LI",
  name: "Lienz",
  shortName: null,
  color: null,
};
const spittal: AdministrativeUnit = {
  id: "spittal",
  parentId: kaernten.id,
  level: "district",
  code: "SP",
  name: "Spittal an der Drau",
  shortName: null,
  color: null,
};
const noe: AdministrativeUnit = {
  id: "noe",
  parentId: "at",
  level: "state",
  code: "N",
  name: "Niederösterreich",
  shortName: null,
  color: null,
};
const kremsLand: AdministrativeUnit = {
  id: "krems-land",
  parentId: noe.id,
  level: "district",
  code: "KR",
  name: "Krems-Land",
  shortName: null,
  color: null,
};
const melk: AdministrativeUnit = {
  id: "melk",
  parentId: noe.id,
  level: "district",
  code: "ME",
  name: "Melk",
  shortName: null,
  color: null,
};

const units = [at, salzburg, tirol, kaernten, zellAmSee, lienz, spittal, noe, kremsLand, melk];

const hoheTauern: Region = {
  id: "hohe-tauern",
  name: "Hohe Tauern",
  description: null,
  color: null,
  homeParentId: null,
  homeLevel: "federal",
};
const wachau: Region = {
  id: "wachau",
  name: "Wachau",
  description: null,
  color: null,
  homeParentId: null,
  homeLevel: "federal",
};

describe("groupRegionsByParent", () => {
  it("ordnet eine Region mit mehreren verknüpften Einheiten unter DEMSELBEN Elternknoten diesem Elternknoten zu (einmal, dedupliziert)", () => {
    const links: RegionAdministrativeUnitLink[] = [
      { regionId: wachau.id, administrativeUnitId: kremsLand.id },
      { regionId: wachau.id, administrativeUnitId: melk.id },
    ];
    const result = groupRegionsByParent(units, [wachau], links);
    expect(result.get(noe.id)).toEqual([wachau]);
    expect(result.size).toBe(1);
  });

  it("ordnet eine Region mit verknüpften Einheiten unter VERSCHIEDENEN Eltern deren niedrigstem gemeinsamen Vorfahren zu (einmal, nicht je Elternknoten)", () => {
    const links: RegionAdministrativeUnitLink[] = [
      { regionId: hoheTauern.id, administrativeUnitId: zellAmSee.id },
      { regionId: hoheTauern.id, administrativeUnitId: lienz.id },
      { regionId: hoheTauern.id, administrativeUnitId: spittal.id },
    ];
    const result = groupRegionsByParent(units, [hoheTauern], links);
    // Salzburg/Tirol/Kärnten sind alle Kinder von "at" (Österreich) — das ist
    // der gemeinsame Vorfahre, also erscheint die Region in der Spalte, die
    // die Kinder von "at" auflistet (Bundesland-Spalte), NICHT einzeln unter
    // jedem der drei Bundesländer.
    expect(result.get(at.id)).toEqual([hoheTauern]);
    expect(result.get(salzburg.id) ?? []).toEqual([]);
    expect(result.get(tirol.id) ?? []).toEqual([]);
    expect(result.get(kaernten.id) ?? []).toEqual([]);
    expect(result.size).toBe(1);
  });

  it("ordnet eine Region mit genau einer verknüpften Einheit deren Elternknoten zu (Geschwister-Platzierung)", () => {
    const links: RegionAdministrativeUnitLink[] = [{ regionId: wachau.id, administrativeUnitId: kremsLand.id }];
    const result = groupRegionsByParent(units, [wachau], links);
    expect(result.get(noe.id)).toEqual([wachau]);
  });

  it("ordnet eine Region, die mit der Wurzel-Einheit selbst verknüpft ist, dem null-Schlüssel zu (Geschwister von 'Österreich')", () => {
    const links: RegionAdministrativeUnitLink[] = [{ regionId: wachau.id, administrativeUnitId: at.id }];
    const result = groupRegionsByParent(units, [wachau], links);
    expect(result.get(null)).toEqual([wachau]);
  });

  it("ignoriert Links auf unbekannte Einheiten oder Regionen", () => {
    const links: RegionAdministrativeUnitLink[] = [
      { regionId: "does-not-exist", administrativeUnitId: kremsLand.id },
      { regionId: wachau.id, administrativeUnitId: "does-not-exist" },
    ];
    const result = groupRegionsByParent(units, [wachau], links);
    expect(result.size).toBe(0);
  });
});
