import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  // where() muss zwei Aufrufformen bedienen: direkt awaited
  // (getShopImageOverrides) ODER mit angehängtem .limit() weiter verkettet
  // (searchImagesForShopOverride) — ein "Promise mit zusätzlicher .limit-
  // Methode" erfüllt beides gleichzeitig.
  function chainable<T>(value: T[]) {
    const promise = Promise.resolve(value) as Promise<T[]> & { limit: (n: number) => Promise<T[]> };
    promise.limit = vi.fn(() => Promise.resolve(value));
    return promise;
  }

  const selectWhereMock = vi.fn(() => chainable<unknown>([]));
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  const deleteWhereMock = vi.fn();
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  const onConflictDoUpdateMock = vi.fn();
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    authMock: vi.fn(),
    dbMock: {
      select: selectMock,
      selectFromMock,
      selectWhereMock,
      chainable,
      delete: deleteMock,
      deleteWhereMock,
      insert: insertMock,
      valuesMock,
      onConflictDoUpdateMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/image-folder", () => ({
  thumbUrlFor: (id: string) => `https://example-bucket.test/${id}/thumb.jpg`,
}));
vi.mock("@/db/schema", () => ({
  images: { id: "id", hash: "hash", mainLocation: "mainLocation" },
  shopImagePackageAssignments: { imageId: "imageId", packageId: "packageId", categoryId: "categoryId" },
}));

const { searchImagesForShopOverride, getShopImageOverrides, setShopImagePackageOverride } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchImagesForShopOverride", () => {
  it("liefert leer, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await searchImagesForShopOverride("Stift");

    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("liefert leer, wenn ein plain admin sucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await searchImagesForShopOverride("Stift");

    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("liefert leer bei leerer Suchanfrage, ohne die DB zu befragen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await searchImagesForShopOverride("   ");

    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("reichert Treffer für super_admin um thumbUrl an", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockReturnValueOnce(
      dbMock.chainable([{ id: "img-1", hash: "ABC123", mainLocation: "Stift Klosterneuburg" }])
    );

    const result = await searchImagesForShopOverride("Stift");

    expect(result).toEqual([
      { id: "img-1", hash: "ABC123", mainLocation: "Stift Klosterneuburg", thumbUrl: "https://example-bucket.test/img-1/thumb.jpg" },
    ]);
  });
});

describe("getShopImageOverrides", () => {
  it("liefert leer, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await getShopImageOverrides("img-1");

    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("liefert die Overrides für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockReturnValueOnce(dbMock.chainable([{ packageId: "pkg-1", categoryId: null }]));

    const result = await getShopImageOverrides("img-1");

    expect(result).toEqual([{ packageId: "pkg-1", categoryId: null }]);
  });
});

describe("setShopImagePackageOverride", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setShopImagePackageOverride("img-1", "pkg-1", { type: "inherit" });

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("löscht die Override-Zeile bei mode 'inherit'", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopImagePackageOverride("img-1", "pkg-1", { type: "inherit" });

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("upsert mit categoryId = null bei mode 'disabled'", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopImagePackageOverride("img-1", "pkg-1", { type: "disabled" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: "img-1", packageId: "pkg-1", categoryId: null })
    );
  });

  it("upsert mit gesetzter categoryId bei mode 'category'", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopImagePackageOverride("img-1", "pkg-1", { type: "category", categoryId: "cat-5" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: "img-1", packageId: "pkg-1", categoryId: "cat-5" })
    );
  });
});
