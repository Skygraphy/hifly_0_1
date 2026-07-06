import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Führt scripts/generate-flow-screenshots.mjs als Subprozess aus und liest
 * anschließend die von ihm geschriebene report.html zurück. Eigenes,
 * schmales Modul statt direktem node:child_process-Aufruf in der Server
 * Action — Node-Built-ins lassen sich in Tests schlechter zuverlässig
 * mocken als ein eigenes Modul (util.promisify(execFile) hat z.B. eine
 * eingebaute Custom-Logik, die beim Mocken nicht mitkommt).
 */
export function runFlowWalkthroughScript(outputDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/generate-flow-screenshots.mjs", outputDir],
      { cwd: process.cwd(), timeout: 60_000 },
      (error) => {
        if (error) reject(error);
        else resolve(readFile(path.join(outputDir, "report.html"), "utf-8"));
      }
    );
  });
}
