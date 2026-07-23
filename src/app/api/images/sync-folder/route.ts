import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUploadImages } from "@/lib/authorization";
import { listObjectKeysUnderPrefix, deleteObjects } from "@/lib/s3";
import { s3KeyFor } from "@/lib/image-folder";

/**
 * Letzter Schritt pro Ordner-Upload: der lokale Ordner ist die alleinige
 * Wahrheit, daher immer ein Voll-Abgleich statt nur additivem Upload —
 * Bucket-Objekte unter {folderId}/, die keiner der übergebenen lokalen
 * Dateien entsprechen, werden gelöscht. Wird erst aufgerufen, NACHDEM alle
 * lokalen Dateien bestätigt hochgeladen/unverändert sind.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUploadImages(session.user.role)) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.folderId !== "string" ||
    !Array.isArray(body.localFilenames) ||
    !body.localFilenames.every((name: unknown) => typeof name === "string")
  ) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const folderId: string = body.folderId;
  const localFilenames: string[] = body.localFilenames;

  const existingKeys = await listObjectKeysUnderPrefix(`${folderId}/`);
  const localKeys = new Set(localFilenames.map((filename) => s3KeyFor(folderId, filename)));
  const keysToDelete = existingKeys.filter((key) => !localKeys.has(key));

  await deleteObjects(keysToDelete);

  const deletedFilenames = keysToDelete.map((key) => key.slice(folderId.length + 1));
  return NextResponse.json({ deletedFilenames });
}
