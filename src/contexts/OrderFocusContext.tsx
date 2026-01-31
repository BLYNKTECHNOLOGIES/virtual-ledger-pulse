import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface OrderFocusContextType {
  focusedOrderId: string | null;
  focusOrder: (orderId: string) => void;
  clearFocus: () => void;
}

const OrderFocusContext = createContext<OrderFocusContextType | undefined>(undefined);

export function OrderFocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  const focusOrder = useCallback((orderId: string) => {
    setFocusedOrderId(orderId);
    
    // Scroll to the order element after a short delay to ensure it's rendered
    setTimeout(() => {
      const orderElement = document.getElementById(`order-card-${orderId}`);
      if (orderElement) {
        orderElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    
    // Auto-clear focus after 5 seconds
    setTimeout(() => {
      setFocusedOrderId(prev => prev === orderId ? null : prev);
    }, 5000);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedOrderId(null);
  }, []);

  return (
    <OrderFocusContext.Provider value={{ focusedOrderId, focusOrder, clearFocus }}>
      {children}
    </OrderFocusContext.Provider>
  );
}

export function useOrderFocus() {
  const context = useContext(OrderFocusContext);
  if (context === undefined) {
    throw new Error('useOrderFocus must be used within an OrderFocusProvider');
  }
  return context;
}

// Hook for checking if a specific order is focused
export function useIsOrderFocused(orderId: string): boolean {
  const { focusedOrderId } = useOrderFocus();
  return focusedOrderId === orderId;
}
