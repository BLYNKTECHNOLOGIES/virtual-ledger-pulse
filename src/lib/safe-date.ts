import { format } from 'date-fns';

/**
 * Coerce arbitrary date-like values (Date, ms number, ISO string, or a numeric
 * epoch string like "1730000000000") into a valid Date, or null when unparseable.
 * `new Date("1730000000000")` is Invalid in JS, so numeric strings are handled here.
 */
export function toValidDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  let candidate: Date;
  if (value instanceof Date) {
    candidate = value;
  } else if (typeof value === 'number') {
    candidate = new Date(value);
  } else if (typeof value === 'string') {
    candidate = /^\d+$/.test(value.trim()) ? new Date(Number(value)) : new Date(value);
  } else {
    return null;
  }
  return isNaN(candidate.getTime()) ? null : candidate;
}

/** Safe date-fns format that returns a fallback instead of throwing on invalid input. */
export function safeFormat(value: unknown, pattern: string, fallback = '—'): string {
  const d = toValidDate(value);
  return d ? format(d, pattern) : fallback;
}
