import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// forwardRef statt einer einfachen Funktionskomponente: Aufrufer brauchen
// gelegentlich Zugriff auf das native <input> (z.B. um nach einem
// programmatisch gesetzten value die Cursor-/Scrollposition zurückzusetzen,
// siehe image-edit-dialog.tsx).
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function Input(
  { className, type, ...props },
  ref
) {
  return (
    <InputPrimitive
      ref={ref}
      type={type}
      data-slot="input"
      // Kein focus-visible:ring/aria-invalid:ring (box-shadow) — folgt bei
      // border-radius sichtbar eckiger als der Rand selbst und wirkt dann
      // wie ein über den Rand hinauslaufender Hintergrund. Fokus/Fehler
      // zeigen sich stattdessen allein über die Randfarbe
      // (focus-visible:border-ring / aria-invalid:border-destructive).
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50",
        className
      )}
      {...props}
    />
  )
})

export { Input }
