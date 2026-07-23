import { describe, expect, it } from "vitest";
import { parseImageFolderName, s3KeyFor } from "./image-folder";

describe("parseImageFolderName", () => {
  it("parsed einen gültigen Ordnernamen", () => {
    const result = parseImageFolderName(
      "Adalbert_Stifter_Gasse_2024_07_13_001_C3E2EA_0f4e99ef-3261-416e-9de5-aa8223857b91"
    );

    expect(result).toEqual({
      address: "Adalbert_Stifter_Gasse",
      captureDate: "2024-07-13",
      sequenceNumber: 1,
      hash: "C3E2EA",
      uuid: "0f4e99ef-3261-416e-9de5-aa8223857b91",
    });
  });

  it("behandelt eine Adresse mit vielen Unterstrichen korrekt (Regex ist am Ende verankert)", () => {
    const result = parseImageFolderName(
      "Wiener_Strasse_12_Stiege_3_Tuer_4_2023_01_05_042_AABBCC_11111111-2222-3333-4444-555555555555"
    );

    expect(result?.address).toBe("Wiener_Strasse_12_Stiege_3_Tuer_4");
    expect(result?.sequenceNumber).toBe(42);
  });

  it("normalisiert Hash auf Großbuchstaben und UUID auf Kleinbuchstaben", () => {
    const result = parseImageFolderName(
      "Testgasse_2024_01_01_001_aabbcc_0F4E99EF-3261-416E-9DE5-AA8223857B91"
    );

    expect(result?.hash).toBe("AABBCC");
    expect(result?.uuid).toBe("0f4e99ef-3261-416e-9de5-aa8223857b91");
  });

  it("liefert null bei fehlender UUID", () => {
    expect(parseImageFolderName("Testgasse_2024_01_01_001_AABBCC")).toBeNull();
  });

  it("liefert null bei falscher Sequenzlänge", () => {
    expect(
      parseImageFolderName("Testgasse_2024_01_01_1_AABBCC_0f4e99ef-3261-416e-9de5-aa8223857b91")
    ).toBeNull();
  });

  it("liefert null bei falscher Hash-Länge", () => {
    expect(
      parseImageFolderName("Testgasse_2024_01_01_001_AABBCCD_0f4e99ef-3261-416e-9de5-aa8223857b91")
    ).toBeNull();
  });

  it("liefert null für einen komplett unpassenden Namen", () => {
    expect(parseImageFolderName("random-folder-name")).toBeNull();
  });
});

describe("s3KeyFor", () => {
  it("setzt Ordner-id und Dateiname mit / zusammen", () => {
    expect(s3KeyFor("Testgasse_2024_01_01_001_AABBCC_uuid", "original.dng")).toBe(
      "Testgasse_2024_01_01_001_AABBCC_uuid/original.dng"
    );
  });
});
