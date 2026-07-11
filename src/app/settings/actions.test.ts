import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock, setCookieMock, getPersonalSettingPermissionsMock } = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() =>
    Object.assign(Promise.resolve(undefined), { onConflictDoUpdate: onConflictDoUpdateMock })
  );
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const selectMock = vi.fn(() => ({ from: () => ({ where: whereMock }) }));

  const setCookieMock = vi.fn();

  // Standardmäßig identisch zu den Registry-Defaults, damit bestehende Tests
  // sich verhalten wie ohne Overrides — einzelne Tests überschreiben das.
  const getPersonalSettingPermissionsMock = vi
    .fn()
    .mockResolvedValue({ theme: "user", show_debug_info: "admin" });

  return {
    authMock: vi.fn(),
    dbMock: { insert: insertMock, select: selectMock, valuesMock, onConflictDoUpdateMock, limitMock },
    setCookieMock,
    getPersonalSettingPermissionsMock,
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: setCookieMock })) }));
vi.mock("@/lib/settings-service", () => ({ getPersonalSettingPermissions: getPersonalSettingPermissionsMock }));

const { setPersonalSetting, syncGuestSettingsOnLogin } = await import("./actions");

describe("setPersonalSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await setPersonalSetting("theme", "light");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt eine unbekannte Einstellung ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await setPersonalSetting("does_not_exist", "x");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn die Rolle die Einstellung nicht sehen darf", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await setPersonalSetting("show_debug_info", true);

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("erlaubt einem user, show_debug_info zu setzen, wenn die Berechtigungs-Override das erlaubt", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    getPersonalSettingPermissionsMock.mockResolvedValue({ theme: "user", show_debug_info: "user" });

    const result = await setPersonalSetting("show_debug_info", true);

    expect(result.success).toBe(true);
    expect(dbMock.onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("erlaubt admin, show_debug_info zu setzen (ohne Cookie)", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await setPersonalSetting("show_debug_info", true);

    expect(result.success).toBe(true);
    expect(dbMock.onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(setCookieMock).not.toHaveBeenCalled();
  });

  it("erlaubt einem user, das Theme zu setzen, und setzt zusätzlich das Cookie", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await setPersonalSetting("theme", "light");

    expect(result.success).toBe(true);
    expect(dbMock.onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(setCookieMock).toHaveBeenCalledWith(
      "theme",
      "light",
      expect.objectContaining({ path: "/" })
    );
  });
});

describe("syncGuestSettingsOnLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await syncGuestSettingsOnLogin({ theme: "light" });

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("übernimmt einen lokalen Wert, wenn noch keine Konto-Einstellung existiert", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.limitMock.mockResolvedValue([]);

    const result = await syncGuestSettingsOnLogin({ theme: "light" });

    expect(result.success).toBe(true);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(dbMock.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", key: "theme", value: "light" })
    );
  });

  it("überschreibt keine bereits vorhandene Konto-Einstellung", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.limitMock.mockResolvedValue([{ key: "theme", value: "dark" }]);

    const result = await syncGuestSettingsOnLogin({ theme: "light" });

    expect(result.success).toBe(true);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("ignoriert Keys, die nicht gast-fähig sind", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.limitMock.mockResolvedValue([]);

    const result = await syncGuestSettingsOnLogin({ show_debug_info: true });

    expect(result.success).toBe(true);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("ignoriert einen Key, den die Berechtigungs-Override der Rolle gerade entzogen hat", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.limitMock.mockResolvedValue([]);
    getPersonalSettingPermissionsMock.mockResolvedValue({ theme: "admin", show_debug_info: "admin" });

    const result = await syncGuestSettingsOnLogin({ theme: "light" });

    expect(result.success).toBe(true);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
