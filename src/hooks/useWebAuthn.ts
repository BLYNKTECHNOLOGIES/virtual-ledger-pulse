import { supabase } from '@/integrations/supabase/client';

// Base64url encode/decode helpers
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isBiometricAvailable(): boolean {
  return !!window.PublicKeyCredential;
}

export async function checkPlatformAuthenticator(): Promise<boolean> {
  if (!isBiometricAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function callWebAuthn(action: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('terminal-webauthn', {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message || 'WebAuthn request failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function registerBiometric(userId: string, username: string, deviceName?: string) {
  // 1. Get challenge from server
  const challengeData = await callWebAuthn('challenge', {
    user_id: userId,
    type: 'registration',
  });

  // 2. Create credential via browser API
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: base64urlToBuffer(challengeData.challenge),
      rp: {
        name: challengeData.rpName || 'P2P Trading Terminal',
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  }) as PublicKeyCredential;

  if (!credential) throw new Error('Credential creation cancelled');

  const response = credential.response as AuthenticatorAttestationResponse;

  // 3. Send to server
  const result = await callWebAuthn('register', {
    user_id: userId,
    credential_id: bufferToBase64url(credential.rawId),
    public_key: bufferToBase64url(response.getPublicKey?.() || response.attestationObject),
    challenge: challengeData.challenge,
    device_name: deviceName || getDeviceName(),
  });

  return result;
}

export async function authenticateBiometric(userId: string): Promise<string> {
  // 1. Get challenge
  const challengeData = await callWebAuthn('challenge', {
    user_id: userId,
    type: 'authentication',
  });

  const allowCredentials = (challengeData.allowCredentials || []).map(
    (c: { id: string }) => ({
      id: base64urlToBuffer(c.id),
      type: 'public-key' as const,
    })
  );

  // 2. Get assertion via browser API
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: base64urlToBuffer(challengeData.challenge),
      rpId: window.location.hostname,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  if (!assertion) throw new Error('Authentication cancelled');

  const response = assertion.response as AuthenticatorAssertionResponse;

  // Extract sign count from authenticatorData (bytes 33-36, big-endian uint32)
  const authData = new Uint8Array(response.authenticatorData);
  const signCount = new DataView(authData.buffer).getUint32(33, false);

  // 3. Verify on server
  const result = await callWebAuthn('verify', {
    user_id: userId,
    credential_id: bufferToBase64url(assertion.rawId),
    challenge: challengeData.challenge,
    sign_count: signCount,
  });

  return result.session_token;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('Windows')) return 'Windows PC';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown Device';
}
