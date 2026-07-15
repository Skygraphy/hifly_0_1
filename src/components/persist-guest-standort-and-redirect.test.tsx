import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PersistGuestStandortAndRedirect } from "./persist-guest-standort-and-redirect";
import { getGuestSettings } from "@/lib/guest-settings";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

describe("PersistGuestStandortAndRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("speichert den übergebenen Unit-Standort als default_administrative_unit im localStorage", async () => {
    render(<PersistGuestStandortAndRedirect standort={{ type: "unit", id: "unit-123" }} />);
    await waitFor(() =>
      expect(getGuestSettings()["default_administrative_unit"]).toEqual({ type: "unit", id: "unit-123" })
    );
  });

  it("speichert den übergebenen Region-Standort als default_administrative_unit im localStorage", async () => {
    render(<PersistGuestStandortAndRedirect standort={{ type: "region", id: "region-456" }} />);
    await waitFor(() =>
      expect(getGuestSettings()["default_administrative_unit"]).toEqual({ type: "region", id: "region-456" })
    );
  });

  it("leitet auf / um", async () => {
    render(<PersistGuestStandortAndRedirect standort={{ type: "unit", id: "unit-123" }} />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("zeigt einen kurzen Zwischenzustand statt einer leeren Seite", () => {
    render(<PersistGuestStandortAndRedirect standort={{ type: "unit", id: "unit-123" }} />);
    expect(screen.getByTestId("persist-guest-standort-pending")).toBeInTheDocument();
  });
});
