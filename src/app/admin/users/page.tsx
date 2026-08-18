import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, MapPinned } from "lucide-react";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/authorization";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { RoleActionButton } from "./RoleActionButton";
import { BlockActionButton } from "./BlockActionButton";
import { DeleteActionButton } from "./DeleteActionButton";

export default async function AdminUsersPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageUsers(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .orderBy(users.email);

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin" label="Zurück zum Admin-Bereich" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        {/* mt-6 statt pl-12: der Back-Button (absolut, oben links, size-8)
            überlappt sonst das Logo, wenn beide auf derselben Höhe stehen.
            Vertikaler statt horizontaler Abstand hält BrandMark, Überschrift
            und Tabelle alle linksbündig. */}
        <div className="mt-6">
          <BrandMark />
        </div>
        <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "User-Rechte verwalten" }]} className="mt-4" />
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <Users className="size-6 text-primary" />
          User-Rechte verwalten
        </h1>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-Mail</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((user) => {
                const isProtected = user.role === "super_admin" || user.id === session.user.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.name ?? "—"}</TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      {user.isBlocked ? (
                        <Badge variant="destructive">gesperrt</Badge>
                      ) : (
                        <Badge variant="outline">aktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isProtected ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {user.role === "admin" ? (
                            <RoleActionButton userId={user.id} desiredRole="user" label="admin entziehen" />
                          ) : (
                            <RoleActionButton userId={user.id} desiredRole="admin" label="zu admin machen" />
                          )}
                          <BlockActionButton userId={user.id} blocked={user.isBlocked} />
                          {user.role === "admin" && (
                            <Link
                              href={`/admin/users/${user.id}/locations`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              <MapPinned className="size-3.5" />
                              Standorte verwalten
                            </Link>
                          )}
                          <DeleteActionButton userId={user.id} email={user.email} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
}
