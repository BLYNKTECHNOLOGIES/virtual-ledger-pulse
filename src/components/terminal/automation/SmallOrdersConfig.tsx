import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, ShoppingCart } from 'lucide-react';
import { SmallSalesConfig } from './SmallSalesConfig';
import { SmallBuysConfig } from './SmallBuysConfig';

export function SmallOrdersConfig() {
  const [tab, setTab] = useState('sales');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="sales" className="gap-1.5 text-xs h-7">
            <Package className="h-3.5 w-3.5" />
            Small Sales
          </TabsTrigger>
          <TabsTrigger value="buys" className="gap-1.5 text-xs h-7">
            <ShoppingCart className="h-3.5 w-3.5" />
            Small Buys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <SmallSalesConfig />
        </TabsContent>
        <TabsContent value="buys" className="mt-4">
          <SmallBuysConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
