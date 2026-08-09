/**
 * "Frosted Glass"-Hintergrund für Badges/Buttons über Fotoinhalten — neutral-
 * dunkel statt einer festen Marken-Farbe (bg-primary/40 wirkte wie ein
 * aufgesetzter Coral-Chip, unabhängig vom jeweiligen Bildausschnitt
 * dahinter). bg-black/30 + backdrop-blur-sm passt sich stattdessen an JEDEN
 * Bildinhalt an: dunkel genug für Kontrast auf hellen Fotostellen, bleibt
 * aber überall visuell gleich. Ursprünglich nur im Preview-Popup
 * (image-preview-popup.tsx) entwickelt, auf Wunsch des Users hierher
 * ausgelagert und auch von der Kachel (image-thumbnail-card.tsx) genutzt,
 * damit beide Stellen denselben Stil nutzen und nicht auseinanderdriften.
 * Icon-/Textfarbe je Aufrufer separat (Coral für interaktive Elemente,
 * destructive-Rot fürs Löschen) — nur die Fläche dahinter ist hier
 * vereinheitlicht.
 */
export const BUTTON_GLASS_CLASS = "border-white/15 bg-black/30 backdrop-blur-sm hover:bg-black/40";

/**
 * Tags und User-Tags werden als EINE Gruppe behandelt (gleicher Akzent für
 * beide). Badge-Text bleibt bewusst text-foreground-nah (nicht volles
 * Coral) — das unterscheidet Tag-Badges klar von den vollständig
 * coralfarbenen Haupt-/Nebenstandort-Badges (BUTTON_GLASS_CLASS +
 * text-primary). Ein wenig Coral kommt über TAG_ACCENT_TEXT_CLASS
 * (color-mix, "etwas" statt "viel" Coral im Text) und den Badge-Rand
 * (border-primary/25 statt neutralem border-white/15) rein.
 */
export const TAG_GLASS_CLASS = "border-primary/25 bg-black/30 backdrop-blur-sm hover:bg-black/40";
export const TAG_ACCENT_TEXT_CLASS = "text-[color-mix(in_oklab,var(--foreground)_65%,var(--primary)_35%)]";
