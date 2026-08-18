import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock, txMock } = vi.hoisted(() => {
  const txDeleteWhereMock = vi.fn();
  const txDeleteMock = vi.fn(() => ({ where: txDeleteWhereMock }));
  const txInsertValuesMock = vi.fn();
  const txInsertMock = vi.fn(() => ({ values: txInsertValuesMock }));

  const txMock = { delete: txDeleteMock, deleteWhereMock: txDeleteWhereMock, insert: txInsertMock, insertValuesMock: txInsertValuesMock };

  const transactionMock = vi.fn(async (callback: (tx: typeof txMock) => Promise<void>) => callback(txMock));

  return {
    authMock: vi.fn(),
    dbMock: { transaction: transactionMock },
    txMock,
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/schema", () => ({
  shopLocationPackageAssignments: {
    administrativeUnitId: "administrativeUnitId",
    regionId: "regionId",
    packageId: "packageId",
    categoryId: "categoryId",
  },
}));

const { setShopLocationPackageAssignment } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setShopLocationPackageAssignment", () => {
  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setShopLocationPackageAssignment({ type: "unit", id: "unit-1" }, "pkg-1", "cat-1");

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setShopLocationPackageAssignment({ type: "unit", id: "unit-1" }, "pkg-1", "cat-1");

    expect(result.success).toBe(false);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("löscht die bestehende Zeile und legt bei gesetzter Kategorie eine neue an", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopLocationPackageAssignment({ type: "unit", id: "unit-1" }, "pkg-1", "cat-1");

    expect(result.success).toBe(true);
    expect(txMock.delete).toHaveBeenCalled();
    expect(txMock.insert).toHaveBeenCalled();
    expect(txMock.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ administrativeUnitId: "unit-1", regionId: null, packageId: "pkg-1", categoryId: "cat-1" })
    );
  });

  it("löscht nur (kein Neuanlegen), wenn categoryId null ist ('nicht verfügbar')", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopLocationPackageAssignment({ type: "region", id: "region-1" }, "pkg-1", null);

    expect(result.success).toBe(true);
    expect(txMock.delete).toHaveBeenCalled();
    expect(txMock.insert).not.toHaveBeenCalled();
  });
});
