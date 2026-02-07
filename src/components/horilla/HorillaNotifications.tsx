
import { CheckCheck, X, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

interface HorillaNotificationsProps {
  onClose: () => void;
}

const mockNotifications = [
  { id: "1", title: "New Leave Request", message: "John Doe requested 3 days of casual leave", time: "5 min ago", by: "Admin Demo", read: false },
  { id: "2", title: "Attendance Alert", message: "3 employees are late today", time: "15 min ago", by: "Admin Demo", read: false },
  { id: "3", title: "Ticket Update", message: "Ticket #1023 has been resolved", time: "1 hour ago", by: "Admin Demo", read: false },
  { id: "4", title: "Payslip Generated", message: "December payslips are ready", time: "2 hours ago", by: "Admin Demo", read: true },
];

export function HorillaNotifications({ onClose }: HorillaNotificationsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-10 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">Notifications</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-600">
            <VolumeX className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-600">
            <CheckCheck className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-600" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Notifications */}
      <div className="max-h-72 overflow-y-auto">
        {mockNotifications.map((n) => (
          <div key={n.id} className="px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0">
            <div className="flex items-start gap-2.5">
              <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${!n.read ? 'bg-red-500' : 'bg-transparent'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700">{n.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-gray-400">{n.time}</span>
                  <span className="text-[10px] text-gray-400">by {n.by}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-100 text-center">
        <button className="text-xs text-[#009C4A] hover:underline font-medium">
          View all Notification
        </button>
      </div>
    </div>
  );
}
