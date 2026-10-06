import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sparkles, Send, Plus, Loader2, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_name?: string | null;
  created_at: string;
};

const SUGGESTIONS = [
  "Quais patrocinadores estão quentes sem contato há mais de 30 dias?",
  "Mostre o pipeline atual por estágio",
  "Lista parcelas atrasadas e a vencer nos próximos 7 dias",
  "Quais entregas estão pendentes?",
];

export function AIAssistantDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) loadConversations();
  }, [open]);

  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId);
    else setMessages([]);
  }, [activeConvId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function loadConversations() {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, title, last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(30);
    setConversations(data || []);
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from("ai_messages")
      .select("id, role, content, tool_name, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { conversationId: activeConvId, message: trimmed },
      });
      if (error) throw error;
      const newConvId = (data as any)?.conversationId;
      if (newConvId && newConvId !== activeConvId) {
        setActiveConvId(newConvId);
      } else if (activeConvId) {
        await loadMessages(activeConvId);
      }
      loadConversations();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar mensagem");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  const visibleMessages = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0"
      >
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              BrandAI
            </SheetTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistory((v) => !v)}
                title="Histórico"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setActiveConvId(null);
                  setMessages([]);
                  setShowHistory(false);
                }}
                title="Nova conversa"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {showHistory ? (
          <ScrollArea className="flex-1 px-2 py-2">
            <div className="space-y-1">
              {conversations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma conversa ainda.
                </p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveConvId(c.id);
                    setShowHistory(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md hover:bg-muted transition",
                    activeConvId === c.id && "bg-muted",
                  )}
                >
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.last_message_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {visibleMessages.length === 0 && !sending && (
                <div className="space-y-3">
                  <div className="text-center py-6">
                    <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
                    <h3 className="font-semibold">Como posso ajudar?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Pergunte sobre patrocinadores, pipeline, entregas e mais.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="w-full text-left text-sm px-3 py-2 rounded-md border hover:bg-muted transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {visibleMessages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 max-w-[85%] text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content || ""}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pensando...
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="border-t p-3 flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte algo..."
                disabled={sending}
                autoFocus
              />
              <Button type="submit" size="icon" disabled={sending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
