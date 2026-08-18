"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Warenkorb als globaler Client-Zustand über mehrere Bilder/Seiten hinweg
// (siehe Konzept-Plan Abschnitt 9) — der erste Fall im Projekt, der Zustand
// tatsächlich braucht (src/lib/app-alert.ts löst eine einzelne globale
// Nachricht bewusst mit useSyncExternalStore statt Zustand, siehe dortiger
// Kommentar; ein Warenkorb mit mehreren Feldern pro Position UND
// Persistenz über einen Browser-Reload hinweg ist der Fall, für den Zustand
// im Tech-Stack vorgesehen ist).
//
// WICHTIG: dieser Store ist ausschließlich UX/Anzeige — label/priceCents
// sind ein Snapshot vom Zeitpunkt des Hinzufügens, keine Autorität. Die
// serverseitige Neuvalidierung von Verfügbarkeit UND Preis bei
// createCheckoutSession (src/app/checkout/actions.ts) ist der einzige
// Vertrauensanker, unabhängig davon, was hier im Store steht.
export interface CartItem {
  imageId: string;
  /** 6-stelliger Hash aus dem Ordnernamen (images.hash), für die
   * kopierbare "ID"-Anzeige im Warenkorb (siehe CartPageClient) — dieselbe
   * User-facing Kennung wie auf /images und /shop/image/[imageId]. */
  hash: string;
  kind: "digital_package" | "print";
  packageId: string | null;
  categoryId: string | null;
  printFormatId: string | null;
  printQualityId: string | null;
  quantity: number;
  label: string;
  priceCents: number;
  thumbUrl: string;
}

type CartItemIdentity = Pick<CartItem, "imageId" | "kind" | "packageId" | "printFormatId" | "printQualityId">;

function itemKey(item: CartItemIdentity): string {
  return item.kind === "digital_package"
    ? `digital_package:${item.imageId}:${item.packageId}`
    : `print:${item.imageId}:${item.printFormatId}:${item.printQualityId}`;
}

interface CartState {
  items: CartItem[];
  /** Digitale Pakete: erneutes Hinzufügen ist ein No-Op (Menge bleibt 1).
   * Drucke: erneutes Hinzufügen erhöht die Stückzahl um 1. */
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (item: CartItemIdentity) => void;
  /** quantity <= 0 entfernt die Position. */
  setQuantity: (item: CartItemIdentity, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const key = itemKey(item);
          const existingIndex = state.items.findIndex((existingItem) => itemKey(existingItem) === key);
          if (existingIndex === -1) {
            return { items: [...state.items, { ...item, quantity: 1 }] };
          }
          if (item.kind === "digital_package") return state;
          return {
            items: state.items.map((existingItem, index) =>
              index === existingIndex ? { ...existingItem, quantity: existingItem.quantity + 1 } : existingItem
            ),
          };
        }),
      removeItem: (item) =>
        set((state) => ({ items: state.items.filter((existingItem) => itemKey(existingItem) !== itemKey(item)) })),
      setQuantity: (item, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((existingItem) => itemKey(existingItem) !== itemKey(item)) };
          }
          return {
            items: state.items.map((existingItem) =>
              itemKey(existingItem) === itemKey(item) ? { ...existingItem, quantity } : existingItem
            ),
          };
        }),
      clear: () => set({ items: [] }),
    }),
    { name: "hifly-cart" }
  )
);
