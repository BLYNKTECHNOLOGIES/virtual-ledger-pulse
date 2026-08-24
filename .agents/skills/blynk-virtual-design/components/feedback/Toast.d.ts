/** Transient confirmation on the ink surface; slides up 8px over 220ms. Bottom-right, one at a time. */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "success" | "danger";
  /** Lucide icon name, tinted by tone. */
  icon?: string;
  onDismiss?: () => void;
}
export declare function Toast(props: ToastProps): JSX.Element;
