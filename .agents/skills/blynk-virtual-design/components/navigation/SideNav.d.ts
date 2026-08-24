/**
 * Application navigation rail on the ink surface — 232px wide, 40px items, cyan-tinted active row.
 * @startingPoint section="Navigation" subtitle="App rail, tabs and top bar" viewport="700x340"
 */
export interface SideNavProps extends React.HTMLAttributes<HTMLElement> {
  /** `{ value, label, icon, badge? }` — `icon` is a Lucide name. */
  items?: Array<{ value: string; label: string; icon: string; badge?: string | number }>;
  value?: string;
  onChange?: (value: string) => void;
  /** Rendered pinned to the bottom (account row, version stamp). */
  footer?: React.ReactNode;
  width?: number;
}
export declare function SideNav(props: SideNavProps): JSX.Element;
