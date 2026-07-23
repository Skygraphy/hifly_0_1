import { describe, it, expect } from "vitest";
import { parseMatchFileImages } from "./parse-match-file";

const SAMPLE = JSON.stringify([
  {
    id: "Adalbert_Stifter_Gasse_2024_07_13_001_C3E2EA_0f4e99ef-3261-416e-9de5-aa8223857b91",
    hash: "C3E2EA",
    lat_lng: [48.30751808173115, 16.300887425734985],
    main_location: "Adalbert Stifter-Gasse",
    secondary_locations: ["SL1", "SL2"],
    tags: ["T1", "T2"],
    user_tags: ["UT1", "UT2"],
    area: "F",
    web_visible: true,
    web_ranking: 1,
    print_visible: true,
    print_ranking: 1,
    do_match: true,
  },
  {
    id: "Albert_Böhm_Gasse_2024_07_07_001_00483C_1b9f41d4-dba6-43b2-81da-e3971b1b9db9",
    hash: "00483C",
    lat_lng: [48.29781042913616, 16.325043416787505],
    main_location: "Albert Böhm-Gasse",
    secondary_locations: [],
    tags: [],
    user_tags: [],
    area: "D",
    web_visible: true,
    web_ranking: 1,
    print_visible: true,
    print_ranking: 1,
    do_match: false,
  },
  {
    id: "No_Area_2024_01_01_001_ABCDEF_00000000-0000-0000-0000-000000000000",
    hash: "ABCDEF",
    lat_lng: [1, 2],
    main_location: "Testweg",
    secondary_locations: [],
    tags: [],
    user_tags: [],
    area: "",
    web_visible: false,
    web_ranking: 2,
    print_visible: false,
    print_ranking: 2,
    do_match: true,
  },
]);

describe("parseMatchFileImages", () => {
  it("liest alle Einträge inkl. Umlaute, verschachtelter Arrays und leerer Arrays", () => {
    const entries = parseMatchFileImages(SAMPLE);
    expect(entries).toHaveLength(3);

    const first = entries[0];
    expect(first.id).toBe("Adalbert_Stifter_Gasse_2024_07_13_001_C3E2EA_0f4e99ef-3261-416e-9de5-aa8223857b91");
    expect(first.lat_lng).toEqual([48.30751808173115, 16.300887425734985]);
    expect(first.main_location).toBe("Adalbert Stifter-Gasse");
    expect(first.secondary_locations).toEqual(["SL1", "SL2"]);
    expect(first.area).toBe("F");
    expect(first.do_match).toBe(true);

    const second = entries[1];
    expect(second.main_location).toBe("Albert Böhm-Gasse");
    expect(second.secondary_locations).toEqual([]);
    expect(second.do_match).toBe(false);
  });

  it("liest ein leeres area-Feld als null", () => {
    const entries = parseMatchFileImages(SAMPLE);
    expect(entries[2].area).toBeNull();
  });

  it("akzeptiert auch ein Objekt mit images-Property (statt bare Array)", () => {
    const entries = parseMatchFileImages(JSON.stringify({ images: [{ id: "wrapped-1" }, { id: "wrapped-2" }] }));
    expect(entries.map((entry) => entry.id)).toEqual(["wrapped-1", "wrapped-2"]);
  });

  it("wirft eine verständliche Fehlermeldung bei ungültigem JSON", () => {
    expect(() => parseMatchFileImages("{ not valid json")).toThrow(/JSON/);
  });

  it("wirft eine verständliche Fehlermeldung, wenn kein images-Array vorhanden ist", () => {
    expect(() => parseMatchFileImages(JSON.stringify({ foo: [] }))).toThrow(/images/);
  });

  it("filtert Einträge ohne gültige id heraus, statt abzustürzen", () => {
    const entries = parseMatchFileImages(JSON.stringify({ images: [{ hash: "AAAAAA" }, { id: "ok-1" }] }));
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("ok-1");
  });
});
