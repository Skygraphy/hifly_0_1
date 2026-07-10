import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    authMock: vi.fn(),
    dbMock: { insert: insertMock, valuesMock, onConflictDoUpdateMock },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { setGlobalSetting } = await import("./actions");

describe("setGlobalSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setGlobalSetting("maintenance_mode", true);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setGlobalSetting("maintenance_mode", true);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt eine unbekannte Einstellung ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setGlobalSetting("does_not_exist", true);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, den Wartungsmodus zu setzen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setGlobalSetting("maintenance_mode", true);

    expect(result.success).toBe(true);
    expect(dbMock.onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "maintenance_mode", value: true })
    );
  });
});
