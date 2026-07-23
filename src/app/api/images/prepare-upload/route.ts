import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUploadImages } from "@/lib/authorization";
import { headObjectEtag, createPresignedPutUrl } from "@/lib/s3";

/**
 * Route Handler statt Server Action: der client-seitige Upload-Loop in
 * /admin/images/upload braucht eine gewöhnliche JSON-Antwort pro Datei,
 * viele davon in kurzer Folge — kein Formular-Submit-Kontext, für den
 * Server Actions gedacht sind. Schleust selbst keine Datei-Bytes durch
 * (Vercel-Body-Limits) — die eigentlichen Bytes gehen per XHR.PUT direkt
 * Browser → S3 über die hier zurückgegebene presigned URL.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUploadImages(session.user.role)) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || typeof body.contentMd5Base64 !== "string") {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const [existingEtag, uploadUrl] = await Promise.all([
    headObjectEtag(body.key),
    createPresignedPutUrl(body.key, body.contentMd5Base64),
  ]);

  return NextResponse.json({ existingEtag, uploadUrl });
}
