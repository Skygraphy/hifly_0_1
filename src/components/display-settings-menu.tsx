"use client";

import { useEffect, useState, useTransition } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getGuestSettings, setGuestSetting } from "@/lib/guest-settings";
import { setPersonalSetting, syncGuestSettingsOnLogin } from "@/app/settings/actions";
import {
  applyThemePreference,
  resolveIsDark,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from "@/lib/apply-theme";
import type { AccountMenuUser } from "./account-menu";

const SYNC_MARKER_KEY = "hifly_guest_settings_synced";

function readThemeCookie(): ThemePreference {
  if (typeof document === "undefined") return "dark";
  const match = document.cookie.match(/(?:^|; )theme=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === "light" || value === "dark" || value === "system" ? value : "dark";
}

/**
 * Immer sichtbar, unabhängig vom Login-Status — zeigt nur die
 * gast-fähigen Einstellungen aus PERSONAL_SETTINGS_REGISTRY (aktuell nur
 * Theme). Nicht eingeloggt: localStorage + Cookie direkt clientseitig.
 * Eingeloggt: Server Action (die auch das Cookie mitsetzt).
 */
export function DisplaySettingsMenu({ user }: { user: AccountMenuUser | null }) {
  const [preference, setPreference] = useState<ThemePreference>("dark");
  const [isDark, setIsDark] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Liest bewusst vom Cookie statt von einem Prop: das <html>-Element
    // wurde serverseitig bereits per Cookie korrekt gerendert (verhindert
    // FOUC), hier wird nur der React-State für die Menü-Markierung
    // synchronisiert — ein Sync von einem externen System, kein
    // abgeleiteter State.
    const initial = readThemeCookie();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreference(initial);
    setIsDark(resolveIsDark(initial));
  }, []);

  useEffect(() => {
    // Bei "System" live auf OS-Theme-Wechsel reagieren, solange die Seite
    // offen ist (nicht nur beim nächsten Laden neu auflösen).
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      setIsDark(mql.matches);
      document.documentElement.classList.toggle("dark", mql.matches);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [preference]);

  useEffect(() => {
    // Andere Theme-Controls auf derselben Seite (z.B. das Select auf
    // /settings) sind unabhängige Komponenten — bei deren Änderung diesen
    // Header-Umschalter nachziehen, statt erst beim nächsten Laden.
    function handleExternalChange(event: Event) {
      const value = (event as CustomEvent<string>).detail;
      if (value !== "light" && value !== "dark" && value !== "system") return;
      setPreference(value);
      setIsDark(resolveIsDark(value));
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleExternalChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleExternalChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (window.localStorage.getItem(SYNC_MARKER_KEY)) return;

    const localValues = getGuestSettings();
    if (Object.keys(localValues).length === 0) {
      window.localStorage.setItem(SYNC_MARKER_KEY, "1");
      return;
    }
    startTransition(async () => {
      await syncGuestSettingsOnLogin(localValues);
      window.localStorage.setItem(SYNC_MARKER_KEY, "1");
    });
  }, [user]);

  function handleThemeChange(value: ThemePreference) {
    setPreference(value);
    setIsDark(resolveIsDark(value));
    applyThemePreference(value);

    if (user) {
      startTransition(async () => {
        const result = await setPersonalSetting("theme", value);
        if (!result.success) alert(result.error ?? "Änderung fehlgeschlagen.");
      });
    } else {
      setGuestSetting("theme", value);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Anzeige-Einstellungen öffnen"
        data-testid="display-settings-trigger"
        disabled={isPending}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
      >
        {preference === "system" ? (
          <Monitor className="size-4" />
        ) : isDark ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Anzeige</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem data-testid="display-settings-theme-system" onClick={() => handleThemeChange("system")}>
            <Monitor className="size-4" />
            System
            {preference === "system" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="display-settings-theme-light" onClick={() => handleThemeChange("light")}>
            <Sun className="size-4" />
            Hell
            {preference === "light" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="display-settings-theme-dark" onClick={() => handleThemeChange("dark")}>
            <Moon className="size-4" />
            Dunkel
            {preference === "dark" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
