import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StarRatingField } from "./star-rating-field";

describe("StarRatingField", () => {
  it("ruft onChange mit der angeklickten Sternzahl auf", () => {
    const onChange = vi.fn();
    render(
      <StarRatingField id="test" testId="test-rating" label="Web-Ranking" value={null} onChange={onChange} />
    );

    fireEvent.click(screen.getByTestId("test-rating-star-4"));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("setzt die Bewertung auf null zurück, wenn der bereits aktive Stern erneut angeklickt wird", () => {
    const onChange = vi.fn();
    render(
      <StarRatingField id="test" testId="test-rating" label="Web-Ranking" value={4} onChange={onChange} />
    );

    fireEvent.click(screen.getByTestId("test-rating-star-4"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("zeigt den aktuellen Wert als Text an", () => {
    render(
      <StarRatingField id="test" testId="test-rating" label="Web-Ranking" value={7} onChange={vi.fn()} />
    );

    expect(screen.getByTestId("test-rating-value")).toHaveTextContent("7/10");
  });

  it("zeigt einen Platzhalter, wenn keine Bewertung vorhanden ist", () => {
    render(
      <StarRatingField id="test" testId="test-rating" label="Web-Ranking" value={null} onChange={vi.fn()} />
    );

    expect(screen.getByTestId("test-rating-value")).toHaveTextContent("—");
  });

  it("ignoriert Klicks, wenn disabled gesetzt ist", () => {
    const onChange = vi.fn();
    render(
      <StarRatingField
        id="test"
        testId="test-rating"
        label="Druck-Ranking"
        value={null}
        onChange={onChange}
        disabled
      />
    );

    fireEvent.click(screen.getByTestId("test-rating-star-3"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
