"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteUser } from "./actions";
import { showAppAlert } from "@/lib/app-alert";

export function DeleteActionButton({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        data-testid={`delete-user-${userId}`}
        disabled={isPending}
        className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
      >
        <Trash2 className="size-3.5" />
        löschen
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Account wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            {email} wird unwiderruflich gelöscht, inklusive aller zugehörigen Daten (Logins,
            Einstellungen). Das kann nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="confirm-delete-user"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteUser(userId);
                if (!result.success) {
                  showAppAlert(result.error ?? "Löschen fehlgeschlagen.");
                }
                setOpen(false);
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
