import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const returningMock = vi.fn();
  const onConflictDoUpdateMock = vi.fn();
  // values() liefert ein Objekt mit BEIDEN möglichen Fortsetzungen
  // (.returning() für createShopPackage/createShopPackageCategory,
  // .onConflictDoUpdate() für den Preis-Upsert in setShopPackagePrice) —
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
  shopPackages: { id: "id", name: "name" },
  shopPackageCategories: { id: "id", name: "name" },
  shopPackagePrices: { packageId: "packageId", categoryId: "categoryId" },
}));

const {
  createShopPackage,
  updateShopPackage,
  deleteShopPackage,
  createShopPackageCategory,
  updateShopPackageCategory,
  deleteShopPackageCategory,
  setShopPackagePrice,
} = await import("./actions");

const validPackageInput = {
  name: "Web",
  description: "<p>Für Privatpersonen.</p>",
  includedFiles: ["medium.jpg", "small.jpg"],
  sortOrder: 1,
};
const validCategoryInput = { name: "C", sortOrder: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.returningMock.mockResolvedValue([{ id: "new-id" }]);
});

describe("createShopPackage", () => {
  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await createShopPackage(validPackageInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await createShopPackage(validPackageInput);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt einen leeren Namen ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPackage({ ...validPackageInput, name: "  " });

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("legt das Paket für super_admin an", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPackage(validPackageInput);

    expect(result.success).toBe(true);
    expect(result.id).toBe("new-id");
    expect(dbMock.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ description: "<p>Für Privatpersonen.</p>" }));
  });

  it("normalisiert eine leere TipTap-Beschreibung ('<p></p>') zu null", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await createShopPackage({ ...validPackageInput, description: "<p></p>" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it("übersetzt eine Unique-Violation auf name in eine verständliche Meldung", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.returningMock.mockRejectedValue({ code: "23505" });

    const result = await createShopPackage(validPackageInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Dieser Name existiert bereits.");
  });
});

describe("updateShopPackage", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await updateShopPackage("pkg-1", validPackageInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("aktualisiert das Paket für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await updateShopPackage("pkg-1", validPackageInput);

    expect(result.success).toBe(true);
    expect(dbMock.update).toHaveBeenCalled();
  });
});

describe("deleteShopPackage", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await deleteShopPackage("pkg-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("löscht für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await deleteShopPackage("pkg-1");

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
  });
});

describe("createShopPackageCategory / updateShopPackageCategory / deleteShopPackageCategory", () => {
  it("lehnen ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    expect((await createShopPackageCategory(validCategoryInput)).success).toBe(false);
    expect((await updateShopPackageCategory("cat-1", validCategoryInput)).success).toBe(false);
    expect((await deleteShopPackageCategory("cat-1")).success).toBe(false);
  });

  it("erlauben es super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    expect((await createShopPackageCategory(validCategoryInput)).success).toBe(true);
    expect((await updateShopPackageCategory("cat-1", validCategoryInput)).success).toBe(true);
    expect((await deleteShopPackageCategory("cat-1")).success).toBe(true);
  });
});

describe("setShopPackagePrice", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setShopPackagePrice("pkg-1", "cat-1", 1900);

    expect(result.success).toBe(false);
  });

  it("lehnt negative/nicht-ganzzahlige Preise ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    expect((await setShopPackagePrice("pkg-1", "cat-1", -1)).success).toBe(false);
    expect((await setShopPackagePrice("pkg-1", "cat-1", 19.5)).success).toBe(false);
  });

  it("speichert einen gültigen Preis für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopPackagePrice("pkg-1", "cat-1", 1900);

    expect(result.success).toBe(true);
  });
});
