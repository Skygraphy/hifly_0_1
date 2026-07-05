import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, dbMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const selectMock = vi.fn(() => ({ from: () => ({ where: whereMock }) }));

  const updateWhereMock = vi.fn();
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  return {
    authMock: vi.fn(),
    dbMock: { select: selectMock, update: updateMock, limitMock, setMock },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { setUserAdminRole } = await import("./actions");

function mockTargetUser(role: "user" | "admin" | "super_admin" | null) {
  dbMock.limitMock.mockResolvedValue(role ? [{ role }] : []);
}

describe("setUserAdminRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lehnt ab, wenn niemand eingeloggt ist, und ändert nichts", async () => {
    authMock.mockResolvedValue(null);
    mockTargetUser("user");

    const result = await setUserAdminRole("target-id", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn der Ziel-User nicht existiert", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    mockTargetUser(null);

    const result = await setUserAdminRole("missing-id", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin die Aktion aufruft", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mockTargetUser("user");

    const result = await setUserAdminRole("target-id", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt Selbst-Änderung durch den super_admin ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    mockTargetUser("user");

    const result = await setUserAdminRole("super-1", "admin");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("lehnt die Vergabe der Rolle super_admin über diese Aktion ab", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    mockTargetUser("user");

    const result = await setUserAdminRole("target-id", "super_admin");

    expect(result.success).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, einen user zu admin zu machen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    mockTargetUser("user");

    const result = await setUserAdminRole("target-id", "admin");

    expect(result.success).toBe(true);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.setMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" })
    );
  });
});
