/** Label + hint/error scaffolding around a form control. Error text replaces hint text. */
export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  /** Helper copy under the control. */
  hint?: string;
  /** Error copy — replaces `hint` and turns red. */
  error?: string;
  required?: boolean;
  htmlFor?: string;
}
export declare function Field(props: FieldProps): JSX.Element;
