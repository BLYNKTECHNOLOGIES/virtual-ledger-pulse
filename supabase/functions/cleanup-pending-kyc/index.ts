import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// ============================================================================
// DISABLED ON PURPOSE.
//
// This job previously deleted "orphaned" files from a temporary `pending-kyc/`
// storage folder. That design was dangerous: KYC documents (Aadhaar, Binance ID
// screenshots, vKYC recordings) are legally/operationally critical and must
// NEVER be auto-deleted. A single missed reference table would permanently
// destroy a real client document, forcing us to re-request it from the
// counterparty.
//
// KYC uploads now write directly to a PERMANENT `kyc/` path (see
// src/lib/kyc-background-upload.ts) and nothing prunes them. This function is
// kept only as an inert stub so any stale trigger/cron cannot delete files.
// It performs NO storage deletions.
// ============================================================================

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      disabled: true,
      deleted: 0,
      message:
        'cleanup-pending-kyc is permanently disabled. KYC documents are never auto-deleted.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
