import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { validateProject, type Project } from "@/lib/api";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
  RefreshCw,
  Clock3,
} from "lucide-react";

interface BuildBarProps {
  getProject: () => Project;
  revision: number;
}

export const BuildBar = ({ getProject, revision }: BuildBarProps) => {
  const [activeTab, setActiveTab] = useState("logs");
  const [validating, setValidating] = useState(false);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [lastValidatedAt, setLastValidatedAt] = useState<string | null>(null);

  const runValidation = useCallback(async () => {
    setValidating(true);
    setValidationError(null);
    try {
      const project = getProject();
      const result = await validateProject(project);
      setValidationIssues(result.issues ?? []);
      setIsValid(result.valid);
      setLastValidatedAt(new Date().toISOString());
    } catch (error) {
      console.error("Validation failed", error);
      setValidationError(error instanceof Error ? error.message : "Validation failed");
      setIsValid(null);
    } finally {
      setValidating(false);
    }
  }, [getProject]);

  useEffect(() => {
    // Trigger validation when canvas changes
    runValidation();
  }, [revision, runValidation]);

  const validationSummary = (() => {
    if (validationError) return "Validation error";
    if (validating) return "Validating…";
    if (isValid && validationIssues.length === 0) return "Ready to export";
    if (validationIssues.length > 0) return `${validationIssues.length} issue${validationIssues.length > 1 ? "s" : ""} found`;
    return "No validation run yet";
  })();

  return (
    <div className="h-60 border-t border-border bg-sidebar flex-shrink-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-9">
            <TabsTrigger value="logs" className="gap-2 text-xs">
              <Terminal className="w-3 h-3" />
              Run Log
            </TabsTrigger>
            <TabsTrigger value="validation" className="gap-2 text-xs">
              <CheckCircle2 className="w-3 h-3" />
              Validation
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2 text-xs">
              <Package className="w-3 h-3" />
              Export
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="logs" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2 font-mono text-xs">
              <div className="flex items-start gap-2 text-muted-foreground">
                <span className="text-accent">[System]</span>
                <span>Studio ready.</span>
              </div>
              <div className="flex items-start gap-2 text-muted-foreground">
                <span className="text-accent">[Hint]</span>
                <span>Drag agents and tools into the canvas to start composing.</span>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="validation" className="flex-1 mt-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className={`w-4 h-4 ${validationIssues.length === 0 && !validationError ? "text-success" : "text-muted-foreground"}`} />
              <span>{validationSummary}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={runValidation}
              disabled={validating}
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {validating ? "Validating..." : "Re-run"}
            </Button>
          </div>
          <ScrollArea className="h-[calc(100%-45px)]">
            <div className="p-4 space-y-3">
              {lastValidatedAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  Last checked {new Date(lastValidatedAt).toLocaleTimeString()}
                </div>
              )}

              {validationError && (
                <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <div>
                    <p className="font-medium">Validation failed</p>
                    <p className="text-xs">{validationError}</p>
                  </div>
                </div>
              )}

              {!validationError && validationIssues.length === 0 && !validating && (
                <div className="flex items-start gap-3 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
                  <CheckCircle2 className="w-4 h-4 mt-0.5" />
                  <div>
                    <p className="font-medium">All checks passed</p>
                    <p className="text-xs text-success/80">
                      Agents, tools, and configuration look export-ready.
                    </p>
                  </div>
                </div>
              )}

              {validationIssues.map((issue) => (
                <div key={issue} className="flex items-start gap-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <div>
                    <p className="font-medium">Action required</p>
                    <p className="text-xs text-muted-foreground">{issue}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="export" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Package Checklist</h4>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>✅ React frontend (deliverables/frontend)</p>
                  <p>✅ FastAPI + MAF backend (deliverables/backend-python)</p>
                  <p>✅ Generated `project.json` blueprint</p>
                  <p>✅ Tool manifest & `.env.generated.example`</p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
