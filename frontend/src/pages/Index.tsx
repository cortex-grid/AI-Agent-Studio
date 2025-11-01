import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ArrowRight,
  Sparkles,
  Folder,
  Loader2,
  MonitorPlay,
  BookOpenCheck,
  FlaskConical,
  CloudUpload,
  Paperclip,
  Check,
  X,
} from "lucide-react";
import { AuthMenu } from "@/components/auth/AuthMenu";
import { useAuth } from "@/hooks/useAuth";
import { fetchProjectsForUser, isSupabaseAvailable, type StoredProjectSummary, deleteProjectForUser } from "@/lib/storage";
import { Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PricingModal } from "@/components/marketing/PricingModal";
import { EnterpriseModal } from "@/components/marketing/EnterpriseModal";
import ParticleBackground from '@/components/ParticleBackground';

const createProjectId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}`;
};

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState<StoredProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [workflowAuto, setWorkflowAuto] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [displayPlaceholder, setDisplayPlaceholder] = useState("");
  const placeholderText = "Ask Agent Canvas to design an AI team for...";
  const [pricingOpen, setPricingOpen] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  

  const isAuthReady = useMemo(() => Boolean(user), [user]);

  const highlightFeatures = useMemo(
    () => [
      {
        title: "Live Preview",
        description: "Boot a WebContainers sandbox in the browser to iterate on agents without leaving the studio.",
        icon: MonitorPlay,
      },
      {
        title: "Playbooks & Scenes",
        description: "Drop in reusable multi-agent templates with prompt wiring and tool configs.",
        icon: BookOpenCheck,
      },
      {
        title: "Evaluation Harness",
        description: "Author scripted conversations with assertions so every export ships with QA scenarios.",
        icon: FlaskConical,
      },
      {
        title: "Azure Deploy",
        description: "Package and push to Azure Container Apps in one click using the bundled Bicep workflows.",
        icon: CloudUpload,
      },
    ],
    []
  );

  const toolOptions = useMemo(
    () => [
      { id: "code-interpreter", label: "Code Interpreter" },
      { id: "file-search", label: "File Search" },
      { id: "yahoo-finance", label: "Yahoo Finance" },
      { id: "google-search", label: "Google Search" },
      { id: "mcp-tool", label: "MCP Bridge" },
      { id: "calculator", label: "Calculator" },
      { id: "pandas", label: "Pandas Toolkit" },
      { id: "csv-toolkit", label: "CSV Toolkit" },
      { id: "confluence", label: "Confluence" },
      { id: "jira", label: "Jira" },
      { id: "clickup", label: "ClickUp" },
      { id: "youtube", label: "YouTube" },
      { id: "discord", label: "Discord" },
    ],
    []
  );

  useEffect(() => {
    const text = placeholderText;
    let active = true;
    let index = 0;
    const timers: number[] = [];

    const type = () => {
      if (!active) return;
      setDisplayPlaceholder(text.slice(0, index));
      if (index >= text.length) {
        timers.push(
          window.setTimeout(() => {
            index = 0;
            type();
          }, 1800)
        );
      } else {
        index += 1;
        timers.push(window.setTimeout(type, 55));
      }
    };

    type();

    return () => {
      active = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [placeholderText]);

  useEffect(() => {
    if (!promptInputRef.current) return;
    const textarea = promptInputRef.current;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 320);
    textarea.style.height = `${Math.max(nextHeight, 48)}px`;
  }, [prompt]);

  useEffect(() => {
    const load = async () => {
      if (!user || !isSupabaseAvailable()) {
        setProjects([]);
        setLoadingProjects(false);
        return;
      }
      setLoadingProjects(true);
      const data = await fetchProjectsForUser(user.id);
      setProjects(data);
      setLoadingProjects(false);
    };
    void load();
  }, [user]);

  const handleCreateNew = () => {
    const newId = createProjectId();
    navigate(`/studio/${newId}`);
  };

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    const next: File[] = [...attachedFiles];

    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 5MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      if (next.find((item) => item.name === file.name && item.size === file.size)) {
        continue;
      }
      if (next.length >= 5) {
        toast({
          title: "Attachment limit reached",
          description: "You can attach up to five files per request.",
          variant: "destructive",
        });
        break;
      }
      next.push(file);
    }

    setAttachedFiles(next);
    event.target.value = "";
  };

  const removeAttachment = (fileName: string) => {
    setAttachedFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const toggleToolSelection = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const [, base64] = result.split(",");
        resolve(base64 ?? "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handlePromptSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    const projectId = createProjectId();

    try {
      setSubmitting(true);
      const attachmentsPayload = await Promise.all(
        attachedFiles.map(async (file) => ({
          filename: file.name,
          contentType: file.type,
          base64: await fileToBase64(file),
        }))
      );

      if (typeof window !== "undefined") {
        const handoffPayload = {
          prompt: prompt.trim(),
          attachments: attachmentsPayload,
          tools: selectedTools,
          workflowPreference: workflowAuto ? "auto" : "manual",
        };
        window.sessionStorage.setItem(
          `agent-canvas:handoff:${projectId}`,
          JSON.stringify(handoffPayload)
        );
      }

      const encoded = encodeURIComponent(prompt.trim());
      navigate(`/studio/${projectId}?prompt=${encoded}`);
    } catch (error) {
      console.error("Failed to prepare handoff payload", error);
      toast({
        title: "Failed to prepare request",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-background text-white">
      <ParticleBackground />
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Agent Canvas logo"
            className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 p-1 object-contain"
          />
          <div>
            <h1 className="text-lg font-semibold">CortexGrid</h1>
            <p className="text-xs text-muted-foreground">AI Agent Canvas Studio</p>
          </div>
        </div>

        <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          <button
            type="button"
            className="transition hover:text-white"
            onClick={() => setPricingOpen(true)}
          >
            Pricing
          </button>
          <button
            type="button"
            className="transition hover:text-white"
            onClick={() => setEnterpriseOpen(true)}
          >
            Enterprise
          </button>
          <a
            href="#features"
            className="transition hover:text-white"
          >
            Features
          </a>
          <a
            href="#resources"
            className="transition hover:text-white"
          >
            Resources
          </a>
        </nav>

        <AuthMenu />
      </header>

      <main className="px-6 pb-16">
        <section className="mx-auto max-w-5xl text-center py-16 space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs text-white/80">
            <Sparkles className="h-3 w-3 text-primary" />
            Introducing the AI Agent Canvas Studio
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight">
              Build something           
              <img
                src="/logo.png"
                alt="Agent Canvas logo"
                className="inline-block h-16 w-16 rounded-2xl  p-1 object-contain mb-2"
              />
              <span className="text-primary">smart</span>
            </h2>
            <p className="text-base md:text-lg text-white/70 max-w-2xl mx-auto">
              Describe the multi-agent system you need and let the studio design it with Microsoft Agent Framework               
              <img
                src="/maf.png"
                alt="Microsoft Agent Framework logo"
                className="inline-block h-10 w-10 rounded-2xl  p-1 object-contain mb-2"
              />
              building blocks.
            </p>
          </div>

          {/* <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              variant="secondary"
              className="rounded-full px-6 py-5 text-sm font-semibold"
              onClick={() => setPricingOpen(true)}
            >
              View plans
            </Button>
            <Button
              className="rounded-full px-6 py-5 text-sm font-semibold bg-white text-black hover:bg-white/90"
              onClick={() => setEnterpriseOpen(true)}
            >
              Talk to us
            </Button>
          </div> */}

          <form
            onSubmit={handlePromptSubmit}
            className="mx-auto mt-10 w-full max-w-3xl rounded-3xl bg-black/40 backdrop-blur border border-white/10 px-6 py-6 shadow-[0_40px_120px_-40px_rgba(56,189,248,.3)]"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleFilesSelected}
              accept=".pdf,.txt,.md,.json,.csv,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp"
            />
            <div className="flex items-start gap-4">
              <textarea
                ref={promptInputRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={displayPlaceholder}
                rows={1}
                className="flex-1 bg-transparent text-left text-base placeholder:text-white/50 focus:outline-none resize-none leading-6 max-h-80 min-h-[48px]"
                autoComplete="off"
                spellCheck={false}
                aria-label="Describe the agent system you want to build"
              />
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 min-h-[44px]"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/60">
              <button
                type="button"
                onClick={handleFileAttach}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 transition hover:border-primary/50 hover:text-primary"
              >
                <Paperclip className="h-3 w-3" />
                Attach docs
              </button>
              <button
                type="button"
                onClick={() => setToolPickerOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                  toolPickerOpen || selectedTools.length > 0
                    ? "border-primary/60 text-primary"
                    : "border-white/15 hover:border-primary/50 hover:text-primary"
                }`}
              >
                <Plus className="h-3 w-3" />
                Use existing tools
              </button>
              <button
                type="button"
                onClick={() => setWorkflowAuto((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                  workflowAuto
                    ? "border-emerald-400/60 text-emerald-300"
                    : "border-white/15 hover:border-primary/50 hover:text-primary"
                }`}
              >
                <Check className="h-3 w-3" />
                Auto-generate workflow
              </button>
            </div>
            {attachedFiles.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                {attachedFiles.map((file) => (
                  <span
                    key={file.name}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      className="text-white/60 hover:text-white"
                      onClick={() => removeAttachment(file.name)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {toolPickerOpen && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                <p className="text-xs uppercase tracking-wider text-white/50 mb-3">Preferred tools</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {toolOptions.map((tool) => {
                    const active = selectedTools.includes(tool.id);
                    return (
                      <button
                        type="button"
                        key={tool.id}
                        onClick={() => toggleToolSelection(tool.id)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                          active
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-white/10 bg-transparent text-white/80 hover:border-primary/50 hover:text-primary"
                        }`}
                      >
                        <span>{tool.label}</span>
                        {active && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </form>

          <div className="pt-6">
            <Button size="lg" className="bg-white text-black hover:bg-white/90" onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Start from blank canvas
            </Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 rounded-3xl border border-white/10 bg-black/40 p-8 md:grid-cols-2 lg:grid-cols-4">
          {highlightFeatures.map((feature) => (
            <div key={feature.title} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                <feature.icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                <p className="text-xs text-white/70 leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-5xl rounded-3xl bg-black/50 border border-white/10 px-6 py-8 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">My projects</h3>
              <p className="text-xs text-white/60">
                {isAuthReady
                  ? "Your recent Agent Canvas workspaces."
                  : "Sign in to see your saved agent projects."}
              </p>
            </div>
            {isAuthReady && (
              <Button variant="outline" size="sm" onClick={handleCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                New project
              </Button>
            )}
          </div>

          {!isSupabaseAvailable() ? (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
              <Folder className="h-4 w-4" />
              <span>Supabase environment variables are not configured. Projects will be stored locally only.</span>
            </div>
          ) : !isAuthReady ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-10 text-sm text-white/70">
              <Folder className="h-8 w-8 mb-4 text-white/50" />
              <p>Sign in to sync your projects and pick up where you left off.</p>
            </div>
          ) : loadingProjects ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/70" />
              <span className="text-sm text-white/70">Loading your projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-10 text-sm text-white/70">
              <Folder className="h-8 w-8 mb-4 text-white/50" />
              <p>No projects yet. Generate your first agent team using the prompt box above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-5 text-left transition hover:border-primary/50 hover:shadow-[0_20px_60px_-40px_rgba(56,189,248,.6)]"
                >
                  <button
                    className="absolute right-3 top-3 text-white/60 hover:text-white"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("Delete this project? This action cannot be undone.")) return;
                      try {
                        if (user) await deleteProjectForUser(user.id, project.id);
                        setProjects((prev) => prev.filter((p) => p.id !== project.id));
                        toast({ title: "Project deleted" });
                      } catch (error) {
                        console.error("Failed to delete project", error);
                        toast({ title: "Failed to delete project", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
                      }
                    }}
                    title="Delete project"
                  >
                    <Trash className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => navigate(`/studio/${project.id}`)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>Updated {new Date(project.updated_at).toLocaleString()}</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                    <h4 className="mt-3 text-lg font-semibold text-white">{project.name}</h4>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <PricingModal open={pricingOpen} onOpenChange={setPricingOpen} />
      <EnterpriseModal open={enterpriseOpen} onOpenChange={setEnterpriseOpen} />
    </div>
  );
};

export default Index;

