import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BUCKET = 'kyc-documents';
const PREFIX = 'pending-kyc';
// Only consider files older than this many hours, so in-flight approvals
// (file uploaded, approval not yet clicked) are never touched.
const MIN_AGE_HOURS = 24;

interface StorageFile {
  name: string;
  created_at?: string;
  updated_at?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // 1) List all files in the pending-kyc temp folder (paginated).
    const allFiles: StorageFile[] = [];
    const pageSize = 100;
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(PREFIX, { limit: pageSize, offset, sortBy: { column: 'created_at', order: 'asc' } });
      if (error) throw error;
      const batch = (data ?? []) as StorageFile[];
      allFiles.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    if (allFiles.length === 0) {
      return new Response(JSON.stringify({ scanned: 0, deleted: 0, kept: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Keep only files old enough to be considered orphaned.
    const cutoff = Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000;
    const candidates = allFiles.filter((f) => {
      const ts = f.created_at ? new Date(f.created_at).getTime() : 0;
      return ts > 0 && ts < cutoff;
    });

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ scanned: allFiles.length, deleted: 0, kept: allFiles.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Build the set of referenced pending-kyc paths from every table that
    //    can store such a URL. A file is "referenced" if any record's URL
    //    contains the storage path "pending-kyc/<name>".
    const referenced = new Set<string>();
    const collect = (rows: { url: string | null }[]) => {
      for (const r of rows) {
        const u = r.url || '';
        const idx = u.indexOf(`${PREFIX}/`);
        if (idx >= 0) referenced.add(u.slice(idx)); // e.g. "pending-kyc/123_abc_file.jpg"
      }
    };

    const [kyc, bank, income] = await Promise.all([
      supabase.from('client_kyc_documents').select('file_url').ilike('file_url', `%${PREFIX}/%`),
      supabase.from('client_bank_details').select('statement_url').ilike('statement_url', `%${PREFIX}/%`),
      supabase.from('client_income_details').select('source_of_fund_url').ilike('source_of_fund_url', `%${PREFIX}/%`),
    ]);

    if (kyc.error) throw kyc.error;
    if (bank.error) throw bank.error;
    if (income.error) throw income.error;

    collect((kyc.data ?? []).map((r: any) => ({ url: r.file_url })));
    collect((bank.data ?? []).map((r: any) => ({ url: r.statement_url })));
    collect((income.data ?? []).map((r: any) => ({ url: r.source_of_fund_url })));

    // 4) Delete candidates whose path is not referenced anywhere.
    const toDelete: string[] = [];
    for (const f of candidates) {
      const path = `${PREFIX}/${f.name}`;
      if (!referenced.has(path)) toDelete.push(path);
    }

    let deleted = 0;
    // Remove in chunks to stay within request limits.
    const chunkSize = 100;
    for (let i = 0; i < toDelete.length; i += chunkSize) {
      const chunk = toDelete.slice(i, i + chunkSize);
      const { error } = await supabase.storage.from(BUCKET).remove(chunk);
      if (error) {
        console.error('Failed to remove chunk:', error);
      } else {
        deleted += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({
        scanned: allFiles.length,
        candidates: candidates.length,
        referenced: referenced.size,
        deleted,
        kept: allFiles.length - deleted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('cleanup-pending-kyc error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
