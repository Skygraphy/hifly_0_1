import { describe, expect, it, beforeEach } from "vitest";
import { getGuestSettings, setGuestSetting, GUEST_SETTINGS_STORAGE_KEY } from "./guest-settings";

describe("guest-settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("liefert ein leeres Objekt, wenn noch nichts gespeichert ist", () => {
    expect(getGuestSettings()).toEqual({});
  });

  it("speichert und liest eine einzelne Einstellung", () => {
    setGuestSetting("theme", "light");
    expect(getGuestSettings()).toEqual({ theme: "light" });
  });

  it("merged mehrere Einstellungen statt sie zu überschreiben", () => {
    setGuestSetting("theme", "light");
    setGuestSetting("font_size", "lg");
    expect(getGuestSettings()).toEqual({ theme: "light", font_size: "lg" });
  });

  it("überschreibt einen bestehenden Key bei erneutem Setzen", () => {
    setGuestSetting("theme", "light");
    setGuestSetting("theme", "dark");
    expect(getGuestSettings()).toEqual({ theme: "dark" });
  });

  it("gibt ein leeres Objekt zurück, wenn der gespeicherte Wert kaputtes JSON ist", () => {
    window.localStorage.setItem(GUEST_SETTINGS_STORAGE_KEY, "not-json");
    expect(getGuestSettings()).toEqual({});
  });
});
