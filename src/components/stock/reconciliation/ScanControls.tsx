import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Clock } from "lucide-react";

interface Props {
  onScan: (scope: string[]) => Promise<void>;
  isScanning: boolean;
  lastScan?: any;
}

const SCOPES = [
  { value: 'all', label: 'Full Scan (All Modules)' },
  { value: 'orders', label: 'Orders Only' },
  { value: 'financial', label: 'Financial Only' },
  { value: 'balances', label: 'Balances Only' },
  { value: 'movements', label: 'Movements Only' },
  { value: 'conversions', label: 'Conversions Only' },
  { value: 'clients', label: 'Clients Only' },
  { value: 'payments', label: 'Payments Only' },
];

export function ScanControls({ onScan, isScanning, lastScan }: Props) {
  const [scope, setScope] = useState('all');

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => onScan([scope])}
            disabled={isScanning}
            className="gap-2"
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isScanning ? 'Scanning...' : 'Run Scan'}
          </Button>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {lastScan && (
            <>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{new Date(lastScan.started_at).toLocaleString()}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {lastScan.findings_count} findings
              </Badge>
              {lastScan.duration_ms && (
                <Badge variant="outline" className="text-xs">
                  {(lastScan.duration_ms / 1000).toFixed(1)}s
                </Badge>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
