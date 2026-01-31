import React, { createContext, useContext, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOrderFocus } from './OrderFocusContext';

export interface GlobalNotification {
  id: string;
  title: string;
  description: string;
  time: Date;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  orderId?: string;
  orderRoute?: string;
}

interface NotificationContextType {
  notifications: GlobalNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<GlobalNotification, 'id' | 'time' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  handleNotificationClick: (notification: GlobalNotification) => void;
  /**
   * Emits when the user clicks a bell notification that targets an order.
   * Consumers (e.g. BuyOrdersTab) can use this to mark the order attended, stop buzzers, etc.
   */
  lastOrderNavigation: { orderId: string; at: number } | null;

  /**
   * Emits when user actions imply "I'm done with all current alerts" (mark all read / clear).
   * Watchers should interpret this as attending those orders so buzzers stop.
   */
  lastAttendedOrders: { orderIds: string[]; at: number } | null;

  /**
   * Emits when notifications were cleared, so watchers can re-emit notifications
   * for any still-active alerts/buzzers.
   */
  notificationsResetSignal: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<GlobalNotification[]>([]);
  const [lastOrderNavigation, setLastOrderNavigation] = useState<{ orderId: string; at: number } | null>(null);
  const [lastAttendedOrders, setLastAttendedOrders] = useState<{ orderIds: string[]; at: number } | null>(null);
  const [notificationsResetSignal, setNotificationsResetSignal] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { focusOrder } = useOrderFocus();

  const addNotification = useCallback((notification: Omit<GlobalNotification, 'id' | 'time' | 'read'>) => {
    const newNotification: GlobalNotification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: new Date(),
      read: false,
    };

    setNotifications(prev => {
      // Keep max 50 notifications, remove oldest
      const updated = [newNotification, ...prev].slice(0, 50);
      return updated;
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      const orderIds = Array.from(
        new Set(prev.map(n => n.orderId).filter((id): id is string => Boolean(id)))
      );
      if (orderIds.length > 0) {
        setLastAttendedOrders({ orderIds, at: Date.now() });
      }
      return prev.map(n => ({ ...n, read: true }));
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications(prev => {
      const orderIds = Array.from(
        new Set(prev.map(n => n.orderId).filter((id): id is string => Boolean(id)))
      );
      if (orderIds.length > 0) {
        setLastAttendedOrders({ orderIds, at: Date.now() });
      }
      return [];
    });
    // Let watchers re-emit notifications for any still-active alerts
    setNotificationsResetSignal(s => s + 1);
  }, []);

  const handleNotificationClick = useCallback((notification: GlobalNotification) => {
    // Mark as read
    markAsRead(notification.id);

    // Treat clicking any order notification as "attended" for buzzer suppression
    if (notification.orderId) {
      setLastAttendedOrders({ orderIds: [notification.orderId], at: Date.now() });
    }
    
    // Navigate if there's an order route
    if (notification.orderId && notification.orderRoute) {
      // If not on the target route, navigate first
      if (location.pathname !== notification.orderRoute) {
        navigate(notification.orderRoute);
        // Delay focus to allow page to load
        setTimeout(() => {
          focusOrder(notification.orderId!);
          setLastOrderNavigation({ orderId: notification.orderId!, at: Date.now() });
        }, 500);
      } else {
        // Already on the page, just focus
        focusOrder(notification.orderId);
        setLastOrderNavigation({ orderId: notification.orderId, at: Date.now() });
      }
    }
  }, [markAsRead, navigate, location.pathname, focusOrder]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      handleNotificationClick,
      lastOrderNavigation,
      lastAttendedOrders,
      notificationsResetSignal,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
