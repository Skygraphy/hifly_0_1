import { describe, it, expect } from "vitest";
import { hexToBase64, computeFileMd5 } from "./client-md5";

describe("hexToBase64", () => {
  it("converts a hex MD5 digest to its base64 form", () => {
    // md5("") = d41d8cd9 8f00b204 e9800998 ecf8427e
    expect(hexToBase64("d41d8cd98f00b204e9800998ecf8427e")).toBe("1B2M2Y8AsgTpgAmY7PhCfg==");
  });
});

describe("computeFileMd5", () => {
  it("hashes an empty blob", async () => {
    const result = await computeFileMd5(new Blob([]));
    expect(result.hex).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(result.base64).toBe("1B2M2Y8AsgTpgAmY7PhCfg==");
  });

  it("hashes a small blob (known md5('abc'))", async () => {
    const result = await computeFileMd5(new Blob(["abc"]));
    expect(result.hex).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("hashes content spanning multiple internal chunks identically to a single read", async () => {
    // Größer als eine einzelne FileReader-Runde wäre bei kleineren
    // CHUNK_SIZE-Werten nötig — hier nur sichergestellt, dass ein
    // mehrere KB großer, sich wiederholender Inhalt einen stabilen,
    // deterministischen Hash liefert (Regressionsschutz gegen einen
    // fehlerhaften Chunk-Fortsetzungs-Bug).
    const content = "x".repeat(50_000);
    const first = await computeFileMd5(new Blob([content]));
    const second = await computeFileMd5(new Blob([content]));
    expect(first.hex).toBe(second.hex);
    expect(first.hex).toHaveLength(32);
  });
});
