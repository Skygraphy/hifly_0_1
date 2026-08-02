import { ImageThumbnailCard } from "@/components/image-thumbnail-card";
import { canEditImage, canDeleteImage, type Role } from "@/lib/authorization";
import { FALLBACK_MARKER_COLOR } from "@/lib/image-map-colors";
import type { ImageSearchRow } from "@/app/images/actions";

/**
 * Reguläres, bündiges Grid mit fester Zellgröße (4:3, deckt die meisten
 * Bilder — Querformat 512×384 — direkt ab) statt einer Justified Gallery mit
 * variabler Zeilenhöhe (auf Wunsch des Users zurückgebaut, siehe
 * ImageThumbnailCard für die Hochformat-Behandlung).
 */
export function ImageGrid({
  rows,
  user,
  selectedIds,
  onToggleSelect,
  onPreview,
  onEdit,
  onDelete,
  onAddUserTag,
  onRemoveUserTag,
  dotColorById,
  onLocateOnMap,
}: {
  rows: ImageSearchRow[];
  user: { id?: string; role: Role } | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, index: number, isRangeSelect: boolean) => void;
  onPreview: (row: ImageSearchRow) => void;
  onEdit: (row: ImageSearchRow) => void;
  onDelete: (row: ImageSearchRow) => void;
  onAddUserTag: (id: string, tag: string) => void;
  onRemoveUserTag: (id: string, tag: string, addedBy: string | null) => void;
  /** Standort-Farbe pro Bild-id, dieselbe wie der zugehörige Karten-Marker
   * (siehe dotColorById in images-page-client.tsx) — für den Punkt unten
   * rechts auf jeder Kachel. */
  dotColorById: Map<string, string>;
  onLocateOnMap: (row: ImageSearchRow) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1" data-testid="image-grid">
      {rows.map((row, index) => {
        const canEdit = canEditImage({
          actingUserId: user?.id,
          actingRole: user?.role,
          imageUploadedBy: row.uploadedBy,
        });
        const canDelete = canDeleteImage({
          actingUserId: user?.id,
          actingRole: user?.role,
          imageUploadedBy: row.uploadedBy,
        });
        return (
          <ImageThumbnailCard
            key={row.id}
            row={row}
            canEdit={canEdit}
            canDelete={canDelete}
            isSelected={selectedIds.has(row.id)}
            onToggleSelect={canDelete ? (isRangeSelect) => onToggleSelect(row.id, index, isRangeSelect) : undefined}
            onPreview={onPreview}
            onEdit={onEdit}
            onDelete={onDelete}
            currentUser={user}
            onAddUserTag={(tag) => onAddUserTag(row.id, tag)}
            onRemoveUserTag={(tag, addedBy) => onRemoveUserTag(row.id, tag, addedBy)}
            dotColor={dotColorById.get(row.id) ?? FALLBACK_MARKER_COLOR}
            onLocateOnMap={onLocateOnMap}
          />
        );
      })}
    </div>
  );
}
