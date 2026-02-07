
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

interface HorillaNotificationsProps {
  onClose: () => void;
}

const mockNotifications = [
  { id: "1", title: "New Leave Request", message: "John Doe requested 3 days of casual leave", type: "leave_request", time: "5 min ago", read: false },
  { id: "2", title: "Attendance Alert", message: "3 employees are late today", type: "attendance_alert", time: "15 min ago", read: false },
  { id: "3", title: "Ticket Update", message: "Ticket #1023 has been resolved", type: "ticket_update", time: "1 hour ago", read: false },
  { id: "4", title: "Payslip Generated", message: "December payslips are ready", type: "payslip_generated", time: "2 hours ago", read: true },
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
    <div ref={ref} className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
        <Button variant="ghost" size="sm" className="text-xs text-[#E8604C] hover:text-[#d04a38]">
          <CheckCheck className="h-3.5 w-3.5 mr-1" />
          Mark all read
        </Button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
        {mockNotifications.map((n) => (
          <div key={n.id} className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${!n.read ? 'bg-orange-50/50' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 mt-2 rounded-full shrink-0 ${!n.read ? 'bg-[#E8604C]' : 'bg-transparent'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[11px] text-gray-400 mt-1">{n.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-center">
        <Button variant="ghost" size="sm" className="text-xs text-[#E8604C]">View All Notifications</Button>
      </div>
    </div>
  );
}
