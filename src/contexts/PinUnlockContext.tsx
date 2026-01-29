import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PinUnlockContextType {
  unlockedGroups: Set<string>;
  unlockGroup: (groupId: string) => void;
  isGroupUnlocked: (groupId: string) => boolean;
}

const PinUnlockContext = createContext<PinUnlockContextType | null>(null);

const STORAGE_KEY = 'sidebar_unlocked_groups';

export function PinUnlockProvider({ children }: { children: ReactNode }) {
  const [unlockedGroups, setUnlockedGroups] = useState<Set<string>>(() => {
    // Initialize from sessionStorage
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore parse errors
    }
    return new Set();
  });

  // Persist to sessionStorage when unlocked groups change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...unlockedGroups]));
    } catch (e) {
      // Ignore storage errors
    }
  }, [unlockedGroups]);

  const unlockGroup = (groupId: string) => {
    setUnlockedGroups(prev => new Set([...prev, groupId]));
  };

  const isGroupUnlocked = (groupId: string) => {
    return unlockedGroups.has(groupId);
  };

  return (
    <PinUnlockContext.Provider value={{ unlockedGroups, unlockGroup, isGroupUnlocked }}>
      {children}
    </PinUnlockContext.Provider>
  );
}

export function usePinUnlock() {
  const context = useContext(PinUnlockContext);
  if (!context) {
    throw new Error('usePinUnlock must be used within a PinUnlockProvider');
  }
  return context;
}
