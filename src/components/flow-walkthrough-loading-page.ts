// Spiegelt die Schrittnamen aus scripts/generate-flow-screenshots.mjs, damit
// die Ladeseite passende Statusmeldungen zeigen kann, während der Report noch
// nicht fertig ist (Server Action liefert erst am Ende Fortschritt, kein
// Streaming) — reine Anzeige, kein echtes Live-Tracking der Skript-Schritte.
export const FLOW_WALKTHROUGH_STEP_MESSAGES = [
  "Browser wird gestartet…",
  "Startseite wird geladen (anonym)…",
  "Login-Formular wird geöffnet…",
  "Login wird durchgeführt…",
  "Account-Menü wird geöffnet…",
  "Admin-Bereich wird aufgerufen…",
  "User-Verwaltung wird geöffnet…",
  "Test-User wird blockiert…",
  "Abmeldung wird durchgeführt…",
];

const MAX_PERCENT_WHILE_WAITING = 92;
const MS_PER_STEP = 1400;

export function buildFlowWalkthroughLoadingPage(): string {
  const stepsJson = JSON.stringify(FLOW_WALKTHROUGH_STEP_MESSAGES);

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Flow-Walkthrough wird generiert…</title>
<style>
  :root {
    --bg: #121212; --surface: #1b1b1b; --border: #2e2e2e;
    --text: #ededed; --text-muted: #9a9a9a; --accent: #ff7f50;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f7f5f3; --surface: #ffffff; --border: #e2ded9;
      --text: #1c1c1c; --text-muted: #6b6b6b; --accent: #d9603f;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); color: var(--text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .card { width: min(420px, 90vw); display: flex; flex-direction: column; gap: 14px; }
  h1 { font-size: 1.1rem; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  .track {
    height: 8px; border-radius: 999px; background: var(--surface);
    border: 1px solid var(--border); overflow: hidden;
  }
  .fill { height: 100%; width: 4%; background: var(--accent); border-radius: 999px; transition: width 0.4s ease; }
  .msg { color: var(--text-muted); font-size: 0.9rem; min-height: 1.3em; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>Flow-Walkthrough wird generiert…</h1>
    <div class="track"><div class="fill" id="fill"></div></div>
    <p class="msg" id="msg">${FLOW_WALKTHROUGH_STEP_MESSAGES[0]}</p>
  </div>
  <script>
    var steps = ${stepsJson};
    var fill = document.getElementById("fill");
    var msg = document.getElementById("msg");
    var i = 1;
    function tick() {
      if (i < steps.length) {
        msg.textContent = steps[i];
        fill.style.width = Math.min(${MAX_PERCENT_WHILE_WAITING}, Math.round((i / (steps.length - 1)) * ${MAX_PERCENT_WHILE_WAITING})) + "%";
        i += 1;
      }
    }
    setInterval(tick, ${MS_PER_STEP});
  </script>
</body>
</html>`;
}
