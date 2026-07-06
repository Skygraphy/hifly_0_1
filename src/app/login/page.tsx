import { PlaneTakeoff, Globe, Fingerprint, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signInWithProvider } from "./actions";
import { CredentialsForm } from "./CredentialsForm";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  SuperAdminOAuthDisabled:
    "Der super_admin-Account kann sich aus Sicherheitsgründen nur per Passwort anmelden.",
  OAuthAccountNotLinked:
    "Dieser Account ist noch nicht verknüpft. Bitte melde dich zuerst per Passwort an.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? (OAUTH_ERROR_MESSAGES[error] ?? "Anmeldung fehlgeschlagen. Bitte versuche es erneut.")
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PlaneTakeoff className="size-5" />
            <span className="text-sm font-semibold tracking-tight">HiFly</span>
          </div>
          <CardTitle className="text-2xl">Anmelden</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {errorMessage && (
            <p role="alert" data-testid="oauth-error" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <CredentialsForm />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            oder
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            <form action={signInWithProvider.bind(null, "google")}>
              <Button type="submit" variant="outline" className="w-full">
                <Globe className="size-4" />
                Mit Google anmelden
              </Button>
            </form>
            <form action={signInWithProvider.bind(null, "apple")}>
              <Button type="submit" variant="outline" className="w-full">
                <Fingerprint className="size-4" />
                Mit Apple anmelden
              </Button>
            </form>
            <form action={signInWithProvider.bind(null, "paypal")}>
              <Button type="submit" variant="outline" className="w-full">
                <Wallet className="size-4" />
                Mit PayPal anmelden
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
