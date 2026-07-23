import SparkMD5 from "spark-md5";

// 8 MiB — groß genug für wenige Chunks bei typischen .dng-Dateigrößen,
// klein genug, um nicht die gesamte Datei auf einmal in den Speicher zu
// laden (browserseitiges FileReader.readAsArrayBuffer auf der ganzen Datei
// wäre bei sehr großen RAWs unnötig speicherhungrig).
const CHUNK_SIZE = 8 * 1024 * 1024;

/** SubtleCrypto kennt kein MD5 — S3s ETag (Single-Part-PUT) ist aber genau
 * das, daher spark-md5 als einzige Möglichkeit für einen client-seitigen
 * Inhalts-Hash, der 1:1 mit dem Bucket vergleichbar ist. */
export function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface FileMd5Result {
  /** Vergleichbar mit dem von S3 zurückgegebenen (angeführungszeichen-
   * befreiten) ETag eines Single-Part-Objekts. */
  hex: string;
  /** Für den ContentMD5-Header der presigned PUT-URL (siehe src/lib/s3.ts). */
  base64: string;
}

/** Liest die Datei in Chunks (statt auf einmal) und berechnet den MD5
 * inkrementell — Fortschritt optional pro Chunk gemeldet. */
export function computeFileMd5(file: Blob, onProgress?: (fraction: number) => void): Promise<FileMd5Result> {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer();
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    let currentChunk = 0;
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("Datei konnte nicht gelesen werden."));
        return;
      }
      spark.append(result);
      currentChunk += 1;
      onProgress?.(currentChunk / totalChunks);
      if (currentChunk < totalChunks) {
        loadNextChunk();
      } else {
        const hex = spark.end();
        resolve({ hex, base64: hexToBase64(hex) });
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));

    function loadNextChunk() {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    }

    loadNextChunk();
  });
}
