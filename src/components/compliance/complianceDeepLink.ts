/**
 * Deep-link routing for the compliance activity feed.
 * Maps an audit-log source table to the tab / sub-tab that renders it,
 * so a feed entry can jump straight to the record it refers to.
 */
export type ComplianceTarget = {
  tab: string;
  sub?: string;
  /** Record ids are rendered as `tx-row-<id>` and highlighted by useDeepLinkHighlight */
  focusable: boolean;
};

export const COMPLIANCE_TARGETS: Record<string, ComplianceTarget> = {
  bank_cases: { tab: "banking", sub: "cases", focusable: true },
  account_investigations: { tab: "banking", sub: "active-investigations", focusable: true },
  bank_communications: { tab: "banking", sub: "bank-communications", focusable: true },
  compliance_documents: { tab: "legal", sub: "documents", focusable: true },
  // Case updates are child rows of a bank case — land on the cases list.
  compliance_case_updates: { tab: "banking", sub: "cases", focusable: false },
};

export function buildComplianceLink(source: string, recordId: string | null): string | null {
  const target = COMPLIANCE_TARGETS[source];
  if (!target) return null;
  const params = new URLSearchParams();
  params.set("tab", target.tab);
  if (target.sub) params.set("sub", target.sub);
  if (target.focusable && recordId) params.set("focus", recordId);
  return `/compliance?${params.toString()}`;
}
