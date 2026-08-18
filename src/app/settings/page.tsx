import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { getPersonalSettings, getPersonalSettingPermissions } from "@/lib/settings-service";
import { PERSONAL_SETTINGS_REGISTRY } from "@/lib/settings-registry";
import { hasMinRole } from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { PersonalSettingRow } from "./personal-setting-row";

export default async function SettingsPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }

  const values = await getPersonalSettings(session.user.id, session.user.role);
  const permissions = await getPersonalSettingPermissions();
  const visibleDefs = PERSONAL_SETTINGS_REGISTRY.filter(
    (def) => !def.hidden && hasMinRole(session.user.role, permissions[def.key] ?? def.minRoleToView)
  );

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/" label="Zurück zur Startseite" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        {/* max-w-6xl wie die Kachelansicht statt der schmalen Auth-Karten —
            Label + Beschreibung + Kontrolle nebeneinander (siehe
            PersonalSettingRow) braucht mehr Platz, sonst quetscht sich die
            Beschreibung bei längeren Einstellungen auf mehrere Zeilen
            zusammen (gleiche Begründung wie /admin/settings). Oben statt
            vertikal zentriert (auf Wunsch des Users) — anders als bei den
            schmalen Auth-Karten wirkte eine so breite Karte mittig auf dem
            Bildschirm wie ein Layout-Fehler, nicht wie eine bewusste
            Zentrierung. */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav />
        </div>
        <Breadcrumb items={[{ label: "Start", href: "/" }, { label: "Konto-Einstellungen" }]} className="mt-4" />
        <Card className="mt-6 w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Settings className="size-6" />
              Konto-Einstellungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visibleDefs.map((def) => (
              <PersonalSettingRow key={def.key} def={def} initialValue={values[def.key]} />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
