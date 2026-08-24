/** Centred modal — 20px radius, 28px padding, `--shadow-xl`, blurred scrim, 220ms pop-in. */
export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  title?: React.ReactNode;
  /** Muted sub-line under the title. */
  description?: React.ReactNode;
  /** Right-aligned action row — cancel first, primary last. */
  footer?: React.ReactNode;
  onClose?: () => void;
  width?: number;
}
export declare function Dialog(props: DialogProps): JSX.Element;
