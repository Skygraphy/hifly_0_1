"use client";

import { useTransition } from "react";
import { ShieldCheck, ShieldMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setUserAdminRole } from "./actions";
import type { Role } from "@/lib/authorization";
import { showAppAlert } from "@/lib/app-alert";

export function RoleActionButton({
  userId,
  desiredRole,
  label,
}: {
  userId: string;
  desiredRole: Role;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const Icon = desiredRole === "admin" ? ShieldCheck : ShieldMinus;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await setUserAdminRole(userId, desiredRole);
          if (!result.success) {
            showAppAlert(result.error ?? "Aktion fehlgeschlagen.");
          }
        });
      }}
    >
      {isPending ? "…" : <Icon className="size-3.5" />}
      {isPending ? "" : label}
    </Button>
  );
}
