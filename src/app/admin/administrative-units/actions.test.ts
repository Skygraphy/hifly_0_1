import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const updateWhereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const deleteWhereMock = vi.fn();
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  return {
    authMock: vi.fn(),
    dbMock: {
      insert: insertMock,
      valuesMock,
      returningMock,
      update: updateMock,
      setMock,
      updateWhereMock,
      delete: deleteMock,
      deleteWhereMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createAdministrativeUnit, updateAdministrativeUnit, deleteAdministrativeUnit } = await import(
  "./actions"
);

const validInput = { code: "1701", name: "Gugging", shortName: null, color: null };

describe("createAdministrativeUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.returningMock.mockResolvedValue([{ id: "new-id" }]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await createAdministrativeUnit("parent-1", "cadastral_municipality", validInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await createAdministrativeUnit("parent-1", "cadastral_municipality", validInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt fehlenden Code oder Namen ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createAdministrativeUnit("parent-1", "cadastral_municipality", {
      ...validInput,
      name: "  ",
    });

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("übersetzt eine Unique-Violation auf (parent_id, code) in eine verständliche Meldung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.returningMock.mockRejectedValue({ code: "23505" });

    const result = await createAdministrativeUnit("parent-1", "cadastral_municipality", validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/existiert bereits/);
  });

  it("erlaubt dem super_admin, einen neuen Eintrag anzulegen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createAdministrativeUnit("parent-1", "cadastral_municipality", validInput);

    expect(result.success).toBe(true);
    expect(result.id).toBe("new-id");
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent-1", level: "cadastral_municipality", code: "1701" })
    );
  });
});

describe("updateAdministrativeUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.updateWhereMock.mockResolvedValue(undefined);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await updateAdministrativeUnit("unit-1", validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await updateAdministrativeUnit("unit-1", validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("übersetzt eine Unique-Violation auf (parent_id, code) in eine verständliche Meldung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.updateWhereMock.mockRejectedValue({ code: "23505" });

    const result = await updateAdministrativeUnit("unit-1", validInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/existiert bereits/);
  });

  it("erlaubt dem super_admin, einen Eintrag zu bearbeiten", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await updateAdministrativeUnit("unit-1", { ...validInput, name: "Neuer Name" });

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ name: "Neuer Name" }));
  });
});

describe("deleteAdministrativeUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.deleteWhereMock.mockResolvedValue(undefined);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await deleteAdministrativeUnit("unit-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await deleteAdministrativeUnit("unit-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, einen Eintrag zu löschen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await deleteAdministrativeUnit("unit-1");

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});
