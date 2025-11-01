import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ReactFlowProvider } from "reactflow";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ArrowLeft, Download, MessageSquare, Eye, BookOpen, Cloud, FlaskConical, Trash } from "lucide-react";
import { Palette } from "@/components/studio/Palette";
import { Canvas, type CanvasRef } from "@/components/studio/Canvas";
import { Inspector } from "@/components/studio/Inspector";
import { BuildBar } from "@/components/studio/BuildBar";
import { ChatPanel } from "@/components/studio/ChatPanel";
import { exportProject, type CapabilityBundle, type Project, type Playbook } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LivePreviewPanel } from "@/components/studio/LivePreviewPanel";
import { PlaybookPanel } from "@/components/studio/PlaybookPanel";
import { EvaluationPanel } from "@/components/studio/EvaluationPanel";
import { AzureDeployPanel } from "@/components/studio/AzureDeployPanel";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseAvailable, loadProjectById, saveProjectForUser, deleteProjectForUser } from "@/lib/storage";

const createProjectId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}`;
};

interface HandoffAttachment {
  filename: string;
  contentType?: string;
  base64: string;
}

const AgentStudio = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const supabaseEnabled = isSupabaseAvailable();
  const { toast } = useToast();

  const canvasRef = useRef<CanvasRef>(null);
  const fallbackProjectId = useRef<string>(params.id && params.id !== "new" ? params.id : createProjectId());

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [graphRevision, setGraphRevision] = useState(0);
  const [initialAttachments, setInitialAttachments] = useState<HandoffAttachment[]>([]);
  const [initialToolHints, setInitialToolHints] = useState<string[]>([]);
  const [initialWorkflowPreference, setInitialWorkflowPreference] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPlaybookOpen, setIsPlaybookOpen] = useState(false);
  const [isEvaluationOpen, setIsEvaluationOpen] = useState(false);
  const [isAzureOpen, setIsAzureOpen] = useState(false);

  const activeProjectId = useMemo(() => {
    if (params.id && params.id !== "new") {
      fallbackProjectId.current = params.id;
      return params.id;
    }
    return fallbackProjectId.current;
  }, [params.id]);

  useEffect(() => {
    if (!params.id || params.id === "new") {
      const prompt = searchParams.get("prompt");
      const newId = createProjectId();
      const query = prompt ? `?prompt=${encodeURIComponent(prompt)}` : "";
      navigate(`/studio/${newId}${query}`, { replace: true });
    }
  }, [params.id, navigate, searchParams]);

  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt) {
      setInitialPrompt(prompt);
      const next = new URLSearchParams(searchParams);
      next.delete("prompt");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handoffKey = `agent-canvas:handoff:${activeProjectId}`;
    const raw = window.sessionStorage.getItem(handoffKey);
    if (!raw) return;

    try {
      const payload = JSON.parse(raw) as {
        prompt?: string;
        attachments?: HandoffAttachment[];
        tools?: string[];
        workflowPreference?: string | null;
      };
      if (payload.prompt) {
        setInitialPrompt(payload.prompt);
      }
      if (Array.isArray(payload.attachments)) {
        setInitialAttachments(payload.attachments);
      }
      if (Array.isArray(payload.tools)) {
        setInitialToolHints(payload.tools);
      }
      if (payload.workflowPreference) {
        setInitialWorkflowPreference(payload.workflowPreference);
      }
    } catch (error) {
      console.error("Failed to parse studio handoff payload", error);
    } finally {
      window.sessionStorage.removeItem(handoffKey);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (authLoading) return;
    if (supabaseEnabled && !user) {
      navigate("/", { replace: true, state: { from: location.pathname + location.search } });
    }
  }, [authLoading, user, navigate, location.pathname, location.search, supabaseEnabled]);

  useEffect(() => {
    if (!user || !supabaseEnabled) return;
    if (!params.id || params.id === "new") return;
    let active = true;

    const load = async () => {
      if (!canvasRef.current) {
        setTimeout(load, 200);
        return;
      }
      const stored = await loadProjectById(params.id as string);
      if (stored && active) {
        setProjectName(stored.name);
        canvasRef.current?.replaceGraph(stored.graph.nodes, stored.graph.edges);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [user, params.id, supabaseEnabled]);

  const handleGraphChange = useCallback(() => {
    setGraphRevision((prev) => prev + 1);
  }, []);

  const getCurrentProject = useCallback((): Project => {
    const nodes = canvasRef.current?.getNodes() || [];
    const edges = canvasRef.current?.getEdges() || [];

    return {
      id: activeProjectId,
      name: projectName,
      graph: {
        nodes,
        edges,
      },
      settings: {
        defaultProvider: "openai",
        defaultModel: "gpt-4o-mini",
      },
    };
  }, [activeProjectId, projectName]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const project = getCurrentProject();
      if (user && isSupabaseAvailable()) {
        await saveProjectForUser(user.id, project);
      }
      const { url, filename } = await exportProject(project);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      toast({
        title: "Export successful",
        description: "Your project has been exported. Download started.",
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export project",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!user) {
      toast({ title: "Not signed in", description: "Sign in to delete projects.", variant: "destructive" });
      return;
    }
    if (!confirm("Delete this project? This action cannot be undone.")) return;
    try {
      await deleteProjectForUser(user.id, activeProjectId);
      toast({ title: "Project deleted" });
      navigate("/");
    } catch (error) {
      console.error("Failed to delete project", error);
      toast({ title: "Failed to delete project", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleAddBundle = useCallback(
    (bundle: CapabilityBundle) => {
      if (!canvasRef.current) return;

      const existingCount = canvasRef.current.getNodes().length;
      const offsetX = (existingCount % 3) * 280;
      const offsetY = Math.floor(existingCount / 3) * 220;

      const idMap = new Map<string, string>();
      const makeId = (base: string) => {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
          return `${base}-${crypto.randomUUID()}`;
        }
        return `${base}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      };

      const newNodes = bundle.nodes.map((node) => {
        const newId = makeId(node.id ?? node.type ?? "node");
        if (node.id) {
          idMap.set(node.id, newId);
        }

        const basePosition = (node as { position?: { x?: number; y?: number } }).position ?? { x: 0, y: 0 };

        return {
          ...node,
          id: newId,
          position: {
            x: (basePosition.x ?? 0) + offsetX,
            y: (basePosition.y ?? 0) + offsetY,
          },
        };
      });

      const newEdges = bundle.edges.map((edge) => {
        const sourceId = edge.source && idMap.get(edge.source) ? idMap.get(edge.source)! : edge.source;
        const targetId = edge.target && idMap.get(edge.target) ? idMap.get(edge.target)! : edge.target;
        return {
          ...edge,
          id: makeId(edge.id ?? "edge"),
          source: sourceId,
          target: targetId,
        };
      });

      canvasRef.current.addGeneratedNodes(newNodes, newEdges);
    },
    []
  );

  const handleImportPlaybook = useCallback(
    (playbook: Playbook) => {
      if (!canvasRef.current) return;
      canvasRef.current.replaceGraph(playbook.project.graph.nodes, playbook.project.graph.edges);
      setProjectName(playbook.metadata.name ?? "Untitled Project");
      toast({
        title: "Scene loaded",
        description: `${playbook.metadata.name} replaced the current canvas.`,
      });
    },
    [toast]
  );

  const project = getCurrentProject();

  useEffect(() => {
    if (!user || !supabaseEnabled) return;
    const handle = window.setTimeout(() => {
      try {
        void saveProjectForUser(user.id, getCurrentProject());
      } catch (error) {
        console.error("Autosave failed", error);
      }
    }, 1000);

    return () => window.clearTimeout(handle);
  }, [graphRevision, projectName, user, supabaseEnabled, getCurrentProject]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-14 border-b border-border bg-sidebar px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="hover:bg-sidebar-accent">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsChatOpen((prev) => !prev)}>
            <MessageSquare className="w-4 h-4 mr-2" />
            {isChatOpen ? "Close Chat" : "Chat"}
          </Button>
          <div>
            <input
              aria-label="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="font-semibold text-lg bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">Agent Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(true)}>
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsPlaybookOpen(true)}>
            <BookOpen className="w-4 h-4 mr-2" />
            Playbooks
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsEvaluationOpen(true)}>
            <FlaskConical className="w-4 h-4 mr-2" />
            Evaluate
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsAzureOpen(true)}>
            <Cloud className="w-4 h-4 mr-2" />
            Deploy
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Exporting..." : "Export"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteProject}
            title="Delete project"
            className="ml-2"
          >
            <Trash className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </header>

      <ReactFlowProvider>
        <div className="flex-1 flex overflow-hidden">
          <Palette onAddBundle={handleAddBundle} />

          <div className="flex-1 flex flex-col">
            <Canvas
              ref={canvasRef}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              onGraphChange={handleGraphChange}
            />
            <BuildBar getProject={getCurrentProject} revision={graphRevision} />
          </div>

          <Inspector selectedNode={selectedNode} key={graphRevision} />
          {isChatOpen && (
            <ChatPanel
              project={project}
              nodes={canvasRef.current?.getNodes() || []}
              edges={canvasRef.current?.getEdges() || []}
              initialPrompt={initialPrompt}
              initialAttachments={initialAttachments}
              initialToolHints={initialToolHints}
              initialWorkflowPreference={initialWorkflowPreference}
              onInitialPromptConsumed={() => {
                setInitialPrompt(null);
                setInitialAttachments([]);
                setInitialToolHints([]);
                setInitialWorkflowPreference(null);
              }}
              onGenerateNodes={(nodes, edges) => {
                canvasRef.current?.addGeneratedNodes(nodes, edges);
                if (user && supabaseEnabled) {
                  setTimeout(() => {
                    try {
              void saveProjectForUser(user.id, getCurrentProject());
            } catch (error) {
              console.error("Failed to sync project", error);
            }
          }, 250);
        }
      }}
    />
  )}
        </div>
      </ReactFlowProvider>

      <LivePreviewPanel open={isPreviewOpen} onOpenChange={setIsPreviewOpen} getProject={getCurrentProject} />
      <PlaybookPanel open={isPlaybookOpen} onOpenChange={setIsPlaybookOpen} getProject={getCurrentProject} onImportPlaybook={handleImportPlaybook} />
      <EvaluationPanel open={isEvaluationOpen} onOpenChange={setIsEvaluationOpen} getProject={getCurrentProject} />
      <AzureDeployPanel open={isAzureOpen} onOpenChange={setIsAzureOpen} getProject={getCurrentProject} onRequestExport={handleExport} />
    </div>
  );
};

export default AgentStudio;
