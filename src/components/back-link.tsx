import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackLink({ href, label = "Zurück" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-testid="back-link"
      className={cn(buttonVariants({ variant: "outline", size: "icon" }), "absolute left-4 top-4 z-20")}
    >
      <ArrowLeft className="size-4" />
    </Link>
  );
}
