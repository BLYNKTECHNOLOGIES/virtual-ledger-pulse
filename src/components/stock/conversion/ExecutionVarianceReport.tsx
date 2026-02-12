
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useConversionHistory } from "@/hooks/useProductConversions";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { format } from "date-fns";
import { BarChart3 } from "lucide-react";

export function ExecutionVarianceReport() {
  const { data: conversions = [], isLoading } = useConversionHistory({ status: 'APPROVED' });

  // Only show conversions that have both execution_rate and market_rate_snapshot
  const withVariance = conversions.filter((c: any) =>
    c.execution_rate_usdt && c.market_rate_snapshot && Number(c.market_rate_snapshot) > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5" />
          Execution vs Market Variance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : withVariance.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No conversions with market rate snapshots. Enter market_rate_snapshot when creating conversions to see variance data.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Execution Rate</TableHead>
                  <TableHead className="text-right">Market Rate</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withVariance.map((c: any) => {
                  const execRate = Number(c.execution_rate_usdt);
                  const marketRate = Number(c.market_rate_snapshot);
                  const variance = execRate - marketRate;
                  const variancePct = (variance / marketRate) * 100;
                  // For BUY, negative variance is good (bought cheaper). For SELL, positive is good.
                  const isFavorable = c.side === 'BUY' ? variance < 0 : variance > 0;

                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{format(new Date(c.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-mono text-xs">{c.reference_no}</TableCell>
                      <TableCell>
                        <Badge variant={c.side === 'BUY' ? 'default' : 'secondary'} className="text-[10px]">{c.side}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{c.asset_code}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(execRate)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(marketRate)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono text-xs ${isFavorable ? 'text-green-600' : 'text-red-600'}`}>
                          {variance >= 0 ? '+' : ''}{formatSmartDecimal(variance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono text-xs ${isFavorable ? 'text-green-600' : 'text-red-600'}`}>
                          {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(2)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
