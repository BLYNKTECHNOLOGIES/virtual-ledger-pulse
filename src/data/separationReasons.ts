/**
 * Standard exit/separation reasons used across HRMS (resignation initiation,
 * exit checklist, Separations & F&F cockpit step). "Other" reveals a free-text
 * input so unusual cases can still be recorded.
 */
export const SEPARATION_REASONS: string[] = [
  "Resignation — Better opportunity",
  "Resignation — Personal / family reasons",
  "Resignation — Health reasons",
  "Resignation — Higher education",
  "Resignation — Relocation",
  "Absconding / abandonment of service",
  "Termination — Performance",
  "Termination — Misconduct / disciplinary",
  "Probation not confirmed",
  "Mutual separation",
  "End of contract",
  "Retirement",
];

export const SEPARATION_REASON_OTHER = "Other (specify)";
