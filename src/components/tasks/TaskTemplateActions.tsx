import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { BookTemplate, Save, Loader2 } from 'lucide-react';

const from = (table: string) => supabase.from(table as any);

interface TaskTemplateActionsProps {
  onLoadTemplate: (template: { title: string; description: string; priority: string; tags: string[] }) => void;
  currentTask?: { title: string; description: string; priority: string; tags: string };
}

export function TaskTemplateActions({ onLoadTemplate, currentTask }: TaskTemplateActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const { data: templates } = useQuery({
    queryKey: ['erp-task-templates'],
    queryFn: async () => {
      const { data, error } = await from('erp_task_templates').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!templateName.trim() || !currentTask) return;
      const { error } = await from('erp_task_templates').insert({
        title: templateName.trim(),
        description: currentTask.description || null,
        priority: currentTask.priority,
        tags: currentTask.tags ? currentTask.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-task-templates'] });
      toast({ title: 'Template saved' });
      setSaveOpen(false);
      setTemplateName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await from('erp_task_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-task-templates'] });
    },
  });

  return (
    <>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setLoadOpen(true)}>
          <BookTemplate className="h-3.5 w-3.5 mr-1" /> Load Template
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setSaveOpen(true)} disabled={!currentTask?.title}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save as Template
        </Button>
      </div>

      {/* Save Template Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save as Template</DialogTitle></DialogHeader>
          <Input placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} />
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={!templateName.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Template Dialog */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Load Template</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {!templates?.length && <p className="text-sm text-muted-foreground py-4">No templates saved yet</p>}
            {templates?.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.priority} priority</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => {
                    onLoadTemplate({ title: t.title, description: t.description || '', priority: t.priority || 'medium', tags: t.tags || [] });
                    setLoadOpen(false);
                  }}>Use</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(t.id)}>×</Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
