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
  const transactionMock = vi.fn((fn: (tx: { update: typeof updateMock }) => Promise<unknown>) =>
    fn({ update: updateMock })
  );

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
      transaction: transactionMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createImageRecord, runImageMatch } = await import("./actions");

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

describe("runImageMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectWhereMock.mockResolvedValue([]);
    dbMock.setFromAwaitRows([]);
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await runImageMatch([makeEntry()]);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lehnt eine plain user-Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await runImageMatch([makeEntry()]);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("ignoriert Zeilen mit do_match !== true, komplett (keine DB-Abfrage für deren id)", async () => {
    const result = await runImageMatch([makeEntry({ id: "img-skip", do_match: false })]);

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("überspringt Datei-Zeilen ohne passende DB-Zeile, ohne Warnung und ohne Update", async () => {
    dbMock.selectWhereMock.mockResolvedValue([]); // keine existierende images-Zeile

    const result = await runImageMatch([makeEntry({ id: "img-missing" })]);

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.updatedIds).toEqual([]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("updatedIds enthält nur tatsächlich synchronisierte Zeilen, nicht übersprungene", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ id: "img-1" }), makeEntry({ id: "img-missing" })]);

    expect(result.updatedIds).toEqual(["img-1"]);
    expect(result.skippedCount).toBe(1);
  });

  it("area passt zu einem direkten Kind, super_admin → administrativeUnitId wird neu zugewiesen, kein Warning", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "F" })]);

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(dbMock.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
        administrativeUnitId: "unit-child-f",
      })
    );
  });

  it("administrativeUnitId zeigt bereits auf die zu area passende Einheit (erneuter Lauf) → kein Warning, keine Änderung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-child-f", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "F" })]);

    expect(result.warnings).toEqual([]);
    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("administrativeUnitId");
    expect(setArg.hash).toBe("ABCDEF");
  });

  it("area passt zu einem direkten Kind, admin MIT Freigabe für das Kind → administrativeUnitId wird neu zugewiesen", async () => {
    // Aufrufreihenfolge in runImageMatch: erst images-Zeilen, danach (nur
    // für Nicht-super_admin) admin_location_grants — beide über denselben
    // .where()-Mock, daher als Once-Kette in genau dieser Reihenfolge.
    dbMock.selectWhereMock
      .mockResolvedValueOnce([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }])
      .mockResolvedValueOnce([{ administrativeUnitId: "unit-child-f", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "F" })]);

    expect(result.warnings).toEqual([]);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ administrativeUnitId: "unit-child-f" }));
  });

  it("area passt zu einem direkten Kind, admin OHNE Freigabe → Warning, keine Neuzuweisung", async () => {
    dbMock.selectWhereMock
      .mockResolvedValueOnce([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }])
      .mockResolvedValueOnce([]); // keine Freigaben
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "F" })]);

    expect(result.warnings).toEqual([{ id: "img-1", message: expect.stringMatching(/Berechtigung/i) }]);
    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("administrativeUnitId");
  });

  it("area passt zu keinem direkten Kind der aktuell zugewiesenen Einheit → Warning, keine Neuzuweisung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "X" })]);

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    expect(result.warnings).toEqual([{ id: "img-1", message: expect.stringMatching(/existiert nicht/i) }]);
    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("administrativeUnitId");
  });

  it("area fehlt in der Datei → Warning, keine Neuzuweisung, Update läuft trotzdem", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: null })]);

    expect(result.warnings).toEqual([{ id: "img-1", message: expect.stringMatching(/area fehlt/i) }]);
    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("administrativeUnitId");
  });

  it("zugewiesener Standort ist eine Region → Warning, area-Zuordnung wird (noch) nicht unterstützt", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: null, regionId: "region-1" }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "F" })]);

    expect(result.warnings).toEqual([{ id: "img-1", message: expect.stringMatching(/region/i) }]);
    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("administrativeUnitId");
  });

  it("Zeile hat noch keinen zugewiesenen Standort → Warning", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: null, regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    const result = await runImageMatch([makeEntry({ area: "F" })]);

    expect(result.warnings).toEqual([{ id: "img-1", message: expect.stringMatching(/keinen zugewiesenen Standort/i) }]);
  });

  it("leere Felder in der Datei löschen die vorhandenen DB-Werte (Datei ist Wahrheit)", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    await runImageMatch([
      makeEntry({
        area: null,
        lat_lng: null,
        main_location: null,
        secondary_locations: [],
        tags: [],
        user_tags: [],
        web_visible: null,
        web_ranking: null,
        print_visible: null,
        print_ranking: null,
      }),
    ]);

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
  });

  it("regionId wird nie verändert, es wird nie inserted oder gelöscht", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ id: "img-1", administrativeUnitId: "unit-parent", regionId: null }]);
    dbMock.setFromAwaitRows([parentUnit, childUnitF]);

    await runImageMatch([makeEntry({ area: "F" })]);

    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("regionId");
    expect(setArg.administrativeUnitId).toBe("unit-child-f");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
