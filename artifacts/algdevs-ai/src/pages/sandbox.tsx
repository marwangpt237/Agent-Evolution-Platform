import { useState } from "react";
import { useExecuteSandbox, useListSandboxExecutions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Play, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const languages = ["python", "javascript", "typescript", "bash", "ruby"] as const;
type Language = typeof languages[number];

const EXAMPLES: Record<Language, string> = {
  python: 'print("Hello from AlgDevs-AI!")\nfor i in range(5):\n    print(f"Step {i}")',
  javascript: 'console.log("Hello from AlgDevs-AI!");\nconst arr = [1,2,3];\nconsole.log(arr.map(x => x * 2));',
  typescript: 'const greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("AlgDevs-AI"));',
  bash: 'echo "Hello from bash"\ndate\necho "Done"',
  ruby: 'puts "Hello from AlgDevs-AI!"\n(1..3).each { |i| puts "Step #{i}" }',
};

export default function Sandbox() {
  const [code, setCode] = useState(EXAMPLES.python);
  const [language, setLanguage] = useState<Language>("python");
  const [activeTab, setActiveTab] = useState<"execute" | "history">("execute");

  const executeSandbox = useExecuteSandbox();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: executions, isLoading: histLoading } = useListSandboxExecutions({
    query: { enabled: activeTab === "history" } as any,
  });

  const result = executeSandbox.data;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 font-mono">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tighter">Code Sandbox</h1>
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">Execute code in an isolated E2B environment.</p>
        </div>
        <Code className="w-7 h-7 text-primary opacity-50 shrink-0 ml-4" />
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["execute", "history"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-3 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "execute" ? (
        <div className="space-y-4">
          {/* Language selector */}
          <div className="flex gap-1.5 flex-wrap">
            {languages.map((lang) => (
              <Button key={lang} variant={language === lang ? "default" : "outline"} size="sm"
                onClick={() => { setLanguage(lang); setCode(EXAMPLES[lang]); }}
                className="text-xs font-mono h-7 px-2.5">
                {lang}
              </Button>
            ))}
          </div>

          <Card className="bg-card border-border shadow-none">
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">Editor</CardTitle>
                <Button onClick={() => executeSandbox.mutate({ data: { code, language } })}
                  disabled={executeSandbox.isPending || !code.trim()} size="sm" className="h-7 text-xs">
                  <Play className="w-3 h-3 mr-1.5" />
                  {executeSandbox.isPending ? "Running..." : "Run"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={8}
                className="w-full bg-background text-foreground text-sm border border-border rounded p-2.5 font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={`Enter ${language} code...`} spellCheck={false} />
            </CardContent>
          </Card>

          {result && (
            <Card className="bg-card border-border shadow-none">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">Output</CardTitle>
                  <Badge className={cn("text-xs border",
                    result.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-destructive/20 text-destructive border-destructive/30")}>
                    {result.status}
                  </Badge>
                  {result.executionMs && <span className="text-xs text-muted-foreground">{result.executionMs}ms</span>}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {result.stdout && (
                  <pre className="bg-background border border-border rounded p-2.5 text-xs text-green-400 whitespace-pre-wrap overflow-x-auto">
                    {result.stdout}
                  </pre>
                )}
                {result.stderr && (
                  <pre className="bg-background border border-border rounded p-2.5 text-xs text-destructive whitespace-pre-wrap overflow-x-auto">
                    {result.stderr}
                  </pre>
                )}
                {!result.stdout && !result.stderr && (
                  <div className="text-xs text-muted-foreground">(no output)</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {histLoading ? (
            <div className="text-primary animate-pulse text-sm">Loading history...</div>
          ) : !executions?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Terminal className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No executions yet.</p>
            </div>
          ) : (
            executions.map((exec) => (
              <Card key={exec.id} className="bg-card border-border shadow-none">
                <CardContent className="py-2.5 px-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs border",
                        exec.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-destructive/20 text-destructive border-destructive/30")}>
                        {exec.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{exec.language}</span>
                      {exec.executionMs && <span className="text-xs text-muted-foreground">{exec.executionMs}ms</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(exec.createdAt), "HH:mm:ss")}</span>
                  </div>
                  <pre className="text-xs text-muted-foreground line-clamp-2 bg-background rounded border border-border p-2">
                    {exec.code}
                  </pre>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
