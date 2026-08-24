/** Status pill — 22px tall, fully rounded, tinted background with a matching dark label. */
export interface BadgeProps {
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "ink";
  /** Leading 6px dot, for live status readouts. */
  dot?: boolean;
  /** Lucide icon name shown before the label. */
  icon?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;
