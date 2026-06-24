import { useState } from "react";
import { useListSessions, useGetSession, useListMessages, useSendMessage, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function Chat() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  
  const { data: sessions, isLoading: sessionsLoading } = useListSessions();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: messages, isLoading: messagesLoading } = useListMessages(activeSessionId || 0, {
    query: { enabled: !!activeSessionId } as any
  });
  
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  const handleCreateSession = () => {
    createSession.mutate({
      data: { title: "New Conversation", mode: "chat" }
    }, {
      onSuccess: (session) => {
        setActiveSessionId(session.id);
      }
    });
  };

  const handleSend = () => {
    if (!input.trim() || !activeSessionId) return;
    
    sendMessage.mutate({
      sessionId: activeSessionId,
      data: { content: input }
    });
    
    setInput("");
  };

  return (
    <div className="flex h-full font-mono">
      {/* Sessions Sidebar */}
      <div className="w-72 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-semibold tracking-tight">Comms</h2>
          <Button variant="ghost" size="icon" onClick={handleCreateSession} disabled={createSession.isPending}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
            ) : sessions?.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">No sessions found.</div>
            ) : (
              sessions?.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-md text-sm transition-colors flex flex-col gap-1",
                    activeSessionId === session.id 
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : "text-foreground hover:bg-accent hover:text-accent-foreground border border-transparent"
                  )}
                >
                  <div className="font-medium truncate">{session.title}</div>
                  <div className="text-xs opacity-70 flex justify-between w-full">
                    <span>{session.mode}</span>
                    <span>{format(new Date(session.updatedAt), "MM/dd")}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-background">
        {activeSessionId ? (
          <>
            <div className="h-14 border-b border-border flex items-center px-6">
              <h2 className="font-semibold">Session #{activeSessionId}</h2>
            </div>
            
            <ScrollArea className="flex-1 p-6">
              <div className="max-w-3xl mx-auto space-y-6">
                {messagesLoading ? (
                  <div className="text-center text-muted-foreground animate-pulse">Syncing logs...</div>
                ) : messages?.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10">
                    <MessageSquare className="w-10 h-10 mx-auto mb-4 opacity-20" />
                    <p>Connection established. Awaiting input.</p>
                  </div>
                ) : (
                  messages?.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "flex flex-col max-w-[80%]",
                        msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                        {msg.role === "user" ? (
                          <>User</>
                        ) : (
                          <><BotIcon className="w-3 h-3" /> {msg.agentType || "Assistant"}</>
                        )}
                      </div>
                      <div className={cn(
                        "px-4 py-3 rounded-lg text-sm",
                        msg.role === "user" 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-card border border-border text-foreground"
                      )}>
                        <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t border-border bg-card">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Input 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Enter command..."
                  className="bg-background border-border font-mono"
                />
                <Button onClick={handleSend} disabled={sendMessage.isPending || !input.trim()}>
                  <Send className="w-4 h-4 mr-2" />
                  Transmit
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a session to initiate comms link.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
    </svg>
  )
}
