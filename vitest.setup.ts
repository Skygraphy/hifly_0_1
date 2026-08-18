import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom hat keine echte Layout-Engine und implementiert daher weder
// ResizeObserver noch Element.scrollTo — beide werden zur Laufzeit im
// echten Browser von Komponenten mit Größen-/Scroll-Verhalten benötigt
// (z.B. useIsTruncated, useFittingCount, AdministrativeUnitColumnsView).
// In Tests genügt ein No-op, sonst crasht jede Komponente, die sie nutzt.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof Element.prototype.scrollTo === "undefined") {
  Element.prototype.scrollTo = () => {};
}
