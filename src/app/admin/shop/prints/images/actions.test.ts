import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  // where() muss zwei Aufrufformen bedienen: direkt awaited
  // (getPrintImageOverrides) — kein .limit() nötig hier, anders als bei der
  // (wiederverwendeten, hier nicht getesteten) Suche. Trotzdem als Promise
  // mit .limit modelliert, für Konsistenz mit dem Paket-Test-Vorbild.
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
vi.mock("@/db/schema", () => ({
  shopImagePrintFormatAssignments: { imageId: "imageId", printFormatId: "printFormatId", printQualityId: "printQualityId" },
}));

const { getPrintImageOverrides, setShopImagePrintFormatOverride } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPrintImageOverrides", () => {
  it("liefert leer, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await getPrintImageOverrides("img-1");

    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("liefert die Overrides für super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.selectWhereMock.mockReturnValueOnce(dbMock.chainable([{ printFormatId: "fmt-1", printQualityId: null }]));

    const result = await getPrintImageOverrides("img-1");

    expect(result).toEqual([{ printFormatId: "fmt-1", printQualityId: null }]);
  });
});

describe("setShopImagePrintFormatOverride", () => {
  it("lehnt ab, wenn kein super_admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setShopImagePrintFormatOverride("img-1", "fmt-1", { type: "inherit" });

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("löscht die Override-Zeile bei mode 'inherit'", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopImagePrintFormatOverride("img-1", "fmt-1", { type: "inherit" });

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("upsert mit printQualityId = null bei mode 'disabled'", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopImagePrintFormatOverride("img-1", "fmt-1", { type: "disabled" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: "img-1", printFormatId: "fmt-1", printQualityId: null })
    );
  });

  it("upsert mit gesetzter printQualityId bei mode 'quality'", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopImagePrintFormatOverride("img-1", "fmt-1", { type: "quality", printQualityId: "qual-5" });

    expect(result.success).toBe(true);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: "img-1", printFormatId: "fmt-1", printQualityId: "qual-5" })
    );
  });
});
