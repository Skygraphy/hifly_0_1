import Link from "next/link";
import { Images } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

/**
 * Ersetzt die normale /images-Ansicht, sobald ein anonymer Besucher die
 * Ansichten-Grenze erreicht hat (siehe anon-view-tracking.ts,
 * recordAnonymousImageView in images/actions.ts, GLOBAL_SETTINGS_REGISTRY:
 * anon_image_view_limit/anon_image_view_window_minutes, geprüft in
 * images/page.tsx). Reine Info-Karte im Stil von /login und /register,
 * kein eigener Zustand — verschwindet von selbst, sobald das Zeitfenster
 * abläuft oder sich der Besucher anmeldet.
 */
export function AnonViewLimitGate() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark />
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Images className="size-6" />
            Weiterschauen mit Konto
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Du hast schon einige Bilder angesehen. Registriere dich kostenlos oder melde dich an, um
            weiterzuschauen.
          </p>
          <Link href="/register" data-testid="anon-view-limit-register" className={cn(buttonVariants())}>
            Registrieren
          </Link>
          <Link
            href="/login"
            data-testid="anon-view-limit-login"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Anmelden
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
