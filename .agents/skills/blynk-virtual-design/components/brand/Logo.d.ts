/**
 * Official Blynk Virtual Technologies lockup — horizontal wordmark or the standalone mark.
 * Never re-typeset or redraw the wordmark; always render this component.
 * @startingPoint section="Brand" subtitle="Logo lockups and clear-space rules" viewport="700x220"
 */
export interface LogoProps {
  /** `full` = mark + wordmark lockup; `mark` = the two-block glyph alone. */
  variant?: "full" | "mark";
  /** `dark` uses the black wordmark (light backgrounds); `light` uses the white wordmark. */
  tone?: "dark" | "light";
  /** Rendered height in px. Minimum 20px for `full`, 16px for `mark`. */
  height?: number;
  /** Path prefix to the design-system root, e.g. `".."` from a one-level-deep page. */
  assetBase?: string;
  alt?: string;
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
