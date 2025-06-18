
import { useState } from 'react';

interface MinimizedDialog {
  id: string;
  title: string;
  type: 'sales' | 'purchase' | 'other';
  data?: any;
}

export function useMinimizedDialogs() {
  const [minimizedDialogs, setMinimizedDialogs] = useState<MinimizedDialog[]>([]);

  const minimizeDialog = (dialog: MinimizedDialog) => {
    setMinimizedDialogs(prev => {
      const exists = prev.find(d => d.id === dialog.id);
      if (exists) return prev;
      return [...prev, dialog];
    });
  };

  const restoreDialog = (id: string) => {
    setMinimizedDialogs(prev => prev.filter(d => d.id !== id));
  };

  const removeDialog = (id: string) => {
    setMinimizedDialogs(prev => prev.filter(d => d.id !== id));
  };

  return {
    minimizedDialogs,
    minimizeDialog,
    restoreDialog,
    removeDialog
  };
}
