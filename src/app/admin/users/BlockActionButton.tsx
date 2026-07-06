"use client";

import { useTransition } from "react";
import { Ban, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setUserBlockedStatus } from "./actions";

export function BlockActionButton({
  userId,
  blocked,
}: {
  userId: string;
  blocked: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const Icon = blocked ? CircleCheck : Ban;
  const label = blocked ? "entsperren" : "blockieren";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await setUserBlockedStatus(userId, !blocked);
          if (!result.success) {
            alert(result.error ?? "Aktion fehlgeschlagen.");
          }
        });
      }}
    >
      {isPending ? "…" : <Icon className="size-3.5" />}
      {isPending ? "" : label}
    </Button>
  );
}
