/** Renders a Lucide glyph at the Blynk default of 20px / 1.75px stroke. */
export interface IconProps {
  /** Lucide icon name in kebab-case, e.g. `"activity"`, `"chevron-right"`, `"cpu"`. */
  name: string;
  /** Box size in px. 16 for inline text, 20 default, 24 for nav, 32+ for feature marks. */
  size?: number;
  /** Stroke width. Keep 1.75 unless the icon sits above 32px (then 1.5). */
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;
