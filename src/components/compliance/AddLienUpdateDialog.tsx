
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddLienUpdateDialogProps {
  lienCaseId: string;
  onUpdateAdded: () => void;
}

export function AddLienUpdateDialog({ lienCaseId, onUpdateAdded }: AddLienUpdateDialogProps) {
  const [open, setOpen] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('lien_updates')
        .insert([{
          lien_case_id: lienCaseId,
          update_text: updateText,
          created_by: 'System User' // Replace with actual user when auth is implemented
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Update added successfully",
      });

      setUpdateText("");
      setOpen(false);
      onUpdateAdded();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add update",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-1" />
          Add Update
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add Lien Update</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="update">Update Details *</Label>
            <Textarea
              id="update"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              rows={4}
              placeholder="Enter update details..."
              required
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Update</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
