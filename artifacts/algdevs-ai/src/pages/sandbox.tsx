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
  python: 'print("Hello from AlgDevs-AI sandbox!")\nfor i in range(5):\n    print(f"Step {i}")',
  javascript: 'console.log("Hello from AlgDevs-AI sandbox!");\nconst arr = [1,2,3];\nconsole.log(arr.map(x => x * 2));',
  typescript: 'const greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("AlgDevs-AI"));',
  bash: 'echo "Hello from bash"\nls /tmp\ndate',
  ruby: 'puts "Hello from AlgDevs-AI sandbox!"\n(1..5).each { |i| puts "Step #{i}" }',
};

export default function Sandbox() {
  const [code, setCode] = useState(EXAMPLES.python);
  const [language, setLanguage] = useState<Language>("python");
  const [activeTab, setActiveTab] = useState<"execute" | "history">("execute");

  const executeSandbox = useExecuteSandbox();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: executions, isLoading: histLoading } = useListSandboxExecutions({
    query: { enabled: activeTab === "history" } as any
  });

  const handleRun = () => {
    executeSandbox.mutate({ data: { code, language } });
  };

  const result = executeSandbox.data;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Code Sandbox</h1>
          <p className="text-muted-foreground mt-1 text-sm">Execute code in an isolated E2B environment.</p>
        </div>
        <Code className="w-8 h-8 text-primary opacity-50" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["execute", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "execute" ? (
        <div className="space-y-4">
          {/* Language selector */}
          <div className="flex gap-2 flex-wrap">
            {languages.map((lang) => (
              <Button
                key={lang}
                variant={language === lang ? "default" : "outline"}
                size="sm"
                onClick={() => { setLanguage(lang); setCode(EXAMPLES[lang]); }}
                className="text-xs font-mono"
              >
                {lang}
              </Button>
            ))}
          </div>

          {/* Code editor */}
          <Card className="bg-card border-border shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Editor</CardTitle>
                <Button onClick={handleRun} disabled={executeSandbox.isPending || !code.trim()} size="sm">
                  <Play className="w-3.5 h-3.5 mr-2" />
                  {executeSandbox.isPending ? "Running..." : "Run"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={10}
                className="w-full bg-background text-foreground text-sm border border-border rounded p-3 font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={`Enter ${language} code...`}
                spellCheck={false}
              />
            </CardContent>
          </Card>

          {/* Output */}
          {result && (
            <Card className="bg-card border-border shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">Output</CardTitle>
                  <Badge className={cn(
                    "text-xs border",
                    result.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-destructive/20 text-destructive border-destructive/30"
                  )}>
                    {result.status}
                  </Badge>
                  {result.executionMs && (
                    <span className="text-xs text-muted-foreground">{result.executionMs}ms</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {result.stdout && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase mb-1">stdout</div>
                    <pre className="bg-background border border-border rounded p-3 text-sm text-green-400 whitespace-pre-wrap">
                      {result.stdout}
                    </pre>
                  </div>
                )}
                {result.stderr && (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground uppercase mb-1">stderr</div>
                    <pre className="bg-background border border-border rounded p-3 text-sm text-destructive whitespace-pre-wrap">
                      {result.stderr}
                    </pre>
                  </div>
                )}
                {!result.stdout && !result.stderr && (
                  <div className="text-sm text-muted-foreground">(no output)</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {histLoading ? (
            <div className="text-primary animate-pulse">Loading history...</div>
          ) : !executions?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Terminal className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No executions yet.</p>
            </div>
          ) : (
            executions.map((exec) => (
              <Card key={exec.id} className="bg-card border-border shadow-none">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Badge className={cn(
                        "text-xs border",
                        exec.status === "completed" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-destructive/20 text-destructive border-destructive/30"
                      )}>
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
