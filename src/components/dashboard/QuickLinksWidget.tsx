
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
      <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-300 group hover:shadow-md hover:border-blue-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
            <LinkIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-blue-900">{link.title}</p>
            {link.description && (
              <p className="text-sm text-gray-600 group-hover:text-blue-700">{link.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              handleEditLink(link);
            }}
            className="h-9 w-9 p-0 hover:bg-blue-100 hover:text-blue-700"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              handleDeleteLink(link.id);
            }}
            className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {link.isExternal && <ExternalLink className="h-4 w-4 text-gray-400" />}
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
    <Card className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 bg-white shadow-sm border-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 bg-gradient-to-r from-gray-50 to-gray-100">
        <CardTitle className="text-xl font-bold flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-sm">
            <LinkIcon className="h-5 w-5 text-white" />
          </div>
          Quick Links
        </CardTitle>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Link
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingLink ? 'Edit Quick Link' : 'Add Quick Link'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter link title"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="url" className="text-sm font-medium">URL</Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="/sales or https://example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="description" className="text-sm font-medium">Description (Optional)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description"
                  className="mt-1"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isExternal"
                  checked={formData.isExternal}
                  onChange={(e) => setFormData(prev => ({ ...prev, isExternal: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <Label htmlFor="isExternal" className="text-sm">External link (opens in new tab)</Label>
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={handleAddLink} className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  {editingLink ? 'Update Link' : 'Add Link'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAddDialog(false);
                    setEditingLink(null);
                    setFormData({ title: '', url: '', description: '', isExternal: false });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {quickLinks.map(renderLink)}
          {quickLinks.length === 0 && (
            <div className="col-span-full text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <LinkIcon className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No quick links added yet</h3>
              <p className="text-gray-600 mb-4">Create shortcuts to your most-used pages and external tools</p>
              <Button
                onClick={() => setShowAddDialog(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Link
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
