import { describe, expect, it, vi, beforeEach } from "vitest";

const { authMock, runScriptMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  runScriptMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/run-flow-walkthrough-script", () => ({ runFlowWalkthroughScript: runScriptMock }));

const { runFlowWalkthroughAction } = await import("./flow-report-actions");

describe("runFlowWalkthroughAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runScriptMock.mockResolvedValue("<html>report</html>");
  });

  it("lehnt ab, wenn niemand eingeloggt ist, und startet kein Skript", async () => {
    authMock.mockResolvedValue(null);

    const result = await runFlowWalkthroughAction();

    expect(result.success).toBe(false);
    expect(runScriptMock).not.toHaveBeenCalled();
  });

  it("lehnt ab, wenn ein plain admin es versucht", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });

    const result = await runFlowWalkthroughAction();

    expect(result.success).toBe(false);
    expect(runScriptMock).not.toHaveBeenCalled();
  });

  it("erlaubt dem super_admin, den Walkthrough auszulösen", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });

    const result = await runFlowWalkthroughAction();

    expect(result.success).toBe(true);
    expect(result.outputDir).toMatch(/^flow-reports[\\/]/);
    expect(result.reportHtml).toBe("<html>report</html>");
    expect(runScriptMock).toHaveBeenCalledTimes(1);
    expect(runScriptMock.mock.calls[0][0]).toContain("flow-reports");
  });

  it("gibt eine Fehlermeldung zurück, wenn das Skript fehlschlägt", async () => {
    authMock.mockResolvedValue({ user: { id: "super-1", role: "super_admin" } });
    runScriptMock.mockRejectedValue(new Error("boom"));

    const result = await runFlowWalkthroughAction();

    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });
});
