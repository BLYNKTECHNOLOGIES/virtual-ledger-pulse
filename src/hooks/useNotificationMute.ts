
import { useState, useCallback, useEffect } from 'react';

const MUTE_STORAGE_KEY = 'notification_muted_';

function getMuteKey(userId: string): string {
  return `${MUTE_STORAGE_KEY}${userId}`;
}

export function useNotificationMute() {
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize from localStorage when user is available
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
      const muteKey = getMuteKey(storedUserId);
      const storedMute = localStorage.getItem(muteKey);
      setIsMuted(storedMute === 'true');
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!userId) return;
    
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    localStorage.setItem(getMuteKey(userId), String(newMuteState));
  }, [isMuted, userId]);

  const setMute = useCallback((muted: boolean) => {
    if (!userId) return;
    
    setIsMuted(muted);
    localStorage.setItem(getMuteKey(userId), String(muted));
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
    const userId = localStorage.getItem('userId');
    if (!userId) return false;
    
    const muteKey = getMuteKey(userId);
    return localStorage.getItem(muteKey) === 'true';
  } catch {
    return false;
  }
}
