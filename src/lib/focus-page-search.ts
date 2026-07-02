/**
 * Focus the search / filter input of whatever page the user is currently on.
 *
 * Resolution order:
 *  1. An element explicitly tagged with `data-page-search` (preferred — pages opt in).
 *  2. The first visible `input[type="search"]`.
 *  3. The first visible text input whose placeholder mentions "search".
 *
 * Returns true if an input was found and focused.
 */
function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

export function focusPageSearch(): boolean {
  const candidates: HTMLElement[] = [];

  const tagged = Array.from(
    document.querySelectorAll<HTMLElement>("[data-page-search]"),
  );
  candidates.push(...tagged);

  const searchInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="search"]'),
  );
  candidates.push(...searchInputs);

  const placeholderInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("input[placeholder]"),
  ).filter((el) => /search/i.test(el.placeholder));
  candidates.push(...placeholderInputs);

  for (const el of candidates) {
    if (!isVisible(el)) continue;
    // The tagged element may be a wrapper — find the actual input inside it.
    const input =
      el instanceof HTMLInputElement
        ? el
        : el.querySelector<HTMLInputElement>("input");
    if (!input || !isVisible(input)) continue;

    input.scrollIntoView({ block: "center", behavior: "smooth" });
    input.focus({ preventScroll: true });
    input.select?.();
    return true;
  }

  return false;
}
