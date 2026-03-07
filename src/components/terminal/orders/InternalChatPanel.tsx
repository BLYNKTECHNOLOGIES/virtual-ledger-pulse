import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Send, Paperclip, Image, FileText, Users, Loader2, UserCheck, Wallet } from 'lucide-react';
import { useInternalMessages, useSendInternalMessage, useMarkInternalChatRead, InternalMessage } from '@/hooks/useInternalChat';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

interface Props {
  orderNumber: string;
  advNo?: string | null;
  totalPrice?: number;
  tradeType?: string;
}

export function InternalChatPanel({ orderNumber, advNo, totalPrice, tradeType }: Props) {
  const { messages, isLoading } = useInternalMessages(orderNumber);
  const { send } = useSendInternalMessage();
  const { markRead } = useMarkInternalChatRead(orderNumber);
  const { userId } = useTerminalAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch assigned payer & operator for this order
  const { data: assignmentInfo } = useQuery({
    queryKey: ['order-assignment-info', advNo, totalPrice],
    queryFn: async () => {
      if (!advNo && !totalPrice) return null;

      // Fetch all active payer & operator assignments + size ranges + usernames in parallel
      const [payerRes, operatorRes, rangesRes] = await Promise.all([
        supabase.from('terminal_payer_assignments').select('payer_user_id, ad_id, size_range_id').eq('is_active', true),
        supabase.from('terminal_operator_assignments' as any).select('operator_user_id, ad_id, size_range_id').eq('is_active', true),
        supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount'),
      ]);

      const ranges = rangesRes.data || [];
      const rangeMap = new Map(ranges.map((r: any) => [r.id, r]));

      // Find matching payer (by ad_id or size_range containing totalPrice)
      const matchAssignment = (assignments: any[], userIdField: string) => {
        const matched = new Set<string>();
        for (const a of (assignments || [])) {
          const matchByAd = advNo && a.ad_id && a.ad_id === advNo;
          const matchByRange = totalPrice && a.size_range_id && (() => {
            const range = rangeMap.get(a.size_range_id);
            return range && totalPrice >= range.min_amount && totalPrice <= range.max_amount;
          })();
          if (matchByAd || matchByRange) {
            matched.add(a[userIdField]);
          }
        }
        return Array.from(matched);
      };

      const payerUserIds = matchAssignment(payerRes.data || [], 'payer_user_id');
      const operatorUserIds = matchAssignment(operatorRes.data || [], 'operator_user_id');

      const allUserIds = [...new Set([...payerUserIds, ...operatorUserIds])];
      if (allUserIds.length === 0) return { payers: [], operators: [] };

      const { data: users } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .in('id', allUserIds);

      const userMap = new Map((users || []).map((u: any) => [u.id, u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username]));

      return {
        payers: payerUserIds.map(id => userMap.get(id) || 'Unknown'),
        operators: operatorUserIds.map(id => userMap.get(id) || 'Unknown'),
      };
    },
    enabled: !!(advNo || totalPrice),
    staleTime: 60000,
  });

  // Mark read on mount and when new messages arrive
  useEffect(() => {
    markRead();
  }, [messages.length, markRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await send({ orderNumber, text: trimmed });
      setText('');
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${orderNumber}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('internal-chat-files')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('internal-chat-files')
        .getPublicUrl(path);

      const isImage = file.type.startsWith('image/');
      await send({
        orderNumber,
        text: isImage ? null : file.name,
        fileUrl: urlData.publicUrl,
        fileName: file.name,
        messageType: isImage ? 'image' : 'file',
      });
    } catch (err) {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card/50">
        <Users className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">Internal Chat</span>
        <span className="text-[10px] text-muted-foreground">— Order #{orderNumber.slice(-8)}</span>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 px-3 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
            <Users className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No internal messages yet</p>
            <p className="text-[10px] text-muted-foreground/60">
              Start a conversation with your team
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <InternalChatBubble key={msg.id} message={msg} isOwn={msg.sender_id === userId} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border px-3 py-2 bg-card/50">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="h-8 text-xs"
            disabled={sending}
          />
          <Button
            variant="default"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleSend}
            disabled={!text.trim() || sending}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function InternalChatBubble({ message, isOwn }: { message: InternalMessage; isOwn: boolean }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] min-w-0 rounded-lg px-3 py-2 overflow-hidden ${
          isOwn
            ? 'bg-primary/15 border border-primary/20 text-foreground'
            : 'bg-secondary border border-border text-foreground'
        }`}
      >
        <p className={`text-[9px] font-semibold mb-0.5 ${
          isOwn ? 'text-primary' : 'text-trade-pending'
        }`}>
          {message.sender_name}
        </p>

        {/* Image */}
        {message.message_type === 'image' && message.file_url && !imgError && (
          <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
            <img
              src={message.file_url}
              alt={message.file_name || 'Image'}
              className="max-w-full w-auto rounded max-h-48 object-contain"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </a>
        )}

        {/* File attachment */}
        {message.message_type === 'file' && message.file_url && (
          <a
            href={message.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 mb-1.5 px-2 py-1.5 rounded bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-primary underline truncate">{message.file_name || 'Download file'}</span>
          </a>
        )}

        {/* Text */}
        {message.message_text && (
          <p className="text-xs whitespace-pre-wrap leading-relaxed break-words overflow-hidden">
            {message.message_text}
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-1">
          <p className="text-[9px] text-muted-foreground">
            {format(new Date(message.created_at), 'HH:mm')}
          </p>
          <span className="text-[8px] text-accent-foreground bg-accent/50 px-1 rounded">
            {message.sender_name}
          </span>
        </div>
      </div>
    </div>
  );
}
