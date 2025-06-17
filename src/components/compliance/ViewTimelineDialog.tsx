
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TimelineUpdate {
  id: string;
  update_text: string;
  created_at: string;
  created_by: string;
}

interface ViewTimelineDialogProps {
  lienCaseId: string;
}

export function ViewTimelineDialog({ lienCaseId }: ViewTimelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<TimelineUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUpdates = async () => {
    if (!open) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lien_updates')
        .select('*')
        .eq('lien_case_id', lienCaseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUpdates(data || []);
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, [open, lienCaseId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Clock className="h-4 w-4 mr-1" />
          View Timeline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>Lien Case Timeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : updates.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No updates found</div>
          ) : (
            updates.map((update, index) => (
              <div key={update.id} className="border-l-2 border-blue-200 pl-4 pb-4 relative">
                <div className="absolute -left-2 top-0 w-4 h-4 bg-blue-500 rounded-full"></div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600 mb-1">
                    {format(new Date(update.created_at), 'PPpp')} - {update.created_by}
                  </div>
                  <div className="text-gray-900">{update.update_text}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
