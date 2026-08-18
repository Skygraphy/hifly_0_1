import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const returningMock = vi.fn();
  const onConflictDoUpdateMock = vi.fn();
  // values() liefert ein Objekt mit BEIDEN möglichen Fortsetzungen
  // (.returning() für createShopPrintFormat/createShopPrintQuality,
  // .onConflictDoUpdate() für den Preis-Upsert in setShopPrintFormatPrice) —
  // je Aufrufer wird nur die jeweils passende tatsächlich verwendet.
  const valuesMock = vi.fn(() => ({ returning: returningMock, onConflictDoUpdate: onConflictDoUpdateMock }));
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
      onConflictDoUpdateMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/schema", () => ({
  shopPrintFormats: { id: "id", name: "name" },
  shopPrintQualities: { id: "id", name: "name" },
  shopPrintFormatPrices: { printFormatId: "printFormatId", printQualityId: "printQualityId" },
}));

const {
  createShopPrintFormat,
  updateShopPrintFormat,
  deleteShopPrintFormat,
  createShopPrintQuality,
  updateShopPrintQuality,
  deleteShopPrintQuality,
  setShopPrintFormatPrice,
} = await import("./actions");

const validFormatInput = {
  name: "A4",
  description: "<p>Für den Alltag.</p>",
  widthCm: 21.0,
  heightCm: 29.7,
  sortOrder: 1,
};
const validQualityInput = { name: "Fotopapier", description: "<p>Klassisches Fotopapier.</p>", sortOrder: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.returningMock.mockResolvedValue([{ id: "new-id" }]);
});

describe("createShopPrintFormat", () => {
  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await createShopPrintFormat(validFormatInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await createShopPrintFormat(validFormatInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt einen leeren Namen ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPrintFormat({ ...validFormatInput, name: "  " });

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt nicht-positive Breite/Höhe ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    expect((await createShopPrintFormat({ ...validFormatInput, widthCm: 0 })).success).toBe(false);
    expect((await createShopPrintFormat({ ...validFormatInput, heightCm: -1 })).success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("legt das Format für super_admin an", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPrintFormat(validFormatInput);

    expect(result.success).toBe(true);
    expect(result.id).toBe("new-id");
    expect(dbMock.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ widthCm: 21.0, heightCm: 29.7 }));
  });

  it("normalisiert eine leere TipTap-Beschreibung ('<p></p>') zu null", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPrintFormat({ ...validFormatInput, description: "<p></p>" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it("übersetzt eine Unique-Violation auf name in eine verständliche Meldung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.returningMock.mockRejectedValue({ code: "23505" });

    const result = await createShopPrintFormat(validFormatInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Dieser Name existiert bereits.");
  });
});

describe("updateShopPrintFormat", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await updateShopPrintFormat("fmt-1", validFormatInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("aktualisiert das Format für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await updateShopPrintFormat("fmt-1", validFormatInput);

    expect(result.success).toBe(true);
    expect(dbMock.update).toHaveBeenCalled();
  });
});

describe("deleteShopPrintFormat", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await deleteShopPrintFormat("fmt-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("löscht für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await deleteShopPrintFormat("fmt-1");

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
  });
});

describe("createShopPrintQuality / updateShopPrintQuality / deleteShopPrintQuality", () => {
  it("lehnen ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    expect((await createShopPrintQuality(validQualityInput)).success).toBe(false);
    expect((await updateShopPrintQuality("qual-1", validQualityInput)).success).toBe(false);
    expect((await deleteShopPrintQuality("qual-1")).success).toBe(false);
  });

  it("erlauben es super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    expect((await createShopPrintQuality(validQualityInput)).success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ description: "<p>Klassisches Fotopapier.</p>" }));
    expect((await updateShopPrintQuality("qual-1", validQualityInput)).success).toBe(true);
    expect((await deleteShopPrintQuality("qual-1")).success).toBe(true);
  });

  it("normalisiert eine leere TipTap-Beschreibung ('<p></p>') zu null", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPrintQuality({ ...validQualityInput, description: "<p></p>" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });
});

describe("setShopPrintFormatPrice", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setShopPrintFormatPrice("fmt-1", "qual-1", 1990);

    expect(result.success).toBe(false);
  });

  it("lehnt negative/nicht-ganzzahlige Preise ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    expect((await setShopPrintFormatPrice("fmt-1", "qual-1", -1)).success).toBe(false);
    expect((await setShopPrintFormatPrice("fmt-1", "qual-1", 19.5)).success).toBe(false);
  });

  it("speichert einen gültigen Preis für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopPrintFormatPrice("fmt-1", "qual-1", 1990);

    expect(result.success).toBe(true);
  });
});
