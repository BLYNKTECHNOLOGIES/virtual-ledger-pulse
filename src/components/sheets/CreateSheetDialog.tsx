
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Calculator, Users, BarChart3, Table } from "lucide-react";

interface CreateSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateSheet: (sheetData: any) => void;
}

export function CreateSheetDialog({ open, onOpenChange, onCreateSheet }: CreateSheetDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: '',
    template: 'blank'
  });

  const templates = [
    { id: 'blank', name: 'Blank Spreadsheet', icon: FileText, description: 'Start with an empty spreadsheet' },
    { id: 'budget', name: 'Budget Tracker', icon: Calculator, description: 'Track expenses and income' },
    { id: 'attendance', name: 'Attendance Sheet', icon: Users, description: 'Monitor team attendance' },
    { id: 'dashboard', name: 'Dashboard', icon: BarChart3, description: 'Create data visualization' },
    { id: 'inventory', name: 'Inventory Tracker', icon: Table, description: 'Manage stock and inventory' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      onCreateSheet({
        ...formData,
        id: Date.now(),
        createdAt: new Date(),
        lastModified: new Date()
      });
      setFormData({ name: '', description: '', type: '', template: 'blank' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Spreadsheet</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Spreadsheet Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter spreadsheet name"
                required
              />
            </div>
            <div>
              <Label htmlFor="type">Category</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="budget">Budget</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this spreadsheet will be used for"
              rows={3}
            />
          </div>

          <div>
            <Label>Choose Template</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {templates.map((template) => {
                const Icon = template.icon;
                return (
                  <div
                    key={template.id}
                    className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                      formData.template === template.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200'
                    }`}
                    onClick={() => setFormData({ ...formData, template: template.id })}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-gray-600" />
                      <span className="font-medium text-sm">{template.name}</span>
                    </div>
                    <p className="text-xs text-gray-500">{template.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Create Spreadsheet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
