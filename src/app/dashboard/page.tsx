import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { canAccessAdminArea } from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Dieser Bereich ist nur für eingeloggte User sichtbar.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span>{session.user.email}</span>
            <Badge variant="secondary">{session.user.role}</Badge>
          </div>

          {canAccessAdminArea(session.user.role) && (
            <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
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
              Abmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
