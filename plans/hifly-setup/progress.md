# HiFly – Fortschritt & Plan

Stand: 2026-07-05

## Erledigt

- **Next.js-App gescaffoldet**: TypeScript, Tailwind, App Router, `src/`-Struktur (per `create-next-app`, in temp. Verzeichnis erzeugt und ins Projekt kopiert, da `CLAUDE.md`/`supabase_pw` schon vorhanden waren).
- **Startseite** (`src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`): einzelne simple Seite mit großem "HiFly"-Schriftzug, Dark Theme, an Supabase-UI angelehnt (Hintergrund `#121212`, grüner Glow `#3ecf8e`, dezentes Grid). Font: **Inter** (freie Alternative zur lizenzierten Supabase-Font). Geprüft per Dev-Server + Playwright-Screenshot, keine Konsolenfehler.
- **Umgebungsvariablen eingerichtet**:
  - `.env.local` (von Git ignoriert, `.env*` steht in `.gitignore`) mit echten Werten: Supabase-URL, anon key, service role key, `DATABASE_URL` (Passwort stammte aus `supabase_pw`, diese Datei wurde danach gelöscht), AWS-Region `eu-central-1`, Access Key, Secret Key, Bucket-Name `hifly`.
  - `.env.example` als Vorlage ohne echte Werte für andere Entwickler.
- **Verbindungen geprüft und bestätigt funktionsfähig**:
  - Supabase Postgres (`scripts/test-db-connection.mjs` bzw. `npm run check:db`) – Connect + `select now()` erfolgreich (Postgres 17.6).
  - AWS S3 (`scripts/test-s3-connection.mjs` bzw. `npm run check:s3`) – `HeadBucket`/`ListObjectsV2` auf Bucket `hifly` in `eu-central-1` erfolgreich.
  - Dotenv-Werbe-Tip in beiden Skripten stummgeschaltet (`quiet: true`); die AWS-SDK-Warnung zu Node 20 (Support endet Anfang 2027, SDK v3 braucht dann Node ≥22) bleibt bewusst sichtbar als Erinnerung, ist keine Marketing-Meldung.
- **Projekt-Konventionen in `CLAUDE.md` festgehalten**:
  - Alle eigenständigen Skripte (Connection-Checks, Wartungsskripte) liegen in `scripts/`, aufrufbar über `npm run check:*`.
  - Jeder Plan bekommt ein eigenes Verzeichnis unter `plans/<plan-name>/` statt einer losen Datei im Root (dieses Dokument ist das erste Beispiel: `plans/hifly-setup/`).
- **Claude Code CLI repariert**: globales `claude.exe` fehlte nach einem abgebrochenen Auto-Update (nur `claude.exe.old.<timestamp>` vorhanden); alte funktionierende Version zurückkopiert. Empfehlung an den User: danach `claude update` bzw. `npm install -g @anthropic-ai/claude-code@latest` ausführen, um wieder auf den aktuellen Stand zu kommen (Backup-Datei war vom 9. Juni).

## Offene Punkte / nächste Schritte

- Noch nichts von alldem ist committet — `git status` zeigt `CLAUDE.md` als modified und alle Next.js-Scaffold-Dateien, `scripts/`, `plans/` etc. als untracked. Committen, sobald gewünscht.
- Package-Name in `package.json` ist noch `hifly_scaffold` (Reste vom temporären Scaffold-Verzeichnisnamen) – ggf. auf einen sprechenderen Namen ändern.
- Restliche Punkte aus `CLAUDE.md`-Tech-Stack (shadcn/ui, Zustand, TanStack Query, Drizzle ORM, Auth.js, Vercel-Deployment) sind noch nicht eingerichtet – bisher nur Next.js-Grundgerüst, Supabase- und S3-Anbindung.
- Kein Drizzle-Schema/Migration bisher angelegt, obwohl `DATABASE_URL` schon steht.

## Hinweis

Ein ursprünglich in dieser Anfrage erwähnter "Tattoo-Design"-Punkt wurde auf Rückfrage bewusst weggelassen, da er zu keinem Zeitpunkt Teil des HiFly-Projekts war.
