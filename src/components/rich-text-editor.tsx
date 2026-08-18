"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Schlanker HTML-Rich-Text-Editor (TipTap StarterKit, auf Fett/Kursiv/
 * Listen reduziert — mehr braucht eine kurze Paket-Beschreibung nicht,
 * jedes zusätzliche Toolbar-Element wäre für diesen Anwendungsfall
 * Overhead). onChange liefert direkt editor.getHTML() — der Aufrufer
 * persistiert das Ergebnis unverändert als HTML-String (siehe
 * shopPackages.description in schema.ts).
 *
 * Kein eigenes prose-Plugin (@tailwindcss/typography ist in diesem Projekt
 * nicht installiert) — die paar möglichen Elemente (p/strong/em/ul/ol/li)
 * werden direkt per Tailwind-Arbitrary-Variants auf dem Editor-Container
 * gestylt. Platzhaltertext über die offizielle
 * @tiptap/extension-placeholder (setzt data-placeholder + eine
 * is-editor-empty-Klasse auf den leeren Absatz, hier per
 * ::before-Arbitrary-Variant sichtbar gemacht).
 *
 * immediatelyRender: false ist bei Next.js/SSR Pflicht — TipTap rendert
 * sonst serverseitig einen von der Client-Hydration abweichenden initialen
 * Zustand (offiziell dokumentierte SSR-Warnung ab TipTap v2.5+).
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  testId,
}: {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-24 rounded-b-lg border border-t-0 border-input bg-transparent px-3 py-2 text-sm outline-none",
          "focus:border-ring",
          "[&_p]:my-1 [&_strong]:font-semibold [&_em]:italic",
          "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        ),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label>{label}</Label>}
      <div className="rounded-lg border border-input">
        <div className="flex items-center gap-1 rounded-t-lg border-b border-input bg-muted/40 p-1">
          <Button
            type="button"
            variant={editor?.isActive("bold") ? "secondary" : "ghost"}
            size="icon-xs"
            disabled={!editor}
            aria-label="Fett"
            data-testid={testId ? `${testId}-bold` : undefined}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={editor?.isActive("italic") ? "secondary" : "ghost"}
            size="icon-xs"
            disabled={!editor}
            aria-label="Kursiv"
            data-testid={testId ? `${testId}-italic` : undefined}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={editor?.isActive("bulletList") ? "secondary" : "ghost"}
            size="icon-xs"
            disabled={!editor}
            aria-label="Aufzählung"
            data-testid={testId ? `${testId}-bullet-list` : undefined}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={editor?.isActive("orderedList") ? "secondary" : "ghost"}
            size="icon-xs"
            disabled={!editor}
            aria-label="Nummerierte Liste"
            data-testid={testId ? `${testId}-ordered-list` : undefined}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-3.5" />
          </Button>
        </div>
        <EditorContent editor={editor} data-testid={testId} />
      </div>
    </div>
  );
}
