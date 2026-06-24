import { useState } from "react";
import { useListSessions, useListMessages, useSendMessage, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Send, ChevronLeft, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function Chat() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(true);

  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messages, isLoading: messagesLoading } = useListMessages(activeSessionId ?? 0, {
    query: { enabled: !!activeSessionId } as any,
  });

  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  const handleCreateSession = () => {
    createSession.mutate(
      { data: { title: "New Conversation", mode: "chat" } },
      {
        onSuccess: (session) => {
          setActiveSessionId(session.id);
          setShowSessions(false);
        },
      }
    );
  };

  const handleSelectSession = (id: number) => {
    setActiveSessionId(id);
    setShowSessions(false);
  };

  const handleSend = () => {
    if (!input.trim() || !activeSessionId) return;
    sendMessage.mutate({ sessionId: activeSessionId, data: { content: input } });
    setInput("");
  };

  const activeSession = sessions?.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-full font-mono overflow-hidden">
      {/* Sessions panel */}
      <div
        className={cn(
          "flex flex-col border-r border-border bg-card",
          // Mobile: full width when shown, hidden when chat is active
          "w-full md:w-72 md:flex",
          showSessions ? "flex" : "hidden md:flex"
        )}
      >
        <div className="p-3 border-b border-border flex justify-between items-center shrink-0">
          <h2 className="font-semibold tracking-tight text-sm">Conversations</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCreateSession}
            disabled={createSession.isPending}
            className="h-8 w-8"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
            ) : !sessions?.length ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No sessions yet.
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex flex-col gap-0.5",
                    activeSessionId === session.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-foreground hover:bg-accent border border-transparent"
                  )}
                >
                  <div className="font-medium truncate">{session.title}</div>
                  <div className="text-xs opacity-60 flex justify-between">
                    <span>{session.mode}</span>
                    <span>{format(new Date(session.updatedAt), "MM/dd")}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-background min-w-0",
          showSessions ? "hidden md:flex" : "flex"
        )}
      >
        {activeSessionId ? (
          <>
            {/* Chat header */}
            <div className="h-12 border-b border-border flex items-center px-3 gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-8 w-8 shrink-0"
                onClick={() => setShowSessions(true)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-semibold text-sm truncate">
                {activeSession?.title ?? `Session #${activeSessionId}`}
              </span>
            </div>

            <ScrollArea className="flex-1 px-3 md:px-6 py-4">
              <div className="max-w-2xl mx-auto space-y-4">
                {messagesLoading ? (
                  <div className="text-center text-muted-foreground animate-pulse text-sm">Syncing...</div>
                ) : !messages?.length ? (
                  <div className="text-center text-muted-foreground py-10">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Connection established. Awaiting input.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col max-w-[88%]",
                        msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        {msg.role === "user" ? (
                          "You"
                        ) : (
                          <>
                            <Bot className="w-3 h-3" />
                            {msg.agentType ?? "Assistant"}
                          </>
                        )}
                      </div>
                      <div
                        className={cn(
                          "px-3 py-2.5 rounded-lg text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border text-foreground"
                        )}
                      >
                        <pre className="whitespace-pre-wrap font-sans break-words">{msg.content}</pre>
                      </div>
                    </div>
                  ))
                )}
                {sendMessage.isPending && (
                  <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <Bot className="w-3 h-3" />
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border bg-card shrink-0">
              <div className="max-w-2xl mx-auto flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Enter message..."
                  className="bg-background border-border font-mono text-sm"
                  disabled={sendMessage.isPending}
                />
                <Button
                  onClick={handleSend}
                  disabled={sendMessage.isPending || !input.trim()}
                  size="icon"
                  className="shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm text-center">Select a conversation or create a new one.</p>
            <Button className="mt-4" onClick={handleCreateSession} disabled={createSession.isPending}>
              <Plus className="w-4 h-4 mr-2" /> New Conversation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
