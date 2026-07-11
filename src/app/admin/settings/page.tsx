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
    <main className="relative min-h-screen bg-background">
      <BackLink href="/admin" label="Zurück zum Admin-Bereich" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <BrandMark />
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
        <Card className="w-full max-w-sm">
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
