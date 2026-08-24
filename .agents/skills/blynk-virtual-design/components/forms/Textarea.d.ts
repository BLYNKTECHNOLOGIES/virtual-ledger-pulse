/** Multi-line text control — same border/focus language as Input, vertical resize only. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  rows?: number;
}
export declare function Textarea(props: TextareaProps): JSX.Element;
