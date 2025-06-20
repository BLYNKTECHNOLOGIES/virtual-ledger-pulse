
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ExternalLink, Edit, Trash2, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface QuickLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  isExternal?: boolean;
}

interface QuickLinksWidgetProps {
  onRemove: (widgetId: string) => void;
}

export function QuickLinksWidget({ onRemove }: QuickLinksWidgetProps) {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([
    { id: '1', title: 'New Sale', url: '/sales', description: 'Create sales order' },
    { id: '2', title: 'Add Client', url: '/clients', description: 'Register new client' },
    { id: '3', title: 'Stock Check', url: '/stock', description: 'View inventory' },
    { id: '4', title: 'Reports', url: '/accounting', description: 'Financial reports' }
  ]);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    description: '',
    isExternal: false
  });

  const handleAddLink = () => {
    if (formData.title && formData.url) {
      const newLink: QuickLink = {
        id: Date.now().toString(),
        title: formData.title,
        url: formData.url,
        description: formData.description,
        isExternal: formData.isExternal
      };
      
      if (editingLink) {
        setQuickLinks(links => 
          links.map(link => link.id === editingLink.id ? { ...newLink, id: editingLink.id } : link)
        );
        setEditingLink(null);
      } else {
        setQuickLinks(links => [...links, newLink]);
      }
      
      setFormData({ title: '', url: '', description: '', isExternal: false });
      setShowAddDialog(false);
    }
  };

  const handleEditLink = (link: QuickLink) => {
    setEditingLink(link);
    setFormData({
      title: link.title,
      url: link.url,
      description: link.description || '',
      isExternal: link.isExternal || false
    });
    setShowAddDialog(true);
  };

  const handleDeleteLink = (linkId: string) => {
    setQuickLinks(links => links.filter(link => link.id !== linkId));
  };

  const renderLink = (link: QuickLink) => {
    const linkContent = (
      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors group">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <LinkIcon className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-sm">{link.title}</p>
            {link.description && (
              <p className="text-xs text-gray-600">{link.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              handleEditLink(link);
            }}
            className="h-8 w-8 p-0"
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              handleDeleteLink(link.id);
            }}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          {link.isExternal && <ExternalLink className="h-3 w-3 text-gray-400" />}
        </div>
      </div>
    );

    if (link.isExternal) {
      return (
        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">
          {linkContent}
        </a>
      );
    }

    return (
      <Link key={link.id} to={link.url}>
        {linkContent}
      </Link>
    );
  };

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg font-semibold">Quick Links</CardTitle>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLink ? 'Edit Quick Link' : 'Add Quick Link'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter link title"
                />
              </div>
              <div>
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="/sales or https://example.com"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isExternal"
                  checked={formData.isExternal}
                  onChange={(e) => setFormData(prev => ({ ...prev, isExternal: e.target.checked }))}
                />
                <Label htmlFor="isExternal">External link (opens in new tab)</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddLink} className="flex-1">
                  {editingLink ? 'Update Link' : 'Add Link'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAddDialog(false);
                    setEditingLink(null);
                    setFormData({ title: '', url: '', description: '', isExternal: false });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {quickLinks.map(renderLink)}
          {quickLinks.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <LinkIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No quick links added yet</p>
              <p className="text-sm">Click "Add Link" to get started</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
