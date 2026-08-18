"use client"

import * as React from "react"
import { ChevronUp, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "./input"

/**
 * type="number" mit den nativen (grauen, browserabhängig unauffälligen)
 * Spinner-Pfeilen ausgeblendet, ersetzt durch ein permanent sichtbares,
 * in der Markenfarbe eingefärbtes Pfeil-Paar direkt neben dem Feld (auf
 * Wunsch des Users, für alle Zahlenfelder der App). Klick ruft die native
 * input.stepUp()/stepDown() auf (respektiert min/max/step automatisch wie
 * der native Spinner) und feuert danach manuell ein "input"-Event — ohne
 * das würde React den von stepUp/stepDown direkt am DOM-Node gesetzten
 * Wert nicht bemerken und der kontrollierte onChange-Handler des Aufrufers
 * nie auslösen. Dadurch bleiben alle bestehenden onChange-Handler
 * (`Number(event.target.value)`) an den Aufrufstellen unverändert gültig.
 */
const NumberInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  function NumberInput({ className, disabled, ...props }, forwardedRef) {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

    function step(direction: 1 | -1) {
      const input = innerRef.current
      if (!input) return
      if (direction === 1) input.stepUp()
      else input.stepDown()
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }

    return (
      <div className={cn("flex items-stretch", className)}>
        <Input
          ref={innerRef}
          type="number"
          disabled={disabled}
          className="rounded-r-none border-r-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          {...props}
        />
        <div className="flex w-5 shrink-0 flex-col overflow-hidden rounded-r-lg border border-input">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Erhöhen"
            disabled={disabled}
            onClick={() => step(1)}
            className="flex flex-1 items-center justify-center border-b border-input text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronUp className="size-3" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Verringern"
            disabled={disabled}
            onClick={() => step(-1)}
            className="flex flex-1 items-center justify-center text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronDown className="size-3" />
          </button>
        </div>
      </div>
    )
  }
)

export { NumberInput }
