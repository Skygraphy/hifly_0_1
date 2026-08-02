"use client";

import { useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteImage, type ImageSearchRow } from "@/app/images/actions";

export function ImageDeleteDialog({
  row,
  onOpenChange,
  onDeleted,
}: {
  row: ImageSearchRow | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={row !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bild wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            {row?.mainLocation ?? row?.id} wird unwiderruflich gelöscht, inklusive aller zugehörigen
            Dateien (Original, Vorschauen, Thumbnail). Das kann nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="image-confirm-delete"
            onClick={() => {
              if (!row) return;
              startTransition(async () => {
                const result = await deleteImage(row.id);
                if (!result.success) {
                  alert(result.error ?? "Löschen fehlgeschlagen.");
                  return;
                }
                onDeleted(row.id);
              });
            }}
          >
            {isPending ? "Wird gelöscht…" : "Endgültig löschen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
