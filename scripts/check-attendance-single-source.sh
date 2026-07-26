#!/usr/bin/env bash
# V1 guard: fail if anything outside the sanctioned hook reads attendance
# state directly from the raw canonical tables. All surfaces must read
# `hr_attendance_day_v` via `src/hooks/hrms/useAttendanceDay.ts`.
#
# Allowed callers (whitelist):
#   • src/hooks/hrms/useAttendanceDay.ts        (the sanctioned reader)
#   • src/integrations/supabase/types.ts        (generated types, harmless)
#   • src/lib/hrms/statutoryCalculator.ts       (payroll — reads whole month,
#                                                stays on hr_lop_days)
#   • supabase/**                               (edge functions / migrations)
#
# Anything else touching hr_attendance_daily or hr_lop_days is a bug: add it
# to the whitelist or route it through the hook.

set -euo pipefail

ALLOW='^(src/hooks/hrms/useAttendanceDay\.ts|src/hooks/hrms/useShadowReadiness\.ts|src/integrations/supabase/types\.ts|src/lib/hrms/statutoryCalculator\.ts|supabase/)'

# Only actual table/RPC access counts as a violation — comments, query-key
# strings, and doc references are fine. Match: .from('hr_attendance_daily'),
# .from("hr_attendance_daily"), .rpc('hr_lop_days'…), .rpc("hr_lop_days"…).
PATTERN="\.from\(['\"]hr_attendance_daily['\"]\)|\.rpc\(['\"]hr_lop_days['\"]"
matches=$(rg -l "$PATTERN" src/ supabase/ 2>/dev/null || true)

fail=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if [[ ! "$file" =~ $ALLOW ]]; then
    echo "❌ V1 guard: $file reads a raw attendance table directly."
    echo "   Route it through useAttendanceDay / useAttendanceDayRange"
    echo "   (src/hooks/hrms/useAttendanceDay.ts) instead."
    fail=1
  fi
done <<< "$matches"

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "One or more surfaces bypass the canonical attendance view."
  echo "See docs/attendance/SINGLE_SOURCE.md for the doctrine."
  exit 1
fi

echo "✅ V1 guard: all attendance reads route through hr_attendance_day_v."
