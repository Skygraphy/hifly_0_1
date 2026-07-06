"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut, ShieldCheck, Users, Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleBadge } from "@/components/role-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canAccessAdminArea, canManageUsers, canRunOpsTools, type Role } from "@/lib/authorization";
import { signOutAction } from "./account-menu-actions";
import { runFlowWalkthroughAction } from "./flow-report-actions";
import { buildFlowWalkthroughLoadingPage } from "./flow-walkthrough-loading-page";

export interface AccountMenuUser {
  email?: string | null;
  name?: string | null;
  role: Role;
  image?: string | null;
}

export function AccountMenu({ user }: { user: AccountMenuUser | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isWalkthroughPending, startWalkthroughTransition] = useTransition();

  if (!user) {
    return (
      <Link
        href="/login"
        aria-label="Anmelden"
        data-testid="login-link"
        className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
      >
        <LogIn className="size-4" />
      </Link>
    );
  }

  function beginFlowWalkthrough() {
    if (isWalkthroughPending) return;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert(
        "Das Report-Fenster wurde vom Browser blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen."
      );
      return;
    }
    // Direkt per Blob-URL statt document.write() navigieren: document.write
    // auf ein frisch geöffnetes Popup rendert in manchen Browsern nicht
    // zuverlässig, während die Blob-URL-Navigation (dasselbe Verfahren wie
    // beim späteren Umschalten auf den fertigen Report) nachweislich
    // funktioniert.
    const loadingBlob = new Blob([buildFlowWalkthroughLoadingPage()], { type: "text/html" });
    reportWindow.location.href = URL.createObjectURL(loadingBlob);
    reportWindow.focus();

    startWalkthroughTransition(async () => {
      const result = await runFlowWalkthroughAction();
      if (result.success && result.reportHtml) {
        if (!reportWindow.closed) {
          const blob = new Blob([result.reportHtml], { type: "text/html" });
          reportWindow.location.href = URL.createObjectURL(blob);
        }
      } else {
        reportWindow.close();
        alert(result.error ?? "Walkthrough fehlgeschlagen.");
      }
    });
  }

  const displayName = user.name ?? user.email ?? "Unbekannt";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Konto-Menü öffnen"
        data-testid="account-menu-trigger"
        disabled={isPending}
      >
        <Avatar>
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-1.5 px-2.5 py-2 font-normal text-foreground">
            <span className="truncate text-sm font-medium">{displayName}</span>
            {user.name && (
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            )}
            <RoleBadge role={user.role} />
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {(canAccessAdminArea(user.role) || canManageUsers(user.role)) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {canAccessAdminArea(user.role) && (
                <DropdownMenuItem
                  data-testid="account-menu-admin-link"
                  onClick={() => router.push("/admin")}
                >
                  <ShieldCheck className="size-4" />
                  Admin-Bereich
                </DropdownMenuItem>
              )}
              {canManageUsers(user.role) && (
                <DropdownMenuItem
                  data-testid="account-menu-users-link"
                  onClick={() => router.push("/admin/users")}
                >
                  <Users className="size-4" />
                  User-Rechte verwalten
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        )}

        {canRunOpsTools(user.role) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                data-testid="account-menu-flow-walkthrough"
                disabled={isWalkthroughPending}
                // Die komplette Aktion (Fenster öffnen + Server Action
                // starten) muss in einem einzigen, echten Pointer-/Tastatur-
                // Event laufen. Zwei Gründe: (1) window.open braucht eine
                // synchrone User-Aktivierung, die spätestens beim nächsten
                // Tick verfällt — Base UI ruft onClick teils erst nach der
                // Schließ-Animation auf, dann wird das Fenster lautlos als
                // Popup geblockt. (2) Das geöffnete Fenster entzieht der
                // Seite den Fokus, was Base UI als "Klick außerhalb"
                // interpretiert und das Menü samt onClick-Callback verwirft,
                // bevor er feuert — onPointerDown lief da schon durch.
                onPointerDown={() => beginFlowWalkthrough()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    beginFlowWalkthrough();
                  }
                }}
              >
                <Camera className="size-4" />
                {isWalkthroughPending ? "Walkthrough läuft…" : "Flow-Walkthrough generieren"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid="account-menu-sign-out"
          disabled={isPending}
          onClick={() => startTransition(() => signOutAction())}
        >
          <LogOut className="size-4" />
          {isPending ? "Abmelden…" : "Abmelden"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
