import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const onConflictDoNothingMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ onConflictDoNothing: onConflictDoNothingMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const deleteWhereMock = vi.fn();
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  return {
    authMock: vi.fn(),
    dbMock: {
      insert: insertMock,
      insertValuesMock,
      onConflictDoNothingMock,
      delete: deleteMock,
      deleteWhereMock,
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/schema", () => ({
  shopLocationPrintFormatAssignments: {
    administrativeUnitId: "administrativeUnitId",
    regionId: "regionId",
    printFormatId: "printFormatId",
    printQualityId: "printQualityId",
  },
}));

const { setShopLocationPrintFormatAssignment } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setShopLocationPrintFormatAssignment", () => {
  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setShopLocationPrintFormatAssignment({ type: "unit", id: "unit-1" }, "fmt-1", "qual-1", true);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setShopLocationPrintFormatAssignment({ type: "unit", id: "unit-1" }, "fmt-1", "qual-1", true);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("legt bei available=true eine neue Zeile an (onConflictDoNothing statt Fehler bei Duplikat)", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopLocationPrintFormatAssignment({ type: "unit", id: "unit-1" }, "fmt-1", "qual-1", true);

    expect(result.success).toBe(true);
    expect(dbMock.insert).toHaveBeenCalled();
    expect(dbMock.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ administrativeUnitId: "unit-1", regionId: null, printFormatId: "fmt-1", printQualityId: "qual-1" })
    );
    expect(dbMock.onConflictDoNothingMock).toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("löscht bei available=false GENAU dieses (Standort, Format, Qualität)-Tripel, ohne andere Qualitäten desselben Formats anzutasten", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setShopLocationPrintFormatAssignment({ type: "region", id: "region-1" }, "fmt-1", "qual-1", false);

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
