import { useState, useRef, useEffect } from 'react';
import { useTaskComments, useAddTaskComment } from '@/hooks/useTaskComments';
import { useUsers } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export function TaskComments({ taskId }: { taskId: string }) {
  const { data: comments, isLoading } = useTaskComments(taskId);
  const { data: allUsers } = useUsers();
  const addComment = useAddTaskComment();
  const [content, setContent] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSend = async () => {
    if (!content.trim()) return;
    // Extract @mentions
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[2]);
    }

    try {
      await addComment.mutateAsync({ taskId, content: content.trim(), mentions });
      setContent('');
    } catch {
      toast({ title: 'Error', description: 'Failed to add comment', variant: 'destructive' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '@') {
      setShowMentions(true);
      setMentionSearch('');
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (showMentions && e.key === 'Escape') {
      setShowMentions(false);
    }
  };

  const handleInput = (val: string) => {
    setContent(val);
    if (showMentions) {
      const lastAt = val.lastIndexOf('@');
      if (lastAt >= 0) {
        setMentionSearch(val.substring(lastAt + 1));
      } else {
        setShowMentions(false);
      }
    }
  };

  const insertMention = (user: { id: string; full_name: string }) => {
    const lastAt = content.lastIndexOf('@');
    const before = content.substring(0, lastAt);
    const newContent = `${before}@[${user.full_name}](${user.id}) `;
    setContent(newContent);
    setShowMentions(false);
  };

  const filteredUsers = (allUsers || []).filter(u =>
    !mentionSearch || u.full_name?.toLowerCase().includes(mentionSearch.toLowerCase())
  ).slice(0, 5);

  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const displayContent = (text: string) => {
    // Escape HTML first to prevent XSS, then apply mention formatting
    const escaped = escapeHtml(text);
    return escaped.replace(/@\[([^\]]+)\]\([^)]+\)/g, '<span class="text-primary font-medium">@$1</span>');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[300px] pr-1">
        {isLoading && <p className="text-sm text-muted-foreground py-4">Loading comments...</p>}
        {!isLoading && !comments?.length && <p className="text-sm text-muted-foreground py-4">No comments yet</p>}
        {comments?.map((c) => (
          <div key={c.id} className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{c.user_name}</span>
              {c.user_username && <span className="text-xs text-muted-foreground">@{c.user_username}</span>}
              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(c.created_at), 'MMM d, h:mm a')}
              </span>
            </div>
            <p className="text-sm" dangerouslySetInnerHTML={{ __html: displayContent(c.content) }} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="relative mt-3">
        {showMentions && filteredUsers.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 w-full bg-popover border rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
            {filteredUsers.map(u => (
              <button
                key={u.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                onClick={() => insertMention(u)}
              >
                {u.full_name} <span className="text-muted-foreground">@{u.username}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (type @ to mention)"
            className="min-h-[40px] max-h-[100px] resize-none text-sm"
            rows={1}
          />
          <Button size="icon" onClick={handleSend} disabled={!content.trim() || addComment.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
