/** Filter chip — 6px radius (squarer than Badge), selectable and optionally removable. */
export interface TagProps {
  /** Selected state: cyan-50 fill, cyan-300 border. */
  selected?: boolean;
  /** Supply to render a trailing remove affordance. */
  onRemove?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Tag(props: TagProps): JSX.Element;
