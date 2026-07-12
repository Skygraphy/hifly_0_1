import { describe, expect, it } from "vitest";
import { ADMINISTRATIVE_LEVELS, getChildLevel } from "./administrative-units";

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
