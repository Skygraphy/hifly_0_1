"use client";

import { useActionState } from "react";
import { Mail, KeyRound, ArrowRight } from "lucide-react";
import { signInWithCredentials } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

async function action(_prevState: string | undefined, formData: FormData) {
  return signInWithCredentials(formData);
}

export function CredentialsForm() {
  const [error, formAction, isPending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="flex items-center gap-1.5">
          <Mail className="size-3.5 text-muted-foreground" />
          E-Mail
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-muted-foreground" />
          Passwort
        </Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && (
        <p role="alert" data-testid="login-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? "Anmelden…" : "Anmelden"}
        {!isPending && <ArrowRight className="size-4" />}
      </Button>
    </form>
  );
}
