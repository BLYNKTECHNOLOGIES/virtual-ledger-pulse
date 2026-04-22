#!/usr/bin/env bash
# CI guardrail: fail the build if any client code mutates bank_transactions directly.
# The bank ledger is append-only — all reversals must go through reverse_bank_transaction RPC.
set -euo pipefail

PATTERN="from\(['\"]bank_transactions['\"]\)\.(delete|update)\("
ROOT="${1:-src}"

# Find offending lines (exclude this script itself)
HITS=$(grep -REn "$PATTERN" "$ROOT" --include='*.ts' --include='*.tsx' || true)

if [ -n "$HITS" ]; then
  echo "❌ Bank ledger immutability violation detected:" >&2
  echo "$HITS" >&2
  echo "" >&2
  echo "bank_transactions is append-only. Use:" >&2
  echo "  supabase.rpc('reverse_bank_transaction', { p_original_id, p_reason })" >&2
  echo "followed by a fresh INSERT instead of .delete() or .update()." >&2
  exit 1
fi

echo "✅ No direct bank_transactions mutations found in $ROOT"
