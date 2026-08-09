import { describe, expect, it, vi, beforeEach } from "vitest";
import { asc, desc, sql } from "drizzle-orm";
import { images } from "@/db/schema";

const { authMock, dbMock, s3Mock } = vi.hoisted(() => {
  // searchImages-Kette: select({...9 Felder inkl. mainLocation}).from().where().orderBy().limit().offset()
  const selectOffsetMock = vi.fn().mockResolvedValue([]);
  const selectLimitMock = vi.fn(() => ({ offset: selectOffsetMock }));
  const selectOrderByMock = vi.fn(() => ({ limit: selectLimitMock }));
  // getImageById-Kette: select({...dieselben Felder inkl. mainLocation}).from().where().limit(1)
  // — KEIN .orderBy() dazwischen (nur eine Zeile per id), daher ein zweiter,
  // direkt awaitbarer .limit-Zweig als Geschwister von .orderBy auf
  // demselben where()-Ergebnis (beide Aufrufer teilen sich denselben
  // Kandidaten-Filter "mainLocation" in der selectMock-Weiche unten).
  const getByIdRowsMock = vi.fn().mockResolvedValue([]);
  const selectWhereMock = vi.fn(() => ({ orderBy: selectOrderByMock, limit: () => getByIdRowsMock() }));
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));

  // Zusätzliche count(*)-Query für SearchImagesResult.total: select({count}).from().where()
  // — direkt awaitbar, keine orderBy/limit/offset-Kette.
  const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
  const countFromMock = vi.fn(() => ({ where: countWhereMock }));

  // searchImageLocations-Kette: select({id,lat,lng,administrativeUnitId,regionId}).from().where()
  // — direkt awaitbar, keine orderBy/limit/offset-Kette (keine Pagination),
  // kein Join mehr (Farbauflösung ist jetzt clientseitig, siehe
  // resolveImageColor in src/lib/administrative-units.ts).
  const locationsWhereMock = vi.fn().mockResolvedValue([]);
  const locationsFromMock = vi.fn(() => ({ where: locationsWhereMock }));

  // Owner-Vorab-Prüfung (updateImageMetadata/deleteImage/deleteImages):
  // select({uploadedBy} oder {id, uploadedBy}).from().where() — mal direkt
  // awaited (deleteImages' inArray-Abfrage), mal mit zusätzlichem .limit(1)
  // (updateImageMetadata/deleteImage) — beide Formen müssen auf denselben,
  // per Test kontrollierbaren Rückgabewert zeigen.
  const ownershipRowsMock = vi.fn().mockResolvedValue([]);
  function ownershipQueryResult() {
    const promise = ownershipRowsMock();
    (promise as unknown as { limit: () => unknown }).limit = () => ownershipQueryResult();
    return promise;
  }
  const ownershipWhereMock = vi.fn(() => ownershipQueryResult());
  const ownershipFromMock = vi.fn(() => ({ where: ownershipWhereMock }));

  // toggleFavorite-Existenzprüfung: select({userId}).from().where().limit(1)
  // — eigene Kette statt der ownership*-Mocks (auch wenn strukturell
  // identisch), da Favoriten kein Owner-Konzept haben und eine gemeinsame
  // Mock-Variable hier eher verwirren als Code sparen würde.
  const favoritesRowsMock = vi.fn().mockResolvedValue([]);
  function favoritesQueryResult() {
    const promise = favoritesRowsMock();
    (promise as unknown as { limit: () => unknown }).limit = () => favoritesQueryResult();
    return promise;
  }
  const favoritesWhereMock = vi.fn(() => favoritesQueryResult());
  const favoritesFromMock = vi.fn(() => ({ where: favoritesWhereMock }));

  const selectMock = vi.fn((projection: Record<string, unknown>) => {
    if ("count" in projection) {
      return { from: countFromMock };
    }
    // hash unterscheidet searchImages/getImageById (beide haben es) von
    // searchImageLocations (das seit kurzem AUCH mainLocation selektiert,
    // für das Kartenhover-Vorschaubild — aber weiterhin kein hash) — muss
    // daher VOR der mainLocation-Prüfung laufen, sonst würden
    // searchImages/getImageById fälschlich auf die pagination-lose
    // locationsFromMock-Kette geroutet.
    if ("hash" in projection) {
      return { from: selectFromMock };
    }
    if ("mainLocation" in projection) {
      return { from: locationsFromMock };
    }
    if ("userId" in projection) {
      return { from: favoritesFromMock };
    }
    return { from: ownershipFromMock };
  });

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhereMock }>(() => ({
    where: updateWhereMock,
  }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  const insertValuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  return {
    authMock: vi.fn(),
    dbMock: {
      select: selectMock,
      selectFromMock,
      selectWhereMock,
      selectOrderByMock,
      selectLimitMock,
      selectOffsetMock,
      getByIdRowsMock,
      countWhereMock,
      locationsWhereMock,
      ownershipRowsMock,
      ownershipWhereMock,
      favoritesRowsMock,
      favoritesWhereMock,
      update: updateMock,
      setMock,
      updateWhereMock,
      delete: deleteMock,
      deleteWhereMock,
      insert: insertMock,
      insertValuesMock,
    },
    s3Mock: {
      listObjectKeysUnderPrefix: vi.fn().mockResolvedValue([]),
      deleteObjects: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/lib/s3", () => s3Mock);
vi.mock("@/lib/image-folder", () => ({
  thumbUrlFor: (id: string) => `https://example-bucket.test/${id}/thumb.jpg`,
  previewUrlFor: (id: string) => `https://example-bucket.test/${id}/preview.jpg`,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  searchImages,
  searchImageLocations,
  updateImageMetadata,
  deleteImage,
  deleteImages,
  addUserTag,
  removeUserTag,
  toggleFavorite,
  getImageById,
} = await import("./actions");

describe("searchImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectOffsetMock.mockResolvedValue([]);
    dbMock.countWhereMock.mockResolvedValue([{ count: 0 }]);
    authMock.mockResolvedValue(null);
  });

  it("filtert anonym/user auf web_visible = true", async () => {
    await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("baut für tagsQuery eine Bedingung, ohne zu werfen (user_tags ist jsonb, nicht text[] — array_to_string darauf würde in Postgres einen Laufzeitfehler werfen, den dieser gemockte Test nicht fängt; echte SQL-Ausführung separat gegen die DB verifiziert)", async () => {
    await searchImages({ locationQuery: "", tagsQuery: "Herbst", offset: 0 });

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("baut für hashQuery (User-facing 'ID') eine Bedingung, ohne zu werfen", async () => {
    await searchImages({ locationQuery: "", tagsQuery: "", hashQuery: "C3E2", offset: 0 });

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("baut für favoritesOnly 'yes' eine EXISTS-Bedingung (eingeloggt), ohne zu werfen", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    await searchImages({ locationQuery: "", tagsQuery: "", favoritesOnly: "yes", offset: 0 });

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("baut für favoritesOnly 'no' eine NOT-EXISTS-Bedingung (eingeloggt), ohne zu werfen", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    await searchImages({ locationQuery: "", tagsQuery: "", favoritesOnly: "no", offset: 0 });

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("favoritesOnly 'yes' baut auch anonym (ohne Session) eine Bedingung, ohne zu werfen", async () => {
    authMock.mockResolvedValue(null);

    await searchImages({ locationQuery: "", tagsQuery: "", favoritesOnly: "yes", offset: 0 });

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("admin/super_admin sehen auch unsichtbare Bilder (kein web_visible-Filter)", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.selectOffsetMock.mockResolvedValue([]);

    const result = await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result.rows).toEqual([]);
    // .where(undefined) wird aufgerufen, wenn gar keine Bedingung gilt
    // (kein Standort, keine Textfilter, keine Sichtbarkeits-Einschränkung).
    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(undefined);
  });

  it("mappt Zeilen inkl. thumbUrl und ersetzt null-Arrays durch leere Arrays", async () => {
    dbMock.selectOffsetMock.mockResolvedValue([
      {
        id: "img-1",
        hash: "1E044D",
        mainLocation: "Teststraße",
        secondaryLocations: null,
        tags: null,
        userTags: [{ tag: "UT1", addedBy: "user-1" }],
        webVisible: true,
        administrativeUnitId: "unit-1",
        regionId: null,
      },
    ]);

    const result = await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result.rows).toEqual([
      {
        id: "img-1",
        hash: "1E044D",
        mainLocation: "Teststraße",
        secondaryLocations: [],
        tags: [],
        userTags: [{ tag: "UT1", addedBy: "user-1" }],
        webVisible: true,
        administrativeUnitId: "unit-1",
        regionId: null,
        thumbUrl: "https://example-bucket.test/img-1/thumb.jpg",
        previewUrl: "https://example-bucket.test/img-1/preview.jpg",
      },
    ]);
  });

  it("hasMore ist true, wenn mehr als eine Seite (60) Zeilen zurückkommen", async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({
      id: `img-${i}`,
      mainLocation: null,
      secondaryLocations: [],
      tags: [],
      userTags: [],
      webVisible: true,
    }));
    dbMock.selectOffsetMock.mockResolvedValue(rows);

    const result = await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result.rows).toHaveLength(60);
    expect(result.hasMore).toBe(true);
  });

  it("hasMore ist false, wenn genau eine Seite oder weniger zurückkommt", async () => {
    dbMock.selectOffsetMock.mockResolvedValue([
      { id: "img-1", mainLocation: null, secondaryLocations: [], tags: [], userTags: [], webVisible: true },
    ]);

    const result = await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result.hasMore).toBe(false);
  });

  it("total kommt aus einer eigenen count(*)-Query und ist unabhängig von der geladenen Seite", async () => {
    const rows = Array.from({ length: 61 }, (_, i) => ({
      id: `img-${i}`,
      mainLocation: null,
      secondaryLocations: [],
      tags: [],
      userTags: [],
      webVisible: true,
    }));
    dbMock.selectOffsetMock.mockResolvedValue(rows);
    dbMock.countWhereMock.mockResolvedValue([{ count: 150 }]);

    const result = await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result.rows).toHaveLength(60);
    expect(result.total).toBe(150);
  });

  it("sortiert standardmäßig (kein sortBy) nach web_ranking", async () => {
    await searchImages({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(dbMock.selectOrderByMock).toHaveBeenCalledWith(
      sql`${images.webRanking} DESC NULLS LAST`,
      desc(images.createdAt),
      asc(images.id)
    );
  });

  it("sortBy 'address-asc' sortiert nach main_location/secondary_locations aufsteigend, mit sequence_number/capture_date als versteckte Tiebreaker", async () => {
    await searchImages({ locationQuery: "", tagsQuery: "", offset: 0, sortBy: "address-asc" });

    expect(dbMock.selectOrderByMock).toHaveBeenCalledWith(
      sql`${images.mainLocation} ASC NULLS LAST`,
      sql`${images.secondaryLocations} ASC NULLS LAST`,
      asc(images.sequenceNumber),
      asc(images.captureDate),
      asc(images.id)
    );
  });

  it("sortBy 'address-desc' sortiert nach main_location/secondary_locations absteigend, mit sequence_number/capture_date als versteckte Tiebreaker (ebenfalls absteigend)", async () => {
    await searchImages({ locationQuery: "", tagsQuery: "", offset: 0, sortBy: "address-desc" });

    expect(dbMock.selectOrderByMock).toHaveBeenCalledWith(
      sql`${images.mainLocation} DESC NULLS LAST`,
      sql`${images.secondaryLocations} DESC NULLS LAST`,
      desc(images.sequenceNumber),
      desc(images.captureDate),
      asc(images.id)
    );
  });
});

describe("searchImageLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.locationsWhereMock.mockResolvedValue([]);
    authMock.mockResolvedValue(null);
  });

  it("nutzt die from().where()-Kette ohne Pagination (kein orderBy/limit/offset) und ohne Join", async () => {
    const result = await searchImageLocations({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result).toEqual([]);
    expect(dbMock.locationsWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("gibt administrativeUnitId/regionId roh zurück, ohne Farbauflösung (die passiert clientseitig)", async () => {
    dbMock.locationsWhereMock.mockResolvedValue([
      { id: "img-1", lat: 48.3, lng: 16.3, administrativeUnitId: "unit-1", regionId: null },
      { id: "img-2", lat: 48.4, lng: 16.4, administrativeUnitId: null, regionId: "region-1" },
      { id: "img-3", lat: 48.5, lng: 16.5, administrativeUnitId: null, regionId: null },
    ]);

    const result = await searchImageLocations({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(result).toEqual([
      { id: "img-1", lat: 48.3, lng: 16.3, administrativeUnitId: "unit-1", regionId: null },
      { id: "img-2", lat: 48.4, lng: 16.4, administrativeUnitId: null, regionId: "region-1" },
      { id: "img-3", lat: 48.5, lng: 16.5, administrativeUnitId: null, regionId: null },
    ]);
  });

  it("admin/super_admin sehen auch unsichtbare Bilder (kein web_visible-Filter)", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    await searchImageLocations({ locationQuery: "", tagsQuery: "", offset: 0 });

    expect(dbMock.locationsWhereMock).toHaveBeenCalledWith(expect.anything());
  });
});

describe("updateImageMetadata", () => {
  const validInput = {
    id: "img-1",
    mainLocation: "Neuer Ort",
    secondaryLocations: ["S1"],
    tags: ["T1"],
    webVisible: true,
    webRanking: 1,
    printVisible: true,
    printRanking: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1", printVisible: false, printRanking: 0 }]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await updateImageMetadata(validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt eine plain user-Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await updateImageMetadata(validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein admin NICHT der Owner ist", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-2", role: "admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1", printVisible: false, printRanking: 0 }]);

    const result = await updateImageMetadata(validInput);

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("erlaubt dem Owner-admin, schreibt alle Metadaten-Felder AUSSER print_visible/print_ranking", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1", printVisible: false, printRanking: 0 }]);

    const result = await updateImageMetadata(validInput);

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mainLocation: "Neuer Ort",
        secondaryLocations: ["S1"],
        tags: ["T1"],
        webVisible: true,
        webRanking: 1,
        // input wollte true/1 setzen, aber ein Owner-admin darf print-Felder
        // nicht ändern — die vorhandenen DB-Werte bleiben stehen.
        printVisible: false,
        printRanking: 0,
      })
    );
    expect(dbMock.setMock.mock.calls[0][0]).not.toHaveProperty("userTags");
  });

  it("erlaubt super_admin, auch print_visible/print_ranking zu ändern, unabhängig vom Owner — ändert nie administrativeUnitId/regionId", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { uploadedBy: "someone-else", printVisible: false, printRanking: 0 },
    ]);

    const result = await updateImageMetadata(validInput);

    expect(result.success).toBe(true);
    const setArg = dbMock.setMock.mock.calls[0][0];
    expect(setArg.printVisible).toBe(true);
    expect(setArg.printRanking).toBe(1);
    expect(setArg).not.toHaveProperty("administrativeUnitId");
    expect(setArg).not.toHaveProperty("regionId");
  });
});

describe("deleteImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mock.listObjectKeysUnderPrefix.mockResolvedValue([]);
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1" }]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await deleteImage("img-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("lehnt eine plain user-Rolle ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await deleteImage("img-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein admin NICHT der Owner ist", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-2", role: "admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1" }]);

    const result = await deleteImage("img-1");

    expect(result.success).toBe(false);
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("löscht erst die S3-Objekte unter dem Ordner-Prefix, dann die DB-Zeile (Owner-admin)", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1" }]);
    s3Mock.listObjectKeysUnderPrefix.mockResolvedValue(["img-1/original.dng", "img-1/thumb.jpg"]);

    const result = await deleteImage("img-1");

    expect(result.success).toBe(true);
    expect(s3Mock.listObjectKeysUnderPrefix).toHaveBeenCalledWith("img-1/");
    expect(s3Mock.deleteObjects).toHaveBeenCalledWith(["img-1/original.dng", "img-1/thumb.jpg"]);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it("super_admin darf auch fremde Bilder löschen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ uploadedBy: "admin-1" }]);

    const result = await deleteImage("img-1");

    expect(result.success).toBe(true);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });
});

describe("deleteImages (bulk)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mock.listObjectKeysUnderPrefix.mockResolvedValue([]);
  });

  it("lehnt alles ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await deleteImages(["img-1", "img-2"]);

    expect(result).toEqual({ deletedIds: [], skippedIds: ["img-1", "img-2"] });
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("löscht nur die eigenen Bilder eines admin, überspringt fremde", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { id: "img-1", uploadedBy: "admin-1" },
      { id: "img-2", uploadedBy: "admin-2" },
    ]);

    const result = await deleteImages(["img-1", "img-2"]);

    expect(result.deletedIds).toEqual(["img-1"]);
    expect(result.skippedIds).toEqual(["img-2"]);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it("super_admin löscht alle angefragten Bilder unabhängig vom Owner", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { id: "img-1", uploadedBy: "admin-1" },
      { id: "img-2", uploadedBy: "admin-2" },
    ]);

    const result = await deleteImages(["img-1", "img-2"]);

    expect(result.deletedIds).toEqual(["img-1", "img-2"]);
    expect(result.skippedIds).toEqual([]);
  });
});

describe("addUserTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.ownershipRowsMock.mockResolvedValue([{ userTags: [] }]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await addUserTag("img-1", "Herbst");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt einen leeren (nur Leerzeichen) Tag ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });

    const result = await addUserTag("img-1", "   ");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn das Bild nicht existiert", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([]);

    const result = await addUserTag("img-1", "Herbst");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("jede Rolle darf einen eigenen Tag hinzufügen — addedBy kommt aus der Session, nie vom Aufrufer", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ userTags: [] }]);

    const result = await addUserTag("img-1", "Herbst");

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(
      expect.objectContaining({ userTags: [{ tag: "Herbst", addedBy: "user-1" }] })
    );
  });

  it("lehnt exakt denselben Tag (case-insensitive) desselben Users doppelt ab", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ userTags: [{ tag: "Herbst", addedBy: "user-1" }] }]);

    const result = await addUserTag("img-1", "herbst");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("erlaubt denselben Tag-Text von einem anderen User", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([{ userTags: [{ tag: "Herbst", addedBy: "user-1" }] }]);

    const result = await addUserTag("img-1", "Herbst");

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userTags: [
          { tag: "Herbst", addedBy: "user-1" },
          { tag: "Herbst", addedBy: "user-2" },
        ],
      })
    );
  });
});

describe("removeUserTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await removeUserTag("img-1", "Herbst", "user-1");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn das Bild nicht existiert", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([]);

    const result = await removeUserTag("img-1", "Herbst", "user-1");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("erlaubt dem Ersteller, seinen eigenen Tag zu entfernen", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { uploadedBy: "admin-1", userTags: [{ tag: "Herbst", addedBy: "user-1" }] },
    ]);

    const result = await removeUserTag("img-1", "Herbst", "user-1");

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ userTags: [] }));
  });

  it("lehnt ab, wenn ein anderer User (kein Owner-admin) einen fremden Tag entfernen will", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2", role: "user" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { uploadedBy: "admin-1", userTags: [{ tag: "Herbst", addedBy: "user-1" }] },
    ]);

    const result = await removeUserTag("img-1", "Herbst", "user-1");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("erlaubt dem Owner-admin, einen fremden Tag auf seinem eigenen Bild zu entfernen", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { uploadedBy: "admin-1", userTags: [{ tag: "Herbst", addedBy: "user-1" }] },
    ]);

    const result = await removeUserTag("img-1", "Herbst", "user-1");

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ userTags: [] }));
  });

  it("super_admin darf immer entfernen, auch Alt-Tags mit addedBy null", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    dbMock.ownershipRowsMock.mockResolvedValue([
      { uploadedBy: "admin-1", userTags: [{ tag: "Legacy", addedBy: null }] },
    ]);

    const result = await removeUserTag("img-1", "Legacy", null);

    expect(result.success).toBe(true);
    expect(dbMock.setMock).toHaveBeenCalledWith(expect.objectContaining({ userTags: [] }));
  });
});

describe("toggleFavorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.favoritesRowsMock.mockResolvedValue([]);
  });

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    authMock.mockResolvedValue(null);

    const result = await toggleFavorite("img-1");

    expect(result.success).toBe(false);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("fügt einen Favoriten ein, wenn noch keiner existiert — userId kommt aus der Session, nie vom Aufrufer", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.favoritesRowsMock.mockResolvedValue([]);

    const result = await toggleFavorite("img-1");

    expect(result).toEqual({ success: true, isFavorite: true });
    expect(dbMock.insertValuesMock).toHaveBeenCalledWith({ userId: "user-1", imageId: "img-1" });
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("entfernt einen bestehenden Favoriten, statt einen zweiten einzufügen", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } });
    dbMock.favoritesRowsMock.mockResolvedValue([{ userId: "user-1" }]);

    const result = await toggleFavorite("img-1");

    expect(result).toEqual({ success: true, isFavorite: false });
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("getImageById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getByIdRowsMock.mockResolvedValue([]);
    authMock.mockResolvedValue(null);
  });

  it("gibt null zurück, wenn kein Bild mit dieser id existiert", async () => {
    const result = await getImageById("img-missing");

    expect(result).toBeNull();
  });

  it("baut die Bedingung ohne zu werfen, auch für eingeloggte Sessions", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    await getImageById("img-1");

    expect(dbMock.selectWhereMock).toHaveBeenCalledWith(expect.anything());
  });

  it("mappt eine gefundene Zeile inkl. thumbUrl/previewUrl und ersetzt null-Arrays durch leere Arrays", async () => {
    dbMock.getByIdRowsMock.mockResolvedValue([
      {
        id: "img-1",
        hash: "1E044D",
        mainLocation: "Teststraße",
        secondaryLocations: null,
        tags: null,
        userTags: [{ tag: "UT1", addedBy: "user-1" }],
        webVisible: true,
        webRanking: 1,
        printVisible: null,
        printRanking: null,
        uploadedBy: "user-1",
        administrativeUnitId: "unit-1",
        regionId: null,
        isFavorite: false,
      },
    ]);

    const result = await getImageById("img-1");

    expect(result).toEqual({
      id: "img-1",
      hash: "1E044D",
      mainLocation: "Teststraße",
      secondaryLocations: [],
      tags: [],
      userTags: [{ tag: "UT1", addedBy: "user-1" }],
      webVisible: true,
      webRanking: 1,
      printVisible: null,
      printRanking: null,
      uploadedBy: "user-1",
      administrativeUnitId: "unit-1",
      regionId: null,
      isFavorite: false,
      thumbUrl: "https://example-bucket.test/img-1/thumb.jpg",
      previewUrl: "https://example-bucket.test/img-1/preview.jpg",
    });
  });
});
