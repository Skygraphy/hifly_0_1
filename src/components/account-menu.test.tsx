import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

vi.mock("./account-menu-actions", () => ({ signOutAction: vi.fn() }));
vi.mock("./flow-report-actions", () => ({ runFlowWalkthroughAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Das Öffnen des Dropdowns selbst (Base UI Menu, Popup/Positionierung) lässt
// sich in jsdom nicht zuverlässig simulieren — diese Interaktion wird durch
// e2e/account-menu.spec.ts in einem echten Browser abgedeckt. Hier wird nur
// die reine Verzweigungslogik (eingeloggt/nicht eingeloggt) geprüft.
describe("AccountMenu", () => {
  it("zeigt einen Login-Link, wenn kein User eingeloggt ist", () => {
    render(<AccountMenu user={null} />);
    const link = screen.getByTestId("login-link");
    expect(link).toHaveAttribute("href", "/login");
    expect(screen.queryByTestId("account-menu-trigger")).not.toBeInTheDocument();
  });

  it("zeigt den Avatar-Trigger, wenn ein User eingeloggt ist", () => {
    render(<AccountMenu user={{ email: "u@example.com", role: "user" }} />);
    expect(screen.getByTestId("account-menu-trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("login-link")).not.toBeInTheDocument();
  });
});
