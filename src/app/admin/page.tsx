import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import { auth } from "@/auth";
import { canAccessAdminArea, canManageUsers } from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { cn } from "@/lib/utils";

export default async function AdminPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canAccessAdminArea(session.user.role)) {
    redirect("/?error=forbidden");
  }

  return (
    <main className="relative min-h-screen bg-[#121212]">
      <AccountMenuSlot>
        <AccountMenu user={session.user} />
      </AccountMenuSlot>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <BrandMark />
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="size-6" />
              Admin-Bereich
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{session.user.email}</span>
              <RoleBadge role={session.user.role} />
            </div>

            {canManageUsers(session.user.role) && (
              <Link
                href="/admin/users"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Users className="size-4" />
                User-Rechte verwalten
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
