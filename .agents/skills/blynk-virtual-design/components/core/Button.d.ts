/**
 * The Blynk action control: 10px radius, semibold Manrope label, cyan primary fill.
 * @startingPoint section="Core" subtitle="Buttons, icon buttons, badges and tags" viewport="700x260"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` cyan fill · `secondary` white/bordered · `ink` black fill · `ghost` text-only · `danger` destructive. */
  variant?: "primary" | "secondary" | "ink" | "ghost" | "danger";
  /** 32 / 40 / 48px tall. */
  size?: "sm" | "md" | "lg";
  /** Lucide icon name rendered before the label. */
  iconLeft?: string;
  /** Lucide icon name rendered after the label. */
  iconRight?: string;
  /** Fill the container width. */
  block?: boolean;
  disabled?: boolean;
}
export declare function Button(props: ButtonProps): JSX.Element;
