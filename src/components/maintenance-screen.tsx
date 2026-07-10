import { Wrench } from "lucide-react";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu, type AccountMenuUser } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";

/**
 * Ersetzt für alle ohne Admin-Zugriff die komplette Startseite, solange
 * maintenance_mode aktiv ist (siehe src/app/page.tsx) — bewusst dieselbe
 * Gitter-/Glow-Optik wie die normale Startseite, damit der Übergang wie
 * derselbe Ort wirkt und nicht wie eine Fehlerseite. AccountMenuSlot bleibt
 * erhalten, damit ein noch nicht eingeloggter Admin sich hier einloggen und
 * so den Wartungsmodus umgehen kann.
 */
export function MaintenanceScreen({ user }: { user: AccountMenuUser | null }) {
  return (
    <main
      data-testid="maintenance-screen"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4"
    >
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={user} />
          <AccountMenu user={user} />
        </div>
      </AccountMenuSlot>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, currentColor 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, currentColor 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 60% 60% at 50% 50%, black 40%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-primary opacity-[0.15] blur-[140px]"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-8 text-center">
        <h1 className="text-6xl font-semibold tracking-tight text-foreground sm:text-7xl">
          HiFly
        </h1>
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <Wrench className="size-6" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
              Wartungsarbeiten
            </h2>
            <p className="max-w-sm text-sm text-balance text-muted-foreground">
              HiFly ist gerade kurz nicht erreichbar, während wir im Hintergrund an
              Verbesserungen arbeiten. Schau in Kürze wieder vorbei.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
