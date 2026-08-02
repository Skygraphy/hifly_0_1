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
import { deleteImages } from "@/app/images/actions";

/**
 * Nach dem Muster von ImageDeleteDialog, aber für eine ganze Auswahl —
 * `deleteImages` prüft serverseitig pro Bild erneut die Owner-Berechtigung
 * (siehe actions.ts), `skippedIds` kann daher auch bei clientseitig bereits
 * gefilterter Auswahl theoretisch nicht leer sein (defensiv, nicht der
 * Regelfall).
 */
export function BulkDeleteDialog({
  ids,
  onOpenChange,
  onDeleted,
}: {
  ids: string[];
  onOpenChange: (open: boolean) => void;
  onDeleted: (deletedIds: string[]) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={ids.length > 0} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ids.length} Bild(er) wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Die ausgewählten Bilder werden unwiderruflich gelöscht, inklusive aller zugehörigen Dateien
            (Original, Vorschauen, Thumbnail). Das kann nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="images-bulk-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteImages(ids);
                if (result.skippedIds.length > 0) {
                  alert(
                    `${result.deletedIds.length} Bild(er) gelöscht, ${result.skippedIds.length} übersprungen (nicht dein Bild).`
                  );
                }
                onDeleted(result.deletedIds);
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
