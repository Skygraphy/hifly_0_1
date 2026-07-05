import { redirect } from "next/navigation";
import Link from "next/link";
import { PlaneTakeoff, CircleUserRound, ShieldCheck, LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import { canAccessAdminArea } from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PlaneTakeoff className="size-5" />
            <span className="text-sm font-semibold tracking-tight">HiFly</span>
          </div>
          <CardTitle className="text-2xl">Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Dieser Bereich ist nur für eingeloggte User sichtbar.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <CircleUserRound className="size-4 text-muted-foreground" />
              {session.user.email}
            </span>
            <RoleBadge role={session.user.role} />
          </div>

          {canAccessAdminArea(session.user.role) && (
            <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
              <ShieldCheck className="size-4" />
              Zum Admin-Bereich
            </Link>
          )}

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" className="w-full">
              <LogOut className="size-4" />
              Abmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
