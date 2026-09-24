/**
 * Standard exit/separation reasons used across HRMS (resignation initiation,
 * exit checklist, Separations & F&F cockpit step). Reasons are grouped into
 * Voluntary (employee-initiated) and Non-Voluntary (company-initiated) so the
 * picker is two-step and attrition reporting stays clean. "Other" reveals a
 * free-text input so unusual cases can still be recorded.
 */

export type SeparationGroup = "voluntary" | "non_voluntary";

export const SEPARATION_GROUPS: {
  key: SeparationGroup;
  label: string;
  otherLabel: string;
  reasons: string[];
}[] = [
  {
    key: "voluntary",
    label: "Voluntary (employee-initiated)",
    otherLabel: "Other (please specify)",
    reasons: [
      "Voluntary — Career growth",
      "Voluntary — Financial growth",
      "Voluntary — Higher studies",
      "Voluntary — Relocation",
      "Voluntary — Health / personal / family",
      "Voluntary — Work-life balance",
      "Voluntary — Work culture / manager issues",
      "Voluntary — Career change",
      "Voluntary — Retirement",
    ],
  },
  {
    key: "non_voluntary",
    label: "Non-Voluntary (company-initiated)",
    otherLabel: "Other (company-initiated)",
    reasons: [
      "Non-Voluntary — Termination: misconduct",
      "Non-Voluntary — Termination: poor performance",
      "Non-Voluntary — Non-confirmation of probation",
      "Non-Voluntary — Retrenchment / layoff",
      "Non-Voluntary — End of contract",
      "Non-Voluntary — Medical incapacity",
      "Non-Voluntary — Mutual separation",
    ],
  },
];

/** Flat list of every standard reason (both groups). */
export const SEPARATION_REASONS: string[] = SEPARATION_GROUPS.flatMap((g) => g.reasons);

/** Sentinel values for the per-group "Other" option (reveals free text). */
export const SEPARATION_OTHER_LABELS: string[] = SEPARATION_GROUPS.map((g) => g.otherLabel);

/** @deprecated legacy sentinel — kept so older imports keep compiling. */
export const SEPARATION_REASON_OTHER = "Other (specify)";

/** Which group a stored reason belongs to, or null for legacy/custom values. */
export function separationGroupOf(reason: string): SeparationGroup | null {
  for (const g of SEPARATION_GROUPS) {
    if (g.reasons.includes(reason) || g.otherLabel === reason) return g.key;
  }
  return null;
}
