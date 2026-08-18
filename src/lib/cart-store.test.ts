import { describe, expect, it, beforeEach } from "vitest";
import { useCartStore } from "./cart-store";

const PACKAGE_ITEM = {
  imageId: "img-1",
  hash: "AAAAAA",
  kind: "digital_package" as const,
  packageId: "pkg-web",
  categoryId: "cat-a",
  printFormatId: null,
  printQualityId: null,
  label: "Web (Kategorie A)",
  priceCents: 1900,
  thumbUrl: "https://example.com/thumb.jpg",
};

const PRINT_ITEM = {
  imageId: "img-2",
  hash: "BBBBBB",
  kind: "print" as const,
  packageId: null,
  categoryId: null,
  printFormatId: "fmt-a5",
  printQualityId: "qual-foto",
  label: "A5, Fotopapier",
  priceCents: 900,
  thumbUrl: "https://example.com/thumb2.jpg",
};

beforeEach(() => {
  useCartStore.getState().clear();
});

describe("useCartStore", () => {
  it("startet leer", () => {
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("fügt eine neue Position mit Menge 1 hinzu", () => {
    useCartStore.getState().addItem(PACKAGE_ITEM);
    expect(useCartStore.getState().items).toEqual([{ ...PACKAGE_ITEM, quantity: 1 }]);
  });

  it("erneutes Hinzufügen eines digitalen Pakets ist ein No-Op (Menge bleibt 1)", () => {
    useCartStore.getState().addItem(PACKAGE_ITEM);
    useCartStore.getState().addItem(PACKAGE_ITEM);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });

  it("erneutes Hinzufügen eines Drucks erhöht die Stückzahl", () => {
    useCartStore.getState().addItem(PRINT_ITEM);
    useCartStore.getState().addItem(PRINT_ITEM);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it("unterschiedliche Bilder/Formate landen als getrennte Positionen", () => {
    useCartStore.getState().addItem(PACKAGE_ITEM);
    useCartStore.getState().addItem(PRINT_ITEM);
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it("removeItem entfernt genau die passende Position", () => {
    useCartStore.getState().addItem(PACKAGE_ITEM);
    useCartStore.getState().addItem(PRINT_ITEM);
    useCartStore.getState().removeItem(PACKAGE_ITEM);
    expect(useCartStore.getState().items).toEqual([{ ...PRINT_ITEM, quantity: 1 }]);
  });

  it("setQuantity ändert die Stückzahl", () => {
    useCartStore.getState().addItem(PRINT_ITEM);
    useCartStore.getState().setQuantity(PRINT_ITEM, 5);
    expect(useCartStore.getState().items[0].quantity).toBe(5);
  });

  it("setQuantity mit 0 entfernt die Position", () => {
    useCartStore.getState().addItem(PRINT_ITEM);
    useCartStore.getState().setQuantity(PRINT_ITEM, 0);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("clear leert den gesamten Warenkorb", () => {
    useCartStore.getState().addItem(PACKAGE_ITEM);
    useCartStore.getState().addItem(PRINT_ITEM);
    useCartStore.getState().clear();
    expect(useCartStore.getState().items).toEqual([]);
  });
});
