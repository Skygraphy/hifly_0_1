import { describe, expect, it } from "vitest";
import { isOverLimit, nextAnonViewState, readAnonViewState, type AnonViewState } from "./anon-view-tracking";

const MINUTE_MS = 60_000;

describe("readAnonViewState", () => {
  it("liefert null für ein fehlendes Cookie", () => {
    expect(readAnonViewState(undefined)).toBeNull();
  });

  it("liefert null für kaputtes/manipuliertes JSON", () => {
    expect(readAnonViewState("nicht-json")).toBeNull();
    expect(readAnonViewState('{"count":"drei"}')).toBeNull();
    expect(readAnonViewState('{"count":1}')).toBeNull();
  });

  it("parst ein gültiges Cookie", () => {
    expect(readAnonViewState('{"count":3,"windowStart":1000}')).toEqual({ count: 3, windowStart: 1000 });
  });
});

describe("nextAnonViewState", () => {
  it("startet ein neues Fenster, wenn noch nichts gezählt wurde", () => {
    expect(nextAnonViewState(null, 30, 1000)).toEqual({ count: 1, windowStart: 1000 });
  });

  it("zählt innerhalb des Fensters hoch, windowStart bleibt gleich", () => {
    const state: AnonViewState = { count: 5, windowStart: 1000 };
    expect(nextAnonViewState(state, 30, 1000 + 5 * MINUTE_MS)).toEqual({ count: 6, windowStart: 1000 });
  });

  it("startet nach Ablauf des Fensters neu bei 1", () => {
    const state: AnonViewState = { count: 25, windowStart: 0 };
    const now = 31 * MINUTE_MS; // 1 Minute über einem 30-Minuten-Fenster
    expect(nextAnonViewState(state, 30, now)).toEqual({ count: 1, windowStart: now });
  });

  it("genau an der Fenstergrenze gilt das Fenster noch NICHT als abgelaufen", () => {
    const state: AnonViewState = { count: 10, windowStart: 0 };
    const now = 30 * MINUTE_MS; // exakt die Fenstergröße
    expect(nextAnonViewState(state, 30, now)).toEqual({ count: 11, windowStart: 0 });
  });

  it("eine Millisekunde über der Fenstergröße gilt als abgelaufen", () => {
    const state: AnonViewState = { count: 10, windowStart: 0 };
    const now = 30 * MINUTE_MS + 1;
    expect(nextAnonViewState(state, 30, now)).toEqual({ count: 1, windowStart: now });
  });
});

describe("isOverLimit", () => {
  it("ist nie gesperrt ohne vorherigen Zustand", () => {
    expect(isOverLimit(null, 25, 30, 1000)).toBe(false);
  });

  it("ist gesperrt, sobald die Grenze innerhalb des Fensters erreicht ist", () => {
    const state: AnonViewState = { count: 25, windowStart: 0 };
    expect(isOverLimit(state, 25, 30, 1 * MINUTE_MS)).toBe(true);
  });

  it("ist NICHT gesperrt, solange die Grenze noch nicht erreicht ist", () => {
    const state: AnonViewState = { count: 24, windowStart: 0 };
    expect(isOverLimit(state, 25, 30, 1 * MINUTE_MS)).toBe(false);
  });

  it("ist nicht mehr gesperrt, sobald das Fenster abgelaufen ist", () => {
    const state: AnonViewState = { count: 25, windowStart: 0 };
    expect(isOverLimit(state, 25, 30, 31 * MINUTE_MS)).toBe(false);
  });
});
