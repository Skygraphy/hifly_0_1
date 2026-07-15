import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LastAdministrativeUnitName } from "./last-administrative-unit-name";
import { setGuestSetting } from "@/lib/guest-settings";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

const leaf: AdministrativeUnit = {
  id: "leaf",
  parentId: "root",
  level: "state",
  code: "NOE",
  name: "Niederösterreich",
  shortName: null,
  color: null,
};
const units = [leaf];

const wachau: Region = {
  id: "wachau",
  name: "Wachau",
  description: null,
  color: null,
  parentId: null,
  homeLevel: "federal",
};
const regions = [wachau];

describe("LastAdministrativeUnitName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("zeigt den Namen synchron, wenn initialStandort eine Unit ist, und leitet nicht um", () => {
    render(
      <LastAdministrativeUnitName units={units} regions={regions} initialStandort={{ type: "unit", id: leaf.id }} />
    );
    expect(screen.getByTestId("last-administrative-unit-name")).toHaveTextContent(leaf.name);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("zeigt den Namen synchron, wenn initialStandort eine Region ist, und leitet nicht um", () => {
    render(
      <LastAdministrativeUnitName units={units} regions={regions} initialStandort={{ type: "region", id: wachau.id }} />
    );
    expect(screen.getByTestId("last-administrative-unit-name")).toHaveTextContent(wachau.name);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("stellt den Namen aus localStorage wieder her (anonym) und leitet nicht um", async () => {
    setGuestSetting("default_administrative_unit", { type: "unit", id: leaf.id });
    render(<LastAdministrativeUnitName units={units} regions={regions} initialStandort={null} />);
    await waitFor(() =>
      expect(screen.getByTestId("last-administrative-unit-name")).toHaveTextContent(leaf.name)
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("leitet auf / um, wenn weder Server noch localStorage eine Auswahl kennen (Guard)", async () => {
    render(<LastAdministrativeUnitName units={units} regions={regions} initialStandort={null} />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(screen.queryByTestId("last-administrative-unit-name")).not.toBeInTheDocument();
  });

  it("leitet auf / um, wenn die gespeicherte Unit nicht mehr existiert (Guard)", async () => {
    render(
      <LastAdministrativeUnitName units={units} regions={regions} initialStandort={{ type: "unit", id: "does-not-exist" }} />
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(screen.queryByTestId("last-administrative-unit-name")).not.toBeInTheDocument();
  });

  it("leitet auf / um, wenn die gespeicherte Region nicht mehr existiert (Guard)", async () => {
    render(
      <LastAdministrativeUnitName units={units} regions={regions} initialStandort={{ type: "region", id: "does-not-exist" }} />
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
    expect(screen.queryByTestId("last-administrative-unit-name")).not.toBeInTheDocument();
  });
});
