import { Crown, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/authorization";

const ROLE_CONFIG: Record<Role, { label: string; icon: typeof User; variant: "default" | "secondary" | "outline" }> = {
  super_admin: { label: "super_admin", icon: Crown, variant: "default" },
  admin: { label: "admin", icon: ShieldCheck, variant: "secondary" },
  user: { label: "user", icon: User, variant: "outline" },
};

export function RoleBadge({ role }: { role: Role }) {
  const { label, icon: Icon, variant } = ROLE_CONFIG[role];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
