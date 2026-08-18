import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { CheckoutSuccessClient } from "./checkout-success-client";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { order } = await searchParams;
  if (!order) {
    redirect("/");
  }

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/orders" label="Zurück zu Meine Bestellungen" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav />
        </div>
        <Breadcrumb
          items={[{ label: "Start", href: "/" }, { label: "Meine Bestellungen", href: "/orders" }, { label: "Bestellung" }]}
          className="mt-4"
        />
      </div>
      <div className="flex min-h-[calc(100vh-11rem)] items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Bestellung</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckoutSuccessClient orderId={order} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
