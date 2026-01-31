import { useState, useCallback, useEffect, useRef } from 'react';
import { isNotificationMuted } from './useNotificationMute';

export type AlertType = 'new_order' | 'info_update' | 'payment_timer' | 'order_timer';

interface OrderAlertState {
  needsAttention: boolean;
  alertType: AlertType | null;
  lastAlertTime: number;
  attendedDataHash: string | null;
}

// Generate a hash of order data to track changes
export function generateOrderDataHash(order: any): string {
  return JSON.stringify({
    status: order.status,
    order_status: order.order_status,
    supplier_name: order.supplier_name,
    contact_number: order.contact_number,
    pan_number: order.pan_number,
    bank_account_name: order.bank_account_name,
    bank_account_number: order.bank_account_number,
    ifsc_code: order.ifsc_code,
    upi_id: order.upi_id,
    timer_end_at: order.timer_end_at,
    total_paid: order.total_paid,
    notes: order.notes,
  });
}

// Store attended state in localStorage
const ATTENDED_STORAGE_KEY = 'purchase_order_attended_state_v1';

interface AttendedState {
  [orderId: string]: {
    dataHash: string;
    timestamp: number;
  };
}

function getAttendedOrders(): AttendedState {
  try {
    const stored = localStorage.getItem(ATTENDED_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveAttendedOrders(state: AttendedState) {
  localStorage.setItem(ATTENDED_STORAGE_KEY, JSON.stringify(state));
}

// Audio context for alerts
let audioContext: AudioContext | null = null;
let activeAlarms: Map<string, { intervalId: number }> = new Map();

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

// Play a single alert tone
function playTone(frequency: number, duration: number, delay: number = 0, volume: number = 0.7) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'square';
    
    const startTime = ctx.currentTime + delay;
    gainNode.gain.setValueAtTime(volume, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.05);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  } catch (e) {
    console.error('Failed to play tone:', e);
  }
}

// Play alert sound once
export function playAlertSound(type: AlertType) {
  // Check if notifications are muted for current user
  if (isNotificationMuted()) return;
  
  try {
    switch (type) {
      case 'new_order':
        playTone(1200, 0.15, 0, 0.8);
        playTone(1500, 0.15, 0.2, 0.8);
        playTone(1800, 0.25, 0.4, 0.9);
        break;
      case 'info_update':
        playTone(1000, 0.15, 0, 0.7);
        playTone(1300, 0.2, 0.2, 0.8);
        break;
      case 'payment_timer':
        playTone(1600, 0.1, 0, 0.9);
        playTone(1600, 0.1, 0.15, 0.9);
        playTone(1800, 0.1, 0.3, 0.9);
        playTone(1800, 0.1, 0.45, 0.9);
        playTone(2000, 0.15, 0.6, 1.0);
        break;
      case 'order_timer':
        playTone(900, 0.2, 0, 0.8);
        playTone(700, 0.2, 0.25, 0.8);
        playTone(900, 0.2, 0.5, 0.9);
        playTone(700, 0.25, 0.75, 0.9);
        break;
    }
  } catch (e) {
    console.error('Failed to play alert sound:', e);
  }
}

// Start continuous alarm for an order
export function startContinuousAlarm(orderId: string, type: 'payment_timer' | 'order_timer') {
  if (activeAlarms.has(orderId)) return;

  const playAlarm = () => {
    // Check mute status on each alarm iteration
    if (isNotificationMuted()) return;
    if (type === 'payment_timer') {
      playTone(2400, 0.12, 0, 1.0);
      playTone(2800, 0.12, 0.15, 1.0);
      playTone(2400, 0.12, 0.30, 1.0);
      playTone(2800, 0.12, 0.45, 1.0);
      playTone(3000, 0.15, 0.60, 1.0);
    } else {
      playTone(1800, 0.2, 0, 1.0);
      playTone(1200, 0.2, 0.25, 1.0);
      playTone(1800, 0.2, 0.5, 1.0);
      playTone(1200, 0.2, 0.75, 1.0);
    }
  };

  playAlarm();
  const intervalId = window.setInterval(playAlarm, 1500);
  activeAlarms.set(orderId, { intervalId });
}

// Stop continuous alarm for an order
export function stopContinuousAlarm(orderId: string) {
  const alarm = activeAlarms.get(orderId);
  if (alarm) {
    clearInterval(alarm.intervalId);
    activeAlarms.delete(orderId);
  }
}

// Stop all alarms
export function stopAllAlarms() {
  activeAlarms.forEach((alarm) => {
    clearInterval(alarm.intervalId);
  });
  activeAlarms.clear();
}

// Previous order hashes storage
const PREVIOUS_ORDERS_STORAGE_KEY = 'purchase_order_previous_hashes_v1';

function getPreviousOrderHashes(): Map<string, string> {
  try {
    const stored = localStorage.getItem(PREVIOUS_ORDERS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
    return new Map();
  } catch {
    return new Map();
  }
}

function savePreviousOrderHashes(hashes: Map<string, string>) {
  const obj: Record<string, string> = {};
  hashes.forEach((value, key) => {
    obj[key] = value;
  });
  localStorage.setItem(PREVIOUS_ORDERS_STORAGE_KEY, JSON.stringify(obj));
}

export function useOrderAlerts() {
  const [alertStates, setAlertStates] = useState<Map<string, OrderAlertState>>(new Map());
  const attendedOrdersRef = useRef<AttendedState>(getAttendedOrders());
  const previousOrdersRef = useRef<Map<string, string>>(getPreviousOrderHashes());
  const activeTimerAlarmsRef = useRef<Set<string>>(new Set());

  // Safety: if the Purchase page (or this hook) unmounts, ensure we stop any lingering intervals.
  // This prevents "ghost" buzzers continuing after navigation.
  useEffect(() => {
    return () => {
      stopAllAlarms();
    };
  }, []);

  // Mark order as attended
  const markAttended = useCallback((orderId: string, order?: any) => {
    stopContinuousAlarm(orderId);
    activeTimerAlarmsRef.current.delete(orderId);
    
    const dataHash = order ? generateOrderDataHash(order) : previousOrdersRef.current.get(orderId) || '';
    attendedOrdersRef.current[orderId] = {
      dataHash,
      timestamp: Date.now(),
    };
    saveAttendedOrders(attendedOrdersRef.current);
    
    setAlertStates(prev => {
      const newStates = new Map(prev);
      newStates.delete(orderId);
      return newStates;
    });
  }, []);

  // Check if order needs attention
  const needsAttention = useCallback((orderId: string): OrderAlertState | null => {
    return alertStates.get(orderId) || null;
  }, [alertStates]);

  // Trigger alert for an order
  const triggerAlert = useCallback((orderId: string, type: AlertType, currentDataHash: string) => {
    setAlertStates(prev => {
      const newStates = new Map(prev);
      newStates.set(orderId, {
        needsAttention: true,
        alertType: type,
        lastAlertTime: Date.now(),
        attendedDataHash: null,
      });
      return newStates;
    });
    
    playAlertSound(type);
    
    if (type === 'payment_timer' || type === 'order_timer') {
      if (!activeTimerAlarmsRef.current.has(orderId)) {
        activeTimerAlarmsRef.current.add(orderId);
        startContinuousAlarm(orderId, type);
      }
    }
  }, []);

  // Trigger timer alert - but NOT for terminal/expired orders or already-attended orders
  const triggerTimerAlert = useCallback((orderId: string, type: 'payment_timer' | 'order_timer', order?: any) => {
    // If order is provided, check if it's in a terminal state
    if (order) {
      const orderStatus = order.order_status;
      const isTerminal = orderStatus === 'completed' || orderStatus === 'cancelled';
      const isExpired = order.order_expires_at && new Date(order.order_expires_at).getTime() < Date.now();
      
      if (isTerminal || isExpired) {
        // Don't trigger alerts for terminal/expired orders
        stopContinuousAlarm(orderId);
        activeTimerAlarmsRef.current.delete(orderId);
        return;
      }
      
      // Check if already attended with the same data hash (including timer state)
      const currentDataHash = generateOrderDataHash(order);
      const attendedState = attendedOrdersRef.current[orderId];
      if (attendedState && attendedState.dataHash === currentDataHash) {
        // Already attended with same data - don't trigger timer alert
        return;
      }
    }
    
    const currentState = alertStates.get(orderId);
    if (currentState?.alertType === type) return;
    
    setAlertStates(prev => {
      const newStates = new Map(prev);
      newStates.set(orderId, {
        needsAttention: true,
        alertType: type,
        lastAlertTime: Date.now(),
        attendedDataHash: null,
      });
      return newStates;
    });
    
    if (!activeTimerAlarmsRef.current.has(orderId)) {
      activeTimerAlarmsRef.current.add(orderId);
      startContinuousAlarm(orderId, type);
    }
  }, [alertStates]);

  // Check for new orders or updates
  const processOrderChanges = useCallback((orders: any[], isInitialLoad: boolean = false) => {
    const currentOrderMap = new Map<string, string>();
    const now = Date.now();
    const TEN_SECONDS = 10 * 1000;
    
    // Refresh attended state from localStorage on each process
    attendedOrdersRef.current = getAttendedOrders();
    
    orders.forEach(order => {
      const orderId = order.id;
      const orderDataHash = generateOrderDataHash(order);
      const orderStatus = order.order_status;
      
      currentOrderMap.set(orderId, orderDataHash);
      
      // Check if this is a terminal state (completed, cancelled, or expired)
      const isTerminal = orderStatus === 'completed' || orderStatus === 'cancelled';
      const isExpired = order.order_expires_at && new Date(order.order_expires_at).getTime() < now;
      
      // If order is in terminal state or expired, stop any active alarms
      // and don't trigger new alerts
      if (isTerminal || isExpired) {
        // Check if the order was completed/expired within the last 10 seconds
        // If so, allow a brief grace period, then stop
        const completedAt = order.updated_at ? new Date(order.updated_at).getTime() : 0;
        const expiredAt = order.order_expires_at ? new Date(order.order_expires_at).getTime() : 0;
        const terminalTime = isTerminal ? completedAt : expiredAt;
        
        if (now - terminalTime > TEN_SECONDS) {
          // More than 10 seconds since terminal state - stop alarms immediately
          stopContinuousAlarm(orderId);
          activeTimerAlarmsRef.current.delete(orderId);
          
          // Remove from alert states
          setAlertStates(prev => {
            if (prev.has(orderId)) {
              const newStates = new Map(prev);
              newStates.delete(orderId);
              return newStates;
            }
            return prev;
          });
        }
        // Don't trigger new alerts for terminal/expired orders
        return;
      }
      
      // Check if already attended with the same data hash
      const attendedState = attendedOrdersRef.current[orderId];
      if (attendedState && attendedState.dataHash === orderDataHash) {
        // Already attended with same data - don't trigger alert
        return;
      }
      
      if (!isInitialLoad) {
        const previousHash = previousOrdersRef.current.get(orderId);
        
        if (!previousHash) {
          triggerAlert(orderId, 'new_order', orderDataHash);
        } else if (previousHash !== orderDataHash) {
          triggerAlert(orderId, 'info_update', orderDataHash);
        }
      } else {
        // On initial load, only alert if data changed from attended state
        if (attendedState && attendedState.dataHash !== orderDataHash) {
          triggerAlert(orderId, 'info_update', orderDataHash);
        }
        // On initial load without prior attended state, don't alert
      }
    });
    
    previousOrdersRef.current = currentOrderMap;
    savePreviousOrderHashes(currentOrderMap);
  }, [triggerAlert]);

  // Clean up old attended orders
  const cleanupAttendedOrders = useCallback((currentOrderIds: string[]) => {
    const currentSet = new Set(currentOrderIds);
    const toRemove: string[] = [];
    
    Object.keys(attendedOrdersRef.current).forEach(id => {
      if (!currentSet.has(id)) {
        toRemove.push(id);
      }
    });
    
    if (toRemove.length > 0) {
      toRemove.forEach(id => {
        delete attendedOrdersRef.current[id];
        stopContinuousAlarm(id);
      });
      saveAttendedOrders(attendedOrdersRef.current);
    }
  }, []);

  const getOrderForAttended = useCallback((orders: any[], orderId: string) => {
    return orders.find(o => o.id === orderId);
  }, []);

  return {
    markAttended,
    needsAttention,
    triggerAlert,
    triggerTimerAlert,
    processOrderChanges,
    cleanupAttendedOrders,
    alertStates,
    getOrderForAttended,
  };
}
