import { redirect } from "next/navigation";
import Link from "next/link";
import { PlaneTakeoff, ShieldCheck, Users } from "lucide-react";
import { auth } from "@/auth";
import { canAccessAdminArea, canManageUsers } from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

export default async function AdminPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user || !canAccessAdminArea(session.user.role)) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PlaneTakeoff className="size-5" />
            <span className="text-sm font-semibold tracking-tight">HiFly</span>
          </div>
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
    </main>
  );
}
