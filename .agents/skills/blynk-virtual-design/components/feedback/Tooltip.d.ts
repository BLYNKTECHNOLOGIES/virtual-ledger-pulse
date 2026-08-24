/** Ink hover label, 12px text, 6px radius, 8px offset. Never for essential information. */
export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: React.ReactNode;
  placement?: "top" | "bottom" | "right";
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
