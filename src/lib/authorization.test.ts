import { describe, expect, it } from "vitest";
import {
  canAccessAdminArea,
  canManageUsers,
  canChangeRole,
  isOAuthSignInAllowed,
  type Role,
} from "./authorization";

describe("canAccessAdminArea", () => {
  it.each<[Role | undefined | null, boolean]>([
    ["user", false],
    ["admin", true],
    ["super_admin", true],
    [undefined, false],
    [null, false],
  ])("role=%s -> %s", (role, expected) => {
    expect(canAccessAdminArea(role)).toBe(expected);
  });
});

describe("canManageUsers", () => {
  it.each<[Role | undefined | null, boolean]>([
    ["user", false],
    ["admin", false],
    ["super_admin", true],
    [undefined, false],
  ])("role=%s -> %s", (role, expected) => {
    expect(canManageUsers(role)).toBe(expected);
  });
});

describe("isOAuthSignInAllowed", () => {
  it.each<[Role | undefined | null, boolean]>([
    ["user", true],
    ["admin", true],
    ["super_admin", false],
    [undefined, true],
    [null, true],
  ])("existingRole=%s -> %s", (role, expected) => {
    expect(isOAuthSignInAllowed(role)).toBe(expected);
  });
});

describe("canChangeRole", () => {
  const base = {
    actingUserId: "super-admin-id",
    actingRole: "super_admin" as Role,
    targetUserId: "target-id",
    targetCurrentRole: "user" as Role,
    desiredRole: "admin" as Role,
  };

  it("erlaubt super_admin, einem user die admin-Rolle zu geben", () => {
    expect(canChangeRole(base)).toEqual({ allowed: true });
  });

  it("erlaubt super_admin, einem admin die Rolle wieder auf user zu setzen", () => {
    expect(
      canChangeRole({ ...base, targetCurrentRole: "admin", desiredRole: "user" })
    ).toEqual({ allowed: true });
  });

  it("lehnt ab, wenn ein Nicht-super_admin handelt", () => {
    const result = canChangeRole({ ...base, actingRole: "admin" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("lehnt Selbst-Änderung ab", () => {
    const result = canChangeRole({
      ...base,
      targetUserId: base.actingUserId,
    });
    expect(result.allowed).toBe(false);
  });

  it("lehnt ab, wenn das Ziel bereits super_admin ist", () => {
    const result = canChangeRole({ ...base, targetCurrentRole: "super_admin" });
    expect(result.allowed).toBe(false);
  });

  it("lehnt ab, wenn super_admin als gewünschte Rolle übergeben wird", () => {
    const result = canChangeRole({ ...base, desiredRole: "super_admin" });
    expect(result.allowed).toBe(false);
  });
});
