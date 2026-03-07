import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Fingerprint, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";

export function BiometricDeviceStatus() {
  const { data: devices } = useQuery({
    queryKey: ["hr-biometric-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_biometric_devices")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  if (!devices?.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Fingerprint className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No biometric devices registered. Add your ESSL Eris device to start syncing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm md:text-base">
          <Fingerprint className="h-5 w-5 shrink-0" />
          <span className="truncate">Biometric Devices</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {devices.map((device) => (
             <div
               key={device.id}
               className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-card gap-2"
             >
               <div className="flex items-center gap-3 min-w-0">
                 {device.is_connected ? (
                   <Wifi className="h-4 w-4 text-green-600 shrink-0" />
                 ) : (
                   <WifiOff className="h-4 w-4 text-destructive shrink-0" />
                 )}
                 <div className="min-w-0">
                   <p className="text-sm font-medium truncate">{device.name}</p>
                   <p className="text-xs text-muted-foreground truncate">
                     {device.machine_ip}:{device.port_no} · {device.employees_count ?? 0} employees
                   </p>
                 </div>
               </div>
              <div className="text-right">
                <Badge variant={device.is_connected ? "default" : "destructive"} className="text-xs">
                  {device.is_connected ? "Online" : "Offline"}
                </Badge>
                {device.last_sync_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Synced: {format(new Date(device.last_sync_at), "hh:mm a")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
