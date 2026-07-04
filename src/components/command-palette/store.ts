/**
 * Lightweight decoupled opener for the global command palette.
 * Any component (e.g. the header ⌘K button) can trigger the palette
 * without prop-drilling or context. Read-only UI event — no business logic.
 */
const OPEN_EVENT = "command-palette:open";

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

export function subscribeCommandPalette(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
