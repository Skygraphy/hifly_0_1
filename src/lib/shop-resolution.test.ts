import { describe, expect, it, beforeEach, vi } from "vitest";

// Tabellen werden als eindeutige Objekt-Referenzen gemockt (nicht per Name),
// damit der select-Mock unten anhand der tatsächlich übergebenen
// .from(table)-Referenz weiß, welche vorbereitete Antwort zurückzugeben ist
// — robuster als ein positionsabhängiger Queue-Mock, da diese Funktionen
// mehrere unterschiedlich geformte Queries hintereinander absetzen.
const { dbMock, tables } = vi.hoisted(() => {
  const tables = {
    images: { id: "id", administrativeUnitId: "administrativeUnitId", regionId: "regionId" },
    administrativeUnits: { id: "id", parentId: "parentId", name: "name" },
    regions: { id: "id", name: "name" },
    shopPackages: { id: "id", sortOrder: "sortOrder" },
    shopLocationPackageAssignments: {
      administrativeUnitId: "administrativeUnitId",
      regionId: "regionId",
      packageId: "packageId",
      categoryId: "categoryId",
    },
    shopImagePackageAssignments: { imageId: "imageId", packageId: "packageId", categoryId: "categoryId" },
    shopPrintFormats: { id: "id", sortOrder: "sortOrder" },
    shopLocationPrintFormatAssignments: {
      administrativeUnitId: "administrativeUnitId",
      regionId: "regionId",
      printFormatId: "printFormatId",
      printQualityId: "printQualityId",
    },
    shopImagePrintFormatAssignments: { imageId: "imageId", printFormatId: "printFormatId", printQualityId: "printQualityId" },
  };

  const responses = new Map<object, unknown[]>();

  function chainable(value: unknown[]) {
    const promise = Promise.resolve(value) as Promise<unknown[]> & {
      where: () => typeof promise;
      limit: () => typeof promise;
      orderBy: () => typeof promise;
    };
    promise.where = () => chainable(value);
    promise.limit = () => chainable(value);
    promise.orderBy = () => chainable(value);
    return promise;
  }

  const selectMock = vi.fn(() => ({
    from: (table: object) => chainable(responses.get(table) ?? []),
  }));

  return { dbMock: { select: selectMock, responses }, tables };
});

vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/db/schema", () => tables);

const { resolveEffectivePackagesForImage, resolveEffectivePrintFormatsForImage } = await import("./shop-resolution");

// Gemeinsamer Verwaltungseinheiten-Baum für mehrere Tests:
// Österreich (AT) -> Niederösterreich (NOE) -> Tulln (TULLN)
//                  -> Kärnten (KTN)
const UNITS = [
  { id: "AT", parentId: null, name: "Österreich" },
  { id: "NOE", parentId: "AT", name: "Niederösterreich" },
  { id: "TULLN", parentId: "NOE", name: "Tulln" },
  { id: "KTN", parentId: "AT", name: "Kärnten" },
];

function setResponses(entries: Array<[object, unknown[]]>) {
  dbMock.responses.clear();
  for (const [table, value] of entries) {
    dbMock.responses.set(table, value);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.responses.clear();
});

describe("resolveEffectivePackagesForImage", () => {
  it("vererbt eine Zuordnung von der Wurzel an ein Bild mehrere Ebenen darunter", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPackageAssignments, [{ administrativeUnitId: "AT", packageId: "pkg-web", categoryId: "cat-c" }]],
      [tables.shopImagePackageAssignments, []],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result).toEqual([
      { packageId: "pkg-web", categoryId: "cat-c", source: { type: "location", standort: { type: "unit", id: "AT" }, label: "Österreich" } },
    ]);
  });

  it("Zuordnung nur auf einer mittleren Ebene gilt für deren Nachfahren, aber NICHT für einen Geschwister-Zweig ohne eigenen Treffer", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPackageAssignments, [{ administrativeUnitId: "NOE", packageId: "pkg-web", categoryId: "cat-a" }]],
      [tables.shopImagePackageAssignments, []],
    ]);
    const forTulln = await resolveEffectivePackagesForImage("img-tulln");
    expect(forTulln).toEqual([
      { packageId: "pkg-web", categoryId: "cat-a", source: { type: "location", standort: { type: "unit", id: "NOE" }, label: "Niederösterreich" } },
    ]);

    // Gleiche Zuordnungslage, aber jetzt ein Bild unter Kärnten (eigene
    // Kette KTN -> AT enthält keine der beiden Ebenen mit Treffer) —
    // shopLocationPackageAssignments realistischerweise leer, weil eine
    // echte inArray-Query auf die KTN-Kette keine NOE-Zeile zurückgäbe.
    setResponses([
      [tables.images, [{ administrativeUnitId: "KTN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPackageAssignments, []],
      [tables.shopImagePackageAssignments, []],
    ]);
    const forKtn = await resolveEffectivePackagesForImage("img-ktn");
    expect(forKtn).toEqual([]);
  });

  it("die nähere Ebene schlägt die entferntere, wenn beide eine Zuordnung haben", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [
        tables.shopLocationPackageAssignments,
        [
          { administrativeUnitId: "AT", packageId: "pkg-web", categoryId: "cat-c" },
          { administrativeUnitId: "NOE", packageId: "pkg-web", categoryId: "cat-a" },
        ],
      ],
      [tables.shopImagePackageAssignments, []],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result[0]).toEqual({
      packageId: "pkg-web",
      categoryId: "cat-a",
      source: { type: "location", standort: { type: "unit", id: "NOE" }, label: "Niederösterreich" },
    });
  });

  it("ein Bild-Override mit gesetzter Kategorie übersteuert die Standort-Zuordnung vollständig", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPackageAssignments, [{ administrativeUnitId: "AT", packageId: "pkg-web", categoryId: "cat-c" }]],
      [tables.shopImagePackageAssignments, [{ packageId: "pkg-web", categoryId: "cat-e" }]],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result).toEqual([{ packageId: "pkg-web", categoryId: "cat-e", source: { type: "override" } }]);
  });

  it("ein Bild-Override mit NULL sperrt das Paket, obwohl der Standort eine Zuordnung hat", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPackageAssignments, [{ administrativeUnitId: "AT", packageId: "pkg-web", categoryId: "cat-c" }]],
      [tables.shopImagePackageAssignments, [{ packageId: "pkg-web", categoryId: null }]],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result).toEqual([]);
  });

  it("liefert leer, wenn nirgends in der Kette eine Zuordnung existiert", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPackageAssignments, []],
      [tables.shopImagePackageAssignments, []],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result).toEqual([]);
  });

  it("Region-Standort nutzt ausschließlich die eigene Zuordnung, keine Vererbung", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: null, regionId: "region-1" }]],
      [tables.shopPackages, [{ id: "pkg-web" }]],
      [tables.regions, [{ name: "Hohe Tauern" }]],
      [tables.shopLocationPackageAssignments, [{ packageId: "pkg-web", categoryId: "cat-b" }]],
      [tables.shopImagePackageAssignments, []],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result).toEqual([
      { packageId: "pkg-web", categoryId: "cat-b", source: { type: "location", standort: { type: "region", id: "region-1" }, label: "Hohe Tauern" } },
    ]);
  });

  it("hält die Katalog-Reihenfolge (sortOrder) ein, nicht die DB-Rückgabereihenfolge der Zuordnungen", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "AT", regionId: null }]],
      // sortOrder-Reihenfolge des Katalogs: Web, Print Private, Business
      // Premium — die Zuordnungen unten kommen bewusst in einer ANDEREN
      // Reihenfolge zurück, um sicherzustellen, dass resolveEffective... die
      // Paket-Reihenfolge aus der (jetzt sortOrder-sortierten) shopPackages-
      // Abfrage übernimmt, nicht die Einfüge-/Rückgabereihenfolge der
      // Zuordnungstabelle.
      [tables.shopPackages, [{ id: "pkg-web" }, { id: "pkg-print-private" }, { id: "pkg-business-premium" }]],
      [tables.administrativeUnits, UNITS],
      [
        tables.shopLocationPackageAssignments,
        [
          { administrativeUnitId: "AT", packageId: "pkg-business-premium", categoryId: "cat-c" },
          { administrativeUnitId: "AT", packageId: "pkg-web", categoryId: "cat-c" },
          { administrativeUnitId: "AT", packageId: "pkg-print-private", categoryId: "cat-c" },
        ],
      ],
      [tables.shopImagePackageAssignments, []],
    ]);

    const result = await resolveEffectivePackagesForImage("img-1");

    expect(result.map((row) => row.packageId)).toEqual(["pkg-web", "pkg-print-private", "pkg-business-premium"]);
  });
});

describe("resolveEffectivePrintFormatsForImage", () => {
  it("übernimmt an der nächstgelegenen Ebene ALLE dort zugeordneten Qualitäten", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPrintFormats, [{ id: "fmt-a5" }]],
      [tables.administrativeUnits, UNITS],
      [
        tables.shopLocationPrintFormatAssignments,
        [
          { administrativeUnitId: "NOE", printFormatId: "fmt-a5", printQualityId: "qual-foto" },
          { administrativeUnitId: "NOE", printFormatId: "fmt-a5", printQualityId: "qual-premium" },
        ],
      ],
      [tables.shopImagePrintFormatAssignments, []],
    ]);

    const result = await resolveEffectivePrintFormatsForImage("img-1");

    expect(result).toEqual([
      {
        printFormatId: "fmt-a5",
        printQualityIds: ["qual-foto", "qual-premium"],
        source: { type: "location", standort: { type: "unit", id: "NOE" }, label: "Niederösterreich" },
      },
    ]);
  });

  it("ein Bild-Override ersetzt die volle Qualitäten-Menge durch genau eine Qualität", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPrintFormats, [{ id: "fmt-a5" }]],
      [tables.administrativeUnits, UNITS],
      [
        tables.shopLocationPrintFormatAssignments,
        [
          { administrativeUnitId: "NOE", printFormatId: "fmt-a5", printQualityId: "qual-foto" },
          { administrativeUnitId: "NOE", printFormatId: "fmt-a5", printQualityId: "qual-premium" },
        ],
      ],
      [tables.shopImagePrintFormatAssignments, [{ printFormatId: "fmt-a5", printQualityId: "qual-leinwand" }]],
    ]);

    const result = await resolveEffectivePrintFormatsForImage("img-1");

    expect(result).toEqual([{ printFormatId: "fmt-a5", printQualityIds: ["qual-leinwand"], source: { type: "override" } }]);
  });

  it("ein Bild-Override mit NULL entfernt das Format komplett, trotz Standort-Zuordnung mit mehreren Qualitäten", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "TULLN", regionId: null }]],
      [tables.shopPrintFormats, [{ id: "fmt-a5" }]],
      [tables.administrativeUnits, UNITS],
      [tables.shopLocationPrintFormatAssignments, [{ administrativeUnitId: "NOE", printFormatId: "fmt-a5", printQualityId: "qual-foto" }]],
      [tables.shopImagePrintFormatAssignments, [{ printFormatId: "fmt-a5", printQualityId: null }]],
    ]);

    const result = await resolveEffectivePrintFormatsForImage("img-1");

    expect(result).toEqual([]);
  });

  it("hält die Katalog-Reihenfolge (sortOrder) ein, nicht die DB-Rückgabereihenfolge der Zuordnungen", async () => {
    setResponses([
      [tables.images, [{ administrativeUnitId: "AT", regionId: null }]],
      [tables.shopPrintFormats, [{ id: "fmt-a5" }, { id: "fmt-a4" }, { id: "fmt-a3" }]],
      [tables.administrativeUnits, UNITS],
      [
        tables.shopLocationPrintFormatAssignments,
        [
          { administrativeUnitId: "AT", printFormatId: "fmt-a3", printQualityId: "qual-foto" },
          { administrativeUnitId: "AT", printFormatId: "fmt-a5", printQualityId: "qual-foto" },
          { administrativeUnitId: "AT", printFormatId: "fmt-a4", printQualityId: "qual-foto" },
        ],
      ],
      [tables.shopImagePrintFormatAssignments, []],
    ]);

    const result = await resolveEffectivePrintFormatsForImage("img-1");

    expect(result.map((row) => row.printFormatId)).toEqual(["fmt-a5", "fmt-a4", "fmt-a3"]);
  });
});
