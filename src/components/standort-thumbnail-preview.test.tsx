import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { StandortThumbnailPreview } from "./standort-thumbnail-preview";
import type { RandomImageThumb } from "@/app/images/actions";

const { getRandomImagesMock } = vi.hoisted(() => ({
  getRandomImagesMock: vi.fn(),
}));

vi.mock("@/app/images/actions", () => ({
  getRandomImages: getRandomImagesMock,
}));

const thumbs: RandomImageThumb[] = [
  { id: "img-1", mainLocation: "Adalbert Stifter-Gasse", thumbUrl: "https://cdn.example/img-1/thumb.jpg" },
  { id: "img-2", mainLocation: null, thumbUrl: "https://cdn.example/img-2/thumb.jpg" },
];

describe("StandortThumbnailPreview", () => {
  beforeEach(() => {
    getRandomImagesMock.mockReset();
    getRandomImagesMock.mockResolvedValue([]);
  });

  it("ruft getRandomImages nicht auf, wenn filter null ist", async () => {
    render(<StandortThumbnailPreview filter={null} />);
    await Promise.resolve();
    expect(getRandomImagesMock).not.toHaveBeenCalled();
  });

  it("ruft getRandomImages mit dem übergebenen Filter auf", async () => {
    getRandomImagesMock.mockResolvedValue(thumbs);
    render(<StandortThumbnailPreview filter={{ administrativeUnitIds: ["unit-1"] }} />);
    await waitFor(() => expect(getRandomImagesMock).toHaveBeenCalledWith({ administrativeUnitIds: ["unit-1"] }));
  });

  it("rendert die zurückgegebenen Kacheln ohne klickbare Elemente", async () => {
    getRandomImagesMock.mockResolvedValue(thumbs);
    render(<StandortThumbnailPreview filter={{ regionId: "region-1" }} />);

    await waitFor(() => expect(screen.getByTestId("standort-thumbnail-preview")).toBeInTheDocument());
    expect(screen.getByTestId("standort-thumbnail-img-1")).toBeInTheDocument();
    expect(screen.getByTestId("standort-thumbnail-img-2")).toBeInTheDocument();
    // Kein Adress-Badge (nur noch als alt-Text am Bild selbst, nicht sichtbar).
    expect(screen.queryByText("Adalbert Stifter-Gasse")).not.toBeInTheDocument();
    expect(screen.getByAltText("Adalbert Stifter-Gasse")).toBeInTheDocument();
    // Keine interaktiven Elemente — reine Anzeige, siehe Kommentar in der Komponente.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rendert nichts, wenn keine Bilder zurückkommen", async () => {
    getRandomImagesMock.mockResolvedValue([]);
    render(<StandortThumbnailPreview filter={{ regionId: "region-1" }} />);
    await waitFor(() => expect(getRandomImagesMock).toHaveBeenCalled());
    expect(screen.queryByTestId("standort-thumbnail-preview")).not.toBeInTheDocument();
  });
});
