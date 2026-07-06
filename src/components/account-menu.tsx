"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut, ShieldCheck, Users } from "lucide-react";
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
import { canAccessAdminArea, canManageUsers, type Role } from "@/lib/authorization";
import { signOutAction } from "./account-menu-actions";

export interface AccountMenuUser {
  email?: string | null;
  name?: string | null;
  role: Role;
  image?: string | null;
}

export function AccountMenu({ user }: { user: AccountMenuUser | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
