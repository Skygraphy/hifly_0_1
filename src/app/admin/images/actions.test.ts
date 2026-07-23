import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const selectWhereMock = vi.fn().mockResolvedValue([]);
  // runImageMatch lädt administrativeUnits OHNE .where() (komplette
  // Tabelle) — selectFromMock muss daher sowohl .where() anbieten (images/
  // admin_location_grants-Abfragen) als auch selbst awaitbar sein (thenable),
  // gesteuert über setFromAwaitRows.
  let fromAwaitRows: unknown[] = [];
  const selectFromMock = vi.fn(() => ({
    where: selectWhereMock,
    then: (resolve: (value: unknown[]) => void, reject?: (err: unknown) => void) =>
      Promise.resolve(fromAwaitRows).then(resolve, reject),
  }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhereMock }>(() => ({
    where: updateWhereMock,
  }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  return {
    authMock: vi.fn(),
    dbMock: {
      insert: insertMock,
      valuesMock,
      onConflictDoUpdateMock,
      select: selectMock,
      selectFromMock,
      selectWhereMock,
      setFromAwaitRows: (rows: unknown[]) => {
        fromAwaitRows = rows;
      },
      update: updateMock,
      setMock,
      updateWhereMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createImageRecord, prepareImageMatch, applyImageMatchEntry } = await import("./actions");

const validInput = {
  id: "Adalbert_Stifter_Gasse_2024_07_13_001_C3E2EA_0f4e99ef-3261-416e-9de5-aa8223857b91",
  address: "Adalbert Stifter Gasse",
  captureDate: "2024-07-13",
  sequenceNumber: 1,
  hash: "C3E2EA",
  uuid: "0f4e99ef-3261-416e-9de5-aa8223857b91",
  standort: { type: "unit" as const, id: "unit-1" },
};

describe("createImageRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectWhereMock.mockResolvedValue([]);
    dbMock.onConflictDoUpdateMock.mockResolvedValue(undefined);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await createImageRecord(validInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt eine plain user-Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await createImageRecord(validInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin jeden Standort, ohne Freigaben nachzuladen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createImageRecord(validInput);

    expect(result.success).toBe(true);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: validInput.id,
        uploadedBy: "super-1",
        administrativeUnitId: "unit-1",
        regionId: null,
      })
    );
  });

  it("lehnt einen admin ohne passende Freigabe ab", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ administrativeUnitId: "other-unit", regionId: null }]);

    const result = await createImageRecord(validInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("erlaubt einem admin mit exakt passender Einheiten-Freigabe", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ administrativeUnitId: "unit-1", regionId: null }]);

    const result = await createImageRecord(validInput);

    expect(result.success).toBe(true);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("erlaubt einem admin mit passender Regions-Freigabe (Standort vom Typ region)", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ administrativeUnitId: null, regionId: "region-1" }]);

    const result = await createImageRecord({
      ...validInput,
      standort: { type: "region", id: "region-1" },
    });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ administrativeUnitId: null, regionId: "region-1" })
    );
  });

  it("upserted über onConflictDoUpdate (Resume-fähig)", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    await createImageRecord(validInput);

    expect(dbMock.onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.anything() })
    );
  });
});

const parentUnit = {
  id: "unit-parent",
  parentId: null,
  code: "K",
  name: "Klosterneuburg Stadt",
};

const childUnitF = {
  id: "unit-child-f",
  parentId: "unit-parent",
  code: "F",
  name: "Bereich F",
};

function makeEntry(overrides: Partial<import("@/lib/parse-match-file").MatchFileEntry> = {}) {
  return {
    id: "img-1",
    hash: "ABCDEF",
    lat_lng: [48.3, 16.3] as [number, number],
    main_location: "Teststraße",
    secondary_locations: ["SL1"],
    tags: ["T1"],
    user_tags: ["UT1"],
    area: "F",
    web_visible: true,
    web_ranking: 1,
    print_visible: true,
    print_ranking: 1,
    do_match: true,
    ...overrides,
  };
}

describe("prepareImageMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectWhereMock.mockResolvedValue([]);
    dbMock.setFromAwaitRows([]);
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await prepareImageMatch([makeEntry()]);

    expect(result.success).toBe(false);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("lehnt eine plain user-Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await prepareImageMatch([makeEntry()]);

    expect(result.success).toBe(false);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("ignoriert Zeilen mit do_match !== true, komplett (keine DB-Abfrage für deren id)", async () => {
    const result = await prepareImageMatch([makeEntry({ id: "img-skip", do_match: false })]);

    expect(result.success).toBe(true);
    expect(result.plan).toEqual([]);
    expect(result.skippedCount).toBe(0);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("überspringt Datei-Zeilen ohne passende DB-Zeile, ohne Plan-Eintrag", async () => {
    dbMock.selectWhereMock.mockResolvedValue([]); // keine existierende images-Zeile

    const result = await prepareImageMatch([makeEntry({ id: "img-missing" })]);

    expect(result.success).toBe(true);
    expect(result.plan).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  it("plant nur tatsächlich vorhandene Zeilen, überspringt fehlende", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ id: "img-1" }), makeEntry({ id: "img-missing" })]);

    expect(result.plan?.map((entry) => entry.id)).toEqual(["img-1"]);
    expect(result.skippedCount).toBe(1);
  });

  it("bildet die Datei-Felder 1:1 auf den Plan-Eintrag ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(result.plan).toEqual([
      expect.objectContaining({
        id: "img-1",
        hash: "ABCDEF",
        lat: 48.3,
        lng: 16.3,
        mainLocation: "Teststraße",
        secondaryLocations: ["SL1"],
        tags: ["T1"],
        userTags: ["UT1"],
        webVisible: true,
        webRanking: 1,
        printVisible: true,
        printRanking: 1,
        newAdministrativeUnitId: "unit-child-f",
        warning: null,
      }),
    ]);
  });

  it("administrativeUnitId zeigt bereits auf die zu area passende Einheit (erneuter Lauf) → kein Warning, keine Änderung geplant", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-child-f", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(result.plan?.[0].warning).toBeNull();
    expect(result.plan?.[0].newAdministrativeUnitId).toBeNull();
  });

  it("area passt zu einem direkten Kind, admin MIT Freigabe für das Kind → Neuzuweisung geplant", async () => {
    // Aufrufreihenfolge in prepareImageMatch: erst images-Zeilen, danach
    // admin_location_grants — beide über denselben .where()-Mock, daher als
    // Once-Kette in genau dieser Reihenfolge.
    dbMock.selectWhereMock
      .mockResolvedValueOnce([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }])
      .mockResolvedValueOnce([{ administrativeUnitId: "unit-child-f", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(result.plan?.[0].warning).toBeNull();
    expect(result.plan?.[0].newAdministrativeUnitId).toBe("unit-child-f");
  });

  it("area passt zu einem direkten Kind, admin OHNE Freigabe → Warning, keine Neuzuweisung geplant", async () => {
    dbMock.selectWhereMock
      .mockResolvedValueOnce([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }])
      .mockResolvedValueOnce([]); // keine Freigaben
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(result.plan?.[0].warning).toMatch(/Berechtigung/i);
    expect(result.plan?.[0].newAdministrativeUnitId).toBeNull();
  });

  it("area passt zu keinem direkten Kind der aktuell zugewiesenen Einheit → Warning, keine Neuzuweisung geplant", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "X" })]);

    expect(result.plan?.[0].warning).toMatch(/existiert nicht/i);
    expect(result.plan?.[0].newAdministrativeUnitId).toBeNull();
  });

  it("area fehlt in der Datei → Warning, keine Neuzuweisung geplant", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: null })]);

    expect(result.plan?.[0].warning).toMatch(/area fehlt/i);
    expect(result.plan?.[0].newAdministrativeUnitId).toBeNull();
  });

  it("zugewiesener Standort ist eine Region → Warning, area-Zuordnung wird (noch) nicht unterstützt", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: null, regionId: "region-1" }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(result.plan?.[0].warning).toMatch(/region/i);
  });

  it("Zeile hat noch keinen zugewiesenen Standort → Warning", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: null, regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(result.plan?.[0].warning).toMatch(/keinen zugewiesenen Standort/i);
  });

  it("schreibt nichts in die DB — reines Planen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    await prepareImageMatch([makeEntry({ area: "F" })]);

    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("applyImageMatchEntry", () => {
  const preparedEntry = {
    id: "img-1",
    hash: "ABCDEF",
    lat: 48.3,
    lng: 16.3,
    mainLocation: "Teststraße",
    secondaryLocations: ["SL1"],
    tags: ["T1"],
    userTags: ["UT1"],
    webVisible: true,
    webRanking: 1,
    printVisible: true,
    printRanking: 1,
    newAdministrativeUnitId: "unit-child-f",
    warning: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await applyImageMatchEntry(preparedEntry);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt eine plain user-Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await applyImageMatchEntry(preparedEntry);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("schreibt alle Feldwerte 1:1 (Datei ist Wahrheit, auch leere Werte löschen)", async () => {
    const result = await applyImageMatchEntry({
      ...preparedEntry,
      lat: null,
      lng: null,
      mainLocation: null,
      secondaryLocations: [],
      tags: [],
      userTags: [],
      webVisible: null,
      webRanking: null,
      printVisible: null,
      printRanking: null,
      newAdministrativeUnitId: null,
    });

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: null,
        lng: null,
        mainLocation: null,
        secondaryLocations: [],
        tags: [],
        userTags: [],
        webVisible: null,
        webRanking: null,
        printVisible: null,
        printRanking: null,
      })
    );
    expect(dbMock.setMock.mock.calls[0][0]).not.toHaveProperty("administrativeUnitId");
  });

  it("setzt administrativeUnitId nur, wenn newAdministrativeUnitId gesetzt ist — regionId nie", async () => {
    await applyImageMatchEntry(preparedEntry);

    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg.administrativeUnitId).toBe("unit-child-f");
    expect(setArg).not.toHaveProperty("regionId");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
