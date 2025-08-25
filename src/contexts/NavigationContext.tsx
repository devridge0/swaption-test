import React, { createContext, useContext, useState, ReactNode } from 'react';

type NavigationContextType = {
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  navigateToTab: (tabId: string) => void;
};

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const [activeTab, setActiveTab] = useState('bull-bear');

  const navigateToTab = (tabId: string) => {
    setActiveTab(tabId);
  };

  return (
    <NavigationContext.Provider value={{ activeTab, setActiveTab, navigateToTab }}>
      {children}
    </NavigationContext.Provider>
  );
};
