import { auth } from "@/auth";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { AuthErrorBanner } from "@/components/auth-error-banner";
import { MaintenanceScreen } from "@/components/maintenance-screen";
import { getAuthErrorMessage } from "@/lib/auth-error-messages";
import { getGlobalSettings } from "@/lib/settings-service";
import { canAccessAdminArea } from "@/lib/authorization";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const { error } = await searchParams;
  const errorMessage = getAuthErrorMessage(error);
  // Beweist, dass App-Settings (Tier "App") wirklich sitezweit wirken: auch
  // ein abgemeldeter Besucher sieht den Wartungshinweis, sobald der
  // super_admin ihn unter /admin/settings aktiviert (kein Auth-Check beim
  // Lesen, siehe getGlobalSettings).
  const { maintenance_mode: maintenanceMode } = await getGlobalSettings();

  // Admins/super_admins behalten vollen Zugriff samt kleinem Reminder-Banner
  // unten, damit sie den Modus wieder abschalten können, ohne sich selbst
  // auszusperren — alle anderen (auch abgemeldete Besucher) sehen statt der
  // Startseite den vollen Wartungsbildschirm.
  if (Boolean(maintenanceMode) && !canAccessAdminArea(session?.user?.role)) {
    return <MaintenanceScreen user={session?.user ?? null} />;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session?.user ?? null} />
          <AccountMenu user={session?.user ?? null} />
        </div>
      </AccountMenuSlot>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, currentColor 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, currentColor 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-[#FF7F50] opacity-[0.15] blur-[140px]"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-4">
        {Boolean(maintenanceMode) && (
          <div
            data-testid="maintenance-banner"
            className="absolute bottom-full mb-6 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-sm text-amber-300"
          >
            Wartungsmodus aktiv — einige Funktionen können eingeschränkt sein.
          </div>
        )}
        <h1 className="text-7xl font-semibold tracking-tight text-foreground sm:text-8xl md:text-9xl">
          HiFly
        </h1>
        {errorMessage && (
          <div className="absolute top-full mt-6">
            <AuthErrorBanner message={errorMessage} />
          </div>
        )}
      </div>
    </main>
  );
}
