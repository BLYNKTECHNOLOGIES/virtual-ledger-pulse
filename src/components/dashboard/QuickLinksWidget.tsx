
import { useState } from "react";
import { WidgetShell, WidgetHeader, WidgetBody, WidgetEmpty } from "./primitives/WidgetShell";
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
      <div className="group/link flex h-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/50">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LinkIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-tight text-foreground">{link.title}</p>
            {link.description && (
              <p className="truncate text-[11px] leading-tight text-muted-foreground">{link.description}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-within/link:opacity-100">
          {link.isExternal && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.preventDefault(); handleEditLink(link); }}
            className="h-7 w-7"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.preventDefault(); handleDeleteLink(link.id); }}
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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
    <WidgetShell className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
      <WidgetHeader
        icon={LinkIcon}
        title="Quick Links"
        subtitle="Shortcuts to frequently used pages"
        actions={
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingLink ? 'Edit Quick Link' : 'Add Quick Link'}</DialogTitle>
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
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="isExternal" className="text-sm">External link (opens in new tab)</Label>
                </div>
                <div className="flex gap-3 pt-2">
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
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <WidgetBody>
        {quickLinks.length === 0 ? (
          <WidgetEmpty
            icon={LinkIcon}
            title="No quick links yet"
            description="Create shortcuts to your most-used pages and external tools"
            action={
              <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add your first link
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 @md/widget:grid-cols-2 @3xl/widget:grid-cols-3 @5xl/widget:grid-cols-4">
            {quickLinks.map(renderLink)}
          </div>
        )}
      </WidgetBody>
    </WidgetShell>
  );
}
