import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, ShoppingCart } from 'lucide-react';
import { SmallSalesConfig } from './SmallSalesConfig';
import { SmallBuysConfig } from './SmallBuysConfig';
import { SEG_LIST, SEG_TRIGGER } from './automationUi';

/** Below 768px the global phone CSS stretches every tablist to full width and pins each tab to its content width
 *  (`flex: 0 0 auto !important`). There the two segments fill the track and are 32px tall (tap target); the child
 *  selector out-ranks the global rule. */
const PHONE_LIST = 'max-md:h-9 max-md:[&>[role=tab]]:!flex-1';
const PHONE_TAB = 'max-md:h-8';

export function SmallOrdersConfig() {
  const [tab, setTab] = useState('sales');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={`${SEG_LIST} w-max max-w-none justify-start ${PHONE_LIST}`} aria-label="Small order side">
          <TabsTrigger value="sales" className={`${SEG_TRIGGER} max-w-none shrink-0 ${PHONE_TAB}`}>
            <Package className="h-3.5 w-3.5" />
            Small Sales
          </TabsTrigger>
          <TabsTrigger value="buys" className={`${SEG_TRIGGER} max-w-none shrink-0 ${PHONE_TAB}`}>
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
