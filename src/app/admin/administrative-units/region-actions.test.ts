import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const returningMock = vi.fn();
  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ returning: returningMock, onConflictDoNothing: onConflictDoNothingMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const updateWhereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const deleteWhereMock = vi.fn();
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  const selectWhereMock = vi.fn().mockResolvedValue([]);
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const txDb = { insert: insertMock, update: updateMock, delete: deleteMock };
  const transactionMock = vi.fn((fn: (tx: typeof txDb) => Promise<unknown>) => fn(txDb));

  return {
    authMock: vi.fn(),
    dbMock: {
      insert: insertMock,
      valuesMock,
      returningMock,
      onConflictDoNothingMock,
      update: updateMock,
      setMock,
      updateWhereMock,
      delete: deleteMock,
      deleteWhereMock,
      select: selectMock,
      selectFromMock,
      selectWhereMock,
      transaction: transactionMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createRegion, updateRegion, deleteRegion, setRegionUnitsWithinScope, setRegionPublished } = await import(
  "./region-actions"
);

const validInput = { name: "Wachau", description: "Donautal", color: null };
const validHome = { parentId: "parent-1", level: "district" as const };

describe("createRegion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.returningMock.mockResolvedValue([{ id: "new-region-id" }]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await createRegion(validInput, validHome);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await createRegion(validInput, validHome);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lehnt leeren Namen ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createRegion({ ...validInput, name: "  " }, validHome);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("übersetzt eine Unique-Violation auf den Namen in eine verständliche Meldung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.returningMock.mockRejectedValue({ code: "23505" });

    const result = await createRegion(validInput, validHome, ["unit-a"]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/existiert bereits/);
  });

  it("lehnt Bund-Ebene als Anlage-Ebene ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createRegion(validInput, { parentId: null, level: "federal" });

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lehnt Anlage ohne initiale Verknüpfung ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const withoutIds = await createRegion(validInput, validHome);
    const withEmptyIds = await createRegion(validInput, validHome, []);

    expect(withoutIds.success).toBe(false);
    expect(withEmptyIds.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("verknüpft bei gesetzten initialUnitIds atomar in derselben Transaktion", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createRegion(validInput, validHome, ["unit-a", "unit-b"]);

    expect(result.success).toBe(true);
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
    // Entwurf ist der Default bei Neuanlage — Freigabe passiert danach über
    // die Checkbox (setRegionPublished), nicht mehr beim Anlegen.
    expect(dbMock.valuesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ published: false }));
    expect(dbMock.valuesMock).toHaveBeenNthCalledWith(2, [
      { regionId: "new-region-id", administrativeUnitId: "unit-a" },
      { regionId: "new-region-id", administrativeUnitId: "unit-b" },
    ]);
  });
});

describe("updateRegion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.updateWhereMock.mockResolvedValue(undefined);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await updateRegion("region-1", validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await updateRegion("region-1", validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("übersetzt eine Unique-Violation auf den Namen in eine verständliche Meldung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.updateWhereMock.mockRejectedValue({ code: "23505" });

    const result = await updateRegion("region-1", validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/existiert bereits/);
  });

  it("erlaubt dem super_admin, eine Region zu bearbeiten", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await updateRegion("region-1", { ...validInput, name: "Neuer Name" });

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ name: "Neuer Name" }));
  });
});

describe("setRegionPublished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.updateWhereMock.mockResolvedValue(undefined);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setRegionPublished("region-1", true);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setRegionPublished("region-1", true);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, die Freigabe umzuschalten", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setRegionPublished("region-1", true);

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ published: true }));
  });
});

describe("deleteRegion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.deleteWhereMock.mockResolvedValue(undefined);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await deleteRegion("region-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await deleteRegion("region-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, eine Region zu löschen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await deleteRegion("region-1");

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});

describe("setRegionUnitsWithinScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.deleteWhereMock.mockResolvedValue(undefined);
    dbMock.selectWhereMock.mockResolvedValue([]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setRegionUnitsWithinScope("region-1", ["unit-a"], ["unit-a"]);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setRegionUnitsWithinScope("region-1", ["unit-a"], ["unit-a"]);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("entfernt nur die abgewählten Kandidaten und lässt Verknüpfungen außerhalb der Kandidatenmenge unangetastet", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setRegionUnitsWithinScope("region-1", ["unit-a", "unit-b", "unit-c"], ["unit-a", "unit-c"]);

    expect(result.success).toBe(true);
    // Nur "unit-b" (Kandidat, aber nicht mehr angehakt) wird entfernt —
    // Verknüpfungen zu Einheiten außerhalb der Kandidatenliste (z.B. in
    // anderen Spalten/Ästen) tauchen hier gar nicht erst auf und werden
    // daher nie gelöscht.
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.valuesMock).toHaveBeenCalledWith([
      { regionId: "region-1", administrativeUnitId: "unit-a" },
      { regionId: "region-1", administrativeUnitId: "unit-c" },
    ]);
    expect(dbMock.onConflictDoNothingMock).toHaveBeenCalledTimes(1);
  });

  it("überspringt den Delete-Schritt, wenn nichts abgewählt wurde", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    await setRegionUnitsWithinScope("region-1", ["unit-a", "unit-b"], ["unit-a", "unit-b"]);

    expect(dbMock.delete).not.toHaveBeenCalled();
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("überspringt den Insert-Schritt, wenn nichts angehakt ist, aber eine Verknüpfung außerhalb der Kandidaten übrig bleibt", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([{ administrativeUnitId: "unit-outside-scope" }]);

    const result = await setRegionUnitsWithinScope("region-1", ["unit-a", "unit-b"], []);

    expect(result.success).toBe(true);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it("lehnt ab, wenn die Region danach keine einzige Verknüpfung mehr hätte", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockResolvedValue([]);

    const result = await setRegionUnitsWithinScope("region-1", ["unit-a", "unit-b"], []);

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
