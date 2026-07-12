import type { AdministrativeLevel } from "@/lib/administrative-units";

export interface AdministrativeUnit {
  id: string;
  parentId: string | null;
  level: AdministrativeLevel;
  code: string;
  name: string;
  shortName: string | null;
  color: string | null;
}

export type FormState =
  | { mode: "create"; parentId: string | null; level: AdministrativeLevel; replaceIndex: number }
  | { mode: "edit"; unit: AdministrativeUnit };
