"use client";

import { useMemo, useRef, useState } from "react";
import { FolderOpen, Pencil, FolderInput, FileText, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";
import { parseImageFolderName, s3KeyFor, type ParsedImageFolder } from "@/lib/image-folder";
import { computeFileMd5 } from "@/lib/client-md5";
import { parseMatchFileImages } from "@/lib/parse-match-file";
import { createImageRecord, prepareImageMatch, applyImageMatchEntry } from "../actions";
import { LocationPickerDialog } from "./location-picker-dialog";

interface MatchWarning {
  id: string;
  message: string;
}

// Vom Client aus den einzelnen applyImageMatchEntry-Aufrufen zusammengesetzt
// (siehe handleRunMatch) — kein direkter Server-Rückgabewert mehr, da der
// Abgleich Zeile für Zeile läuft, um live Fortschritt anzeigen zu können.
interface MatchRunResult {
  success: boolean;
  error?: string;
  updatedCount?: number;
  skippedCount?: number;
  warnings?: MatchWarning[];
  updatedIds?: string[];
}

// showSaveFilePicker (File System Access API) ist in TypeScripts DOM-Lib
// nicht typisiert — nur in Chromium-Browsern verfügbar, daher als optional
// deklariert und vor jedem Aufruf per typeof-Check geprüft (siehe
// handleSaveUpdatedFile).
declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
}

const UPLOAD_CONCURRENCY = 3;

type FolderStatus = "pending" | "hashing" | "uploading" | "syncing" | "saving" | "done" | "error";

interface ParsedFolderEntry {
  folderId: string;
  parsed: ParsedImageFolder | null;
  fileMap: Map<string, File>;
}

interface FolderRuntimeState {
  status: FolderStatus;
  currentFileName: string | null;
  currentFilePercent: number;
  fileResults: Map<string, "unveraendert" | "hochgeladen">;
  deletedFilenames: string[];
  errorMessage: string | null;
  /** Der beim Abschluss TATSÄCHLICH verwendete Standort — eingefroren statt
   * live aus batchStandort/overrides neu berechnet, sonst würde eine
   * spätere Änderung des Batch-Standards die Anzeige einer längst
   * hochgeladenen Zeile rückwirkend verfälschen. */
  committedStandort: StandortRef | null;
}

interface PickedFile {
  file: File;
  relativePath: string;
}

// Ordner-Zugehörigkeit wird IMMER aus den letzten zwei Pfadsegmenten
// abgeleitet (vorletztes = Ordner, letztes = Dateiname) — funktioniert
// unabhängig davon, ob ein einzelner Bild-Ordner direkt ausgewählt/gezogen
// wurde (2 Segmente) oder ein übergeordneter Ordner mit vielen
// Bild-Unterordnern (3+ Segmente, siehe webkitdirectory- und
// Drag&Drop-Pfad unten) — und unabhängig davon, wie viele (auch beliebig
// verstreute) Ordner in einem Rutsch ausgewählt/gezogen wurden.
function groupFilesByFolder(pickedFiles: PickedFile[]): Map<string, Map<string, File>> {
  const groups = new Map<string, Map<string, File>>();
  for (const { file, relativePath } of pickedFiles) {
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const filename = parts[parts.length - 1];
    const folderId = parts[parts.length - 2];
    const folderFiles = groups.get(folderId) ?? new Map<string, File>();
    folderFiles.set(filename, file);
    groups.set(folderId, folderFiles);
  }
  return groups;
}

// webkitRelativePath: nicht in React.InputHTMLAttributes/File typisiert,
// aber von allen relevanten Browsern für webkitdirectory-Eingaben gesetzt
// (Chromium, Firefox, Safari).
function pickedFilesFromFileList(fileList: FileList): PickedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    const all: FileSystemEntry[] = [];
    // readEntries liefert nicht garantiert alles auf einmal — laut Spec in
    // Batches, bis ein leeres Array das Ende markiert.
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
        } else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    }
    readBatch();
  });
}

async function collectPickedFiles(entry: FileSystemEntry, relativePath: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath });
  } else if (entry.isDirectory) {
    const children = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
    await Promise.all(children.map((child) => collectPickedFiles(child, `${relativePath}/${child.name}`, out)));
  }
}

/** Liest beliebig viele, auch nicht benachbarte, per Drag&Drop aus dem
 * Explorer fallengelassene Ordner gleichzeitig ein (Mehrfachauswahl im
 * Explorer + Drag deckt genau den Fall ab, den der native
 * webkitdirectory-Dialog nicht kann: mehrere Ordner in einem Rutsch). */
async function pickedFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(dataTransfer.items);
  const topEntries = items
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);

  const out: PickedFile[] = [];
  await Promise.all(topEntries.map((entry) => collectPickedFiles(entry, entry.name, out)));
  return out;
}

function uploadFileWithProgress(
  url: string,
  file: File,
  contentMd5Base64: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-MD5", contentMd5Base64);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload fehlgeschlagen (Status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
    xhr.send(file);
  });
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    const current = index++;
    if (current >= items.length) return;
    await worker(items[current]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

const STATUS_LABELS: Record<FolderStatus, string> = {
  pending: "Bereit",
  hashing: "Prüfe",
  uploading: "Lädt hoch",
  syncing: "Gleicht ab",
  saving: "Speichert",
  done: "Fertig",
  error: "Fehler",
};

export function ImageUploadManager({
  units,
  regions,
  grantedUnitIds,
  grantedRegionIds,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  grantedUnitIds: string[];
  grantedRegionIds: string[];
}) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const matchFileInputRef = useRef<HTMLInputElement>(null);
  const grantedUnitIdSet = useMemo(() => new Set(grantedUnitIds), [grantedUnitIds]);
  const grantedRegionIdSet = useMemo(() => new Set(grantedRegionIds), [grantedRegionIds]);
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);

  // Bei genau einer Freigabe (Einheit ODER Region) gibt es ohnehin keine
  // andere wählbare Alternative — dann direkt als Batch-Standard vorbelegen,
  // statt den admin zu zwingen, den Picker nur zur Bestätigung zu öffnen.
  // Auch die Grundlage für "Clear" (siehe handleClear): derselbe Ausgangswert
  // wie bei einem frischen Seitenaufruf.
  function defaultBatchStandort(): StandortRef | null {
    if (grantedUnitIds.length === 1 && grantedRegionIds.length === 0) {
      return { type: "unit", id: grantedUnitIds[0] };
    }
    if (grantedRegionIds.length === 1 && grantedUnitIds.length === 0) {
      return { type: "region", id: grantedRegionIds[0] };
    }
    return null;
  }

  const [entries, setEntries] = useState<ParsedFolderEntry[]>([]);
  const [runtime, setRuntime] = useState<Map<string, FolderRuntimeState>>(new Map());
  const [batchStandort, setBatchStandort] = useState<StandortRef | null>(defaultBatchStandort);
  const [overrides, setOverrides] = useState<Map<string, StandortRef>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"batch" | string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [matchFile, setMatchFile] = useState<File | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchRunResult | null>(null);
  // Live-Fortschritt während des Abgleichs (siehe handleRunMatch) — null,
  // solange kein Lauf aktiv ist.
  const [matchProgress, setMatchProgress] = useState<{ total: number; done: number; currentId: string | null } | null>(
    null
  );
  // Nach einem erfolgreichen Abgleich vorbereitet: dieselbe Datei mit
  // do_match: false für jede tatsächlich synchronisierte Zeile — verhindert,
  // dass ein erneuter Lauf mit derselben Datei später in der DB gemachte
  // Änderungen überschreibt (siehe handleRunMatch).
  const [updatedFileDownload, setUpdatedFileDownload] = useState<{ filename: string; content: string } | null>(
    null
  );

  function standortLabel(standort: StandortRef | null): string {
    if (!standort) return "—";
    if (standort.type === "unit") return unitById.get(standort.id)?.name ?? "Unbekannt";
    return regionById.get(standort.id)?.name ?? "Unbekannt";
  }

  function getEffectiveStandort(folderId: string): StandortRef | null {
    return overrides.get(folderId) ?? batchStandort;
  }

  function updateRuntime(folderId: string, patch: Partial<FolderRuntimeState>) {
    setRuntime((prev) => {
      const current = prev.get(folderId);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(folderId, { ...current, ...patch });
      return next;
    });
  }

  // Fügt neu ausgewählte/gezogene Ordner zu den bereits vorhandenen hinzu
  // (statt sie zu ersetzen) — Grundlage dafür, dass sowohl mehrfaches
  // Auswählen über den Dialog als auch ein einzelner Drag&Drop mit mehreren
  // (auch nicht benachbarten) Ordnern funktioniert. Ein erneut eingelesener
  // Ordner (gleiche folderId) ersetzt seinen vorherigen Eintrag samt
  // Laufzeit-Status — praktisch beim Neuziehen eines geänderten Ordners.
  function ingestPickedFiles(pickedFiles: PickedFile[]) {
    const groups = groupFilesByFolder(pickedFiles);
    if (groups.size === 0) return;

    setEntries((prev) => {
      const merged = new Map(prev.map((entry) => [entry.folderId, entry]));
      for (const [folderId, fileMap] of groups) {
        merged.set(folderId, { folderId, parsed: parseImageFolderName(folderId), fileMap });
      }
      return Array.from(merged.values()).sort((a, b) => a.folderId.localeCompare(b.folderId, "de"));
    });

    setRuntime((prev) => {
      const next = new Map(prev);
      for (const folderId of groups.keys()) {
        const parsed = parseImageFolderName(folderId);
        next.set(folderId, {
          status: parsed ? "pending" : "error",
          currentFileName: null,
          currentFilePercent: 0,
          fileResults: new Map(),
          deletedFilenames: [],
          errorMessage: parsed ? null : "Ordnername entspricht nicht dem erwarteten Format.",
          committedStandort: null,
        });
      }
      return next;
    });
  }

  function handleFolderPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    ingestPickedFiles(pickedFilesFromFileList(files));
    event.target.value = "";
  }

  function handleMatchFilePick(event: React.ChangeEvent<HTMLInputElement>) {
    setMatchFile(event.target.files?.[0] ?? null);
    setMatchResult(null);
    setMatchProgress(null);
    setUpdatedFileDownload(null);
    event.target.value = "";
  }

  function handleClearMatchFile() {
    setMatchFile(null);
    setMatchResult(null);
    setMatchProgress(null);
    setUpdatedFileDownload(null);
  }

  async function handleRunMatch() {
    if (!matchFile) return;
    setIsMatching(true);
    setMatchResult(null);
    setMatchProgress(null);
    setUpdatedFileDownload(null);
    try {
      const sourceText = await matchFile.text();
      const entries = parseMatchFileImages(sourceText);
      const prepared = await prepareImageMatch(entries);
      if (!prepared.success || !prepared.plan) {
        setMatchResult({ success: false, error: prepared.error ?? "Abgleich konnte nicht vorbereitet werden." });
        return;
      }

      // Zeile für Zeile statt eines einzigen Bulk-Aufrufs — dadurch kann
      // die UI zwischen den Schreibvorgängen live anzeigen, welcher Ordner
      // gerade dran ist, statt minutenlang ohne Rückmeldung zu warten.
      setMatchProgress({ total: prepared.plan.length, done: 0, currentId: null });
      const warnings: MatchWarning[] = [];
      const updatedIds: string[] = [];

      for (const planEntry of prepared.plan) {
        setMatchProgress((prev) => (prev ? { ...prev, currentId: planEntry.id } : prev));
        try {
          const applyResult = await applyImageMatchEntry(planEntry);
          if (applyResult.success) {
            updatedIds.push(planEntry.id);
            if (planEntry.warning) warnings.push({ id: planEntry.id, message: planEntry.warning });
          } else {
            warnings.push({ id: planEntry.id, message: applyResult.error ?? "Speichern fehlgeschlagen." });
          }
        } catch (err) {
          warnings.push({
            id: planEntry.id,
            message: err instanceof Error ? err.message : "Unbekannter Fehler beim Speichern.",
          });
        }
        setMatchProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }

      setMatchResult({
        success: true,
        updatedCount: updatedIds.length,
        skippedCount: prepared.skippedCount ?? 0,
        warnings,
        updatedIds,
      });

      if (updatedIds.length > 0) {
        const updatedIdSet = new Set(updatedIds);
        const updatedEntries = entries.map((entry) =>
          updatedIdSet.has(entry.id) ? { ...entry, do_match: false } : entry
        );
        const content = `[\n${updatedEntries.map((entry) => `  ${JSON.stringify(entry)}`).join(",\n")}\n]\n`;
        setUpdatedFileDownload({ filename: matchFile.name, content });
      }
    } catch (err) {
      setMatchResult({
        success: false,
        error: err instanceof Error ? err.message : "Unbekannter Fehler beim Abgleich.",
      });
    } finally {
      setMatchProgress(null);
      setIsMatching(false);
    }
  }

  async function handleSaveUpdatedFile() {
    if (!updatedFileDownload) return;

    // Chromium-Browser: echter Save-Dialog, der admin wählt den Speicherort
    // selbst (z.B. direkt über die Originaldatei). Bricht der admin ab,
    // wirft der Picker einen AbortError — kein Fehler, einfach nichts tun.
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: updatedFileDownload.filename,
          types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(updatedFileDownload.content);
        await writable.close();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    // Fallback (Firefox/Safari oder falls der Picker fehlschlägt): normaler
    // Download in den Standard-Downloads-Ordner unter demselben Dateinamen.
    const blob = new Blob([updatedFileDownload.content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = updatedFileDownload.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isUploading) setIsDraggingOver(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    // Bubbelt beim Überqueren von Kind-Elementen (Buttons etc.) — nur
    // zurücksetzen, wenn die Maus die Dropzone tatsächlich verlassen hat.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (isUploading) return;
    const pickedFiles = await pickedFilesFromDataTransfer(event.dataTransfer);
    ingestPickedFiles(pickedFiles);
  }

  async function uploadFolder(entry: ParsedFolderEntry) {
    const standort = getEffectiveStandort(entry.folderId);
    if (!standort || !entry.parsed) return;

    try {
      const filenames = Array.from(entry.fileMap.keys());
      const fileResults = new Map<string, "unveraendert" | "hochgeladen">();

      for (const filename of filenames) {
        const file = entry.fileMap.get(filename);
        if (!file) continue;
        updateRuntime(entry.folderId, {
          status: "hashing",
          currentFileName: filename,
          currentFilePercent: 0,
        });
        const { hex, base64 } = await computeFileMd5(file, (fraction) => {
          updateRuntime(entry.folderId, { currentFilePercent: Math.round(fraction * 100) });
        });

        const key = s3KeyFor(entry.folderId, filename);
        const prepareRes = await fetch("/api/images/prepare-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, contentMd5Base64: base64 }),
        });
        if (!prepareRes.ok) {
          throw new Error(`Vorbereitung für "${filename}" fehlgeschlagen.`);
        }
        const { existingEtag, uploadUrl } = (await prepareRes.json()) as {
          existingEtag: string | null;
          uploadUrl: string;
        };

        if (existingEtag === hex) {
          fileResults.set(filename, "unveraendert");
          updateRuntime(entry.folderId, { currentFilePercent: 100 });
          continue;
        }

        updateRuntime(entry.folderId, { status: "uploading", currentFilePercent: 0 });
        await uploadFileWithProgress(uploadUrl, file, base64, (percent) => {
          updateRuntime(entry.folderId, { currentFilePercent: percent });
        });
        fileResults.set(filename, "hochgeladen");
      }

      updateRuntime(entry.folderId, { status: "syncing", currentFileName: null, currentFilePercent: 100 });
      const syncRes = await fetch("/api/images/sync-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: entry.folderId, localFilenames: filenames }),
      });
      if (!syncRes.ok) {
        throw new Error("Abgleich mit dem Bucket fehlgeschlagen.");
      }
      const { deletedFilenames } = (await syncRes.json()) as { deletedFilenames: string[] };

      updateRuntime(entry.folderId, { status: "saving" });
      const saveResult = await createImageRecord({ id: entry.folderId, standort, ...entry.parsed });
      if (!saveResult.success) {
        throw new Error(saveResult.error ?? "Speichern des Bild-Eintrags fehlgeschlagen.");
      }

      updateRuntime(entry.folderId, {
        status: "done",
        currentFileName: null,
        currentFilePercent: 100,
        fileResults,
        deletedFilenames,
        committedStandort: standort,
      });
    } catch (err) {
      updateRuntime(entry.folderId, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unbekannter Fehler.",
      });
    }
  }

  async function handleStartUpload() {
    const readyEntries = entries.filter(
      (entry) =>
        entry.parsed !== null &&
        getEffectiveStandort(entry.folderId) !== null &&
        runtime.get(entry.folderId)?.status !== "done"
    );
    if (readyEntries.length === 0) return;
    setIsUploading(true);
    await runPool(readyEntries, UPLOAD_CONCURRENCY, uploadFolder);
    setIsUploading(false);
  }

  // Setzt GENAU einen fehlgeschlagenen Ordner wieder auf "bereit" zurück —
  // handleStartUpload nimmt ihn beim nächsten Klick automatisch wieder mit
  // (dessen Filter schließt jeden Status außer "done" bereits ein).
  function handleRetry(folderId: string) {
    updateRuntime(folderId, {
      status: "pending",
      currentFileName: null,
      currentFilePercent: 0,
      errorMessage: null,
    });
  }

  // Setzt die Seite auf denselben Zustand wie ein frischer Aufruf zurück —
  // insbesondere nach einem abgeschlossenen Upload, um Platz für den
  // nächsten Stapel zu machen, ohne die Seite neu laden zu müssen.
  function handleClear() {
    setEntries([]);
    setRuntime(new Map());
    setOverrides(new Map());
    setBatchStandort(defaultBatchStandort());
  }

  const validCount = entries.filter((entry) => entry.parsed !== null).length;
  const locatedCount = entries.filter(
    (entry) => entry.parsed !== null && getEffectiveStandort(entry.folderId) !== null
  ).length;
  const doneCount = Array.from(runtime.values()).filter((state) => state.status === "done").length;
  const errorCount = Array.from(runtime.values()).filter((state) => state.status === "error").length;
  // "Fertig" heißt hier: für jeden gültigen, verorteten Ordner ist der
  // Upload-Lauf durch (done ODER error — ein Fehler blockiert "Upload
  // starten" sonst dauerhaft, auch wenn der admin ihn zunächst so lassen
  // will; erneut versuchen bleibt über denselben Button jederzeit möglich,
  // sobald weitere Ordner hinzukommen oder der Status sich ändert).
  const allUploadsSettled =
    locatedCount > 0 &&
    entries
      .filter((entry) => entry.parsed !== null && getEffectiveStandort(entry.folderId) !== null)
      .every((entry) => {
        const status = runtime.get(entry.folderId)?.status;
        return status === "done" || status === "error";
      });

  const pickerInitialStandort =
    pickerTarget === null ? null : pickerTarget === "batch" ? batchStandort : getEffectiveStandort(pickerTarget);
  const pickerTitle = pickerTarget === "batch" ? "Standort für alle Ordner" : `Standort für "${pickerTarget}"`;

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="folder-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors ${
          isDraggingOver ? "border-primary border-dashed bg-primary/5" : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleFolderPick} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              folderInputRef.current?.setAttribute("webkitdirectory", "");
              folderInputRef.current?.click();
            }}
          >
            <FolderOpen className="size-4" />
            {entries.length > 0 ? "Weitere Ordner hinzufügen" : "Ordner auswählen"}
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderInput className="size-3.5" />
            oder mehrere Ordner per Drag &amp; Drop hierher ziehen
          </span>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Standort für alle Ordner:</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="batch-standort-picker-open"
              onClick={() => setPickerTarget("batch")}
            >
              {standortLabel(batchStandort)}
              <Pencil className="size-3.5" />
            </Button>
          </div>

          {entries.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {entries.length} Ordner erkannt · {validCount} gültig · {locatedCount} mit Standort · {doneCount}{" "}
              hochgeladen
              {errorCount > 0 && ` · ${errorCount} fehlgeschlagen`}
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              data-testid="clear-uploads"
              disabled={isUploading || entries.length === 0}
              onClick={handleClear}
            >
              Zurücksetzen
            </Button>
            {allUploadsSettled ? (
              <span data-testid="upload-settled-summary" className="flex items-center gap-2 text-sm">
                {errorCount > 0 ? (
                  <>
                    <Badge variant="destructive">{errorCount} fehlgeschlagen</Badge>
                    <span className="text-muted-foreground">{doneCount} hochgeladen</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Alle {locatedCount} Ordner hochgeladen</span>
                )}
              </span>
            ) : (
              <Button
                type="button"
                data-testid="start-upload"
                disabled={isUploading || locatedCount === 0}
                onClick={handleStartUpload}
              >
                {isUploading ? "Wird hochgeladen…" : "Upload starten"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordner</TableHead>
                <TableHead>Standort</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fortschritt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const state = runtime.get(entry.folderId);
                // Eine fertige Zeile zeigt den eingefrorenen, tatsächlich
                // verwendeten Standort — nicht mehr live neu berechnet,
                // sonst würde ein späterer Wechsel des Batch-Standards die
                // Anzeige rückwirkend verfälschen (siehe committedStandort).
                const standort =
                  state?.status === "done" ? state.committedStandort : getEffectiveStandort(entry.folderId);
                const uploadedCount = Array.from(state?.fileResults.values() ?? []).filter(
                  (result) => result === "hochgeladen"
                ).length;
                const unchangedCount = Array.from(state?.fileResults.values() ?? []).filter(
                  (result) => result === "unveraendert"
                ).length;

                return (
                  <TableRow key={entry.folderId}>
                    <TableCell className="max-w-64">
                      <div className="truncate font-mono text-xs" title={entry.folderId}>
                        {entry.folderId}
                      </div>
                      {entry.parsed && (
                        <div className="text-xs text-muted-foreground">
                          {entry.parsed.address} · {entry.parsed.captureDate} ·{" "}
                          {String(entry.parsed.sequenceNumber).padStart(3, "0")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* -ml-2.5 gleicht das eigene px-2.5 des Buttons aus
                          (size="sm"), damit der Text bündig unter der
                          "Standort"-Kopfzeile beginnt statt eingerückt. */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2.5"
                        data-testid={`folder-standort-picker-open-${entry.folderId}`}
                        disabled={isUploading || !entry.parsed || state?.status === "done"}
                        onClick={() => setPickerTarget(entry.folderId)}
                      >
                        {standortLabel(standort)}
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      {/* Kein -ml-Ausgleich hier (anders als beim
                          Standort-Button) — sonst säße dieser Badge weiter
                          links als die unkompensierten Fortschritt-Badges
                          rechts daneben. Dieselbe Einfärbung wie die
                          Fortschritt-Badges (unverändert/hochgeladen =
                          secondary, gelöscht = destructive) — für jeden
                          Status, nicht nur "Fertig". */}
                      <Badge variant={state?.status === "error" ? "destructive" : "secondary"}>
                        {state ? STATUS_LABELS[state.status] : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-56">
                      {state?.status === "error" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-destructive">{state.errorMessage}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`retry-${entry.folderId}`}
                            onClick={() => handleRetry(entry.folderId)}
                          >
                            Erneut versuchen
                          </Button>
                        </div>
                      )}
                      {state && ["hashing", "uploading", "syncing", "saving"].includes(state.status) && (
                        <div className="flex flex-col gap-1">
                          {state.currentFileName && (
                            <span className="truncate text-xs text-muted-foreground">
                              {state.currentFileName} · {state.currentFilePercent}%
                            </span>
                          )}
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${state.currentFilePercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {state?.status === "done" && (
                        <div className="flex flex-wrap gap-1">
                          {unchangedCount > 0 && <Badge variant="secondary">{unchangedCount} unverändert</Badge>}
                          {uploadedCount > 0 && <Badge variant="secondary">{uploadedCount} hochgeladen</Badge>}
                          {state.deletedFilenames.length > 0 && (
                            <Badge variant="destructive">{state.deletedFilenames.length} gelöscht</Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={matchFileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleMatchFilePick}
          />
          <Button type="button" variant="outline" onClick={() => matchFileInputRef.current?.click()}>
            <FileText className="size-4" />
            Datei auswählen
          </Button>
          {matchFile && (
            <span className="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-sm">
              {matchFile.name}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Datei entfernen"
                data-testid="match-file-clear"
                onClick={handleClearMatchFile}
              >
                <X className="size-3.5" />
              </Button>
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              data-testid="clear-match"
              disabled={isMatching || (!matchFile && !matchResult)}
              onClick={handleClearMatchFile}
            >
              Zurücksetzen
            </Button>
            <Button
              type="button"
              data-testid="run-match"
              disabled={!matchFile || isMatching}
              onClick={handleRunMatch}
            >
              {isMatching ? "Läuft…" : "Abgleich durchführen"}
            </Button>
          </div>
        </div>

        {matchProgress && (
          <div data-testid="match-progress" className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              <span className="text-muted-foreground">
                Gleiche ab… {matchProgress.done} / {matchProgress.total}
                {matchProgress.currentId && (
                  <>
                    {" "}
                    · <span className="font-mono text-xs">{matchProgress.currentId}</span>
                  </>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${matchProgress.total > 0 ? Math.round((matchProgress.done / matchProgress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {matchResult && (
          <div data-testid="match-result" className="flex flex-col gap-2 text-sm">
            {matchResult.success ? (
              <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                {matchResult.updatedCount ?? 0} aktualisiert · {matchResult.skippedCount ?? 0} noch nicht
                hochgeladen (übersprungen)
                {updatedFileDownload && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="save-updated-match-file"
                    onClick={handleSaveUpdatedFile}
                  >
                    <Download className="size-3.5" />
                    Aktualisierte Datei speichern
                  </Button>
                )}
              </span>
            ) : (
              <span className="text-destructive">{matchResult.error}</span>
            )}
            {matchResult.warnings && matchResult.warnings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {matchResult.warnings.map((warning) => (
                  <li key={warning.id} className="flex items-start gap-2">
                    <Badge variant="destructive" className="shrink-0">
                      {warning.id}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{warning.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <LocationPickerDialog
        open={pickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPickerTarget(null);
        }}
        title={pickerTitle}
        units={units}
        regions={regions}
        grantedUnitIds={grantedUnitIdSet}
        grantedRegionIds={grantedRegionIdSet}
        initialStandort={pickerInitialStandort}
        onPick={(standort) => {
          if (pickerTarget === "batch") {
            setBatchStandort(standort);
          } else if (pickerTarget !== null) {
            const folderId = pickerTarget;
            setOverrides((prev) => new Map(prev).set(folderId, standort));
          }
        }}
      />
    </div>
  );
}
