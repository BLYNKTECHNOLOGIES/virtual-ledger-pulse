import { useEffect, useRef, useState } from "react"

/**
 * useValueFlash — returns a className that briefly highlights an element
 * whenever the watched value changes, signalling a live/synced update.
 *
 * Usage:
 *   const flash = useValueFlash(order.buyVolume)
 *   <span className={flash}>{order.buyVolume}</span>
 */
export function useValueFlash(value: unknown, variant: "value" | "row" = "value") {
  const prev = useRef(value)
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      setFlashing(true)
      const t = setTimeout(() => setFlashing(false), 1200)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value])

  if (!flashing) return ""
  return variant === "row" ? "row-flash" : "value-flash"
}
