import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Plus, Save, Trash2, ClipboardCheck, AlertCircle } from "lucide-react";
import {
  deleteEvaluationScenario,
  fetchEvaluationScenario,
  fetchEvaluationScenarios,
  runEvaluationScenario,
  saveEvaluationScenario,
  type EvaluationListItem,
  type EvaluationResult,
  type EvaluationScenario,
  type Project,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchEvaluationScenariosForUser,
  isSupabaseAvailable,
  saveEvaluationScenarioForUser,
  deleteEvaluationScenarioForUser,
  type StoredEvaluationSummary,
} from "@/lib/storage";

interface EvaluationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getProject: () => Project;
}

interface EvaluationFormState {
  name: string;
  description: string;
  targetAgent: string;
  prompt: string;
  expectedText: string;
}

const defaultForm: EvaluationFormState = {
  name: "",
  description: "",
  targetAgent: "team",
  prompt: "",
  expectedText: "",
};

export const EvaluationPanel = ({ open, onOpenChange, getProject }: EvaluationPanelProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const supabaseEnabled = isSupabaseAvailable();
  const [scenarios, setScenarios] = useState<EvaluationListItem[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<EvaluationScenario | null>(null);
  const [form, setForm] = useState<EvaluationFormState>(defaultForm);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [resultText, setResultText] = useState<string>("");

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [serverItems, userItems] = await Promise.all([
        fetchEvaluationScenarios(),
        user && supabaseEnabled
          ? fetchEvaluationScenariosForUser(user.id)
          : Promise.resolve([] as StoredEvaluationSummary[]),
      ]);

      const merged = new Map<string, EvaluationListItem>();
      for (const item of serverItems) {
        merged.set(item.id, item);
      }

      for (const item of userItems) {
        const existing = merged.get(item.id);
        const existingTimestamp = existing ? new Date(existing.updated_at).getTime() : 0;
        const incomingTimestamp = new Date(item.updated_at).getTime();
        if (!existing || incomingTimestamp >= existingTimestamp) {
          merged.set(item.id, {
            id: item.id,
            name: item.name,
            description: item.description ?? existing?.description,
            target_agent: item.target_agent ?? existing?.target_agent ?? "team",
            updated_at: item.updated_at,
          });
        }
      }

      const sorted = Array.from(merged.values()).sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setScenarios(sorted);
    } catch (error) {
      console.error("Failed to load evaluation scenarios", error);
      toast({
        title: "Failed to load evaluation scenarios",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [toast, supabaseEnabled, user]);

  useEffect(() => {
    if (open) {
      void refreshList();
    }
  }, [open, refreshList]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Name required",
        description: "Provide a scenario name before saving.",
        variant: "destructive",
      });
      return;
    }
    if (!form.prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Add the test prompt to run.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const scenario: EvaluationScenario = {
        id: selectedScenario?.id ?? "",
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        target_agent: form.targetAgent.trim() || "team",
        messages: [{ role: "user", content: form.prompt }],
        assertions: form.expectedText.trim()
          ? [
              {
                description: "Response contains expected text",
                contains: form.expectedText.trim(),
              },
            ]
          : [],
        created_at: selectedScenario?.created_at ?? now,
        updated_at: now,
      };

      const saved = await saveEvaluationScenario(scenario);
      if (user && isSupabaseAvailable()) {
        await saveEvaluationScenarioForUser(user.id, saved);
      }
      setSelectedScenario(saved);
      setForm({
        name: saved.name,
        description: saved.description ?? "",
        targetAgent: saved.target_agent,
        prompt: saved.messages[0]?.content ?? "",
        expectedText: saved.assertions.find((assertion) => assertion.contains)?.contains ?? "",
      });
      toast({
        title: "Scenario saved",
        description: `${saved.name} ready for evaluation.`,
      });
      await refreshList();
    } catch (error) {
      console.error("Failed to save scenario", error);
      toast({
        title: "Failed to save scenario",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = async (item: EvaluationListItem) => {
    try {
      const scenario = await fetchEvaluationScenario(item.id);
      setSelectedScenario(scenario);
      setForm({
        name: scenario.name,
        description: scenario.description ?? "",
        targetAgent: scenario.target_agent,
        prompt: scenario.messages[0]?.content ?? "",
        expectedText: scenario.assertions.find((a) => a.contains)?.contains ?? "",
      });
      setResult(null);
      setResultText("");
    } catch (error) {
      console.error("Failed to load scenario", error);
      toast({
        title: "Failed to load scenario",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (scenarioId: string) => {
    if (!window.confirm("Delete this evaluation scenario?")) return;
    setDeletingId(scenarioId);
    try {
      await deleteEvaluationScenario(scenarioId);
      if (user && isSupabaseAvailable()) {
        await deleteEvaluationScenarioForUser(user.id, scenarioId);
      }
      toast({ title: "Scenario deleted" });
      if (selectedScenario?.id === scenarioId) {
        setSelectedScenario(null);
        setForm(defaultForm);
        setResult(null);
        setResultText("");
      }
      await refreshList();
    } catch (error) {
      console.error("Failed to delete scenario", error);
      toast({
        title: "Failed to delete scenario",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleRun = async (scenarioId: string) => {
    setRunningId(scenarioId);
    try {
      const project = getProject();
      const evaluation = await runEvaluationScenario(scenarioId, project);
      setResult(evaluation);
      setResultText(String(evaluation.metadata?.response ?? ""));
      toast({
        title: evaluation.passed ? "Scenario passed" : "Scenario failed",
        description: evaluation.passed
          ? "All assertions satisfied."
          : `${evaluation.failures.length} assertion(s) failed.`,
        variant: evaluation.passed ? "default" : "destructive",
      });
    } catch (error) {
      console.error("Failed to run scenario", error);
      toast({
        title: "Scenario run failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningId(null);
    }
  };

  const resetForm = () => {
    setSelectedScenario(null);
    setForm(defaultForm);
    setResult(null);
    setResultText("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[520px]">
        <SheetHeader>
          <SheetTitle>Evaluation Harness</SheetTitle>
          <SheetDescription>
            Define regression scenarios to validate responses before exporting or deploying.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Scenario details</h3>
              <p className="text-xs text-muted-foreground">
                Provide a user prompt and optional expected text. Additional assertions coming soon.
              </p>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="Scenario name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Textarea
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={2}
              />
              <Input
                placeholder="Target agent (default: team)"
                value={form.targetAgent}
                onChange={(event) => setForm((prev) => ({ ...prev, targetAgent: event.target.value }))}
              />
              <Textarea
                placeholder="User prompt to evaluate"
                value={form.prompt}
                onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
                rows={4}
              />
              <Textarea
                placeholder="Expected response contains..."
                value={form.expectedText}
                onChange={(event) => setForm((prev) => ({ ...prev, expectedText: event.target.value }))}
                rows={2}
              />
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {selectedScenario ? "Update scenario" : "Save scenario"}
                </Button>
                <Button variant="outline" className="gap-2" onClick={resetForm}>
                  <Plus className="h-4 w-4" /> New
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Saved scenarios</h3>
              <Button variant="ghost" size="sm" onClick={() => void refreshList()} className="gap-2">
                {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
            <ScrollArea className="h-60 rounded-md border border-border bg-muted/20 p-2">
              {loadingList && scenarios.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading scenarios...
                </div>
              ) : scenarios.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No scenarios yet. Save one above to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className={`rounded-md border border-border bg-background p-3 transition hover:border-primary/40 ${
                        selectedScenario?.id === scenario.id ? "ring-2 ring-primary/40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{scenario.name}</p>
                          {scenario.description && (
                            <p className="text-xs text-muted-foreground">{scenario.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">{scenario.target_agent}</Badge>
                            <span>Updated {new Date(scenario.updated_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleSelect(scenario)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void handleRun(scenario.id)}
                            disabled={runningId === scenario.id}
                          >
                            {runningId === scenario.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                            Run
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDelete(scenario.id)}
                            disabled={deletingId === scenario.id}
                          >
                            {deletingId === scenario.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </section>

          {result && (
            <section className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Latest result</h3>
                <Badge variant={result.passed ? "default" : "destructive"}>
                  {result.passed ? "Passed" : "Failed"}
                </Badge>
              </div>
              {result.failures.length > 0 && (
                <div className="space-y-2">
                  {result.failures.map((failure) => (
                    <div key={failure} className="flex items-start gap-2 text-xs text-destructive">
                      <AlertCircle className="h-4 w-4 mt-0.5" />
                      <span>{failure}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Assistant response</p>
                <Textarea value={resultText} readOnly rows={6} className="font-mono text-xs" />
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};







