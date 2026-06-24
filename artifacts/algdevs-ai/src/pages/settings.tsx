import { useState } from "react";
import { useListProviders, useCreateProvider, useDeleteProvider, useTestProvider } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Plus, Trash2, Activity, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const providerTypes = ["groq", "gemini", "openrouter", "openai", "anthropic", "custom"] as const;
type ProviderType = typeof providerTypes[number];

const providerDesc: Record<ProviderType, string> = {
  groq: "Free tier · gpt-oss-120b, Llama 3.3 70B and more",
  gemini: "Requires paid Replit plan — routes through Groq as fallback",
  openrouter: "Requires paid Replit plan — routes through Groq as fallback",
  openai: "Requires paid Replit plan — routes through Groq as fallback",
  anthropic: "Requires paid Replit plan — routes through Groq as fallback",
  custom: "Custom OpenAI-compatible endpoint",
};

export default function SettingsPage() {
  const [form, setForm] = useState({ name: "", providerType: "groq" as ProviderType, defaultModel: "", apiKey: "" });
  const [showForm, setShowForm] = useState(false);

  const { data: providers, isLoading } = useListProviders();
  const createProvider = useCreateProvider();
  const deleteProvider = useDeleteProvider();
  const testProvider = useTestProvider();

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createProvider.mutate({
      data: {
        name: form.name,
        providerType: form.providerType,
        defaultModel: form.defaultModel || undefined,
        apiKey: form.apiKey || undefined,
      }
    }, {
      onSuccess: () => {
        setForm({ name: "", providerType: "groq", defaultModel: "", apiKey: "" });
        setShowForm(false);
      }
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">Configure AI providers and platform settings.</p>
        </div>
        <Settings className="w-8 h-8 text-primary opacity-50" />
      </div>

      {/* Provider section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI Providers</h2>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-2" /> Add Provider
          </Button>
        </div>

        {showForm && (
          <Card className="bg-card border-border shadow-none">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Provider name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-background border-border"
                />
                <select
                  value={form.providerType}
                  onChange={(e) => setForm(f => ({ ...f, providerType: e.target.value as ProviderType }))}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                >
                  {providerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Input
                placeholder="Default model (optional)"
                value={form.defaultModel}
                onChange={(e) => setForm(f => ({ ...f, defaultModel: e.target.value }))}
                className="bg-background border-border"
              />
              <Input
                placeholder="API key (optional, stored encrypted)"
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                className="bg-background border-border"
              />
              <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded p-2">
                Only Groq works on the free tier. All other providers route through Groq as a fallback automatically.
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCreate} disabled={createProvider.isPending || !form.name}>
                  Add Provider
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Provider type reference */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providerTypes.map((type) => (
            <div key={type} className="flex items-start gap-2 p-3 bg-card border border-border rounded-md">
              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
              <div>
                <div className="text-sm font-medium capitalize">{type}</div>
                <div className="text-xs text-muted-foreground">{providerDesc[type]}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Configured providers */}
        {isLoading ? (
          <div className="text-primary animate-pulse">Loading providers...</div>
        ) : providers?.length ? (
          <div className="space-y-2">
            <h3 className="text-sm text-muted-foreground uppercase tracking-widest">Configured</h3>
            {providers.map((provider) => (
              <Card key={provider.id} className="bg-card border-border shadow-none">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {provider.isHealthy ? (
                        <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <div>
                        <span className="font-medium text-sm">{provider.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">({provider.providerType})</span>
                        {provider.defaultModel && (
                          <span className="text-xs text-muted-foreground ml-2">→ {provider.defaultModel}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {provider.latencyMs && (
                        <span className="text-xs text-muted-foreground">{provider.latencyMs}ms</span>
                      )}
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => testProvider.mutate({ id: provider.id })}
                        disabled={testProvider.isPending}
                        title="Test provider"
                      >
                        <Activity className="w-3.5 h-3.5 text-primary" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => deleteProvider.mutate({ id: provider.id })}
                      >
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
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Platform</h2>
        <Card className="bg-card border-border shadow-none">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stack</span>
              <span>Node.js 24 · Express 5 · PostgreSQL · React + Vite</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Compute</span>
              <span>Replit free tier</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sandbox</span>
              <span>E2B (free tier)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI Proxy</span>
              <span>Replit built-in (no API key needed)</span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
