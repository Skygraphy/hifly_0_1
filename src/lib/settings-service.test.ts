import { describe, expect, it, beforeEach, vi } from "vitest";

const { dbMock, state } = vi.hoisted(() => {
  const state = {
    userRows: [] as Array<{ key: string; value: unknown }>,
    globalRows: [] as Array<{ key: string; value: unknown }>,
  };
  const whereMock = vi.fn(() => Promise.resolve(state.userRows));
  const fromMock = vi.fn(() => Object.assign(Promise.resolve(state.globalRows), { where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { dbMock: { select: selectMock }, state };
});

vi.mock("@/db", () => ({ db: dbMock }));

const { getPersonalSettings, getGlobalSettings } = await import("./settings-service");

describe("getPersonalSettings", () => {
  beforeEach(() => {
    state.userRows = [];
    state.globalRows = [];
  });

  it("liefert nur Registry-Standardwerte für Keys, die die Rolle sehen darf", async () => {
    const result = await getPersonalSettings("user-1", "user");
    expect(result).toEqual({ theme: "dark" });
  });

  it("zeigt show_debug_info zusätzlich für admin", async () => {
    const result = await getPersonalSettings("admin-1", "admin");
    expect(result).toEqual({ theme: "dark", show_debug_info: false });
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
});

describe("getGlobalSettings", () => {
  beforeEach(() => {
    state.userRows = [];
    state.globalRows = [];
  });

  it("liefert Registry-Standardwerte, wenn keine Zeilen existieren", async () => {
    const result = await getGlobalSettings();
    expect(result).toEqual({ maintenance_mode: false });
  });

  it("überschreibt den Standardwert mit einer vorhandenen app_settings-Zeile", async () => {
    state.globalRows = [{ key: "maintenance_mode", value: true }];
    const result = await getGlobalSettings();
    expect(result.maintenance_mode).toBe(true);
  });
});
