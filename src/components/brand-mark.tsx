import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";

export function BrandMark() {
  return (
    <Link href="/" className="mb-1 flex items-center gap-2 text-primary">
      <PlaneTakeoff className="size-5" />
      <span className="text-sm font-semibold tracking-tight">HiFly</span>
    </Link>
  );
}
