import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { authMock, getGlobalSettingsMock } = vi.hoisted(() => ({
  authMock: vi.fn().mockResolvedValue(null),
  getGlobalSettingsMock: vi.fn().mockResolvedValue({ maintenance_mode: false }),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/settings-service", () => ({ getGlobalSettings: getGlobalSettingsMock }));

import Home from "./page";

describe("Home", () => {
  it("renders the HiFly heading", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "HiFly" })).toBeInTheDocument();
  });

  it("zeigt keinen Wartungsbanner, wenn maintenance_mode aus ist", async () => {
    authMock.mockResolvedValue(null);
    getGlobalSettingsMock.mockResolvedValue({ maintenance_mode: false });
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByTestId("maintenance-banner")).not.toBeInTheDocument();
  });

  it("zeigt einem abgemeldeten Besucher bei aktivem Wartungsmodus den vollen Wartungsbildschirm statt der Startseite", async () => {
    authMock.mockResolvedValue(null);
    getGlobalSettingsMock.mockResolvedValue({ maintenance_mode: true });
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("maintenance-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("maintenance-banner")).not.toBeInTheDocument();
  });

  it("zeigt einem plain user bei aktivem Wartungsmodus ebenfalls den Wartungsbildschirm", async () => {
    authMock.mockResolvedValue({ user: { id: "1", role: "user", email: "u@example.com" } });
    getGlobalSettingsMock.mockResolvedValue({ maintenance_mode: true });
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("maintenance-screen")).toBeInTheDocument();
  });

  it("admin sieht bei aktivem Wartungsmodus weiterhin die normale Startseite mit Reminder-Banner", async () => {
    authMock.mockResolvedValue({ user: { id: "1", role: "admin", email: "a@example.com" } });
    getGlobalSettingsMock.mockResolvedValue({ maintenance_mode: true });
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("maintenance-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("maintenance-screen")).not.toBeInTheDocument();
  });
});
