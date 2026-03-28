/**
 * Supabase Auth Session Cache
 * 
 * Provides synchronous access to the current Supabase auth session.
 * Updated by onAuthStateChange listener initialized in AuthProvider.
 * Falls back to localStorage userSession for backward compatibility.
 */
import { supabase } from '@/integrations/supabase/client';

interface CachedSession {
  userId: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

let cachedSession: CachedSession | null = null;
let initialized = false;

/**
 * Initialize the session cache listener.
 * Called once from AuthProvider on mount.
 */
export function initSessionCache() {
  if (initialized) return;
  initialized = true;

  // Seed from current session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      updateCacheFromAuth(session.user.id, session.user.email || '');
    } else {
      updateCacheFromLocalStorage();
    }
  });

  // Listen for changes
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      updateCacheFromAuth(session.user.id, session.user.email || '');
    } else {
      // Try localStorage fallback (legacy sessions)
      updateCacheFromLocalStorage();
    }
  });
}

function updateCacheFromAuth(userId: string, email: string) {
  // Enrich from localStorage compatibility layer (has username, names, etc.)
  const localSession = getLocalStorageSession();
  cachedSession = {
    userId,
    email,
    username: localSession?.username || email,
    firstName: localSession?.firstName,
    lastName: localSession?.lastName,
  };
}

function updateCacheFromLocalStorage() {
  const localSession = getLocalStorageSession();
  if (localSession) {
    cachedSession = localSession;
  } else {
    cachedSession = null;
  }
}

function getLocalStorageSession(): CachedSession | null {
  try {
    const sessionStr = localStorage.getItem('userSession');
    if (!sessionStr) return null;
    const session = JSON.parse(sessionStr);
    const user = session?.user;
    if (!user?.id) return null;
    return {
      userId: user.id,
      email: user.email || '',
      username: user.username || user.email || '',
      firstName: user.firstName,
      lastName: user.lastName,
    };
  } catch {
    return null;
  }
}

/**
 * Update the cache directly (called from useAuth when user state changes).
 */
export function setSessionCache(user: { id: string; email: string; username: string; firstName?: string; lastName?: string } | null) {
  if (user) {
    cachedSession = {
      userId: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  } else {
    cachedSession = null;
  }
}

/**
 * Get current user ID synchronously.
 * Returns null if no session is active.
 */
export function getSessionUserId(): string | null {
  if (cachedSession?.userId) return cachedSession.userId;
  // Fallback to localStorage for cases where cache hasn't been initialized yet
  const local = getLocalStorageSession();
  return local?.userId || null;
}

/**
 * Get current user session info synchronously.
 */
export function getSessionUser(): CachedSession | null {
  if (cachedSession) return cachedSession;
  return getLocalStorageSession();
}
