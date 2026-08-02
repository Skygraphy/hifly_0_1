import { describe, expect, it } from "vitest";
import {
  ADMINISTRATIVE_LEVELS,
  getChildLevel,
  groupByParent,
  pathToRoot,
  collectDescendantIds,
  filterPublishedUnits,
  type AdministrativeUnit,
} from "./administrative-units";

describe("getChildLevel", () => {
  it("liefert für jede Ebene die nächsttiefere", () => {
    expect(getChildLevel("federal")).toBe("state");
    expect(getChildLevel("state")).toBe("district");
    expect(getChildLevel("district")).toBe("municipality");
    expect(getChildLevel("municipality")).toBe("cadastral_municipality");
    expect(getChildLevel("cadastral_municipality")).toBe("area");
  });

  it("liefert null für die tiefste Ebene (area)", () => {
    expect(getChildLevel("area")).toBeNull();
  });

  it("deckt alle bekannten Ebenen ab", () => {
    for (const level of ADMINISTRATIVE_LEVELS.slice(0, -1)) {
      expect(getChildLevel(level)).not.toBeNull();
    }
  });
});

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

const root = makeUnit({ id: "root", parentId: null, level: "federal" });
const child = makeUnit({ id: "child", parentId: "root", level: "state" });
const grandchild = makeUnit({ id: "grandchild", parentId: "child", level: "district" });
const fixture = [root, child, grandchild];

describe("groupByParent", () => {
  it("gruppiert Einheiten nach parentId", () => {
    const byParent = groupByParent(fixture);
    expect(byParent.get(null)).toEqual([root]);
    expect(byParent.get("root")).toEqual([child]);
    expect(byParent.get("child")).toEqual([grandchild]);
  });

  it("liefert undefined für eine unbekannte parentId", () => {
    const byParent = groupByParent(fixture);
    expect(byParent.get("unknown")).toBeUndefined();
  });
});

describe("pathToRoot", () => {
  const byId = new Map(fixture.map((unit) => [unit.id, unit]));

  it("liefert den Pfad von der Wurzel bis zur id (root zuerst)", () => {
    expect(pathToRoot("grandchild", byId)).toEqual(["root", "child", "grandchild"]);
  });

  it("liefert [] für eine leere id", () => {
    expect(pathToRoot("", byId)).toEqual([]);
  });

  it("liefert [] für eine unbekannte id", () => {
    expect(pathToRoot("nonexistent", byId)).toEqual([]);
  });
});

describe("collectDescendantIds", () => {
  it("liefert die id selbst plus alle verschachtelten Nachfahren", () => {
    const byParent = groupByParent(fixture);
    expect(collectDescendantIds("root", byParent)).toEqual(["root", "child", "grandchild"]);
  });

  it("liefert nur die id selbst für eine Blatt-Einheit ohne Kinder", () => {
    const byParent = groupByParent(fixture);
    expect(collectDescendantIds("grandchild", byParent)).toEqual(["grandchild"]);
  });

  it("erfasst mehrere Geschwister-Zweige", () => {
    const sibling = makeUnit({ id: "sibling", parentId: "root", level: "state" });
    const byParent = groupByParent([...fixture, sibling]);
    expect(collectDescendantIds("root", byParent)).toEqual(["root", "child", "grandchild", "sibling"]);
  });
});

describe("filterPublishedUnits", () => {
  it("behält eine vollständig veröffentlichte Kette", () => {
    expect(filterPublishedUnits(fixture)).toEqual(fixture);
  });

  it("eine nicht freigegebene Einheit blockiert auch ihren gesamten Unterbaum, selbst wenn Kinder selbst freigegeben sind", () => {
    const draftChild = makeUnit({ id: "child", parentId: "root", level: "state", published: false });
    const publishedGrandchild = makeUnit({ id: "grandchild", parentId: "child", level: "district", published: true });
    const result = filterPublishedUnits([root, draftChild, publishedGrandchild]);
    expect(result).toEqual([root]);
  });

  it("eine nicht freigegebene Einheit ohne Kinder wird nur selbst entfernt", () => {
    const draftLeaf = makeUnit({ id: "child", parentId: "root", level: "state", published: false });
    expect(filterPublishedUnits([root, draftLeaf])).toEqual([root]);
  });
});
