"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SCROLL_THRESHOLD = 600;

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SCROLL_THRESHOLD);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Nach oben scrollen"
      data-testid="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(buttonVariants({ variant: "secondary", size: "icon-lg" }), "fixed bottom-6 right-6 z-30 rounded-full shadow-lg")}
    >
      <ArrowUp className="size-4" />
    </button>
  );
}
