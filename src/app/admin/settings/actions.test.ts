import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock, getPersonalSettingPermissionsMock } = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const getPersonalSettingPermissionsMock = vi
    .fn()
    .mockResolvedValue({ theme: "user", show_debug_info: "admin" });

  return {
    authMock: vi.fn(),
    dbMock: { insert: insertMock, valuesMock, onConflictDoUpdateMock },
    getPersonalSettingPermissionsMock,
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/settings-service", () => ({
  getPersonalSettingPermissions: getPersonalSettingPermissionsMock,
  PERSONAL_SETTING_PERMISSIONS_KEY: "personal_setting_permissions",
}));

const { setGlobalSetting, setPersonalSettingPermission } = await import("./actions");

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

describe("setPersonalSettingPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPersonalSettingPermissionsMock.mockResolvedValue({ theme: "user", show_debug_info: "admin" });
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setPersonalSettingPermission("theme", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setPersonalSettingPermission("theme", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt eine unbekannte Einstellung ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await setPersonalSettingPermission("does_not_exist", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt eine unbekannte Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    // @ts-expect-error absichtlich ungültiger Wert, wie er über FormData/JSON hereinkommen könnte
    const result = await setPersonalSettingPermission("theme", "not-a-role");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, die Schwelle einer Einstellung zu ändern, ohne andere Overrides zu verlieren", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    getPersonalSettingPermissionsMock.mockResolvedValue({ theme: "user", show_debug_info: "admin" });

    const result = await setPersonalSettingPermission("show_debug_info", "user");

    expect(result.success).toBe(true);
    expect(dbMock.onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "personal_setting_permissions",
        value: { theme: "user", show_debug_info: "user" },
      })
    );
  });
});
