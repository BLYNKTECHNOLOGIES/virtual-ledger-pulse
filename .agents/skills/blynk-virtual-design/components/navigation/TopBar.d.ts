/** Sticky 64px page header with glass fill, breadcrumb, title, search and an actions slot. */
export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  title?: React.ReactNode;
  /** Ancestor labels rendered above the title, chevron-separated. */
  breadcrumb?: string[];
  /** Right-aligned node — usually Buttons / IconButtons. */
  actions?: React.ReactNode;
  /** Supply to render the pill search field. */
  onSearch?: (query: string) => void;
}
export declare function TopBar(props: TopBarProps): JSX.Element;
