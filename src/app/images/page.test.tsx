import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: redirectMock,
}));

const { authMock, getStandortPickerDataMock } = vi.hoisted(() => ({
  authMock: vi.fn().mockResolvedValue(null),
  getStandortPickerDataMock: vi.fn().mockResolvedValue({
    units: [
      {
        id: "leaf",
        parentId: null,
        level: "federal",
        code: "AT",
        name: "Österreich",
        shortName: null,
        color: null,
      },
    ],
    regions: [],
    initialStandort: { type: "unit", id: "leaf" },
  }),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/standort-picker-data", () => ({
  getStandortPickerData: getStandortPickerDataMock,
}));

import ImagesPage from "./page";

describe("ImagesPage", () => {
  it("zeigt den Namen des gespeicherten Standorts groß an", async () => {
    render(await ImagesPage());
    expect(screen.getByTestId("last-administrative-unit-name")).toHaveTextContent("Österreich");
  });

  it("zeigt einen Zurück-Link zur Startseite", async () => {
    render(await ImagesPage());
    expect(screen.getByTestId("back-link")).toHaveAttribute("href", "/");
  });

  it("leitet eingeloggte User ohne (gültige) Auswahl serverseitig auf / um, statt die Seite zu rendern", async () => {
    authMock.mockResolvedValue({ user: { id: "1", role: "user", email: "u@example.com" } });
    getStandortPickerDataMock.mockResolvedValue({ units: [], regions: [], initialStandort: null });

    await expect(ImagesPage()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("leitet eingeloggte User um, wenn die gespeicherte Einheit nicht mehr existiert", async () => {
    authMock.mockResolvedValue({ user: { id: "1", role: "user", email: "u@example.com" } });
    getStandortPickerDataMock.mockResolvedValue({
      units: [],
      regions: [],
      initialStandort: { type: "unit", id: "deleted-unit" },
    });

    await expect(ImagesPage()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("leitet eingeloggte User um, wenn die gespeicherte Region nicht mehr existiert", async () => {
    authMock.mockResolvedValue({ user: { id: "1", role: "user", email: "u@example.com" } });
    getStandortPickerDataMock.mockResolvedValue({
      units: [],
      regions: [],
      initialStandort: { type: "region", id: "deleted-region" },
    });

    await expect(ImagesPage()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("zeigt eine gespeicherte Region groß an (statt einer Unit)", async () => {
    authMock.mockResolvedValue(null);
    getStandortPickerDataMock.mockResolvedValueOnce({
      units: [],
      regions: [{ id: "wachau", name: "Wachau", description: null, color: null }],
      initialStandort: { type: "region", id: "wachau" },
    });

    render(await ImagesPage());
    expect(screen.getByTestId("last-administrative-unit-name")).toHaveTextContent("Wachau");
  });
});
