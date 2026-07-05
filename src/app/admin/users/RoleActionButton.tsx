"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setUserAdminRole } from "./actions";
import type { Role } from "@/lib/authorization";

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
            alert(result.error ?? "Aktion fehlgeschlagen.");
          }
        });
      }}
    >
      {isPending ? "…" : label}
    </Button>
  );
}
