import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagInputField } from "./tag-input-field";

describe("TagInputField", () => {
  it("fügt einen Chip per Enter hinzu und leert den Entwurf", () => {
    const onChange = vi.fn();
    render(
      <TagInputField id="test" testId="test-input" label="Tags" values={[]} onChange={onChange} />
    );

    const input = screen.getByTestId("test-input");
    fireEvent.change(input, { target: { value: "Neu" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["Neu"]);
    expect(input).toHaveValue("");
  });

  it("ignoriert exakte Duplikate", () => {
    const onChange = vi.fn();
    render(
      <TagInputField id="test" testId="test-input" label="Tags" values={["Vorhanden"]} onChange={onChange} />
    );

    const input = screen.getByTestId("test-input");
    fireEvent.change(input, { target: { value: "Vorhanden" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("entfernt genau den angeklickten Chip über sein eigenes ×", () => {
    const onChange = vi.fn();
    render(
      <TagInputField id="test" testId="test-input" label="Tags" values={["Eins", "Zwei"]} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: '"Eins" entfernen' }));

    expect(onChange).toHaveBeenCalledWith(["Zwei"]);
  });

  it("entfernt den letzten Chip per Backspace bei leerem Entwurf", () => {
    const onChange = vi.fn();
    render(
      <TagInputField id="test" testId="test-input" label="Tags" values={["Eins", "Zwei"]} onChange={onChange} />
    );

    fireEvent.keyDown(screen.getByTestId("test-input"), { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(["Eins"]);
  });

  it("Backspace bei nicht-leerem Entwurf entfernt keinen Chip", () => {
    const onChange = vi.fn();
    render(
      <TagInputField id="test" testId="test-input" label="Tags" values={["Eins"]} onChange={onChange} />
    );

    const input = screen.getByTestId("test-input");
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
