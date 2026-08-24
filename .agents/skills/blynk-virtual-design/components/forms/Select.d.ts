/** Native select styled to Input's spec, with a Lucide `chevron-down` affordance. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Strings, or `{ value, label }` objects. */
  options?: Array<string | { value: string; label: string }>;
  invalid?: boolean;
}
export declare function Select(props: SelectProps): JSX.Element;
