import Link from "next/link";
import { Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BrandMark />
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Compass className="size-6" />
            Seite nicht gefunden
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Diese Seite gibt es nicht oder nicht mehr.
          </p>
          <Link href="/" className={cn(buttonVariants({ variant: "default" }))}>
            Zur Startseite
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
