import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function PlatformDisplayCard() {
  const { data: activeLink, isLoading } = useQuery({
    queryKey: ['terminal-wallet-links-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_wallet_links')
        .select('*')
        .eq('status', 'active')
        .eq('platform_source', 'terminal')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // Get wallet name
      const { data: wallet } = await supabase
        .from('wallets')
        .select('wallet_name')
        .eq('id', data.wallet_id)
        .single();

      return { ...data, wallet_name: wallet?.wallet_name || 'Unknown' };
    },
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Connected Platform
        </CardTitle>
        <CardDescription className="text-[11px]">Terminal wallet integration status</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : activeLink ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Platform</p>
                <p className="text-[10px] text-muted-foreground">Binance P2P</p>
              </div>
              <Badge variant="default" className="text-[10px]">● Connected</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Linked Wallet</p>
                <p className="text-[10px] text-muted-foreground">{activeLink.wallet_name}</p>
              </div>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Assets</p>
                <p className="text-[10px] text-muted-foreground">{activeLink.supported_assets?.join(', ')}</p>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">Fee: {activeLink.fee_treatment}</Badge>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No platform connected. Link a wallet in Stock Management → Wallets.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
