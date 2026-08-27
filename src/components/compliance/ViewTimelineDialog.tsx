import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, FileText, Download, Eye, Send, Paperclip, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useFileDropzone } from "@/hooks/useFileDropzone";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { downloadStorageFile, openStorageFile } from "@/lib/storage-url";
import { CASE_UPDATE_ATTACHMENT_BUCKET, getCaseDocumentFileName, uniqueCaseDocumentUrls } from "@/lib/compliance-case-documents";


import { usersDirectory } from "@/lib/usersDirectory";
interface TimelineUpdate {
  id: string;
  update_text: string;
  created_at: string;
  created_by: string;
  attachment_urls: string[] | null;
  update_type?: string | null;
}

const UPDATE_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "BANK_RESPONSE", label: "Bank response" },
  { value: "LEA_RESPONSE", label: "LEA response" },
  { value: "ESCALATION", label: "Escalation" },
  { value: "DOCUMENT_SUBMITTED", label: "Document submitted" },
  { value: "RESOLUTION", label: "Resolution" },
];

interface ViewTimelineDialogProps {
  caseId: string;
  caseType: 'bank_case' | 'lien_case';
}

export function ViewTimelineDialog({ caseId, caseType }: ViewTimelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<TimelineUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [updateType, setUpdateType] = useState("NOTE");
  const [posting, setPosting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { hasPermission } = usePermissions();
  const canPost = hasPermission("compliance_manage") && caseType === "bank_case";


  const fetchUpdates = async () => {
    if (!open) return;
    setLoading(true);
    try {
      if (caseType === 'lien_case') {
        const { data, error } = await supabase
          .from('lien_updates')
          .select('id, update_text, created_at, created_by, attachment_urls')
          .eq('lien_case_id', caseId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUpdates(data || []);
      } else {
        // For bank cases, show the linked account investigation timeline.
        const { data: investigation, error: investigationError } = await supabase
          .from('account_investigations')
          .select('id')
          .eq('bank_case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (investigationError) throw investigationError;

        const merged: TimelineUpdate[] = [];

        const { data: bankCase, error: bankCaseError } = await supabase
          .from('bank_cases')
          .select('created_at, created_by, documents_attached, screenshots, proof_of_debit, supporting_proof, supporting_document, statement_proof')
          .eq('id', caseId)
          .maybeSingle();
        if (bankCaseError) throw bankCaseError;

        if (bankCase) {
          const initialAttachments = uniqueCaseDocumentUrls([
            ...(bankCase.documents_attached || []),
            ...(bankCase.screenshots || []),
            bankCase.proof_of_debit,
            bankCase.supporting_proof,
            bankCase.supporting_document,
            bankCase.statement_proof,
          ]);

          if (initialAttachments.length > 0) {
            merged.push({
              id: `${caseId}-initial-documents`,
              update_text: `${initialAttachments.length} document(s) attached while creating the case`,
              created_at: bankCase.created_at,
              created_by: bankCase.created_by || 'System',
              attachment_urls: initialAttachments,
              update_type: 'DOCUMENT_SUBMITTED',
            });
          }
        }

        const { data: caseUpdates, error: caseUpdatesError } = await supabase
          .from('compliance_case_updates')
          .select('id, update_text, created_at, created_by_name, attachment_urls, update_type')
          .eq('bank_case_id', caseId)
          .order('created_at', { ascending: false });
        if (caseUpdatesError) throw caseUpdatesError;
        for (const u of caseUpdates || []) {
          merged.push({
            id: u.id,
            update_text: u.update_text,
            created_at: u.created_at,
            created_by: u.created_by_name || 'System',
            attachment_urls: u.attachment_urls,
            update_type: u.update_type,
          });
        }

        if (investigation) {
          const { data, error } = await supabase
            .from('investigation_updates')
            .select('id, update_text, created_at, created_by, attachment_urls')
            .eq('investigation_id', investigation.id)
            .order('created_at', { ascending: false });
          if (error) throw error;
          for (const u of data || []) merged.push({ ...u, update_type: 'INVESTIGATION' });
        }

        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setUpdates(merged);
      }
    } catch (error) {
      console.error('Error fetching updates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = async (fileUrl: string) => {
    const resolved = await resolveStorageUrl(fileUrl, CASE_UPDATE_ATTACHMENT_BUCKET);
    if (!resolved) {
      toast.error('Could not open this document');
      return;
    }
    window.open(resolved, '_blank', 'noopener');
  };

  const handleDownloadDocument = async (fileUrl: string) => {
    const resolved = await resolveStorageUrl(fileUrl, CASE_UPDATE_ATTACHMENT_BUCKET);
    if (!resolved) {
      toast.error('Could not download this document');
      return;
    }
    await downloadStorageFile(fileUrl, getCaseDocumentFileName(fileUrl), CASE_UPDATE_ATTACHMENT_BUCKET);
  };

  const MAX_FILE_BYTES = 25 * 1024 * 1024;

  const addFiles = (files: File[]) => {
    const accepted = files.filter((f) => {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} is larger than 25MB`);
        return false;
      }
      return true;
    });
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
  };

  const uploadAttachments = async (): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of attachments) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `compliance-case-updates/${caseId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from('kyc-documents')
        .upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  };

  const { isDragActive, dropzoneProps } = useFileDropzone({
    onFiles: addFiles,
    disabled: posting,
    multiple: true,
  });

  const postUpdate = async () => {
    if (!newUpdate.trim() && attachments.length === 0) return;
    setPosting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      let name: string | null = null;
      if (uid) {
        const { data: me } = await usersDirectory()
          .select('first_name, last_name, username')
          .eq('id', uid)
          .maybeSingle();
        if (me) name = [me.first_name, me.last_name].filter(Boolean).join(' ').trim() || me.username;
      }
      const attachmentPaths = attachments.length > 0 ? await uploadAttachments() : [];
      const { error } = await supabase.from('compliance_case_updates').insert({
        bank_case_id: caseId,
        update_text: newUpdate.trim() || `${attachmentPaths.length} document(s) attached`,
        update_type: updateType,
        created_by: uid,
        created_by_name: name,
        attachment_urls: attachmentPaths.length > 0 ? attachmentPaths : null,
      });
      if (error) throw error;
      setNewUpdate('');
      setUpdateType('NOTE');
      setAttachments([]);
      toast.success('Update added to the case timeline');
      fetchUpdates();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };


  useEffect(() => {
    fetchUpdates();
  }, [open, caseId, caseType]);

  const title = caseType === 'lien_case' ? 'Lien Case Timeline' : 'Case Timeline';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Clock className="h-4 w-4 mr-1" />
          View Timeline
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-md skeleton-shimmer" />
              ))}
            </div>
          ) : updates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm text-muted-foreground">No updates found</p>
            </div>
          ) : (
            updates.map((update) => (
              <div key={update.id} className="border-l-2 border-info/20 pl-4 pb-4 relative">
                <div className="absolute -left-2 top-0 w-4 h-4 bg-info rounded-full"></div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="text-sm text-muted-foreground mb-1">
                    {format(new Date(update.created_at), 'PPpp')} - {update.created_by}
                    {update.update_type && update.update_type !== 'NOTE' && (
                      <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        {update.update_type.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="text-foreground mb-2">{update.update_text}</div>
                  {update.attachment_urls && update.attachment_urls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm font-medium text-foreground">Attachments:</div>
                      <div className="space-y-1">
                        {update.attachment_urls.map((url, urlIndex) => {
                          const fileName = getCaseDocumentFileName(url, `Document ${urlIndex + 1}`);
                          const lower = fileName.toLowerCase();
                          const isPdf = lower.endsWith('.pdf');
                          const isImage = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/.test(lower);
                          return (
                            <div key={urlIndex} className="flex items-center gap-2 p-2 bg-card rounded border">
                              <FileText className="h-4 w-4 text-destructive" />
                              <span className="text-sm flex-1 truncate">{fileName}</span>
                              <div className="flex gap-1">
                                {(isPdf || isImage) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    onClick={() => handleViewDocument(url)}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2"
                                  onClick={() => handleDownloadDocument(url)}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {canPost && (
          <div className="border-t border-border pt-4 space-y-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
              <Select value={updateType} onValueChange={setUpdateType}>
                <SelectTrigger className="min-w-0 flex-1 text-foreground h-9 sm:flex-none sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPDATE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={posting}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Posting an update refreshes the case activity clock</p>
            </div>
            <Textarea
              rows={3}
              className="text-foreground"
              placeholder="Add an update — what happened, who was contacted, what is next…"
              value={newUpdate}
              onChange={(e) => setNewUpdate(e.target.value)}
            />
            <div
              className={`rounded-md border border-dashed border-border bg-muted/30 p-3 transition-colors ${isDragActive ? "border-primary bg-primary/10" : ""}`}
              {...dropzoneProps}
            >
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="w-full justify-start text-primary hover:bg-primary/10"
                onClick={() => fileInputRef.current?.click()}
                disabled={posting}
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Upload documents, PDFs, images, or files
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center gap-2 rounded border bg-muted/40 px-2 py-1">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs">{file.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                onClick={postUpdate}
                disabled={posting || (!newUpdate.trim() && attachments.length === 0)}
              >
                <Send className="h-4 w-4 mr-2" />
                {posting ? "Posting…" : "Post update"}
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
