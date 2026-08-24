/**
 * Inline message banner — tinted fill, matching border, Lucide status glyph.
 * @startingPoint section="Feedback" subtitle="Alerts, toasts, tooltips and dialogs" viewport="700x320"
 */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "success" | "warning" | "danger";
  title?: React.ReactNode;
  /** Supply to render a dismiss affordance. */
  onDismiss?: () => void;
}
export declare function Alert(props: AlertProps): JSX.Element;
