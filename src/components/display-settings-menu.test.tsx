import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DisplaySettingsMenu } from "./display-settings-menu";
import { setGuestSetting } from "@/lib/guest-settings";

const { setPersonalSettingMock, syncGuestSettingsOnLoginMock } = vi.hoisted(() => ({
  setPersonalSettingMock: vi.fn().mockResolvedValue({ success: true }),
  syncGuestSettingsOnLoginMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/app/settings/actions", () => ({
  setPersonalSetting: setPersonalSettingMock,
  syncGuestSettingsOnLogin: syncGuestSettingsOnLoginMock,
}));

// Das Öffnen des Dropdowns selbst (Base UI Menu) lässt sich in jsdom nicht
// zuverlässig simulieren — abgedeckt durch e2e/settings.spec.ts. Hier wird
// die reine Verzweigungslogik geprüft (Trigger-Rendering, Sync-on-Login).
describe("DisplaySettingsMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("zeigt den Trigger auch ohne eingeloggten User", () => {
    render(<DisplaySettingsMenu user={null} />);
    expect(screen.getByTestId("display-settings-trigger")).toBeInTheDocument();
  });

  it("zeigt den Trigger für einen eingeloggten User", () => {
    render(<DisplaySettingsMenu user={{ email: "u@example.com", role: "user" }} />);
    expect(screen.getByTestId("display-settings-trigger")).toBeInTheDocument();
  });

  it("synchronisiert lokale Gast-Werte einmalig nach Login", async () => {
    setGuestSetting("theme", "light");

    render(<DisplaySettingsMenu user={{ email: "u@example.com", role: "user" }} />);

    await waitFor(() => expect(syncGuestSettingsOnLoginMock).toHaveBeenCalledWith({ theme: "light" }));
    expect(window.localStorage.getItem("hifly_guest_settings_synced")).toBe("1");
  });

  it("synchronisiert nichts, wenn keine lokalen Werte vorhanden sind", async () => {
    render(<DisplaySettingsMenu user={{ email: "u@example.com", role: "user" }} />);

    await waitFor(() => expect(window.localStorage.getItem("hifly_guest_settings_synced")).toBe("1"));
    expect(syncGuestSettingsOnLoginMock).not.toHaveBeenCalled();
  });

  it("synchronisiert nichts ohne eingeloggten User", async () => {
    setGuestSetting("theme", "light");

    render(<DisplaySettingsMenu user={null} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(syncGuestSettingsOnLoginMock).not.toHaveBeenCalled();
  });
});
