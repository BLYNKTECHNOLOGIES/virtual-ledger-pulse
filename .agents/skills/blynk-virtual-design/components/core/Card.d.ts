/**
 * Surface container — 14px radius, hairline `--border-subtle`, `--shadow-sm`.
 * Cards never use a coloured left border; use `tone="brand"` for emphasis instead.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "flat" | "sunken" | "inverse" | "brand";
  /** Inner padding in px. 24 default, 16 dense, 32 marketing. */
  padding?: number;
  /** Lift + deepen shadow on hover (for clickable cards). */
  interactive?: boolean;
}
export declare function Card(props: CardProps): JSX.Element;
