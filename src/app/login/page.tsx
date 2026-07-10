import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, Fingerprint, Wallet } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { BackLink } from "@/components/back-link";
import { AuthErrorBanner } from "@/components/auth-error-banner";
import { getAuthErrorMessage } from "@/lib/auth-error-messages";
import { signInWithProvider } from "./actions";
import { CredentialsForm } from "./CredentialsForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { error } = await searchParams;
  const errorMessage = getAuthErrorMessage(error);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <BackLink href="/" label="Zurück zur Startseite" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark />
          <CardTitle className="text-2xl">Anmelden</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AuthErrorBanner message={errorMessage} />

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

          <Link
            href="/register"
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Noch kein Konto? Registrieren
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
