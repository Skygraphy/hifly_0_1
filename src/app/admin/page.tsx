import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Users, Settings, MapPinned, UploadCloud, ShoppingBag, Truck, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import {
  canAccessAdminArea,
  canManageAdministrativeUnits,
  canManageAppSettings,
  canManageUsers,
  canManageRegions,
  canManageShop,
  canManageOrders,
  canUploadImages,
} from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/components/role-badge";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";

export default async function AdminPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canAccessAdminArea(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const role = session.user.role;

  const sections = [
    canUploadImages(role) && {
      href: "/admin/images/upload",
      icon: UploadCloud,
      title: "Bilder hochladen",
      description: "Neue Fotos hochladen und Standorten zuordnen.",
      testId: "upload",
    },
    canManageAppSettings(role) && {
      href: "/admin/settings",
      icon: Settings,
      title: "App-Einstellungen",
      description: "Globale Einstellungen und Berechtigungen für die gesamte App verwalten.",
      testId: "settings",
    },
    (canManageAdministrativeUnits(role) || canManageRegions(role)) && {
      href: "/admin/administrative-units",
      icon: MapPinned,
      title: "Standorte & Regionen",
      description: "Standorte, Regionen und die Verwaltungsstruktur pflegen.",
      testId: "administrative-units",
    },
    canManageShop(role) && {
      href: "/admin/shop",
      icon: ShoppingBag,
      title: "Shop verwalten",
      description: "Pakete, Drucke und Rabattstufen für den Shop konfigurieren.",
      testId: "shop",
    },
    canManageOrders(role) && {
      href: "/admin/orders",
      icon: Truck,
      title: "Druck-Fulfillment",
      description: "Bestellungen mit physischen Drucken bearbeiten und den Versand verwalten.",
      testId: "orders",
    },
    canManageUsers(role) && {
      href: "/admin/users",
      icon: Users,
      title: "User-Rechte verwalten",
      description: "Rollen und Standort-Freigaben für Nutzer verwalten.",
      testId: "users",
    },
  ].filter((section) => section !== false);

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
        <div className="mt-6">
          <BrandMark />
        </div>
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="size-6 text-primary" />
          Admin-Bereich
        </h1>
        <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          {session.user.email}
          <RoleBadge role={role} />
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link key={section.href} href={section.href} data-testid={`admin-section-${section.testId}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-xl">
                    <span className="flex items-center gap-2">
                      <section.icon className="size-5 text-primary" />
                      {section.title}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
