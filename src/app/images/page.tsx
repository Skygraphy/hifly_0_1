import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackLink } from "@/components/back-link";
import { LastAdministrativeUnitName } from "@/components/last-administrative-unit-name";
import { getStandortPickerData } from "@/lib/standort-picker-data";

export default async function ImagesPage() {
  const session = await auth();

  const { units, regions, initialStandort } = await getStandortPickerData(
    session?.user?.id,
    session?.user?.role
  );

  // Eingeloggte User: der Server kennt den gespeicherten Standort bereits
  // deterministisch (inkl. dem Fall, dass die einst gewählte Einheit/Region
  // zwischenzeitlich gelöscht wurde) — ohne gültige Auswahl wird die Seite
  // gar nicht erst gerendert. Für anonyme Besucher übernimmt das
  // localStorage-Recovery in LastAdministrativeUnitName denselben Guard
  // clientseitig, da der Server deren Auswahl nicht kennt.
  const standortValid =
    initialStandort?.type === "unit"
      ? units.some((unit) => unit.id === initialStandort.id)
      : initialStandort?.type === "region"
        ? regions.some((region) => region.id === initialStandort.id)
        : false;

  if (session?.user && !standortValid) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <BackLink href="/" label="Zurück zur Startseite" />
      <LastAdministrativeUnitName units={units} regions={regions} initialStandort={initialStandort} />
    </main>
  );
}
