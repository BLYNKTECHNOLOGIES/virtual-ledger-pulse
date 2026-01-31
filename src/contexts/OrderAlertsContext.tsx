import React, { createContext, useContext } from "react";
import { useOrderAlerts } from "@/hooks/use-order-alerts";

type OrderAlertsContextType = ReturnType<typeof useOrderAlerts>;

const OrderAlertsContext = createContext<OrderAlertsContextType | null>(null);

export function OrderAlertsProvider({ children }: { children: React.ReactNode }) {
  const value = useOrderAlerts();
  return <OrderAlertsContext.Provider value={value}>{children}</OrderAlertsContext.Provider>;
}

export function useOrderAlertsContext() {
  const ctx = useContext(OrderAlertsContext);
  if (!ctx) throw new Error("useOrderAlertsContext must be used within OrderAlertsProvider");
  return ctx;
}
