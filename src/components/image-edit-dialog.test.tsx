import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ImageEditDialog } from "./image-edit-dialog";
import type { ImageSearchRow } from "@/app/images/actions";

const { updateImageMetadataMock } = vi.hoisted(() => ({
  updateImageMetadataMock: vi.fn(),
}));

vi.mock("@/app/images/actions", () => ({
  updateImageMetadata: updateImageMetadataMock,
}));

const baseRow: ImageSearchRow = {
  id: "img-1",
  hash: "ABC123",
  mainLocation: "Hauptstraße",
  secondaryLocations: ["Nebenort 1"],
  tags: ["Tag1"],
  userTags: [
    { tag: "Eigener", addedBy: "user-1" },
    { tag: "Fremder", addedBy: "user-2" },
  ],
  webVisible: true,
  webRanking: 5,
  printVisible: false,
  printRanking: null,
  uploadedBy: "user-1",
  isFavorite: false,
  thumbUrl: "https://cdn.example/img-1/thumb.jpg",
  previewUrl: "https://cdn.example/img-1/preview.jpg",
  administrativeUnitId: "unit-1",
  regionId: null,
};

describe("ImageEditDialog", () => {
  beforeEach(() => {
    updateImageMetadataMock.mockReset();
    updateImageMetadataMock.mockResolvedValue({ success: true });
  });

  it("übernimmt Nebenorte/Tags aus row als Chips (nicht als Kommastring)", () => {
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText("Nebenort 1")).toBeInTheDocument();
    expect(screen.getByText("Tag1")).toBeInTheDocument();
    // Kein kommagetrenntes Textfeld mehr für diese Felder.
    expect(screen.queryByText(/kommagetrennt/i)).not.toBeInTheDocument();
  });

  it("ruft updateImageMetadata beim Speichern mit den erwarteten Arrays auf", async () => {
    const onSaved = vi.fn();
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByTestId("image-edit-secondary-locations"), {
      target: { value: "Neuer Nebenort" },
    });
    fireEvent.keyDown(screen.getByTestId("image-edit-secondary-locations"), { key: "Enter" });

    fireEvent.click(screen.getByTestId("image-edit-save"));

    await waitFor(() =>
      expect(updateImageMetadataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "img-1",
          secondaryLocations: ["Nebenort 1", "Neuer Nebenort"],
          tags: ["Tag1"],
        })
      )
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("rendert keine User-Tags-Sektion ohne eingeloggten currentUser", () => {
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.queryByTestId("image-edit-user-tag-input")).not.toBeInTheDocument();
  });

  it("zeigt das Entfernen-× nur beim eigenen User-Tag (canManageUserTag)", () => {
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        // role "user" (nicht "admin"/Owner) — darf laut canManageUserTag nur
        // den eigenen Tag verwalten, nicht den eines anderen auf demselben Bild.
        currentUser={{ id: "user-1", role: "user" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    // "Eigener" (addedBy: user-1) darf entfernt werden, "Fremder" (user-2) nicht.
    expect(screen.getByTestId("image-edit-user-tag-remove-Eigener")).toBeInTheDocument();
    expect(screen.queryByTestId("image-edit-user-tag-remove-Fremder")).not.toBeInTheDocument();
  });

  it("ruft onAddUserTag sofort beim Enter auf (nicht erst beim Speichern)", () => {
    const onAddUserTag = vi.fn();
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        onAddUserTag={onAddUserTag}
      />
    );

    const input = screen.getByTestId("image-edit-user-tag-input");
    fireEvent.change(input, { target: { value: "Neuer Tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAddUserTag).toHaveBeenCalledWith("Neuer Tag");
    expect(updateImageMetadataMock).not.toHaveBeenCalled();
  });

  it("ruft onRemoveUserTag beim Klick auf × auf", () => {
    const onRemoveUserTag = vi.fn();
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        onRemoveUserTag={onRemoveUserTag}
      />
    );

    fireEvent.click(screen.getByTestId("image-edit-user-tag-remove-Eigener"));

    expect(onRemoveUserTag).toHaveBeenCalledWith("Eigener", "user-1");
  });

  it("zeigt Web-/Druck-Ranking als Sterne statt Zahlenfeld und übernimmt row.webRanking", () => {
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByTestId("image-edit-web-ranking-value")).toHaveTextContent("5/10");
    expect(screen.queryByTestId("image-edit-web-ranking")?.tagName).not.toBe("INPUT");
  });

  it("Druck-Ranking-Sterne sind ohne canManagePrintFields deaktiviert", () => {
    const onSaved = vi.fn();
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByTestId("image-edit-print-ranking-star-3"));
    fireEvent.click(screen.getByTestId("image-edit-save"));

    expect(screen.getByTestId("image-edit-print-ranking-value")).toHaveTextContent("—");
  });

  it("Web-Ranking-Klick auf einen Stern aktualisiert den angezeigten Wert und wird beim Speichern mitgeschickt", async () => {
    render(
      <ImageEditDialog
        row={baseRow}
        canManagePrintFields={false}
        currentUser={{ id: "user-1", role: "admin" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("image-edit-web-ranking-star-8"));
    expect(screen.getByTestId("image-edit-web-ranking-value")).toHaveTextContent("8/10");

    fireEvent.click(screen.getByTestId("image-edit-save"));

    await waitFor(() =>
      expect(updateImageMetadataMock).toHaveBeenCalledWith(expect.objectContaining({ webRanking: 8 }))
    );
  });
});
