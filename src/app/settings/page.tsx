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
    <main className="relative min-h-screen bg-background">
      <BackLink href="/" label="Zurück zur Startseite" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <BrandMark />
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
