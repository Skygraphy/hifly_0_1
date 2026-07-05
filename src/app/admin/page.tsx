import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canAccessAdminArea, canManageUsers } from "@/lib/authorization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
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
          <CardTitle className="text-2xl">Admin-Bereich</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Angemeldet als {session.user.email} ({session.user.role}).
          </p>

          {canManageUsers(session.user.role) && (
            <Link
              href="/admin/users"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              User-Rechte verwalten
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
