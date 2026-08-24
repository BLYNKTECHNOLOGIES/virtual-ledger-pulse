/** Underline tab bar — 2px cyan rule under the active tab, 24px gaps. */
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Strings, or `{ value, label }` objects. */
  items?: Array<string | { value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}
export declare function Tabs(props: TabsProps): JSX.Element;
