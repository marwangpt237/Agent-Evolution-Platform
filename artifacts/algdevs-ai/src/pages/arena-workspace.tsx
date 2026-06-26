import React, { useState, useEffect, useRef } from "react";
import { useCreateSession, useListProviders, useListTasks, useListSessions } from "@workspace/api-client-react";
import { useEventStream } from "@/hooks/use-event-stream";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Send, Bot, Terminal, Code2, Globe, RefreshCw, X, Download, Menu, Settings2, 
  MessageSquare, FileCode, Folder, FolderOpen, FileText, ChevronRight, 
  ChevronDown, Save, Trash, Plus, Image as ImageIcon, CheckCircle2, Moon, Sun, SquareTerminal, PanelRightClose, PanelRightOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSandboxFiles, useSandboxFile } from "@/hooks/use-sandbox-files";

// --- Types & Helpers ---
type FileNode = { name: string; path: string; isDir: boolean; children?: Record<string, FileNode> };

function buildTree(files: { path: string; size: number }[]) {
  const root: Record<string, FileNode> = {};
  for (const f of files) {
    const parts = f.path.replace(/^\//, "").split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const nodePath = parts.slice(0, i + 1).join('/');
      if (!current[part]) {
        current[part] = { name: part, path: nodePath, isDir: !isFile, children: isFile ? undefined : {} };
      }
      if (!isFile) {
        current = current[part].children!;
      }
    }
  }
  return root;
}

// --- Subcomponents ---

const FileTreeItem = ({ 
  node, level, onSelect, activeFile, openFolders, toggleFolder 
}: { 
  node: FileNode, level: number, onSelect: (p: string) => void, activeFile: string | null, openFolders: Set<string>, toggleFolder: (p: string) => void 
}) => {
  const isOpen = openFolders.has(node.path);
  const isSelected = activeFile === node.path;
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(node.name);
  const isCode = /\.(ts|tsx|js|jsx|py|json|html|css|md|sh|yaml|yml)$/i.test(node.name);

  return (
    <div>
      <div 
        className={cn(
          "flex items-center py-1 px-2 cursor-pointer select-none text-[13px] transition-colors group", 
          isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => node.isDir ? toggleFolder(node.path) : onSelect(node.path)}
      >
        {node.isDir ? (
          isOpen ? <ChevronDown className="w-3.5 h-3.5 mr-1 shrink-0 opacity-70"/> : <ChevronRight className="w-3.5 h-3.5 mr-1 shrink-0 opacity-70"/>
        ) : <span className="w-4.5 inline-block" />}
        
        {node.isDir ? (
           isOpen ? <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-blue-500 shrink-0"/> : <Folder className="w-3.5 h-3.5 mr-1.5 text-blue-500 shrink-0"/>
        ) : (
           isImage ? <ImageIcon className="w-3.5 h-3.5 mr-1.5 text-purple-500 shrink-0"/> :
           isCode ? <FileCode className="w-3.5 h-3.5 mr-1.5 text-yellow-600 shrink-0"/> :
           <FileText className="w-3.5 h-3.5 mr-1.5 shrink-0"/>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.isDir && isOpen && node.children && (
        <div>
          {Object.values(node.children).sort((a,b) => a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1).map(child => (
             <FileTreeItem key={child.path} node={child} level={level + 1} onSelect={onSelect} activeFile={activeFile} openFolders={openFolders} toggleFolder={toggleFolder}/>
          ))}
        </div>
      )}
    </div>
  );
};

const ToolBlock = ({ block }: { block: any }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg my-2 text-[13px] overflow-hidden bg-card/50 shadow-sm">
       <div className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setOpen(!open)}>
         {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mr-2"/> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mr-2"/>}
         <Terminal className="w-3.5 h-3.5 text-muted-foreground mr-2" />
         <span className="font-mono text-muted-foreground">call:{block.tool}</span>
         <div className="ml-auto flex items-center gap-2">
           {block.success !== undefined && (
             block.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> : <X className="w-3.5 h-3.5 text-red-500"/>
           )}
         </div>
       </div>
       {open && (
         <div className="p-3 border-t border-border bg-background font-mono text-[11px] overflow-x-auto max-h-[300px] overflow-y-auto">
           <div className="text-muted-foreground/70 mb-1">// Parameters:</div>
           <pre className="text-foreground/90">{JSON.stringify(block.params, null, 2)}</pre>
           {block.output && (
             <>
               <div className="text-muted-foreground/70 mt-3 mb-1">// Output:</div>
               <pre className={cn(block.success ? "text-foreground/90" : "text-red-400")}>{block.output}</pre>
             </>
           )}
         </div>
       )}
    </div>
  );
};

// --- Main Application ---

type OpenFile = { path: string; content: string; isDirty: boolean };

export default function ArenaWorkspace() {
  // Global State
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [mode, setMode] = useState<"chat" | "agent">("agent");
  const [chatHistory, setChatHistory] = useState<Array<{role: string, content: string}>>([]);
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  
  // Layout State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"code" | "preview" | "terminal">("code");
  const scrollRef = useRef<HTMLDivElement>(null);

  // IDE State
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<number | undefined>(undefined);

  // API Hooks
  const createSession = useCreateSession();
  const { data: providers } = useListProviders();
  const { data: tasks } = useListTasks();
  const { data: sessions, refetch: refetchSessions } = useListSessions();
  const { events, connected } = useEventStream(["task", "plan", "artifact", "agent", "message"]);
  const { data: sandboxFiles, refetch: refetchFiles } = useSandboxFiles(activeSessionId);
  const { data: fileContent } = useSandboxFile(activeSessionId, activeFile);
  
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    if (sessions?.length && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
      setMode(sessions[0].mode as "chat" | "agent" || "agent");
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, chatHistory]);

  // Sync loaded file content to open tabs
  useEffect(() => {
    if (fileContent && activeFile) {
      setOpenFiles(prev => prev.map(f => f.path === activeFile && !f.isDirty ? { ...f, content: fileContent.content } : f));
    }
  }, [fileContent, activeFile]);

  const loadSession = async (id: number, sessionMode: "chat" | "agent") => {
    setActiveSessionId(id);
    setMode(sessionMode);
    setSidebarOpen(false);
    setOpenFiles([]);
    setActiveFile(null);
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

  // --- IDE Actions ---

  const handleSelectFile = async (path: string) => {
    const existing = openFiles.find(f => f.path === path);
    if (!existing) {
      setOpenFiles(prev => [...prev, { path, content: "Loading...", isDirty: false }]);
    }
    setActiveFile(path);
  };

  const updateActiveFileContent = (newContent: string) => {
    if (!activeFile) return;
    setOpenFiles(prev => prev.map(f => f.path === activeFile ? { ...f, content: newContent, isDirty: true } : f));
  };

  const handleSaveFile = async (path: string, content: string) => {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}/sandbox/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: path, base64: btoa(unescape(encodeURIComponent(content))) })
      });
      setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, isDirty: false } : f));
      refetchFiles();
    } catch (e) { console.error(e); }
  };

  const handleCreateFile = async (isFolder: boolean) => {
    if (!activeSessionId) return;
    const name = prompt(isFolder ? "Folder name (e.g. src/components):" : "File name (e.g. index.html):");
    if (!name) return;
    const path = name.startsWith('/') ? name : `/${name}`;
    const finalPath = isFolder ? `${path}/.keep` : path;
    try {
      await fetch(`/api/sessions/${activeSessionId}/sandbox/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: finalPath, base64: btoa("") })
      });
      refetchFiles();
      if (!isFolder) handleSelectFile(finalPath);
    } catch (e) { console.error(e); }
  };

  const handleDeleteFile = async (path: string) => {
    if (!activeSessionId || !confirm(`Delete ${path}?`)) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}/sandbox/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: path })
      });
      setOpenFiles(prev => prev.filter(f => f.path !== path));
      if (activeFile === path) setActiveFile(null);
      refetchFiles();
    } catch(e) {}
  };

  const handleDownload = (path: string) => {
    window.open(`/api/sessions/${activeSessionId}/sandbox/files${path.startsWith('/') ? path : '/' + path}`);
  };

  // --- Execution & Chat ---

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
      } catch (err) { console.error(err); } 
      finally { setIsExecuting(false); }
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

  const currentEvents = (events || []).filter(
    e => e.entityId === activeSessionId || e.entityType === "task" || e.entityType === "plan"
  ).reverse();

  // Unified chat rendering
  const chatBlocks = currentEvents.reduce((acc: any[], event) => {
    if (event.eventType === "task.running") {
      acc.push({ type: "agent_start", text: "Agent initialized", id: event.id });
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

  const activeFileObj = openFiles.find(f => f.path === activeFile);
  const activeExt = activeFile?.split('.').pop()?.toLowerCase();
  const isImage = activeFileObj?.content.startsWith('data:image/');

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-background text-foreground font-sans overflow-hidden">
      
      {/* LEFT SIDEBAR - Sessions & Settings */}
      <div className={cn(
        "absolute md:relative z-50 flex flex-col h-full bg-muted/30 border-r border-border transition-transform duration-300 w-64 shrink-0", 
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0", 
        sidebarOpen ? "flex" : "hidden md:flex"
      )}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <span className="font-semibold text-sm flex items-center gap-2 tracking-tight"><Bot className="w-5 h-5"/> Arena Clone</span>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="md:hidden h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>
        
        <ScrollArea className="flex-1 p-3">
          <div className="mb-6">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Model Setup</label>
            <select 
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none text-foreground cursor-pointer shadow-sm"
              value={selectedProviderId || ""}
              onChange={(e) => setSelectedProviderId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">System Default</option>
              {(providers || []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center justify-between">
              History
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => { setActiveSessionId(null); setChatHistory([]); setInput(""); }}>+ New</Button>
            </label>
            <div className="space-y-0.5">
              {(sessions || []).map(s => (
                <button 
                  key={s.id} 
                  onClick={() => loadSession(s.id, s.mode as any)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors flex items-center gap-2", 
                    activeSessionId === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70"/>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
        
        {/* Footer info */}
        <div className="p-3 border-t border-border bg-muted/10 flex justify-between items-center text-xs text-muted-foreground">
           <span className="flex items-center gap-1.5">
             <div className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")} />
             {connected ? 'Connected' : 'Offline'}
           </span>
           <button onClick={() => setIsDarkMode(!isDarkMode)} className="hover:text-foreground transition-colors">
             {isDarkMode ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
           </button>
        </div>
      </div>

      {/* MIDDLE PANEL - Chat Feed */}
      <div className={cn("flex flex-col h-full bg-background shrink-0 transition-all", rightPanelOpen ? "hidden md:flex md:w-[400px] lg:w-[450px] border-r border-border" : "w-full flex-1")}>
        
        {/* Chat Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden h-8 w-8 shrink-0">
              <Menu className="w-4 h-4" />
            </Button>
            
            <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50">
              <button 
                onClick={() => setMode('chat')}
                className={cn("px-4 py-1 text-xs font-medium rounded-md transition-all", mode === 'chat' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >Chat</button>
              <button 
                onClick={() => setMode('agent')}
                className={cn("px-4 py-1 text-xs font-medium rounded-md transition-all", mode === 'agent' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >Agent</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRightPanelOpen(!rightPanelOpen)} className="hidden md:flex text-xs h-8 text-muted-foreground hover:text-foreground">
              {rightPanelOpen ? <PanelRightClose className="w-4 h-4 mr-1.5"/> : <PanelRightOpen className="w-4 h-4 mr-1.5"/>}
              {rightPanelOpen ? "Close Workspace" : "Open Workspace"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setRightPanelOpen(!rightPanelOpen)} className="md:hidden h-8 w-8">
              <Code2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-6 pb-4">
            {chatHistory.length === 0 && chatBlocks.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground mt-32">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Bot className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-foreground">How can I help you today?</p>
                <p className="text-xs mt-1 text-center max-w-[250px] leading-relaxed opacity-70">
                  Switch to Agent mode to execute autonomous tasks, write code, and browse the web.
                </p>
              </div>
            )}

            {/* Render Chat History */}
            {(chatHistory || []).map((msg, i) => (
              <div key={`msg-${i}`} className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed", 
                  msg.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted/50 text-foreground rounded-tl-sm border border-border"
                )}>
                  {msg.role === 'user' ? (
                     <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                     <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert max-w-none">
                       {msg.content}
                     </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {/* Render Agent Streaming Blocks */}
            {mode === 'agent' && chatBlocks.map((block, idx) => (
              <div key={`block-${block.id || idx}`} className="flex flex-col">
                
                {block.type === "agent_start" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium my-3 justify-center">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Agent initialized</span>
                  </div>
                )}

                {block.type === "tool" && <ToolBlock block={block} />}

                {block.type === "agent_stream" && (
                  <div className="flex gap-3 items-start my-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-[14px] leading-relaxed text-foreground pt-1.5 flex-1 min-w-0">
                       <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert max-w-none">
                         {block.text}
                       </ReactMarkdown>
                    </div>
                  </div>
                )}
                
                {block.type === "agent_waiting" && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 shadow-sm my-4">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-500 font-semibold text-xs mb-2 uppercase tracking-wider">
                      <Bot className="w-4 h-4" /> Agent requires input
                    </div>
                    <p className="text-[13px] text-amber-900 dark:text-amber-400/90 whitespace-pre-wrap leading-relaxed">
                      {block.text}
                    </p>
                  </div>
                )}

                {block.type === "agent_end" && (
                  <div className="flex gap-3 items-start my-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-[14px] leading-relaxed text-foreground pt-1.5 flex-1 min-w-0">
                       <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert max-w-none">
                         {block.output}
                       </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Thinking indicator at bottom if executing */}
            {isExecuting && !chatBlocks.some(b => b.type === "agent_waiting") && mode === "chat" && (
               <div className="flex items-center gap-1.5 text-muted-foreground p-4">
                  <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{animationDelay: "0ms"}}/>
                  <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{animationDelay: "150ms"}}/>
                  <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{animationDelay: "300ms"}}/>
               </div>
            )}
          </div>
        </ScrollArea>

        {/* Chat Input */}
        <div className="p-4 bg-background border-t border-border">
          <form onSubmit={handleSubmit} className="relative flex items-end shadow-sm border border-input rounded-xl bg-muted/30 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary overflow-hidden transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={mode === 'chat' ? "Message Arena..." : "Instruct the agent to build..."}
              className="w-full bg-transparent border-0 focus:ring-0 text-[14px] py-3.5 pl-4 pr-12 resize-none max-h-40 min-h-[52px] outline-none text-foreground placeholder:text-muted-foreground"
              disabled={isExecuting}
              rows={1}
            />
            {isExecuting ? (
              <Button type="button" size="icon" onClick={handleCancel} className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-opacity shadow-sm">
                <SquareTerminal className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50">
                <Send className="w-4 h-4" />
              </Button>
            )}
          </form>
        </div>
      </div>

      {/* RIGHT PANEL - IDE Workspace */}
      {rightPanelOpen && (
        <div className="flex-1 flex flex-col min-w-0 bg-background relative z-40">
          
          {/* IDE Navbar Tabs */}
          <div className="h-14 flex items-center px-2 border-b border-border bg-muted/10 shrink-0 gap-1 overflow-x-auto hide-scrollbar">
             <button onClick={() => setActiveTab('code')} className={cn("flex items-center gap-2 px-4 h-9 text-xs font-medium rounded-md transition-all", activeTab === 'code' ? "bg-background shadow-sm border border-border text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
               <Code2 className="w-4 h-4"/> Code
             </button>
             <button onClick={() => setActiveTab('terminal')} className={cn("flex items-center gap-2 px-4 h-9 text-xs font-medium rounded-md transition-all", activeTab === 'terminal' ? "bg-background shadow-sm border border-border text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
               <Terminal className="w-4 h-4"/> Console
             </button>
             <button onClick={() => setActiveTab('preview')} className={cn("flex items-center gap-2 px-4 h-9 text-xs font-medium rounded-md transition-all", activeTab === 'preview' ? "bg-background shadow-sm border border-border text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
               <Globe className="w-4 h-4"/> Preview
             </button>
             <div className="ml-auto flex items-center gap-1 pr-2">
               <Button variant="ghost" size="sm" onClick={() => refetchFiles()} className="h-8 px-2 text-muted-foreground hover:text-foreground text-xs">
                 <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync
               </Button>
             </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'preview' && (
              <div className="flex flex-col h-full bg-background">
                 <div className="h-10 border-b border-border bg-muted/30 flex items-center px-4 shrink-0">
                    <div className="flex gap-1.5 mr-4">
                      <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-400/80"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-400/80"></div>
                    </div>
                    <div className="flex-1 bg-background border border-border rounded-md h-6 flex items-center px-3 text-[11px] text-muted-foreground font-mono overflow-hidden shadow-sm">
                       localhost:3000{activeFile && activeFile.endsWith('.html') ? `/${activeFile}` : '/index.html'}
                    </div>
                 </div>
                 <div className="flex-1 relative bg-white dark:bg-white rounded-bl-lg">
                    {activeFile && activeFile.endsWith('.html') ? (
                      <iframe sandbox="allow-scripts allow-forms" srcDoc={activeFileObj?.content || ""} className="absolute inset-0 w-full h-full border-0" />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 h-full">
                        <Globe className="w-12 h-12 mb-4 opacity-20" />
                        <span className="text-sm font-medium">Select an .html file in the Code tab to render</span>
                      </div>
                    )}
                 </div>
              </div>
            )}

            {activeTab === 'terminal' && (
              <ScrollArea className="h-full bg-[#0a0a0a] p-4 font-mono text-[12px] leading-relaxed text-slate-300">
                {currentEvents.map((e, i) => (
                  <div key={i} className={cn("mb-1.5 flex gap-3", e.eventType.includes('error') || e.eventType.includes('failed') ? "text-red-400" : "")}>
                    <span className="text-slate-600 shrink-0">[{new Date(e.createdAt || Date.now()).toLocaleTimeString()}]</span>
                    <span className={cn("uppercase font-medium shrink-0", e.eventType.includes('error') ? "text-red-500" : "text-blue-400")}>[{e.eventType}]</span>
                    <span className="whitespace-pre-wrap">{e.description}</span>
                  </div>
                ))}
                {currentEvents.length === 0 && <div className="text-slate-600">Waiting for execution...</div>}
              </ScrollArea>
            )}

            {activeTab === 'code' && (
              <PanelGroup direction="horizontal" className="flex-1">
                {/* FILE EXPLORER */}
                <Panel defaultSize={20} minSize={15} className="flex flex-col bg-muted/10 border-r border-border">
                   <div className="h-10 px-4 text-[10px] font-bold text-muted-foreground flex justify-between items-center shrink-0">
                      <span className="tracking-widest uppercase">Explorer</span>
                      <div className="flex gap-0.5">
                         <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted" title="New File" onClick={() => handleCreateFile(false)}><FileText className="w-3.5 h-3.5"/></Button>
                         <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted" title="New Folder" onClick={() => handleCreateFile(true)}><Folder className="w-3.5 h-3.5"/></Button>
                      </div>
                   </div>
                   <ScrollArea className="flex-1">
                     <div className="py-2 pr-2">
                       {Array.isArray(sandboxFiles?.files) && sandboxFiles.files.length > 0 ? (
                          Object.values(buildTree(sandboxFiles?.files || [])).sort((a,b) => a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1).map(node => (
                             <FileTreeItem key={node.path} node={node} level={0} onSelect={handleSelectFile} activeFile={activeFile} openFolders={openFolders} toggleFolder={toggleFolder}/>
                          ))
                       ) : (
                          <div className="text-[11px] text-muted-foreground px-4 py-2">Workspace empty</div>
                       )}
                     </div>
                   </ScrollArea>
                </Panel>
                
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
                
                {/* EDITOR */}
                <Panel defaultSize={80} className="flex flex-col min-w-0 bg-background">
                   {/* Editor Tabs */}
                   <div className="flex items-center bg-muted/10 overflow-x-auto shrink-0 hide-scrollbar border-b border-border">
                     {(openFiles || []).map(f => (
                        <div 
                          key={f.path} 
                          onClick={() => setActiveFile(f.path)}
                          className={cn(
                            "group flex items-center h-10 px-4 border-r border-border min-w-[120px] max-w-[200px] cursor-pointer text-[12px] transition-colors select-none", 
                            activeFile === f.path ? "bg-background text-foreground border-t-2 border-t-primary" : "text-muted-foreground hover:bg-muted/30 border-t-2 border-t-transparent"
                          )}
                        >
                           <span className="truncate flex-1 font-medium">{f.path.split('/').pop()}</span>
                           {f.isDirty && <div className="w-2 h-2 rounded-full bg-amber-500 mr-2 shrink-0"/>}
                           <button onClick={(e) => { 
                             e.stopPropagation(); 
                             const nextFiles = openFiles.filter(x => x.path !== f.path);
                             setOpenFiles(nextFiles); 
                             if(activeFile === f.path) setActiveFile(nextFiles[nextFiles.length-1]?.path || null); 
                           }} className={cn("w-5 h-5 flex items-center justify-center rounded hover:bg-muted", activeFile === f.path ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                             <X className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     ))}
                     {openFiles.length === 0 && <div className="h-10 w-full" />}
                   </div>
                   
                   {/* Editor Toolbar */}
                   {activeFile && (
                     <div className="h-10 bg-background flex items-center justify-between px-4 border-b border-border shrink-0">
                       <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                          home <ChevronRight className="w-3 h-3"/> user <ChevronRight className="w-3 h-3"/> <span className="text-foreground">{activeFile.split('/').join(' / ')}</span>
                       </div>
                       <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => handleDownload(activeFile)}>
                            <Download className="w-3.5 h-3.5 mr-1.5"/> Download
                          </Button>
                          {activeFileObj?.isDirty && (
                             <Button size="sm" className="h-7 px-3 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" onClick={() => handleSaveFile(activeFile, activeFileObj.content)}>
                               <Save className="w-3.5 h-3.5 mr-1.5"/> Save
                             </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[11px] text-red-500 hover:bg-red-500/10 hover:text-red-600" onClick={() => handleDeleteFile(activeFile)}>
                            <Trash className="w-3.5 h-3.5 mr-1.5"/> Delete
                          </Button>
                       </div>
                     </div>
                   )}

                   {/* Editor Content */}
                   <div className="flex-1 relative overflow-hidden bg-background">
                      {activeFile ? (
                         isImage ? (
                           <div className="absolute inset-0 flex items-center justify-center p-8 bg-muted/5">
                              <img src={activeFileObj?.content} alt={activeFile} className="max-w-full max-h-full object-contain shadow-lg border border-border rounded-md" />
                           </div>
                         ) : (
                           <Editor
                             height="100%"
                             language={activeExt === 'ts' || activeExt === 'tsx' ? 'typescript' : activeExt === 'js' ? 'javascript' : activeExt === 'py' ? 'python' : activeExt === 'json' ? 'json' : activeExt === 'html' ? 'html' : activeExt === 'css' ? 'css' : 'markdown'}
                             theme={isDarkMode ? "vs-dark" : "light"}
                             value={activeFileObj?.content || ""}
                             onChange={(val) => updateActiveFileContent(val || "")}
                             onMount={(editor, monaco) => {
                               editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { handleSaveFile(activeFile, editor.getValue()); });
                             }}
                             options={{
                               minimap: { enabled: false },
                               fontSize: 13,
                               fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                               wordWrap: 'on',
                               padding: { top: 16 },
                               scrollBeyondLastLine: false,
                               smoothScrolling: true,
                               cursorBlinking: "smooth",
                             }}
                             className="pt-2"
                           />
                         )
                      ) : (
                         <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground select-none">
                            <Code2 className="w-16 h-16 mb-4 opacity-20" />
                            <h2 className="text-lg font-medium opacity-50">Arena Editor</h2>
                            <p className="text-xs mt-2 opacity-40">Select a file from the explorer to start coding</p>
                         </div>
                      )}
                   </div>
                </Panel>
              </PanelGroup>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
