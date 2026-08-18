"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clearAppAlert, useAppAlertMessage } from "@/lib/app-alert";

/**
 * Globales Ersatz-Popup für window.alert() (siehe app-alert.ts) — einmalig
 * in layout.tsx gemountet, danach von jeder Seite/Komponente per
 * showAppAlert() auslösbar, ohne eigenen Dialog-State.
 */
export function AppAlertDialog() {
  const message = useAppAlertMessage();

  return (
    <AlertDialog open={message !== null} onOpenChange={(open) => !open && clearAppAlert()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hinweis</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction data-testid="app-alert-ok" onClick={clearAppAlert}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
