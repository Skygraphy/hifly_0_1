import { redirect } from "next/navigation";
import { Settings, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { canManageAppSettings } from "@/lib/authorization";
import { getGlobalSettings, getPersonalSettingPermissions } from "@/lib/settings-service";
import { GLOBAL_SETTINGS_REGISTRY, PERSONAL_SETTINGS_REGISTRY } from "@/lib/settings-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { GlobalSettingRow } from "./global-setting-row";
import { PersonalSettingPermissionRow } from "./personal-setting-permission-row";

export default async function AdminSettingsPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageAppSettings(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const values = await getGlobalSettings();
  const permissions = await getPersonalSettingPermissions();

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin" label="Zurück zum Admin-Bereich" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {/* max-w-6xl wie die Kachelansicht (Bilder/Shop) statt der schmalen
            Auth-Karten (max-w-sm) — Label + Beschreibung + Zahlen-Input +
            Speichern-Button nebeneinander (siehe GlobalSettingRow) brauchen
            mehr Platz, sonst quetscht sich der Beschreibungstext bei
            längeren Einstellungen (z.B. den Marker-/Ansichten-Schwellen)
            auf mehrere, kaum lesbare Zeilen zusammen. Oben statt vertikal
            zentriert (auf Wunsch des Users) — anders als bei den schmalen
            Auth-Karten wirkte eine so breite Karte mittig auf dem Bildschirm
            wie ein Layout-Fehler, nicht wie eine bewusste Zentrierung. */}
        <div className="mt-6">
          <BrandMark />
        </div>
        <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "App-Einstellungen" }]} className="mt-4" />
        <Card className="mt-6 w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Settings className="size-6" />
              App-Einstellungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {GLOBAL_SETTINGS_REGISTRY.map((def) => (
              <GlobalSettingRow key={def.key} def={def} initialValue={values[def.key]} />
            ))}
          </CardContent>
        </Card>
        {/* Gleiche Breite wie die App-Einstellungen-Karte oben (auf Wunsch
            des Users) — beide Karten stehen auf derselben Seite direkt
            untereinander, unterschiedliche Breiten wirkten inkonsistent. */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="size-6" />
              Konto-Berechtigungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {PERSONAL_SETTINGS_REGISTRY.map((def) => (
              <PersonalSettingPermissionRow key={def.key} def={def} initialMinRole={permissions[def.key]} />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
