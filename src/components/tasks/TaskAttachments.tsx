import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, File, Trash2, Download, Loader2 } from 'lucide-react';

const from = (table: string) => supabase.from(table as any);

export function TaskAttachments({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: attachments, isLoading } = useQuery({
    queryKey: ['erp-task-attachments', taskId],
    queryFn: async () => {
      const { data, error } = await from('erp_task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!taskId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachment: any) => {
      const path = attachment.file_url?.split('/task-attachments/')[1];
      if (path) await supabase.storage.from('task-attachments').remove([path]);
      const { error } = await from('erp_task_attachments').delete().eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erp-task-attachments', taskId] });
      toast({ title: 'Attachment removed' });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const filePath = `${taskId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(filePath);

      await from('erp_task_attachments').insert({
        task_id: taskId,
        uploaded_by: user?.id,
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
      });

      await from('erp_task_activity_log').insert({
        task_id: taskId, user_id: user?.id, action: 'attachment_added',
        details: { file_name: file.name },
      });

      queryClient.invalidateQueries({ queryKey: ['erp-task-attachments', taskId] });
      toast({ title: 'File uploaded' });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Attachments</h4>
        <label>
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          <Button size="sm" variant="outline" asChild className="cursor-pointer">
            <span>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              Upload
            </span>
          </Button>
        </label>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
      {!isLoading && !attachments?.length && <p className="text-xs text-muted-foreground">No attachments</p>}
      {attachments?.map((a: any) => (
        <div key={a.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2">
          <File className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{a.file_name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatSize(a.file_size || 0)}</span>
          <a href={a.file_url} target="_blank" rel="noopener noreferrer">
            <Button size="icon" variant="ghost" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
          </a>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(a)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
