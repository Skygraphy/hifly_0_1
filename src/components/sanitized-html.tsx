import sanitizeHtml from "sanitize-html";

// Allow-Liste am vollen TipTap-StarterKit-Schema ausgerichtet
// (src/components/rich-text-editor.tsx: extensions: [StarterKit,
// Placeholder] ohne Einschränkung) — die Toolbar zeigt nur Fett/Kursiv/
// Listen, aber StarterKit aktiviert per Markdown-Shortcuts ("# ", "> ", …)
// zusätzlich Überschriften/Zitate/Code, die also technisch vorkommen
// können. Nur auf den öffentlichen Shop-Detail-Seiten verwendet — die
// admin-only dangerouslySetInnerHTML-Stellen in shop-catalog-manager.tsx/
// print-catalog-manager.tsx bleiben unverändert (anderer Vertrauensraum,
// nicht öffentlich, daher dort bewusst kein Sanitizer).
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "hr",
];

/**
 * Rendert admin-authored TipTap-HTML (Paket-/Druckformat-Beschreibungen)
 * auf einer ÖFFENTLICHEN Seite — anders als die Admin-Katalogverwaltung
 * (dort ungefiltertes dangerouslySetInnerHTML im Vertrauensraum
 * "super_admin schreibt, super_admin liest") braucht eine öffentliche
 * Seite echte Sanitisierung, bevor der HTML-String an den Client geht.
 * Ausschließlich serverseitig aufgerufen (Server Components) — keine
 * erneute Sanitisierung im Browser nötig.
 */
export function SanitizedHtml({ html, className }: { html: string; className?: string }) {
  const clean = sanitizeHtml(html, { allowedTags: ALLOWED_TAGS, allowedAttributes: {} });
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
