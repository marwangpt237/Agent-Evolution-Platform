import React, { useState, useEffect, useRef } from "react";
import { useCreateSession, useListProviders, useListTasks, useListSessions } from "@workspace/api-client-react";
import { useEventStream } from "@/hooks/use-event-stream";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Send, Bot, Terminal, Code, AlignLeft, RefreshCw, X, Download, Menu, Settings2, MessageSquare, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSandboxFiles, useSandboxFile } from "@/hooks/use-sandbox-files";

export default function ArenaWorkspace() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [mode, setMode] = useState<"chat" | "agent">("chat");
  const [chatHistory, setChatHistory] = useState<Array<{role: string, content: string}>>([]);
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"terminal" | "files" | "preview">("terminal");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);

  const createSession = useCreateSession();
  const { data: providers } = useListProviders();
  const { data: tasks } = useListTasks();
  const { data: sessions, refetch: refetchSessions } = useListSessions();
  const { events, connected } = useEventStream(["task", "plan", "artifact", "agent", "message"]);
  const { data: sandboxFiles, refetch: refetchFiles } = useSandboxFiles(activeSessionId);
  const { data: fileContent } = useSandboxFile(activeSessionId, selectedFile);

  const currentSession = sessions?.find(s => s.id === activeSessionId);

  useEffect(() => {
    if (sessions?.length && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
      setMode(sessions[0].mode as "chat" | "agent" || "chat");
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, chatHistory]);

  const loadSession = async (id: number, sessionMode: "chat" | "agent") => {
    setActiveSessionId(id);
    setMode(sessionMode);
    setSidebarOpen(false);
    
    // Load historical messages if chat mode
    if (sessionMode === "chat") {
      try {
        const res = await fetch(`/api/sessions/${id}/messages`);
        if (res.ok) {
          const msgs = await res.json();
          setChatHistory(msgs);
        }
      } catch (e) { console.error(e); }
    } else {
      setChatHistory([]);
    }
  };

  const handleDownload = async (path: string) => { 
    window.open(`/api/sessions/${activeSessionId}/sandbox/files${path.startsWith('/') ? path : '/' + path}`); 
  };

  const handleCancel = async () => {
    if (!activeSessionId) return;
    const sessionTasks = tasks?.filter(t => t.sessionId === activeSessionId && t.status === "running") || [];
    for (const t of sessionTasks) {
      await fetch(`/api/tasks/${t.id}/cancel`, { method: "POST" });
    }
    setIsExecuting(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isExecuting) return;

    let sessId = activeSessionId;
    if (!sessId) {
      const session = await createSession.mutateAsync({
        data: { title: input.slice(0, 30) + "...", mode, providerId: selectedProviderId }
      });
      sessId = session.id;
      setActiveSessionId(sessId);
      refetchSessions();
    }

    setIsExecuting(true);
    const userMsg = input;
    setInput("");
    
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    
    if (mode === "chat") {
      try {
        const res = await fetch(`/api/sessions/${sessId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: userMsg, providerId: selectedProviderId })
        });
        if (!res.ok) throw new Error(await res.text());
        const assistantMsg = await res.json();
        setChatHistory(prev => [...prev, { role: 'assistant', content: assistantMsg.content }]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsExecuting(false);
      }
      return;
    }

    try {
      const execRes = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessId, brief: userMsg })
      });
      if (!execRes.ok) throw new Error(await execRes.text());
    } catch (err) {
      console.error(err);
      setIsExecuting(false);
    }
  };

  const currentEvents = events.filter(
    e => e.entityId === activeSessionId || e.entityType === "task" || e.entityType === "plan"
  ).reverse();

  const chatBlocks = currentEvents.reduce((acc: any[], event) => {
    if (event.eventType === "task.running") {
      acc.push({ type: "agent_start", text: event.description, id: event.id });
    } else if (event.eventType === "agent.thought.chunk") {
      const last = acc[acc.length - 1];
      if (last && last.type === "agent_stream") {
        last.text += event.description;
      } else {
        acc.push({ type: "agent_stream", text: event.description, id: event.id });
      }
    } else if (event.eventType === "agent.waiting") {
      acc.push({ type: "agent_waiting", text: event.description, id: event.id });
      if (isExecuting) setIsExecuting(false);
    } else if (event.eventType === "tool.result") {
      try {
        const meta = JSON.parse(event.metadata || "{}");
        acc.push({
          type: "tool",
          id: event.id,
          tool: meta.tool,
          params: meta.parameters,
          success: meta.result?.success,
          output: meta.result?.output || meta.result?.error
        });
      } catch (e) {
        acc.push({ type: "tool", id: event.id, tool: "unknown", params: {}, success: false, output: "Failed to parse tool" });
      }
    } else if (event.eventType === "task.completed" || event.eventType === "task.failed") {
      acc.push({ type: "agent_end", status: event.eventType.split(".")[1], output: event.description, id: event.id });
      if (isExecuting) setIsExecuting(false);
    } else if (event.eventType === "artifact.created") {
      acc.push({ type: "system", text: event.description, id: event.id });
      refetchFiles();
    }
    return acc;
  }, []);

  return (
    <div className="flex h-[100dvh] bg-[#F9FAFB] dark:bg-[#0B0D0E] text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      
      {/* SIDEBAR - History & Settings */}
      <div className={cn("absolute md:relative z-50 flex flex-col h-full bg-white dark:bg-[#111315] border-r border-slate-200 dark:border-slate-800 transition-all duration-300 w-64", sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0", sidebarOpen ? "flex" : "hidden md:flex")}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          <span className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4"/> Arena Settings</span>
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} className="md:hidden"><X className="w-4 h-4" /></Button>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Model & Provider</h3>
            <select 
              className="w-full text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-md px-3 py-2 outline-none text-slate-700 dark:text-slate-300 cursor-pointer"
              value={selectedProviderId || ""}
              onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Default (OpenAI/GPT-OSS-120b)</option>
              {providers?.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.defaultModel})</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">API Health</h3>
            <div className="space-y-2">
              {providers?.map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-1.5 font-medium">
                    <div className={cn("w-2 h-2 rounded-full", p.isHealthy ? "bg-green-500" : "bg-red-500")} />
                    {p.providerType}
                  </span>
                  <span className="text-slate-500">{p.latencyMs ? `${p.latencyMs}ms` : 'N/A'}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-1.5 font-medium">
                    <div className={cn("w-2 h-2 rounded-full", connected ? "bg-green-500" : "bg-red-500")} />
                    SSE Stream
                  </span>
                  <span className="text-slate-500">{connected ? 'Live' : 'Dead'}</span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              Chat History
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setActiveSessionId(null); setChatHistory([]); setInput(""); }}>New</Button>
            </h3>
            <div className="space-y-1">
              {sessions?.map(s => (
                <button 
                  key={s.id} 
                  onClick={() => loadSession(s.id, s.mode as any)}
                  className={cn("w-full text-left px-2 py-1.5 rounded-md text-sm truncate transition-colors", activeSessionId === s.id ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800")}
                >
                  <MessageSquare className="w-3.5 h-3.5 inline mr-2 opacity-50"/>
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
        
        {/* Token & Cost Dashboard */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D0E]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5"/> Cost Dashboard</h3>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Messages:</span>
            <span className="font-mono font-medium">{currentSession?.messageCount || 0}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-slate-500">Mode:</span>
            <span className="font-mono font-medium">{currentSession?.mode || 'None'}</span>
          </div>
        </div>
      </div>

      {/* MIDDLE PANEL - Chat Interface */}
      <div className={cn("flex flex-col h-full border-r border-slate-200 dark:border-slate-800 transition-all", rightPanelOpen ? "hidden md:flex md:w-1/2" : "w-full flex-1")}>
        
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111315]">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden mr-1 px-2">
              <Menu className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 rounded bg-black dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-black font-bold font-mono">A</span>
            </div>
            <span className="font-semibold tracking-tight hidden sm:inline">Arena</span>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button 
              onClick={() => setMode('chat')}
              className={cn("px-4 py-1 text-xs font-semibold rounded-md transition-all", mode === 'chat' ? "bg-white dark:bg-black shadow-sm" : "text-slate-500 hover:text-slate-900")}
            >
              Chat
            </button>
            <button 
              onClick={() => setMode('agent')}
              className={cn("px-4 py-1 text-xs font-semibold rounded-md transition-all", mode === 'agent' ? "bg-white dark:bg-black shadow-sm" : "text-slate-500 hover:text-slate-900")}
            >
              Agent
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)} className="hidden md:flex">
              {rightPanelOpen ? "Close Workspace" : "Open Workspace"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)} className="md:hidden px-2">
              <Code className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
          {chatBlocks.length === 0 && mode === 'agent' && chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Bot className="w-12 h-12 mb-4 opacity-50" />
              <p>What should we build today?</p>
            </div>
          )}
          {mode === 'chat' && chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Bot className="w-12 h-12 mb-4 opacity-50" />
              <p>How can I help you today?</p>
            </div>
          )}

          {chatHistory.map((msg, i) => (
             <div key={`msg-${i}`} className="flex gap-4 items-start">
               {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
               )}
               <div className={cn("rounded-2xl p-4 shadow-sm max-w-[85%]", msg.role === 'user' ? "ml-auto bg-blue-600 text-white rounded-tr-none" : "bg-white dark:bg-[#111315] border border-slate-200 dark:border-slate-800 rounded-tl-none")}>
                 <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
               </div>
             </div>
          ))}

          {mode === 'agent' && chatBlocks.map((block, idx) => (
              <div key={`block-${block.id || idx}`} className="flex flex-col gap-2 mt-4">
                
                {block.type === "agent_start" && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Agent is thinking...</span>
                  </div>
                )}

                {block.type === "agent_stream" && (
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="bg-white dark:bg-[#111315] border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-none p-4 shadow-sm w-full">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
                        {block.text}
                      </p>
                    </div>
                  </div>
                )}
                
                {block.type === "agent_waiting" && (
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl rounded-tl-none p-4 shadow-sm w-full">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
                        [Agent Question] {block.text}
                      </p>
                    </div>
                  </div>
                )}

                {block.type === "tool" && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-[#111315]">
                    <div className="flex items-center px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
                      <Terminal className="w-3.5 h-3.5 mr-2" />
                      call:{block.tool}
                    </div>
                    <div className="p-3 text-xs font-mono text-slate-800 dark:text-slate-300">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(block.params, null, 2)}</pre>
                    </div>
                    {block.output && (
                      <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-[#0B0D0E]">
                        {block.tool === 'edit_file' ? (
                          <div className="text-xs font-mono whitespace-pre-wrap line-clamp-6">
                            <span className="text-slate-400">{'// Visual Diff'}</span><br/>
                            <span className="text-red-500 line-through">{block.params.old_text}</span><br/>
                            <span className="text-green-500">{block.params.new_text}</span><br/>
                            <span className="text-slate-500 mt-2 block">{block.output}</span>
                          </div>
                        ) : (
                          <div className={cn("text-xs font-mono whitespace-pre-wrap line-clamp-6", block.success ? "text-slate-600 dark:text-slate-400" : "text-red-500")}>
                            {block.output}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {block.type === "agent_end" && (
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="bg-white dark:bg-[#111315] border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-none p-4 shadow-sm w-full">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {block.output}
                      </p>
                    </div>
                  </div>
                )}

                {block.type === "system" && (
                  <div className="flex justify-center my-4">
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs px-3 py-1 rounded-full">
                      {block.text}
                    </span>
                  </div>
                )}
              </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white dark:bg-[#111315] border-t border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSubmit} className="relative flex items-center shadow-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-[#F9FAFB] dark:bg-[#0B0D0E] focus-within:ring-2 focus-within:ring-blue-500/20">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to build, search, or code..."
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm py-6 pl-4 pr-12"
              disabled={isExecuting}
            />
            {isExecuting ? (
              <Button
                type="button"
                size="icon"
                onClick={handleCancel}
                className="absolute right-2 w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-opacity"
              >
                <X className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="absolute right-2 w-8 h-8 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT PANEL - Workspace */}
      {rightPanelOpen && (
        <div className="w-full md:w-1/2 flex flex-col h-full bg-white dark:bg-[#111315] absolute md:relative z-40">
          <div className="h-14 flex items-center justify-between px-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex space-x-1">
              <button
                onClick={() => setRightTab("terminal")}
                className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", rightTab === "terminal" ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
              >
                Logs
              </button>
              <button
                onClick={() => { setRightTab("files"); refetchFiles(); }}
                className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", rightTab === "files" ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
              >
                Files
              </button>
              <button
                onClick={() => setRightTab("preview")}
                className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", rightTab === "preview" ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
              >
                Preview
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRightPanelOpen(false)} className="md:hidden">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === "terminal" && (
              <ScrollArea className="h-full bg-[#0B0D0E] p-4 font-mono text-[11px] leading-relaxed text-green-400">
                {currentEvents.map((e, i) => (
                  <div key={i} className="mb-1">
                    <span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span>{" "}
                    <span className="text-blue-400 uppercase">[{e.eventType}]</span>{" "}
                    {e.description}
                  </div>
                ))}
              </ScrollArea>
            )}

            {rightTab === "files" && (
              <div className="flex h-full">
                <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
                  <div className="p-2 space-y-0.5">
                    <div className="text-xs font-semibold text-slate-400 uppercase px-2 py-1 mb-2 tracking-wider">/home/user</div>
                    {sandboxFiles?.files?.length ? sandboxFiles.files.map(f => (
                      <div key={f.path} className={cn("group flex items-center w-full px-2 py-1.5 rounded text-sm transition-colors", selectedFile === f.path.replace(/^\//, "") ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "hover:bg-slate-50 dark:hover:bg-slate-800")}>
                        <button
                          onClick={() => setSelectedFile(f.path.replace(/^\//, ""))}
                          className="truncate flex-1 text-left"
                        >
                          {f.path}
                        </button>
                        <button onClick={() => handleDownload(f.path)} className="hidden group-hover:block ml-2 text-slate-400 hover:text-blue-500">
                           <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )) : (
                      <div className="text-xs text-slate-400 px-2 py-4">No files found.</div>
                    )}
                  </div>
                </div>
                <div className="w-2/3 flex flex-col bg-[#F9FAFB] dark:bg-[#0B0D0E]">
                  {selectedFile ? (
                    <div className="flex-1 p-4 overflow-auto">
                      <div className="text-xs text-slate-400 mb-2 border-b border-slate-200 dark:border-slate-800 pb-2">{selectedFile}</div>
                      {fileContent?.content?.startsWith('data:image/') ? (
                        <div className="flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-900 rounded-lg">
                          <img src={fileContent.content} alt={selectedFile} className="max-w-full max-h-full object-contain shadow-sm" />
                        </div>
                      ) : (
                        <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{fileContent?.content || "Loading..."}</pre>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                      Select a file to view
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {rightTab === "preview" && (
              <div className="flex h-full bg-white dark:bg-black">
                {selectedFile && selectedFile.endsWith('.html') ? (
                  <iframe
                    sandbox="allow-scripts allow-forms"
                    srcDoc={fileContent?.content || ""}
                    className="w-full h-full border-0 bg-white"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                    Select an .html file in the Files tab to preview
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
