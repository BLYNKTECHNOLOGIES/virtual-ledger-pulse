import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Paperclip, X, Plus, MessageSquare, Settings as SettingsIcon, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { LANG_OPTIONS, type Lang, t } from "@/lib/help-assistant-i18n";

interface Msg {
  id?: string;
  role: "user" | "assistant";
  content: string;
  image_urls?: string[];
  sources?: Array<{ n: number; title: string; sourceType: string; parentId: string }>;
  feedback?: number | null;
}

export default function HelpAssistant() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [lang, setLang] = useState<Lang>("en");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<{ url: string; path: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load preferred language
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("staff_chat_user_prefs").select("language").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.language) setLang(data.language as Lang); });
  }, [user?.id]);

  const updateLang = async (l: Lang) => {
    setLang(l);
    if (user?.id) {
      await supabase.from("staff_chat_user_prefs").upsert({ user_id: user.id, language: l });
    }
  };

  // Conversation history
  const { data: conversations = [] } = useQuery({
    queryKey: ["staff-chat-conversations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase.from("staff_chat_conversations")
        .select("id, title, updated_at").eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(30);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const loadConversation = async (id: string) => {
    setConversationId(id);
    const { data } = await supabase.from("staff_chat_messages")
      .select("*").eq("conversation_id", id).order("created_at", { ascending: true });
    setMessages((data ?? []).map((m: any) => ({
      id: m.id, role: m.role, content: m.content, image_urls: m.image_urls,
      sources: m.sources, feedback: m.feedback,
    })));
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput("");
    setPendingImages([]);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Compress + upload image
  const handleFiles = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    const remaining = 3 - pendingImages.length;
    const list = Array.from(files).slice(0, remaining);
    for (const file of list) {
      try {
        const compressed = await compressImage(file, 1600, 0.85);
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const { error } = await supabase.storage.from("staff-chat-uploads").upload(path, compressed, { contentType: "image/jpeg" });
        if (error) throw error;
        const { data: signed } = await supabase.storage.from("staff-chat-uploads").createSignedUrl(path, 3600);
        if (signed?.signedUrl) {
          setPendingImages((p) => [...p, { url: signed.signedUrl, path }]);
        }
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    }
  };

  const removePending = async (idx: number) => {
    const img = pendingImages[idx];
    setPendingImages((p) => p.filter((_, i) => i !== idx));
    await supabase.storage.from("staff-chat-uploads").remove([img.path]);
  };

  const send = async () => {
    if (streaming) return;
    if (!input.trim() && pendingImages.length === 0) return;

    const userMsg: Msg = {
      role: "user",
      content: input,
      image_urls: pendingImages.map((p) => p.url),
    };
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    const sentInput = input;
    const sentImages = pendingImages.map((p) => p.url);
    setInput("");
    setPendingImages([]);
    setStreaming(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversationId, message: sentInput, imageUrls: sentImages, language: lang,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";
      let sources: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const event = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = event.split("\n");
          let evtType = "message";
          let dataStr = "";
          for (const ln of lines) {
            if (ln.startsWith("event: ")) evtType = ln.slice(7).trim();
            else if (ln.startsWith("data: ")) dataStr = ln.slice(6).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (evtType === "meta") {
              if (data.conversationId && !conversationId) setConversationId(data.conversationId);
              sources = data.sources ?? [];
            } else if (data.delta) {
              assistantText += data.delta;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: assistantText, sources };
                return copy;
              });
            }
          } catch {}
        }
      }

      qc.invalidateQueries({ queryKey: ["staff-chat-conversations"] });
    } catch (e: any) {
      const msg = e.message?.includes("limit") ? t("rateLimit", lang) : (e.message || t("error", lang));
      toast({ title: t("error", lang), description: msg, variant: "destructive" });
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  const giveFeedback = async (msgId: string | undefined, val: 1 | -1) => {
    if (!msgId) return;
    setMessages((m) => m.map((x) => x.id === msgId ? { ...x, feedback: val } : x));
    await supabase.from("staff_chat_messages").update({ feedback: val }).eq("id", msgId);
  };

  return (
    <PermissionGate permissions={["help_assistant_view", "help_assistant_manage"]}>
      <div className="flex h-[calc(100vh-4rem)] bg-background">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <Button onClick={newChat} className="w-full" variant="default">
              <Plus className="h-4 w-4" /> {t("newChat", lang)}
            </Button>
            <PermissionGate permissions={["help_assistant_manage"]} showFallback={false}>
              <Button onClick={() => navigate("/help-assistant/admin")} variant="outline" className="w-full">
                <SettingsIcon className="h-4 w-4" /> {t("manage", lang)}
              </Button>
            </PermissionGate>
          </div>
          <div className="px-3 pt-3 text-xs uppercase tracking-wider text-muted-foreground">{t("history", lang)}</div>
          <ScrollArea className="flex-1 px-2 py-2">
            {conversations.map((c: any) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent flex items-start gap-2 mb-1 ${conversationId === c.id ? "bg-accent" : ""}`}
              >
                <MessageSquare className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
                <span className="truncate text-foreground">{c.title}</span>
              </button>
            ))}
          </ScrollArea>
        </aside>

        {/* Chat panel */}
        <main className="flex-1 flex flex-col">
          <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{t("title", lang)}</h1>
                <p className="text-xs text-muted-foreground">{t("subtitle", lang)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("language", lang)}:</span>
              <Select value={lang} onValueChange={(v) => updateLang(v as Lang)}>
                <SelectTrigger className="w-32 text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Sparkles className="h-12 w-12 text-primary/40 mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">{t("emptyTitle", lang)}</h2>
                <p className="text-sm text-muted-foreground max-w-md">{t("emptyHint", lang)}</p>
              </div>
            )}
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"} rounded-2xl px-4 py-3`}>
                    {m.image_urls && m.image_urls.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {m.image_urls.map((u, k) => (
                          <img key={k} src={u} alt="" className="h-32 w-32 object-cover rounded-md border border-border" />
                        ))}
                      </div>
                    )}
                    {m.role === "assistant" && !m.content && streaming ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("thinking", lang)}
                      </div>
                    ) : (
                      <div className={`prose prose-sm max-w-none ${m.role === "user" ? "prose-invert" : "dark:prose-invert"}`}>
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                    {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("sources", lang)}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.sources.map((s) => (
                            <span key={s.n} className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              [{s.n}] {s.title.slice(0, 50)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {m.role === "assistant" && m.id && m.content && (
                      <div className="mt-2 flex items-center gap-1">
                        <button onClick={() => giveFeedback(m.id, 1)} className={`p-1 rounded hover:bg-accent ${m.feedback === 1 ? "text-primary" : "text-muted-foreground"}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => giveFeedback(m.id, -1)} className={`p-1 rounded hover:bg-accent ${m.feedback === -1 ? "text-destructive" : "text-muted-foreground"}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Input bar */}
          <div className="border-t border-border bg-card px-6 py-4">
            <div className="max-w-3xl mx-auto">
              {pendingImages.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {pendingImages.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p.url} className="h-16 w-16 object-cover rounded border border-border" />
                      <button onClick={() => removePending(i)} className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={pendingImages.length >= 3}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={t("placeholder", lang)}
                  className="min-h-[44px] max-h-32 text-foreground resize-none"
                  rows={1}
                />
                <Button onClick={send} disabled={streaming || (!input.trim() && pendingImages.length === 0)}>
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </PermissionGate>
  );
}

async function compressImage(file: File, maxWidth: number, quality: number): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const ratio = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = img.width * ratio;
  canvas.height = img.height * ratio;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}
