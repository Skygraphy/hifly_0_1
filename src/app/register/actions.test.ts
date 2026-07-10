import { describe, expect, it, vi, beforeEach } from "vitest";

const { signInMock, dbMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const selectMock = vi.fn(() => ({ from: () => ({ where: whereMock }) }));
  const valuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    signInMock: vi.fn(),
    dbMock: { select: selectMock, insert: insertMock, limitMock, valuesMock },
  };
});

vi.mock("@/auth", () => ({ signIn: signInMock }));
vi.mock("@/db", () => ({ db: dbMock }));
// Importiert real next-auth eine "next/server"-Kette, die außerhalb des
// Next.js-Runtimes (also unter Vitest) nicht auflöst — next-auth komplett
// mocken, damit weder actions.ts noch dieser Test das echte Paket laden.
vi.mock("next-auth", () => {
  class AuthError extends Error {}
  return { AuthError };
});

const { AuthError } = await import("next-auth");

const { registerWithCredentials } = await import("./actions");

function buildFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("registerWithCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.limitMock.mockResolvedValue([]);
    dbMock.valuesMock.mockResolvedValue(undefined);
    signInMock.mockResolvedValue(undefined);
  });

  it("lehnt ein zu kurzes Passwort ab, ohne die DB anzufassen", async () => {
    const result = await registerWithCredentials(
      buildFormData({ email: "new@example.com", password: "short", confirmPassword: "short" })
    );

    expect(result).toMatch(/mindestens 8 Zeichen/);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("lehnt nicht übereinstimmende Passwörter ab", async () => {
    const result = await registerWithCredentials(
      buildFormData({ email: "new@example.com", password: "password123", confirmPassword: "password124" })
    );

    expect(result).toMatch(/stimmen nicht überein/);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("lehnt eine bereits registrierte E-Mail ab", async () => {
    dbMock.limitMock.mockResolvedValue([{ id: "existing-id" }]);

    const result = await registerWithCredentials(
      buildFormData({ email: "taken@example.com", password: "password123", confirmPassword: "password123" })
    );

    expect(result).toBe("Diese E-Mail ist bereits registriert.");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("fängt eine Unique-Constraint-Verletzung beim Insert ab (Race Condition)", async () => {
    dbMock.valuesMock.mockRejectedValue({ code: "23505" });

    const result = await registerWithCredentials(
      buildFormData({ email: "race@example.com", password: "password123", confirmPassword: "password123" })
    );

    expect(result).toBe("Diese E-Mail ist bereits registriert.");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("wirft andere Insert-Fehler weiter", async () => {
    dbMock.valuesMock.mockRejectedValue(new Error("boom"));

    await expect(
      registerWithCredentials(
        buildFormData({ email: "err@example.com", password: "password123", confirmPassword: "password123" })
      )
    ).rejects.toThrow("boom");
  });

  it("legt bei Erfolg einen user-Account mit gehashtem Passwort an und loggt ein", async () => {
    const result = await registerWithCredentials(
      buildFormData({
        name: "Neuer User",
        email: "new@example.com",
        password: "password123",
        confirmPassword: "password123",
      })
    );

    expect(result).toBeUndefined();
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const insertedValues = dbMock.valuesMock.mock.calls[0][0];
    expect(insertedValues.role).toBe("user");
    expect(insertedValues.email).toBe("new@example.com");
    expect(insertedValues.name).toBe("Neuer User");
    expect(insertedValues.passwordHash).not.toBe("password123");
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "new@example.com",
      password: "password123",
      redirectTo: "/",
    });
  });

  it("speichert name als null, wenn nicht angegeben", async () => {
    await registerWithCredentials(
      buildFormData({ email: "noname@example.com", password: "password123", confirmPassword: "password123" })
    );

    const insertedValues = dbMock.valuesMock.mock.calls[0][0];
    expect(insertedValues.name).toBeNull();
  });

  it("gibt eine Fehlermeldung zurück, wenn die automatische Anmeldung nach der Registrierung fehlschlägt", async () => {
    signInMock.mockRejectedValue(new AuthError("CredentialsSignin"));

    const result = await registerWithCredentials(
      buildFormData({ email: "new@example.com", password: "password123", confirmPassword: "password123" })
    );

    expect(result).toMatch(/manuell einloggen/);
  });

  it("wirft den internen Redirect-Throw von signIn weiter (kein Fehler-Handling)", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    signInMock.mockRejectedValue(redirectError);

    await expect(
      registerWithCredentials(
        buildFormData({ email: "new@example.com", password: "password123", confirmPassword: "password123" })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
