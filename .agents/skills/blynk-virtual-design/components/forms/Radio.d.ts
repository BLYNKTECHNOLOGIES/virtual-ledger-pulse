/** Single radio — 18px circle, cyan 9px dot when selected. Use for 2–3 exclusive options. */
export interface RadioProps {
  checked?: boolean;
  onChange?: (value: string) => void;
  value?: string;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function Radio(props: RadioProps): JSX.Element;
