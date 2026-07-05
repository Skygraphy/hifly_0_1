# Auth & rollenbasierte Autorisierung – Fortschritt

Stand: 2026-07-05 (Umsetzung des Plans aus `C:\Users\ernst\.claude\plans\die-app-verf-gt-ber-fancy-turing.md`)

## Erledigt

- **Dependencies**: `next-auth@beta` (Auth.js v5), `@auth/drizzle-adapter`, `drizzle-orm`, `drizzle-kit`, `bcryptjs`, `jose`.
- **shadcn/ui** eingerichtet (`components.json`, base-ui-Preset statt Radix); Komponenten `button`, `input`, `card`, `table`, `badge`, `label`. Der `form`-Registry-Eintrag (React-Hook-Form-Wrapper) ließ sich in dieser CLI-Version nicht sauber hinzufügen und wurde bewusst weggelassen — Login/Rollen-Formulare laufen über native Server Actions, kein React-Hook-Form nötig.
- **Drizzle-Schema** (`src/db/schema.ts`): `users` (inkl. `role`-Enum `user`/`admin`/`super_admin`, `password_hash`), `accounts`, `sessions`, `verificationTokens` (Auth.js-Adapter-Schema). **Partial Unique Index** `users_one_super_admin_idx` erzwingt auf DB-Ebene, dass nie mehr als ein `super_admin` existieren kann — per Test verifiziert (direkter INSERT-Versuch eines zweiten super_admin schlägt mit `23505` fehl).
- **Migration** generiert und gegen die Supabase-Postgres-DB angewendet (`npm run db:generate` / `npm run db:migrate`).
- **Auth.js-Setup**: Split in `src/auth.config.ts` (edge-sicher, für die Middleware) und `src/auth.ts` (Node-Runtime, mit Drizzle-Adapter). Provider: Google, Apple (Client-Secret wird über `scripts/generate-apple-client-secret.mjs` als signiertes JWT erzeugt, nicht zur Laufzeit), PayPal (custom OIDC-Provider, `src/lib/auth-providers/paypal.ts` — Endpunkte sind Best-Effort, noch nicht gegen echte PayPal-Credentials verifiziert), Credentials (E-Mail/Passwort, bcrypt).
- **Rollen-Logik** zentral in `src/lib/authorization.ts` (`canAccessAdminArea`, `canManageUsers`, `canChangeRole`) — von Middleware UND Server Action genutzt, damit beide Ebenen nie auseinanderlaufen.
- **Seed-Skript** `scripts/seed-super-admin.mjs` (`npm run db:seed:super-admin`): legt den einen super_admin anhand `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` an, idempotent, bricht kontrolliert ab, wenn bereits ein anderer super_admin existiert. Ausgeführt — super_admin ist `ernst.schiener@skygraphy.com`, Passwort wurde generiert und in `.env.local` hinterlegt.
- **UI**: `/login` (Credentials-Formular + Google/Apple/PayPal-Buttons), `/dashboard` (Beispiel „nur für eingeloggte User"), `/admin` (admin+super_admin), `/admin/users` (nur super_admin, Tabelle mit Grant/Revoke-Aktion).
- **Tests**: 22 Vitest-Unit-Tests (Rollen-Logik + Server-Action-Guards, inkl. Mocking) und 8 Playwright-E2E-Tests (Login-Flow, Rollen-Gating, Grant/Revoke) — alle grün. `npx tsc --noEmit` und `npx eslint` sauber.

## Aufgetretene Bugs & Fixes unterwegs

- **TS-Fehler bei JWT-Typerweiterung**: `declare module "next-auth/jwt"` griff nicht, da `next-auth/jwt` das `JWT`-Interface nur re-exportiert (`export * from "@auth/core/jwt"`). Fix: Augmentation direkt gegen `@auth/core/jwt` deklariert (`src/types/next-auth.d.ts`).
- **Apple-Provider-Design korrigiert**: Auth.js' eingebauter Apple-Provider erwartet einen fertigen `clientSecret`-String, keinen Runtime-Callback. Der JWT-Signer wurde von einer geplanten Laufzeit-Funktion zu einem eigenständigen Skript (`scripts/generate-apple-client-secret.mjs`) umgebaut, das `AUTH_APPLE_SECRET` einmalig (alle ~175 Tage) erzeugt — entspricht dem offiziell dokumentierten Auth.js-Muster (`npx auth add apple`).
- **Middleware sah `session.user.role` nicht**: Die Middleware nutzt eine eigene, edge-sichere `NextAuth`-Instanz aus `auth.config.ts`. Der `session`-Callback (der `role`/`id` vom JWT auf die Session projiziert) war nur in `auth.ts` definiert, nicht in der geteilten `authConfig` — dadurch war `auth.user.role` in der Middleware immer `undefined`, obwohl das JWT selbst korrekt war. Fix: `session`-Callback nach `auth.config.ts` verschoben, von `auth.ts` nur noch gespreadet.
- **E2E-Tests waren scheinbar flaky, tatsächlich ein fester Bug**: `page.getByRole("alert")` matchte ein verstecktes, immer im DOM vorhandenes Accessibility-Announcer-Element aus `@base-ui/react` (sichtbar, aber leerer Text) statt unserer eigenen Fehlermeldung. Der Login-Test-Helper (`e2e/fixtures/login.ts`) nutzte genau dieses Race (`Promise.race` zwischen Redirect zu `/dashboard` und Alert-Sichtbarkeit) und löste dadurch sofort fälschlich auf, bevor der echte Login/Redirect abgeschlossen war — nachfolgende `page.goto()`-Aufrufe in Tests liefen dann unauthentifiziert los. Fix: eigener `data-testid="login-error"` auf der echten Fehlermeldung (`CredentialsForm.tsx`), Helper und Assertions darauf umgestellt. Nebenbei `playwright.config.ts` auf `fullyParallel: false` / `workers: 1` gestellt, da die Specs echte Fixture-User gegen einen einzigen geteilten Dev-Server/Postgres-Pool schreiben (kein per-Test-isoliertes Backend) — spart zusätzliche Nebenläufigkeits-Fragilität, auch wenn der Kernbug ein anderer war.
- **`CLAUDE.md` wurde vom `shadcn init` NICHT überschrieben** (anders als beim ursprünglichen `create-next-app`-Lauf) — diesmal nur `layout.tsx`/`globals.css` angepasst, per Screenshot verifiziert, dass die HiFly-Startseite optisch unverändert blieb.

## Offene Punkte (aus dem Plan übernommen, weiterhin gültig)

1. **PayPal-OIDC-Endpunkte** sind Best-Effort, nicht live verifiziert — vor Produktivbetrieb gegen PayPals Discovery-Dokument prüfen.
2. **Google/Apple/PayPal-Login** ist korrekt verdrahtet, aber ungetestet ohne echte, vom User bereitzustellende Client-IDs/Secrets (`AUTH_GOOGLE_*`, `AUTH_APPLE_*`, `AUTH_PAYPAL_*` in `.env.local` aktuell leer).
3. **Apple-Client-Secret** muss einmalig über `node scripts/generate-apple-client-secret.mjs` erzeugt und als `AUTH_APPLE_SECRET` eingetragen werden (braucht Team-ID/Key-ID/`.p8`-Key von Apple), danach alle ~175 Tage erneuern.
4. **JWT-Session-Staleness**: Eine Rollenänderung (Grant/Revoke) wirkt erst beim nächsten Sign-in/Token-Refresh des betroffenen Users, nicht sofort mid-session — akzeptierter MVP-Tradeoff.
5. Kein Passwort-Reset/E-Mail-Verifizierung (nicht angefordert).
6. Restliche Tech-Stack-Punkte aus `CLAUDE.md` (Zustand, TanStack Query, Vercel-Deployment) weiterhin nicht eingerichtet — bisher nicht Teil dieser Aufgabe.
7. Noch nichts von alldem ist committet.
