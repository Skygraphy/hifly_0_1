import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import Home from "./page";

describe("Home", () => {
  it("renders the HiFly heading", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "HiFly" })).toBeInTheDocument();
  });
});
