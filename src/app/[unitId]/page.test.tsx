import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: redirectMock,
  notFound: notFoundMock,
}));

const { authMock, selectResultMock, selectMock, setPersonalSettingMock } = vi.hoisted(() => {
  // Jeder Aufruf von db.select(...) baut eine frische Kette (unit-Lookup,
  // ggf. gefolgt vom region-Lookup) — selectResultMock liefert der Reihe
  // nach die konfigurierten Ergebnisse via mockResolvedValueOnce.
  const selectResultMock = vi.fn().mockResolvedValue([]);
  const selectMock = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => selectResultMock()),
      })),
    })),
  }));
  return {
    authMock: vi.fn().mockResolvedValue(null),
    selectResultMock,
    selectMock,
    setPersonalSettingMock: vi.fn().mockResolvedValue({ success: true }),
  };
});
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: { select: selectMock } }));
vi.mock("@/app/settings/actions", () => ({ setPersonalSetting: setPersonalSettingMock }));

import AdministrativeUnitDeepLinkPage from "./page";

const validUuid = "cce31b45-25b3-4c05-a069-ed2c949fba16";

describe("AdministrativeUnitDeepLinkPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResultMock.mockResolvedValue([]);
    authMock.mockResolvedValue(null);
  });

  it("404'ed bei ungültigem UUID-Format, ohne die DB abzufragen", async () => {
    await expect(
      AdministrativeUnitDeepLinkPage({ params: Promise.resolve({ unitId: "not-a-uuid" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("404'ed bei gültigem UUID-Format ohne Treffer in administrative_units ODER regions", async () => {
    selectResultMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      AdministrativeUnitDeepLinkPage({ params: Promise.resolve({ unitId: validUuid }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rendert die Gast-Übernahme-Komponente für anonyme Besucher (Unit-Treffer), ohne setPersonalSetting aufzurufen", async () => {
    selectResultMock.mockResolvedValueOnce([{ id: validUuid }]);
    authMock.mockResolvedValueOnce(null);

    render(await AdministrativeUnitDeepLinkPage({ params: Promise.resolve({ unitId: validUuid }) }));

    expect(screen.getByTestId("persist-guest-standort-pending")).toBeInTheDocument();
    expect(setPersonalSettingMock).not.toHaveBeenCalled();
  });

  it("speichert serverseitig und leitet eingeloggte User auf / um (Unit-Treffer)", async () => {
    selectResultMock.mockResolvedValueOnce([{ id: validUuid }]);
    authMock.mockResolvedValueOnce({ user: { id: "1", role: "user", email: "u@example.com" } });

    await expect(
      AdministrativeUnitDeepLinkPage({ params: Promise.resolve({ unitId: validUuid }) })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(setPersonalSettingMock).toHaveBeenCalledWith(
      "default_administrative_unit",
      { type: "unit", id: validUuid },
      { revalidate: false }
    );
  });

  it("prüft regions, wenn administrative_units keinen Treffer hat, und speichert als Region-Standort (eingeloggt)", async () => {
    selectResultMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: validUuid }]);
    authMock.mockResolvedValueOnce({ user: { id: "1", role: "user", email: "u@example.com" } });

    await expect(
      AdministrativeUnitDeepLinkPage({ params: Promise.resolve({ unitId: validUuid }) })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(setPersonalSettingMock).toHaveBeenCalledWith(
      "default_administrative_unit",
      { type: "region", id: validUuid },
      { revalidate: false }
    );
  });

  it("rendert die Gast-Übernahme-Komponente für einen Region-Treffer (anonym)", async () => {
    selectResultMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: validUuid }]);
    authMock.mockResolvedValueOnce(null);

    render(await AdministrativeUnitDeepLinkPage({ params: Promise.resolve({ unitId: validUuid }) }));

    expect(screen.getByTestId("persist-guest-standort-pending")).toBeInTheDocument();
    expect(setPersonalSettingMock).not.toHaveBeenCalled();
  });
});
