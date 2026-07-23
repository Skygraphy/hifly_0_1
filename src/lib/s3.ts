import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Einziger Ort mit S3Client-Instanziierung — bisher nur im Wegwerf-Skript
// scripts/test-s3-connection.mjs dupliziert, das dieselben Env-Vars liest.
let client: S3Client | undefined;

function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      // Ab SDK v3.730 hängt der Client standardmäßig (WHEN_SUPPORTED) einen
      // zusätzlichen x-amz-checksum-crc32-Parameter an JEDEN S3-Request an —
      // landet dadurch auch in presigned PUT-URLs, obwohl wir nie
      // ChecksumAlgorithm setzen. Ein normaler XHR.PUT aus dem Browser
      // erfüllt diese zusätzliche Anforderung nicht, der Upload schlägt fehl.
      // WHEN_REQUIRED stellt das alte Verhalten wieder her: Checksums nur,
      // wenn explizit per ChecksumAlgorithm angefordert (kommt hier nie vor).
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }
  return client;
}

function getBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error("AWS_S3_BUCKET_NAME ist nicht gesetzt.");
  return bucket;
}

/** `null` bedeutet: kein Objekt unter diesem Key vorhanden (404). */
export async function headObjectEtag(key: string): Promise<string | null> {
  try {
    const result = await getS3Client().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    // S3 liefert das ETag in Anführungszeichen ("d41d8cd9...") — für den
    // Vergleich mit einem lokal berechneten Hex-MD5 werden die entfernt.
    return result.ETag?.replaceAll('"', "") ?? null;
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "NotFound") {
      return null;
    }
    throw err;
  }
}

/**
 * `contentMd5Base64` wird als ContentMD5-Header in die presigned URL
 * verankert — S3 verifiziert die Integrität beim tatsächlichen PUT serverseitig
 * und lehnt einen Upload mit abweichendem Inhalt ab. Da presigned Direct-
 * Uploads immer Single-Part sind, entspricht das resultierende ETag danach
 * exakt der MD5 (Hex) der hochgeladenen Datei.
 */
export async function createPresignedPutUrl(key: string, contentMd5Base64: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentMD5: contentMd5Base64,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 300 });
}

/** Paginiert automatisch — pro Bild-Ordner sind das ohnehin nur wenige Keys. */
export async function listObjectKeysUnderPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: getBucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const object of result.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Löscht Bucket-Objekte, die lokal nicht mehr existieren (Ordner-Sync, siehe
 * api/images/sync-folder). Ein einzelner DeleteObjectsCommand erlaubt bis zu
 * 1000 Keys — hier pro Ordner immer weit darunter, daher kein Batching nötig.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: getBucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}
