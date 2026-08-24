/** Square icon-only control — same radius and heights as Button. `label` is required for a11y. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon name. */
  icon: string;
  size?: "sm" | "md" | "lg";
  variant?: "secondary" | "ghost" | "primary" | "inverse";
  /** Accessible name — always supply one. */
  label: string;
  disabled?: boolean;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
