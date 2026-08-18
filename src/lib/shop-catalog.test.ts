import { describe, expect, it, beforeEach, vi } from "vitest";

// Gleiches Tabellen-Identitäts-Mock-Muster wie shop-resolution.test.ts —
// robuster als ein positionsabhängiger Queue-Mock, da diese Funktionen
// mehrere unterschiedlich geformte Queries hintereinander absetzen.
const { dbMock, tables } = vi.hoisted(() => {
  const tables = {
    shopPackages: { id: "id", name: "name", description: "description", includedFiles: "includedFiles", sortOrder: "sortOrder" },
    shopPackageCategories: { id: "id", name: "name", sortOrder: "sortOrder" },
    shopPackagePrices: { packageId: "packageId", categoryId: "categoryId", priceCents: "priceCents" },
    shopPrintFormats: { id: "id", name: "name", description: "description", widthCm: "widthCm", heightCm: "heightCm", sortOrder: "sortOrder" },
    shopPrintQualities: { id: "id", name: "name", sortOrder: "sortOrder" },
    shopPrintFormatPrices: { printFormatId: "printFormatId", printQualityId: "printQualityId", priceCents: "priceCents" },
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

const {
  listCatalogPackages,
  listCatalogPrintFormats,
  getCatalogPackageDetail,
  getCatalogPrintFormatDetail,
  stripHtmlSnippet,
  summarizePriceRange,
} = await import("./shop-catalog");

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

describe("listCatalogPackages", () => {
  it("liefert minPriceCents: null für ein Paket ganz ohne Preiszeile", async () => {
    setResponses([
      [tables.shopPackages, [{ id: "pkg-1", name: "Web", description: null, sortOrder: 0, isFeatured: false }]],
      [tables.shopPackagePrices, []],
    ]);
    const result = await listCatalogPackages();
    expect(result).toEqual([
      { id: "pkg-1", name: "Web", description: null, sortOrder: 0, isFeatured: false, minPriceCents: null },
    ]);
  });

  it("gibt isFeatured unverändert durch", async () => {
    setResponses([
      [tables.shopPackages, [{ id: "pkg-1", name: "Web", description: null, sortOrder: 0, isFeatured: true }]],
      [tables.shopPackagePrices, []],
    ]);
    const result = await listCatalogPackages();
    expect(result[0].isFeatured).toBe(true);
  });

  it("nimmt das Minimum über mehrere Preiszeilen desselben Pakets", async () => {
    setResponses([
      [tables.shopPackages, [{ id: "pkg-1", name: "Web", description: null, sortOrder: 0 }]],
      [
        tables.shopPackagePrices,
        [
          { packageId: "pkg-1", priceCents: 2250 },
          { packageId: "pkg-1", priceCents: 1900 },
          { packageId: "pkg-1", priceCents: 3900 },
        ],
      ],
    ]);
    const result = await listCatalogPackages();
    expect(result[0].minPriceCents).toBe(1900);
  });

  it("ordnet Preise korrekt mehreren Paketen zu", async () => {
    setResponses([
      [
        tables.shopPackages,
        [
          { id: "pkg-1", name: "Web", description: null, sortOrder: 0 },
          { id: "pkg-2", name: "Print Private", description: null, sortOrder: 1 },
        ],
      ],
      [
        tables.shopPackagePrices,
        [
          { packageId: "pkg-1", priceCents: 1900 },
          { packageId: "pkg-2", priceCents: 3900 },
        ],
      ],
    ]);
    const result = await listCatalogPackages();
    expect(result.map((row) => row.minPriceCents)).toEqual([1900, 3900]);
  });
});

describe("listCatalogPrintFormats", () => {
  it("liefert Breite/Höhe unverändert und minPriceCents: null ohne Preiszeile", async () => {
    setResponses([
      [
        tables.shopPrintFormats,
        [{ id: "fmt-a5", name: "A5", description: null, widthCm: 14.8, heightCm: 21, sortOrder: 0, isFeatured: false }],
      ],
      [tables.shopPrintFormatPrices, []],
    ]);
    const result = await listCatalogPrintFormats();
    expect(result).toEqual([
      { id: "fmt-a5", name: "A5", description: null, widthCm: 14.8, heightCm: 21, sortOrder: 0, isFeatured: false, minPriceCents: null },
    ]);
  });

  it("gibt isFeatured unverändert durch", async () => {
    setResponses([
      [
        tables.shopPrintFormats,
        [{ id: "fmt-a5", name: "A5", description: null, widthCm: 14.8, heightCm: 21, sortOrder: 0, isFeatured: true }],
      ],
      [tables.shopPrintFormatPrices, []],
    ]);
    const result = await listCatalogPrintFormats();
    expect(result[0].isFeatured).toBe(true);
  });
});

describe("getCatalogPackageDetail", () => {
  it("liefert null für eine unbekannte Id", async () => {
    setResponses([[tables.shopPackages, []]]);
    const result = await getCatalogPackageDetail("does-not-exist");
    expect(result).toBeNull();
  });

  it("liefert Detail mit nach Kategorie-sortOrder sortierten Preisen", async () => {
    setResponses([
      [
        tables.shopPackages,
        [{ id: "pkg-1", name: "Web", description: "<p>Test</p>", includedFiles: ["medium.jpg"], sortOrder: 0, isFeatured: true }],
      ],
      [
        tables.shopPackagePrices,
        [
          { categoryId: "cat-c", priceCents: 1900 },
          { categoryId: "cat-a", priceCents: 900 },
        ],
      ],
      [
        tables.shopPackageCategories,
        [
          { id: "cat-a", name: "A", sortOrder: 0 },
          { id: "cat-c", name: "C", sortOrder: 2 },
        ],
      ],
    ]);
    const result = await getCatalogPackageDetail("pkg-1");
    expect(result).toEqual({
      id: "pkg-1",
      name: "Web",
      description: "<p>Test</p>",
      includedFiles: ["medium.jpg"],
      sortOrder: 0,
      isFeatured: true,
      minPriceCents: 900,
      prices: [
        { categoryId: "cat-a", categoryName: "A", priceCents: 900 },
        { categoryId: "cat-c", categoryName: "C", priceCents: 1900 },
      ],
    });
  });
});

describe("getCatalogPrintFormatDetail", () => {
  it("liefert null für eine unbekannte Id", async () => {
    setResponses([[tables.shopPrintFormats, []]]);
    const result = await getCatalogPrintFormatDetail("does-not-exist");
    expect(result).toBeNull();
  });

  it("liefert Detail mit nach Qualitäts-sortOrder sortierten Preisen", async () => {
    setResponses([
      [
        tables.shopPrintFormats,
        [{ id: "fmt-a5", name: "A5", description: null, widthCm: 14.8, heightCm: 21, sortOrder: 0, isFeatured: true }],
      ],
      [
        tables.shopPrintFormatPrices,
        [
          { printQualityId: "qual-leinwand", priceCents: 5900 },
          { printQualityId: "qual-foto", priceCents: 900 },
        ],
      ],
      [
        tables.shopPrintQualities,
        [
          { id: "qual-foto", name: "Fotopapier", sortOrder: 0 },
          { id: "qual-leinwand", name: "Leinwand", sortOrder: 2 },
        ],
      ],
    ]);
    const result = await getCatalogPrintFormatDetail("fmt-a5");
    expect(result?.prices).toEqual([
      { printQualityId: "qual-foto", printQualityName: "Fotopapier", priceCents: 900 },
      { printQualityId: "qual-leinwand", printQualityName: "Leinwand", priceCents: 5900 },
    ]);
    expect(result?.minPriceCents).toBe(900);
    expect(result?.isFeatured).toBe(true);
  });
});

describe("stripHtmlSnippet", () => {
  it("entfernt Tags und lässt kurzen Text unverändert", () => {
    expect(stripHtmlSnippet("<p>Hallo <strong>Welt</strong></p>", 50)).toBe("Hallo Welt");
  });

  it("kürzt langen Text mit Ellipse", () => {
    const long = "a".repeat(100);
    const result = stripHtmlSnippet(`<p>${long}</p>`, 20);
    expect(result).toBe(`${"a".repeat(20)}…`);
  });

  it("fasst mehrfachen Whitespace zu einem Leerzeichen zusammen", () => {
    expect(stripHtmlSnippet("<p>A</p>\n\n<p>B</p>", 50)).toBe("A B");
  });
});

describe("summarizePriceRange", () => {
  it("liefert null bei leerer Preisliste", () => {
    expect(summarizePriceRange([])).toBeNull();
  });

  it("berechnet Minimum, Maximum und (gerundeten) Mittelwert", () => {
    expect(summarizePriceRange([1900, 3900, 11900])).toEqual({ minCents: 1900, maxCents: 11900, avgCents: 5900 });
  });

  it("rundet den Mittelwert auf ganze Cent", () => {
    expect(summarizePriceRange([1000, 1001])).toEqual({ minCents: 1000, maxCents: 1001, avgCents: 1001 });
  });

  it("min und max sind gleich der Einzelpreis bei nur einer Zeile", () => {
    expect(summarizePriceRange([1900])).toEqual({ minCents: 1900, maxCents: 1900, avgCents: 1900 });
  });
});
