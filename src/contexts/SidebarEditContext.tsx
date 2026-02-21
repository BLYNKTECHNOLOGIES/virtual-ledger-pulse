import { useState, createContext, useContext } from 'react';

interface SidebarEditContextType {
  isDragMode: boolean;
  setIsDragMode: (value: boolean) => void;
  isDashboardRearrangeMode: boolean;
  setIsDashboardRearrangeMode: (value: boolean) => void;
}

const SidebarEditContext = createContext<SidebarEditContextType | null>(null);

export function SidebarEditProvider({ children }: { children: React.ReactNode }) {
  const [isDragMode, setIsDragMode] = useState(false);
  const [isDashboardRearrangeMode, setIsDashboardRearrangeMode] = useState(false);

  return (
    <SidebarEditContext.Provider value={{ isDragMode, setIsDragMode, isDashboardRearrangeMode, setIsDashboardRearrangeMode }}>
      {children}
    </SidebarEditContext.Provider>
  );
}

export function useSidebarEdit() {
  const context = useContext(SidebarEditContext);
  if (!context) {
    throw new Error('useSidebarEdit must be used within a SidebarEditProvider');
  }
  return context;
}