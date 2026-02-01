import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Timer, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { BuzzerIntensity } from '@/hooks/usePurchaseFunctions';

interface OrderTimerProps {
  timerEndAt: string | null;
  orderId: string;
  className?: string;
  onTriggerAlert?: (isUrgent: boolean, buzzerConfig?: BuzzerIntensity) => void;
}

export function OrderTimer({ timerEndAt, orderId, className, onTriggerAlert }: OrderTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [alertState, setAlertState] = useState<'normal' | 'warning' | 'critical' | 'expired'>('normal');
  const fiveMinAlertedRef = useRef<Set<string>>(new Set());
  const oneMinAlertedRef = useRef<Set<string>>(new Set());
  const expiredAlertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!timerEndAt) return;

    const calculateTimeLeft = () => {
      const endTime = new Date(timerEndAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endTime - now) / 1000));
      return diff;
    };

    const updateTimer = () => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setAlertState('expired');
        if (!expiredAlertedRef.current.has(orderId)) {
          expiredAlertedRef.current.add(orderId);
          if (onTriggerAlert) {
            onTriggerAlert(true); // Urgent (expired)
          }
        }
      } else if (remaining <= 120) { // 2 minutes = urgent/continuous
        setAlertState('critical');
        if (!oneMinAlertedRef.current.has(orderId)) {
          oneMinAlertedRef.current.add(orderId);
          if (onTriggerAlert) {
            onTriggerAlert(true); // Urgent = continuous alarm
          }
        }
      } else if (remaining <= 300) { // 5 minutes = warning/single beep
        setAlertState('warning');
        if (!fiveMinAlertedRef.current.has(orderId)) {
          fiveMinAlertedRef.current.add(orderId);
          if (onTriggerAlert) {
            onTriggerAlert(false); // Not urgent = single beep only
          }
        }
      } else {
        setAlertState('normal');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [timerEndAt, orderId, onTriggerAlert]);

  if (!timerEndAt) return null;

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return 'Time Up!';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getBadgeStyles = () => {
    switch (alertState) {
      case 'expired':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-200 animate-pulse';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getIcon = () => {
    switch (alertState) {
      case 'expired':
        return <CheckCircle className="h-3.5 w-3.5" />;
      case 'critical':
        return <AlertTriangle className="h-3.5 w-3.5" />;
      default:
        return <Timer className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Badge 
      variant="outline" 
      className={cn('gap-1 font-mono text-xs', getBadgeStyles(), className)}
    >
      {getIcon()}
      {formatTime(timeLeft)}
    </Badge>
  );
}

// Order Expiry Timer Component
interface OrderExpiryTimerProps {
  orderExpiresAt: string | null;
  orderId: string;
  className?: string;
  onTriggerAlert?: (isUrgent: boolean, buzzerConfig?: BuzzerIntensity) => void;
}

export function OrderExpiryTimer({ orderExpiresAt, orderId, className, onTriggerAlert }: OrderExpiryTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [alertState, setAlertState] = useState<'normal' | 'warning' | 'critical' | 'expired'>('normal');
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!orderExpiresAt) return;

    const calculateTimeLeft = () => {
      const endTime = new Date(orderExpiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endTime - now) / 1000));
      return diff;
    };

    const updateTimer = () => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setAlertState('expired');
        if (!alertedRef.current.has(`${orderId}-expired`)) {
          alertedRef.current.add(`${orderId}-expired`);
          onTriggerAlert?.(true); // Urgent
        }
      } else if (remaining <= 120) { // 2 minutes = critical/continuous
        setAlertState('critical');
        if (!alertedRef.current.has(`${orderId}-critical`)) {
          alertedRef.current.add(`${orderId}-critical`);
          onTriggerAlert?.(true); // Urgent = continuous
        }
      } else if (remaining <= 300) { // 5 minutes = warning/single beep
        setAlertState('warning');
        if (!alertedRef.current.has(`${orderId}-warning`)) {
          alertedRef.current.add(`${orderId}-warning`);
          onTriggerAlert?.(false); // Not urgent = single beep only
        }
      } else if (remaining <= 600) { // 10 minutes
        setAlertState('normal');
      } else {
        setAlertState('normal');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [orderExpiresAt, orderId, onTriggerAlert]);

  if (!orderExpiresAt) return null;

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return 'Expired!';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hrs}h ${remainMins}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getBadgeStyles = () => {
    switch (alertState) {
      case 'expired':
        return 'bg-red-500 text-white border-red-600';
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-200 animate-pulse';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <Badge 
      variant="outline" 
      className={cn('gap-1 font-mono text-xs', getBadgeStyles(), className)}
    >
      <Timer className="h-3 w-3" />
      {formatTime(timeLeft)}
    </Badge>
  );
}
