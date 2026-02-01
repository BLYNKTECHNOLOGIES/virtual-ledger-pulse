import { useState, useCallback, useEffect } from 'react';

const MUTE_STORAGE_KEY = 'notification_muted_';

function getMuteKey(userId: string): string {
  return `${MUTE_STORAGE_KEY}${userId}`;
}

// Helper to get userId from the session stored in localStorage
function getUserIdFromSession(): string | null {
  try {
    const savedSession = localStorage.getItem('userSession');
    if (savedSession) {
      const sessionData = JSON.parse(savedSession);
      return sessionData?.user?.id || null;
    }
    return null;
  } catch {
    return null;
  }
}

export function useNotificationMute() {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize from localStorage when user is available
  useEffect(() => {
    const storedUserId = getUserIdFromSession();
    if (storedUserId) {
      setUserId(storedUserId);
      const muteKey = getMuteKey(storedUserId);
      const storedMute = localStorage.getItem(muteKey);
      setIsMuted(storedMute === 'true');
    }
  }, []);

  // Listen for storage changes (in case user logs in/out in another tab)
  useEffect(() => {
    const handleStorageChange = () => {
      const storedUserId = getUserIdFromSession();
      if (storedUserId && storedUserId !== userId) {
        setUserId(storedUserId);
        const muteKey = getMuteKey(storedUserId);
        const storedMute = localStorage.getItem(muteKey);
        setIsMuted(storedMute === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [userId]);

  const toggleMute = useCallback(() => {
    const currentUserId = userId || getUserIdFromSession();
    if (!currentUserId) return;
    
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    localStorage.setItem(getMuteKey(currentUserId), String(newMuteState));
    
    // Dispatch a custom event so other components can react
    window.dispatchEvent(new CustomEvent('notificationMuteChanged', { 
      detail: { isMuted: newMuteState } 
    }));
  }, [isMuted, userId]);

  const setMute = useCallback((muted: boolean) => {
    const currentUserId = userId || getUserIdFromSession();
    if (!currentUserId) return;
    
    setIsMuted(muted);
    localStorage.setItem(getMuteKey(currentUserId), String(muted));
    
    // Dispatch a custom event so other components can react
    window.dispatchEvent(new CustomEvent('notificationMuteChanged', { 
      detail: { isMuted: muted } 
    }));
  }, [userId]);

  return {
    isMuted,
    toggleMute,
    setMute,
  };
}

// Standalone function to check mute status (for use outside React components)
export function isNotificationMuted(): boolean {
  try {
    const userId = getUserIdFromSession();
    if (!userId) return false;
    
    const muteKey = getMuteKey(userId);
    return localStorage.getItem(muteKey) === 'true';
  } catch {
    return false;
  }
}
