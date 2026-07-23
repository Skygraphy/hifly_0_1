import { redirect } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { auth } from "@/auth";
import { canUploadImages } from "@/lib/authorization";
import { getImageUploadLocationData } from "@/lib/image-upload-data";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { ImageUploadManager } from "./image-upload-manager";

export default async function ImageUploadPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canUploadImages(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const data = await getImageUploadLocationData(session.user.id, session.user.role);

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
            überlappt sonst das Logo, wenn beide auf derselben Höhe stehen. */}
        <div className="mt-6">
          <BrandMark />
        </div>
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <UploadCloud className="size-6 text-primary" />
          Bilder hochladen
        </h1>
        <ImageUploadManager
          units={data.units}
          regions={data.regions}
          grantedUnitIds={data.grantedUnitIds}
          grantedRegionIds={data.grantedRegionIds}
        />
      </div>
    </main>
  );
}
