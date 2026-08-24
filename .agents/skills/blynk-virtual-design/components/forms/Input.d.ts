/**
 * Single-line text control — 40px tall, 10px radius, cyan border + 3px ring on focus.
 * @startingPoint section="Core" subtitle="Inputs, selects, toggles and choices" viewport="700x300"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Lucide icon name shown inside the left edge. */
  iconLeft?: string;
  /** Red border for validation failure. */
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
}
export declare function Input(props: InputProps): JSX.Element;
