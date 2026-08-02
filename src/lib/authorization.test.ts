import { describe, expect, it } from "vitest";
import {
  canAccessAdminArea,
  canManageAppSettings,
  canManageUsers,
  canChangeRole,
  canBlockUser,
  canSeeHiddenImages,
  canEditImage,
  canDeleteImage,
  canManageUserTag,
  hasMinRole,
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

describe("hasMinRole", () => {
  it.each<[Role | undefined | null, Role, boolean]>([
    ["user", "user", true],
    ["admin", "user", true],
    ["super_admin", "user", true],
    ["user", "admin", false],
    ["admin", "admin", true],
    ["super_admin", "admin", true],
    ["admin", "super_admin", false],
    ["super_admin", "super_admin", true],
    [undefined, "user", false],
    [null, "user", false],
  ])("role=%s, minRole=%s -> %s", (role, minRole, expected) => {
    expect(hasMinRole(role, minRole)).toBe(expected);
  });
});

describe("canManageAppSettings", () => {
  it.each<[Role | undefined | null, boolean]>([
    ["user", false],
    ["admin", false],
    ["super_admin", true],
    [undefined, false],
    [null, false],
  ])("role=%s -> %s", (role, expected) => {
    expect(canManageAppSettings(role)).toBe(expected);
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

describe("canBlockUser", () => {
  const base = {
    actingUserId: "super-admin-id",
    actingRole: "super_admin" as Role,
    targetUserId: "target-id",
    targetCurrentRole: "user" as Role,
  };

  it("erlaubt super_admin, einen user zu blockieren", () => {
    expect(canBlockUser(base)).toEqual({ allowed: true });
  });

  it("erlaubt super_admin, einen admin zu blockieren", () => {
    expect(canBlockUser({ ...base, targetCurrentRole: "admin" })).toEqual({ allowed: true });
  });

  it("lehnt ab, wenn ein Nicht-super_admin handelt", () => {
    const result = canBlockUser({ ...base, actingRole: "admin" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("lehnt Selbst-Blockierung ab", () => {
    const result = canBlockUser({ ...base, targetUserId: base.actingUserId });
    expect(result.allowed).toBe(false);
  });

  it("lehnt ab, wenn das Ziel der super_admin ist", () => {
    const result = canBlockUser({ ...base, targetCurrentRole: "super_admin" });
    expect(result.allowed).toBe(false);
  });
});

describe("canSeeHiddenImages", () => {
  it.each<[Role | undefined | null, boolean]>([
    ["user", false],
    ["admin", true],
    ["super_admin", true],
    [undefined, false],
    [null, false],
  ])("role=%s -> %s", (role, expected) => {
    expect(canSeeHiddenImages(role)).toBe(expected);
  });
});

describe("canEditImage / canDeleteImage", () => {
  const owner = { actingUserId: "admin-1", actingRole: "admin" as Role, imageUploadedBy: "admin-1" };
  const notOwner = { actingUserId: "admin-2", actingRole: "admin" as Role, imageUploadedBy: "admin-1" };
  const superAdmin = { actingUserId: "super-1", actingRole: "super_admin" as Role, imageUploadedBy: "admin-1" };
  const plainUser = { actingUserId: "user-1", actingRole: "user" as Role, imageUploadedBy: "admin-1" };

  it.each([
    ["canEditImage", canEditImage],
    ["canDeleteImage", canDeleteImage],
  ] as const)("%s: admin darf sein eigenes Bild verwalten", (_name, fn) => {
    expect(fn(owner)).toBe(true);
  });

  it.each([
    ["canEditImage", canEditImage],
    ["canDeleteImage", canDeleteImage],
  ] as const)("%s: admin darf NICHT das Bild eines anderen admin verwalten", (_name, fn) => {
    expect(fn(notOwner)).toBe(false);
  });

  it.each([
    ["canEditImage", canEditImage],
    ["canDeleteImage", canDeleteImage],
  ] as const)("%s: super_admin darf jedes Bild verwalten", (_name, fn) => {
    expect(fn(superAdmin)).toBe(true);
  });

  it.each([
    ["canEditImage", canEditImage],
    ["canDeleteImage", canDeleteImage],
  ] as const)("%s: eine plain user-Rolle darf nie", (_name, fn) => {
    expect(fn(plainUser)).toBe(false);
  });
});

describe("canManageUserTag", () => {
  const imageUploadedBy = "admin-owner";

  it("super_admin darf jeden Tag verwalten, unabhängig von allem", () => {
    expect(
      canManageUserTag({ actingUserId: "super-1", actingRole: "super_admin", tagAddedBy: "someone-else", imageUploadedBy })
    ).toBe(true);
    expect(
      canManageUserTag({ actingUserId: "super-1", actingRole: "super_admin", tagAddedBy: null, imageUploadedBy })
    ).toBe(true);
  });

  it("jede Rolle darf ihren eigenen Tag verwalten, egal wer das Bild hochgeladen hat", () => {
    expect(
      canManageUserTag({ actingUserId: "user-1", actingRole: "user", tagAddedBy: "user-1", imageUploadedBy })
    ).toBe(true);
    expect(
      canManageUserTag({ actingUserId: "admin-2", actingRole: "admin", tagAddedBy: "admin-2", imageUploadedBy })
    ).toBe(true);
  });

  it("der Owner-admin darf auch fremde Tags auf seinem eigenen Bild verwalten", () => {
    expect(
      canManageUserTag({
        actingUserId: imageUploadedBy,
        actingRole: "admin",
        tagAddedBy: "irgendein-user",
        imageUploadedBy,
      })
    ).toBe(true);
  });

  it("der Owner-admin darf auch Alt-Tags (addedBy null) auf seinem eigenen Bild verwalten", () => {
    expect(
      canManageUserTag({ actingUserId: imageUploadedBy, actingRole: "admin", tagAddedBy: null, imageUploadedBy })
    ).toBe(true);
  });

  it("ein NICHT-Owner-admin darf einen fremden Tag auf einem fremden Bild nicht verwalten", () => {
    expect(
      canManageUserTag({
        actingUserId: "admin-2",
        actingRole: "admin",
        tagAddedBy: "irgendein-user",
        imageUploadedBy,
      })
    ).toBe(false);
  });

  it("ein plain user darf einen fremden Tag nicht verwalten", () => {
    expect(
      canManageUserTag({ actingUserId: "user-1", actingRole: "user", tagAddedBy: "user-2", imageUploadedBy })
    ).toBe(false);
  });

  it("anonym (keine actingUserId) darf nie", () => {
    expect(
      canManageUserTag({ actingUserId: undefined, actingRole: undefined, tagAddedBy: null, imageUploadedBy })
    ).toBe(false);
  });
});
