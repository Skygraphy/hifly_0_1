import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdministrativeLevelWidget } from "./administrative-level-widget";
import { getGuestSettings, setGuestSetting } from "@/lib/guest-settings";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region, RegionAdministrativeUnitLink } from "@/lib/regions";

const { setPersonalSettingMock } = vi.hoisted(() => ({
  setPersonalSettingMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/app/settings/actions", () => ({
  setPersonalSetting: setPersonalSettingMock,
}));

// StandortThumbnailPreview (gerendert zwischen Label und Breadcrumbs, siehe
// administrative-level-widget.tsx) ruft getRandomImages auf — ohne diesen
// Mock würde jeder Breadcrumb-Test einen echten (in vitest nicht
// verfügbaren) DB-Zugriff auslösen. Leeres Array reicht hier: dieser Test
// prüft nicht die Vorschau selbst (siehe standort-thumbnail-preview.test.tsx).
vi.mock("@/app/images/actions", () => ({
  getRandomImages: vi.fn().mockResolvedValue([]),
}));

const root: AdministrativeUnit = {
  id: "root",
  parentId: null,
  level: "federal",
  code: "AT",
  name: "Österreich",
  shortName: null,
  color: null,
  published: true,
};
const child: AdministrativeUnit = {
  id: "child",
  parentId: "root",
  level: "state",
  code: "NOE",
  name: "Niederösterreich",
  shortName: null,
  color: null,
  published: true,
};
const grandchild: AdministrativeUnit = {
  id: "grandchild",
  parentId: "child",
  level: "district",
  code: "TU",
  name: "Tulln",
  shortName: null,
  color: null,
  published: true,
};
const units = [root, child];
const unitsWithGrandchild = [root, child, grandchild];

const wachau: Region = {
  id: "wachau",
  name: "Wachau",
  description: "Donautal",
  color: null,
  parentId: null,
  homeLevel: "federal",
  published: true,
};
const regions = [wachau];
// wachau ist mit "root" (Österreich) verknüpft — erscheint dadurch in der
// Spalte für die Kinder von root.parentId (= null), also derselben Spalte
// wie "Österreich" selbst. LCA von {root} ist root selbst (trivial), die
// Region hat also KEINE Vorfahren-Breadcrumb-Segmente vor sich.
const regionLinksWithWachau: RegionAdministrativeUnitLink[] = [
  { regionId: wachau.id, administrativeUnitId: root.id },
];
// wachau ist stattdessen mit "grandchild" (Tulln, Kind von child/
// Niederösterreich) verknüpft — LCA von {child} ist child selbst, die
// Region erscheint also als Geschwister von grandchild, mit einer
// zweistufigen Vorfahrenkette (root, child) davor.
const regionLinksWithWachauUnderGrandchild: RegionAdministrativeUnitLink[] = [
  { regionId: wachau.id, administrativeUnitId: grandchild.id },
];
const noRegionLinks: RegionAdministrativeUnitLink[] = [];

describe("AdministrativeLevelWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("zeigt den Spalten-Picker, wenn noch kein Wert gespeichert ist", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={null}
        user={null}
      />
    );
    expect(screen.getByTestId("administrative-level-label")).toHaveTextContent("Wähle deinen Standort");
    expect(screen.getByTestId(`unit-column-select-${root.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`unit-breadcrumb-${root.level}`)).not.toBeInTheDocument();
  });

  it("zeigt die Breadcrumb-Ansicht synchron, wenn initialStandort eine Unit ist (kein Flackern), und den Namen des Standorts statt der Aufforderung", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={{ type: "unit", id: child.id }}
        user={{ email: "u@example.com", role: "user" }}
      />
    );
    expect(screen.getByTestId(`unit-breadcrumb-${child.level}`)).toHaveTextContent(child.name);
    expect(screen.getByTestId("administrative-level-label")).toHaveTextContent(child.name);
    expect(screen.queryByText("Wähle deinen Standort")).not.toBeInTheDocument();
  });

  it("stellt die Breadcrumb-Ansicht aus localStorage wieder her (anonym, wiederkehrend)", async () => {
    setGuestSetting("default_administrative_unit", { type: "unit", id: child.id });
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={null}
        user={null}
      />
    );
    await waitFor(() => expect(screen.getByTestId(`unit-breadcrumb-${child.level}`)).toHaveTextContent(child.name));
  });

  it("stellt die Breadcrumb-Ansicht auch aus einem alten, blanken String-Wert wieder her (Rückwärtskompatibilität)", async () => {
    setGuestSetting("default_administrative_unit", child.id);
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={null}
        user={null}
      />
    );
    await waitFor(() => expect(screen.getByTestId(`unit-breadcrumb-${child.level}`)).toHaveTextContent(child.name));
  });

  it("fällt bei gelöschter/unbekannter initialStandort-Unit auf den Picker zurück", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={{ type: "unit", id: "does-not-exist" }}
        user={null}
      />
    );
    expect(screen.getByText("Wähle deinen Standort")).toBeInTheDocument();
  });

  it("speichert per localStorage, wenn anonym eine Zeile ausgewählt wird, bleibt aber im Picker (weitere Spalten klickbar)", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={null}
        user={null}
      />
    );
    fireEvent.click(screen.getByTestId(`unit-column-select-${root.id}`));
    expect(getGuestSettings()["default_administrative_unit"]).toEqual({ type: "unit", id: root.id });
    // Bewusst weiterhin die Spalten-Ansicht (nicht die Breadcrumb-Ansicht) —
    // sonst könnte man beim ersten Besuch nicht durch mehrere Spalten
    // weiterklicken. Die nächste Spalte (Kinder von "root") ist jetzt sichtbar.
    expect(screen.getByTestId(`unit-column-select-${child.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`unit-breadcrumb-${root.level}`)).not.toBeInTheDocument();
  });

  it("ruft setPersonalSetting auf, wenn eingeloggt eine Zeile ausgewählt wird", async () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={null}
        user={{ email: "u@example.com", role: "user" }}
      />
    );
    fireEvent.click(screen.getByTestId(`unit-column-select-${root.id}`));
    await waitFor(() =>
      expect(setPersonalSettingMock).toHaveBeenCalledWith("default_administrative_unit", { type: "unit", id: root.id })
    );
  });

  it("zeigt eine verknüpfte Region als zusätzlichen, abgetrennten Auswahlpunkt in der passenden Spalte (kein Tab mehr nötig)", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={regionLinksWithWachau}
        initialStandort={null}
        user={null}
      />
    );
    expect(screen.getByTestId(`unit-column-select-${root.id}`)).toBeInTheDocument();
    expect(screen.getByText("Gegend")).toBeInTheDocument();
    expect(screen.getByTestId(`region-option-${wachau.id}`)).toBeInTheDocument();
  });

  it("zeigt keine Region-Sektion, wenn keine Region mit der jeweiligen Spalte verknüpft ist", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={null}
        user={null}
      />
    );
    expect(screen.queryByText("Gegend")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`region-option-${wachau.id}`)).not.toBeInTheDocument();
  });

  it("Region auswählen speichert sie sofort und zeigt sie als eigenes Breadcrumb-Segment (ohne Vorfahren, da direkt mit der Wurzel verknüpft)", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={regionLinksWithWachau}
        initialStandort={null}
        user={null}
      />
    );
    fireEvent.click(screen.getByTestId(`region-option-${wachau.id}`));

    expect(getGuestSettings()["default_administrative_unit"]).toEqual({ type: "region", id: wachau.id });
    expect(screen.getByTestId("administrative-level-label")).toHaveTextContent(wachau.name);
    // Kein "Standort ändern"-Link mehr — die Region ist jetzt selbst ein
    // normales Breadcrumb-Segment (Dropdown-Trigger), konsistent mit
    // Einheiten. Kein Vorfahren-Segment davor, da ihr LCA die Wurzel selbst
    // ist (keine Kette dazwischen).
    expect(screen.getByTestId(`region-breadcrumb-${wachau.id}`)).toHaveTextContent(wachau.name);
    expect(screen.queryByTestId(`unit-breadcrumb-${root.level}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("standort-change-region")).not.toBeInTheDocument();
  });

  it("zeigt eine ausgewählte Region als Breadcrumb-Segment HINTER ihrer vollen Vorfahrenkette, wenn ihr LCA nicht die Wurzel ist", () => {
    render(
      <AdministrativeLevelWidget
        units={unitsWithGrandchild}
        regions={regions}
        regionLinks={regionLinksWithWachauUnderGrandchild}
        initialStandort={{ type: "region", id: wachau.id }}
        user={null}
      />
    );
    expect(screen.getByTestId("administrative-level-label")).toHaveTextContent(wachau.name);
    expect(screen.getByTestId(`unit-breadcrumb-${root.level}`)).toHaveTextContent(root.name);
    expect(screen.getByTestId(`unit-breadcrumb-${child.level}`)).toHaveTextContent(child.name);
    expect(screen.getByTestId(`region-breadcrumb-${wachau.id}`)).toHaveTextContent(wachau.name);
  });

  it("fällt bei gelöschter/unbekannter initialStandort-Region auf den Picker zurück", () => {
    render(
      <AdministrativeLevelWidget
        units={units}
        regions={regions}
        regionLinks={noRegionLinks}
        initialStandort={{ type: "region", id: "does-not-exist" }}
        user={null}
      />
    );
    expect(screen.getByText("Wähle deinen Standort")).toBeInTheDocument();
  });
});
