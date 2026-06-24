import { useState } from "react";
import { useListProviders, useCreateProvider, useDeleteProvider, useTestProvider } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Plus, Trash2, Activity, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const providerTypes = ["groq", "openrouter", "gemini", "openai", "anthropic", "custom"] as const;
type ProviderType = typeof providerTypes[number];

const providerDesc: Record<ProviderType, string> = {
  groq: "Free · gpt-oss-120b, Llama 3.3 70B and more",
  openrouter: "Your key · gpt-4o-mini, Llama, Mistral, DeepSeek and more",
  gemini: "Your key · gemini-2.0-flash, gemini-2.5-pro and more",
  openai: "Your key · gpt-4o, gpt-4o-mini and more",
  anthropic: "Your key · claude-3-5-sonnet and more",
  custom: "Custom OpenAI-compatible endpoint",
};

export default function SettingsPage() {
  const [form, setForm] = useState({ name: "", providerType: "groq" as ProviderType, defaultModel: "", apiKey: "" });
  const [showForm, setShowForm] = useState(false);
  const [platformExpanded, setPlatformExpanded] = useState(false);

  const { data: providers, isLoading } = useListProviders();
  const createProvider = useCreateProvider();
  const deleteProvider = useDeleteProvider();
  const testProvider = useTestProvider();

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createProvider.mutate({
      data: { name: form.name, providerType: form.providerType, defaultModel: form.defaultModel || undefined, apiKey: form.apiKey || undefined }
    }, {
      onSuccess: () => { setForm({ name: "", providerType: "groq", defaultModel: "", apiKey: "" }); setShowForm(false); }
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 font-mono">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tighter">Settings</h1>
          <p className="text-muted-foreground mt-1 text-xs md:text-sm">Configure AI providers and platform settings.</p>
        </div>
        <Settings className="w-7 h-7 text-primary opacity-50 shrink-0 ml-4" />
      </div>

      {/* Provider section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">AI Providers</h2>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="h-8 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
          </Button>
        </div>

        {showForm && (
          <Card className="bg-card border-border shadow-none">
            <CardContent className="p-3 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Provider name" value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-background border-border text-sm h-9" />
                <select value={form.providerType}
                  onChange={(e) => setForm(f => ({ ...f, providerType: e.target.value as ProviderType }))}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground h-9">
                  {providerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Input placeholder="Default model (optional)" value={form.defaultModel}
                onChange={(e) => setForm(f => ({ ...f, defaultModel: e.target.value }))}
                className="bg-background border-border text-sm h-9" />
              <Input placeholder="API key (optional)" type="password" value={form.apiKey}
                onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                className="bg-background border-border text-sm h-9" />
              <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded p-2">
                Groq works on free tier. OpenRouter and Gemini use your provided API keys.
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={createProvider.isPending || !form.name}>
                  Add Provider
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Provider type reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {providerTypes.map((type) => (
            <div key={type} className="flex items-start gap-2 p-2.5 bg-card border border-border rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium capitalize">{type}</div>
                <div className="text-xs text-muted-foreground truncate">{providerDesc[type]}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Configured providers */}
        {isLoading ? (
          <div className="text-primary animate-pulse text-sm">Loading providers...</div>
        ) : providers?.length ? (
          <div className="space-y-2">
            <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Configured</h3>
            {providers.map((provider) => (
              <Card key={provider.id} className="bg-card border-border shadow-none">
                <CardContent className="py-2.5 px-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {provider.isHealthy
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      <div className="min-w-0">
                        <span className="font-medium text-sm">{provider.name}</span>
                        <span className="text-xs text-muted-foreground ml-1.5 hidden sm:inline">({provider.providerType})</span>
                        {provider.defaultModel && (
                          <div className="text-xs text-muted-foreground truncate">{provider.defaultModel}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {provider.latencyMs && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">{provider.latencyMs}ms</span>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => testProvider.mutate({ id: provider.id })}
                        disabled={testProvider.isPending} title="Test">
                        <Activity className="w-3.5 h-3.5 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => deleteProvider.mutate({ id: provider.id })}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </section>

      {/* Platform info */}
      <section>
        <button onClick={() => setPlatformExpanded(!platformExpanded)}
          className="flex items-center justify-between w-full text-base font-semibold py-2">
          Platform Info
          {platformExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {platformExpanded && (
          <Card className="bg-card border-border shadow-none mt-2">
            <CardContent className="p-3 space-y-2 text-xs">
              {[
                ["Stack", "Node.js 24 · Express 5 · PostgreSQL · React + Vite"],
                ["AI (primary)", "Groq — gpt-oss-120b (free tier)"],
                ["AI (secondary)", "OpenRouter · Gemini (your keys)"],
                ["Sandbox", "E2B (free tier)"],
                ["Hosting", "Replit free tier"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <span className="text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
