import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Department {
  id?: string;
  name: string;
  code: string;
  description?: string | null;
  hierarchy_level?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department?: Department | null;
  onSuccess: () => void;
}

export function DepartmentFormDialog({ open, onOpenChange, department, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (department) {
      setName(department.name);
      setCode(department.code);
      setDescription(department.description || "");
      setLevel(department.hierarchy_level?.toString() || "");
    } else {
      setName(""); setCode(""); setDescription(""); setLevel("");
    }
  }, [department, open]);

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      hierarchy_level: level ? parseInt(level) : null,
      is_active: true,
    };

    let error;
    if (department?.id) {
      ({ error } = await supabase.from("departments").update(payload).eq("id", department.id));
    } else {
      ({ error } = await supabase.from("departments").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast.error("Failed to save department: " + error.message);
    } else {
      toast.success(department?.id ? "Department updated" : "Department created");
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{department?.id ? "Edit Department" : "Add Department"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Department Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering" />
          </div>
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ENG" className="uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label>Hierarchy Level</Label>
            <Input type="number" value={level} onChange={e => setLevel(e.target.value)} placeholder="e.g. 1" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
