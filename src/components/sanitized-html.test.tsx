import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SanitizedHtml } from "./sanitized-html";

describe("SanitizedHtml", () => {
  it("lässt erlaubte TipTap-Tags unverändert", () => {
    const { container } = render(<SanitizedHtml html="<p>Hallo <strong>Welt</strong></p>" />);
    expect(container.innerHTML).toContain("<p>Hallo <strong>Welt</strong></p>");
  });

  it("entfernt script-Tags und Event-Handler-Attribute", () => {
    const { container } = render(<SanitizedHtml html='<p onclick="alert(1)">Text</p><script>alert(2)</script>' />);
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).not.toContain("onclick");
    expect(container.innerHTML).toContain("Text");
  });

  it("entfernt nicht erlaubte Attribute (z.B. class/style) von erlaubten Tags", () => {
    const { container } = render(<SanitizedHtml html='<p class="evil" style="color:red">Text</p>' />);
    expect(container.innerHTML).not.toContain("class=");
    expect(container.innerHTML).not.toContain("style=");
  });
});
