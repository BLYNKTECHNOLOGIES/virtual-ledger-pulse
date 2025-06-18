
import { createContext, useContext, useState, ReactNode, memo } from 'react';

interface TabManagerContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabData: Record<string, any>;
  setTabData: (tab: string, data: any) => void;
}

const TabManagerContext = createContext<TabManagerContextType | undefined>(undefined);

export const useTabManager = () => {
  const context = useContext(TabManagerContext);
  if (!context) {
    throw new Error('useTabManager must be used within a TabManagerProvider');
  }
  return context;
};

interface TabManagerProviderProps {
  children: ReactNode;
  defaultTab: string;
}

export const TabManagerProvider = memo(function TabManagerProvider({ 
  children, 
  defaultTab 
}: TabManagerProviderProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [tabData, setTabDataState] = useState<Record<string, any>>({});

  const setTabData = (tab: string, data: any) => {
    setTabDataState(prev => ({
      ...prev,
      [tab]: data
    }));
  };

  return (
    <TabManagerContext.Provider value={{
      activeTab,
      setActiveTab,
      tabData,
      setTabData
    }}>
      {children}
    </TabManagerContext.Provider>
  );
});

interface TabContentProps {
  tabId: string;
  children: ReactNode;
}

export const TabContent = memo(function TabContent({ tabId, children }: TabContentProps) {
  const { activeTab } = useTabManager();
  
  if (activeTab !== tabId) {
    return null;
  }

  return <div className="tab-content">{children}</div>;
});
