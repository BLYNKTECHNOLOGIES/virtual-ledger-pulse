import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const body = await req.json();
    const supabase = getSupabase();

    if (path === 'challenge') {
      const { user_id, type } = body;
      if (!user_id || !type) {
        return new Response(JSON.stringify({ error: 'user_id and type required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const challenge = generateChallenge();

      const { error } = await supabase.rpc('store_webauthn_challenge', {
        p_user_id: user_id,
        p_challenge: challenge,
        p_type: type,
      });

      if (error) throw error;

      // Get existing credentials for authentication challenges
      let allowCredentials: { id: string }[] = [];
      if (type === 'authentication') {
        const { data: creds } = await supabase.rpc('get_webauthn_credentials', {
          p_user_id: user_id,
        });
        allowCredentials = (creds || []).map((c: { credential_id: string }) => ({
          id: c.credential_id,
        }));
      }

      return new Response(JSON.stringify({
        challenge,
        allowCredentials,
        rpId: url.hostname === 'localhost' ? 'localhost' : url.hostname,
        rpName: 'P2P Trading Terminal',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'register') {
      const { user_id, credential_id, public_key, challenge, device_name } = body;

      if (!user_id || !credential_id || !public_key || !challenge) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify and consume the challenge
      const { data: challengeValid } = await supabase.rpc('verify_and_consume_challenge', {
        p_user_id: user_id,
        p_challenge: challenge,
        p_type: 'registration',
      });

      if (!challengeValid) {
        return new Response(JSON.stringify({ error: 'Invalid or expired challenge' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Store the credential
      const { data: credId, error } = await supabase.rpc('store_webauthn_credential', {
        p_user_id: user_id,
        p_credential_id: credential_id,
        p_public_key: public_key,
        p_device_name: device_name || null,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, credential_id: credId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (path === 'verify') {
      const { user_id, credential_id, challenge, sign_count } = body;

      if (!user_id || !credential_id || !challenge) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify and consume the challenge
      const { data: challengeValid } = await supabase.rpc('verify_and_consume_challenge', {
        p_user_id: user_id,
        p_challenge: challenge,
        p_type: 'authentication',
      });

      if (!challengeValid) {
        return new Response(JSON.stringify({ error: 'Invalid or expired challenge' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify credential exists for user
      const { data: creds } = await supabase.rpc('get_webauthn_credentials', {
        p_user_id: user_id,
      });

      const matchedCred = (creds || []).find((c: { credential_id: string }) => c.credential_id === credential_id);
      if (!matchedCred) {
        return new Response(JSON.stringify({ error: 'Credential not found' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check sign_count to prevent replay
      if (sign_count !== undefined && sign_count <= matchedCred.sign_count) {
        return new Response(JSON.stringify({ error: 'Possible credential cloning detected' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update sign count
      await supabase.rpc('update_webauthn_sign_count', {
        p_credential_id: credential_id,
        p_sign_count: sign_count || matchedCred.sign_count + 1,
      });

      // Create biometric session
      const { data: sessionToken, error } = await supabase.rpc('create_terminal_biometric_session', {
        p_user_id: user_id,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, session_token: sessionToken }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('terminal-webauthn error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
