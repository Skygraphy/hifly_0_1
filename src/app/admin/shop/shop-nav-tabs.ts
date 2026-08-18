import { Package, Printer, Percent, LayoutGrid, ImageIcon, MapPinned } from "lucide-react";
import type { NavTabItem } from "@/components/nav-tabs";

// Geteilte Tab-Sets für die Admin-Shop-Seiten (siehe
// plans/iridescent-hopping-wozniak.md, Abschnitt 4) — an einer Stelle
// gepflegt statt in 7 Seiten dupliziert.
export const SHOP_LEVEL1_TABS: NavTabItem[] = [
  { value: "packages", label: "Pakete", href: "/admin/shop/packages", icon: Package },
  { value: "prints", label: "Drucke", href: "/admin/shop/prints", icon: Printer },
  { value: "discounts", label: "Rabattstufen", href: "/admin/shop/discounts", icon: Percent },
];

export const PACKAGES_LEVEL2_TABS: NavTabItem[] = [
  { value: "overview", label: "Übersicht", href: "/admin/shop/packages", icon: LayoutGrid },
  { value: "images", label: "Bild-Zuordnung", href: "/admin/shop/packages/images", icon: ImageIcon },
  { value: "locations", label: "Standort-Zuordnung", href: "/admin/shop/packages/locations", icon: MapPinned },
];

export const PRINTS_LEVEL2_TABS: NavTabItem[] = [
  { value: "overview", label: "Übersicht", href: "/admin/shop/prints", icon: LayoutGrid },
  { value: "images", label: "Bild-Zuordnung", href: "/admin/shop/prints/images", icon: ImageIcon },
  { value: "locations", label: "Standort-Zuordnung", href: "/admin/shop/prints/locations", icon: MapPinned },
];
