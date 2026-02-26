import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timer, Zap } from 'lucide-react';
import { AutoPaySettings } from './AutoPaySettings';
import { AutoReplyExecutionLog } from './AutoReplyExecutionLog';

export function AutoPayWithLog() {
  const [tab, setTab] = useState('autopay');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="autopay" className="gap-1.5 text-xs h-7">
            <Timer className="h-3.5 w-3.5" />
            Auto-Pay Settings
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-1.5 text-xs h-7">
            <Zap className="h-3.5 w-3.5" />
            Execution Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="autopay" className="mt-4">
          <AutoPaySettings />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <AutoReplyExecutionLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
