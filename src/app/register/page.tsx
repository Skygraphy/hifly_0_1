import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { BackLink } from "@/components/back-link";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <BackLink href="/" label="Zurück zur Startseite" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark />
          <CardTitle className="text-2xl">Registrieren</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <RegisterForm />

          <Link
            href="/login"
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Schon registriert? Anmelden
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
