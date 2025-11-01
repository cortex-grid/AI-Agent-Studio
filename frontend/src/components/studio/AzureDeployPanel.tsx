import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2, Sparkles, Cloud, ExternalLink } from "lucide-react";
import { fetchToolCatalog, type Project, type ToolCatalogItem } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AzureDeployPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getProject: () => Project;
  onRequestExport?: () => Promise<void> | void;
}

const extractEnvVars = (project: Project, catalog: ToolCatalogItem[]): string[] => {
  const map = new Map<string, ToolCatalogItem>();
  catalog.forEach((item) => map.set(item.subtype, item));

  const vars = new Set<string>();
  const regex = /[A-Z][A-Z0-9_]{2,}/g;

  project.graph.nodes.forEach((node) => {
    const subtype = (node.data as { subtype?: string })?.subtype;
    if (!subtype) return;
    const entry = map.get(subtype);
    const requires = entry?.requires ?? [];
    requires.forEach((req) => {
      const matches = req.match(regex);
      matches?.forEach((match) => vars.add(match));
    });
  });

  return Array.from(vars).sort();
};

const buildDeploymentCommand = (project: Project) => {
  const nameSafe = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const deploymentName = nameSafe ? `${nameSafe}-canvas` : "agent-canvas";
  const baseLines = [
    "# Azure CLI deployment using provided Bicep templates",
    "az login",
    "az group create --name <resource-group> --location <region>",
    [
      "az deployment group create",
      "--resource-group <resource-group>",
      "--template-file backend/deploy/containerapp.bicep",
      `--parameters projectName=${deploymentName} imageTag=latest`,
    ].join(" \\\n  "),
  ];
  return baseLines.join("\n");
};

export const AzureDeployPanel = ({ open, onOpenChange, getProject, onRequestExport }: AzureDeployPanelProps) => {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<ToolCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCatalog(true);
      try {
        const items = await fetchToolCatalog();
        if (!cancelled) {
          setCatalog(items);
        }
      } catch (error) {
        console.error("Failed to load tool catalog", error);
        toast({
          title: "Failed to load tool catalog",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setLoadingCatalog(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const project = getProject();
  const envVars = useMemo(() => extractEnvVars(project, catalog), [catalog, project]);
  const deployCommand = buildDeploymentCommand(project);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed", error);
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    if (!onRequestExport) return;
    try {
      setExporting(true);
      await onRequestExport();
      toast({
        title: "Export triggered",
        description: "Check your downloads for the latest deliverable package.",
      });
    } catch (error) {
      console.error("Export failed", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[520px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Azure Deployment
          </SheetTitle>
          <SheetDescription>
            Package your project and push it to Azure Container Apps using the bundled Bicep templates.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-2 rounded-md border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Quick Start
            </h3>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>Ensure your playbook is validated (see Validation tab).</li>
              <li>
                Export the project deliverables.
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-2"
                  onClick={handleExport}
                  disabled={exporting || !onRequestExport}
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Export bundle
                </Button>
              </li>
              <li>Populate ackend/.env using .env.generated.example and required secrets below.</li>
              <li>Run the Azure CLI deployment command from your project root.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Azure CLI Command</h3>
              <Button variant="ghost" size="sm" onClick={() => handleCopy(deployCommand)} className="gap-2">
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Textarea value={deployCommand} readOnly rows={6} className="font-mono text-xs" />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Environment Variables</h3>
              {loadingCatalog && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {envVars.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tool-specific secrets detected. Review .env.generated.example after export for defaults.
              </p>
            ) : (
              <ScrollArea className="h-32 rounded-md border border-border bg-muted/20 p-2 text-xs">
                <div className="space-y-1">
                  {envVars.map((env) => (
                    <div key={env} className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {env}
                      </Badge>
                      <span className="text-muted-foreground">Set this in your deployment environment.</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </section>

          <section className="space-y-2 text-xs text-muted-foreground">
            <p className="font-medium text-sm text-foreground">Need more?</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Review ackend/deploy/README.md for parameters and required Azure resources.</li>
              <li>
                Customize the front-end build in ackend/deliverables/frontend before deploying.
              </li>
              <li>Set CI/CD pipelines to rebuild and push container images referencing the generated backend.</li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

