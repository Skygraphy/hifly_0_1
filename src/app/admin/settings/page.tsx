import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { canManageAppSettings } from "@/lib/authorization";
import { getGlobalSettings } from "@/lib/settings-service";
import { GLOBAL_SETTINGS_REGISTRY } from "@/lib/settings-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { GlobalSettingRow } from "./global-setting-row";

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

  return (
    <main className="relative min-h-screen bg-background">
      <BackLink href="/admin" label="Zurück zum Admin-Bereich" />
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
              App-Einstellungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {GLOBAL_SETTINGS_REGISTRY.map((def) => (
              <GlobalSettingRow key={def.key} def={def} initialValue={values[def.key]} />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
