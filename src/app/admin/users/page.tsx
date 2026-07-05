import { redirect } from "next/navigation";
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
import { RoleActionButton } from "./RoleActionButton";

export default async function AdminUsersPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user || !canManageUsers(session.user.role)) {
    redirect("/dashboard");
  }

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .orderBy(users.email);

  return (
    <main className="min-h-screen bg-[#121212] p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold">User-Rechte verwalten</h1>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-Mail</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "super_admin" ? "default" : "secondary"}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {user.role === "super_admin" || user.id === session.user.id ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : user.role === "admin" ? (
                    <RoleActionButton userId={user.id} desiredRole="user" label="admin entziehen" />
                  ) : (
                    <RoleActionButton userId={user.id} desiredRole="admin" label="zu admin machen" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
