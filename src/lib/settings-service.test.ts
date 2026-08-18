import { describe, expect, it, beforeEach, vi } from "vitest";

const { dbMock, state } = vi.hoisted(() => {
  const state = {
    userRows: [] as Array<{ key: string; value: unknown }>,
    globalRows: [] as Array<{ key: string; value: unknown }>,
  };
  const dbMock = { select: vi.fn() };
  return { dbMock, state };
});

vi.mock("@/db", () => ({ db: dbMock }));

const { userSettings, appSettings } = await import("@/db/schema");

// Muss zwischen zwei Tabellen unterscheiden: userSettings-Abfragen
// (getPersonalSettings) laufen immer über .where() und liefern userRows,
// appSettings-Abfragen laufen entweder direkt (getGlobalSettings, liefert
// alle globalRows) oder gefiltert über .where() (getPersonalSettingPermissions,
// liefert nur die personal_setting_permissions-Zeile).
dbMock.select = vi.fn(() => ({
  from: vi.fn((table: unknown) => {
    if (table === userSettings) {
      return { where: vi.fn(() => Promise.resolve(state.userRows)) };
    }
    if (table === appSettings) {
      return Object.assign(Promise.resolve(state.globalRows), {
        where: vi.fn(() =>
          Promise.resolve(state.globalRows.filter((row) => row.key === "personal_setting_permissions"))
        ),
      });
    }
    throw new Error("Unbekannte Tabelle im Mock");
  }),
}));

const { getPersonalSettings, getGlobalSettings, getPersonalSettingPermissions } = await import(
  "./settings-service"
);

describe("getPersonalSettings", () => {
  beforeEach(() => {
    state.userRows = [];
    state.globalRows = [];
  });

  it("liefert nur Registry-Standardwerte für Keys, die die Rolle sehen darf", async () => {
    const result = await getPersonalSettings("user-1", "user");
    expect(result).toEqual({ theme: "dark", default_administrative_unit: "" });
  });

  it("zeigt show_debug_info zusätzlich für admin", async () => {
    const result = await getPersonalSettings("admin-1", "admin");
    expect(result).toEqual({
      theme: "dark",
      show_debug_info: false,
      default_administrative_unit: "",
    });
  });

  it("überschreibt den Standardwert mit einer vorhandenen user_settings-Zeile", async () => {
    state.userRows = [{ key: "theme", value: "light" }];
    const result = await getPersonalSettings("user-1", "user");
    expect(result.theme).toBe("light");
  });

  it("ignoriert eine Zeile zu einem Key, den die Rolle nicht sehen darf", async () => {
    state.userRows = [{ key: "show_debug_info", value: true }];
    const result = await getPersonalSettings("user-1", "user");
    expect(result).not.toHaveProperty("show_debug_info");
  });

  it("zeigt show_debug_info für user, wenn die Berechtigungs-Override das erlaubt", async () => {
    state.globalRows = [{ key: "personal_setting_permissions", value: { show_debug_info: "user" } }];
    const result = await getPersonalSettings("user-1", "user");
    expect(result).toHaveProperty("show_debug_info", false);
  });
});

describe("getGlobalSettings", () => {
  beforeEach(() => {
    state.userRows = [];
    state.globalRows = [];
  });

  it("liefert Registry-Standardwerte, wenn keine Zeilen existieren", async () => {
    const result = await getGlobalSettings();
    expect(result).toEqual({
      maintenance_mode: false,
      map_marker_warning_threshold: 1500,
      map_marker_hard_limit: 2000,
      anon_image_view_limit: 25,
      anon_image_view_window_minutes: 30,
      shop_print_shipping_cents: 590,
    });
  });

  it("überschreibt den Standardwert mit einer vorhandenen app_settings-Zeile", async () => {
    state.globalRows = [{ key: "maintenance_mode", value: true }];
    const result = await getGlobalSettings();
    expect(result.maintenance_mode).toBe(true);
  });
});

describe("getPersonalSettingPermissions", () => {
  beforeEach(() => {
    state.userRows = [];
    state.globalRows = [];
  });

  it("liefert die Registry-Defaults, wenn keine Overrides existieren", async () => {
    const result = await getPersonalSettingPermissions();
    expect(result).toEqual({
      theme: "user",
      show_debug_info: "admin",
      default_administrative_unit: "user",
    });
  });

  it("überschreibt einzelne Keys mit den gespeicherten Overrides", async () => {
    state.globalRows = [{ key: "personal_setting_permissions", value: { show_debug_info: "user" } }];
    const result = await getPersonalSettingPermissions();
    expect(result).toEqual({
      theme: "user",
      show_debug_info: "user",
      default_administrative_unit: "user",
    });
  });

  it("ignoriert ungültige Rollen-Werte in den Overrides", async () => {
    state.globalRows = [{ key: "personal_setting_permissions", value: { theme: "not-a-role" } }];
    const result = await getPersonalSettingPermissions();
    expect(result.theme).toBe("user");
  });
});
