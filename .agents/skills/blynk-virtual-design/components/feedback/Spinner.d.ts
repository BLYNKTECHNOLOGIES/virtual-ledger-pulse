/** Indeterminate cyan ring, 600ms linear. Use for waits under ~3s; longer waits get skeletons. */
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
  tone?: "brand" | "inverse";
}
export declare function Spinner(props: SpinnerProps): JSX.Element;
