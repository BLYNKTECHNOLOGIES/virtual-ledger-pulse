import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Simple in-memory rate limiter (per edge function instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 requests per minute per user

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

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

function errorResponse(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logBiometricEvent(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  actionType: string,
  description: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.rpc('log_biometric_event', {
      p_user_id: userId,
      p_action_type: actionType,
      p_description: description,
      p_metadata: metadata,
    });
  } catch (e) {
    console.error('Failed to log biometric event:', e);
  }
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

    // === SECURITY: Validate user_id is a valid UUID ===
    const userId = body.user_id;
    if (!userId || !UUID_REGEX.test(userId)) {
      return errorResponse('Invalid or missing user_id', 400);
    }

    // === SECURITY: Rate limiting ===
    if (isRateLimited(userId)) {
      await logBiometricEvent(supabase, userId, 'BIOMETRIC_RATE_LIMITED',
        'Rate limit exceeded for biometric operations');
      return errorResponse('Too many requests. Try again later.', 429);
    }

    // === SECURITY: Verify user has terminal access ===
    const { data: hasAccess } = await supabase.rpc('verify_terminal_access', {
      p_user_id: userId,
    });
    if (!hasAccess) {
      await logBiometricEvent(supabase, userId, 'BIOMETRIC_ACCESS_DENIED',
        'Attempted biometric operation without terminal access');
      return errorResponse('No terminal access', 403);
    }

    // =================== CHALLENGE ===================
    if (path === 'challenge') {
      const { type } = body;
      if (!type || !['registration', 'authentication'].includes(type)) {
        return errorResponse('Invalid challenge type', 400);
      }

      const challenge = generateChallenge();

      const { error } = await supabase.rpc('store_webauthn_challenge', {
        p_user_id: userId,
        p_challenge: challenge,
        p_type: type,
      });

      if (error) throw error;

      let allowCredentials: { id: string }[] = [];
      if (type === 'authentication') {
        const { data: creds } = await supabase.rpc('get_webauthn_credentials', {
          p_user_id: userId,
        });

        if (!creds || creds.length === 0) {
          return errorResponse('No registered biometric credentials found. Register first.', 403);
        }

        allowCredentials = creds.map((c: { credential_id: string }) => ({
          id: c.credential_id,
        }));
      }

      return jsonResponse({
        challenge,
        allowCredentials,
        rpId: url.hostname === 'localhost' ? 'localhost' : url.hostname,
        rpName: 'P2P Trading Terminal',
      });
    }

    // =================== REGISTER ===================
    if (path === 'register') {
      const { credential_id, public_key, challenge, device_name } = body;

      if (!credential_id || !public_key || !challenge) {
        return errorResponse('Missing required fields', 400);
      }

      // Verify and consume the challenge
      const { data: challengeValid } = await supabase.rpc('verify_and_consume_challenge', {
        p_user_id: userId,
        p_challenge: challenge,
        p_type: 'registration',
      });

      if (!challengeValid) {
        await logBiometricEvent(supabase, userId, 'BIOMETRIC_REGISTER_FAILED',
          'Invalid or expired challenge during registration');
        return errorResponse('Invalid or expired challenge', 403);
      }

      // Store the credential
      const { data: credId, error } = await supabase.rpc('store_webauthn_credential', {
        p_user_id: userId,
        p_credential_id: credential_id,
        p_public_key: public_key,
        p_device_name: device_name || null,
      });

      if (error) throw error;

      await logBiometricEvent(supabase, userId, 'BIOMETRIC_REGISTERED',
        `Biometric credential registered: ${device_name || 'Unknown device'}`, {
          credential_db_id: credId,
          device_name: device_name || null,
        });

      return jsonResponse({ success: true, credential_id: credId });
    }

    // =================== VERIFY ===================
    if (path === 'verify') {
      const { credential_id, challenge, sign_count } = body;

      if (!credential_id || !challenge) {
        return errorResponse('Missing required fields', 400);
      }

      // Verify and consume the challenge
      const { data: challengeValid } = await supabase.rpc('verify_and_consume_challenge', {
        p_user_id: userId,
        p_challenge: challenge,
        p_type: 'authentication',
      });

      if (!challengeValid) {
        await logBiometricEvent(supabase, userId, 'BIOMETRIC_AUTH_FAILED',
          'Invalid or expired challenge during authentication');
        return errorResponse('Invalid or expired challenge', 403);
      }

      // Verify credential exists for user
      const { data: creds } = await supabase.rpc('get_webauthn_credentials', {
        p_user_id: userId,
      });

      const matchedCred = (creds || []).find(
        (c: { credential_id: string }) => c.credential_id === credential_id
      );
      if (!matchedCred) {
        await logBiometricEvent(supabase, userId, 'BIOMETRIC_AUTH_FAILED',
          'Credential not found for user', { credential_id });
        return errorResponse('Credential not found', 403);
      }

      // Check sign_count to prevent replay / cloning
      if (sign_count !== undefined && sign_count !== null && sign_count <= matchedCred.sign_count) {
        await logBiometricEvent(supabase, userId, 'BIOMETRIC_CLONE_DETECTED',
          'Possible authenticator cloning detected - sign_count regression', {
            expected_min: matchedCred.sign_count + 1,
            received: sign_count,
          });
        return errorResponse('Possible credential cloning detected', 403);
      }

      // Update sign count
      await supabase.rpc('update_webauthn_sign_count', {
        p_credential_id: credential_id,
        p_sign_count: sign_count ?? matchedCred.sign_count + 1,
      });

      // Create biometric session
      const { data: sessionToken, error } = await supabase.rpc('create_terminal_biometric_session', {
        p_user_id: userId,
      });

      if (error) throw error;

      await logBiometricEvent(supabase, userId, 'BIOMETRIC_AUTH_SUCCESS',
        'Biometric authentication successful, terminal session created', {
          device_name: matchedCred.device_name,
        });

      return jsonResponse({ success: true, session_token: sessionToken });
    }

    return errorResponse('Unknown action', 404);

  } catch (err) {
    console.error('terminal-webauthn error:', err);
    return errorResponse(err.message || 'Internal error', 500);
  }
});
