"use server";

import path from "node:path";
import { auth } from "@/auth";
import { canRunOpsTools } from "@/lib/authorization";
import { runFlowWalkthroughScript } from "@/lib/run-flow-walkthrough-script";

export interface RunFlowWalkthroughResult {
  success: boolean;
  error?: string;
  outputDir?: string;
  reportHtml?: string;
}

/**
 * Führt scripts/generate-flow-screenshots.mjs als Subprozess aus (kein
 * Code-Duplikat zum CLI-Skript) und schreibt das Ergebnis in einen neuen,
 * zeitgestempelten Ordner unter flow-reports/.
 *
 * Wichtige Einschränkung: Das Skript startet einen echten Playwright-
 * Browser im Node-Prozess des Servers. Funktioniert lokal / auf einem
 * klassischen Node-Server, NICHT auf Vercel-Serverless-Functions (kein
 * Chromium ohne Sonderaufwand wie @sparticuz/chromium). Aktuell bewusst
 * als internes, lokal genutztes super_admin-Tool gedacht.
 */
export async function runFlowWalkthroughAction(): Promise<RunFlowWalkthroughResult> {
  const session = await auth();

  // Unabhängig von der Menü-Sichtbarkeit erneut geprüft (defense in depth).
  if (!session?.user || !canRunOpsTools(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf den Flow-Walkthrough auslösen." };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relativeDir = path.join("flow-reports", timestamp);
  const absoluteDir = path.join(process.cwd(), relativeDir);

  try {
    const reportHtml = await runFlowWalkthroughScript(absoluteDir);
    return { success: true, outputDir: relativeDir, reportHtml };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Walkthrough fehlgeschlagen: ${message}` };
  }
}
