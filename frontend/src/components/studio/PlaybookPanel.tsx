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
import {
  BookOpen,
  Loader2,
  Plus,
  Save,
  UploadCloud,
  Trash2,
} from "lucide-react";
import {
  fetchPlaybooks,
  fetchPlaybook,
  savePlaybook,
  deletePlaybook,
  type Playbook,
  type PlaybookListItem,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PlaybookPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getProject: () => Playbook["project"];
  onImportPlaybook: (playbook: Playbook) => void;
}

interface PlaybookFormState {
  name: string;
  description: string;
  category: string;
  tags: string;
  notes: string;
}

const defaultForm: PlaybookFormState = {
  name: "",
  description: "",
  category: "",
  tags: "",
  notes: "",
};

export const PlaybookPanel = ({
  open,
  onOpenChange,
  getProject,
  onImportPlaybook,
}: PlaybookPanelProps) => {
  const { toast } = useToast();
  const [playbooks, setPlaybooks] = useState<PlaybookListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PlaybookFormState>(defaultForm);
  const [currentMetadata, setCurrentMetadata] = useState<Playbook["metadata"] | null>(null);
  const [loadingSelectionId, setLoadingSelectionId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchPlaybooks();
      setPlaybooks(items);
    } catch (error) {
      console.error("Failed to load playbooks", error);
      toast({
        title: "Failed to load playbooks",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      void refreshList();
    }
  }, [open, refreshList]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Name required",
        description: "Enter a name before saving the playbook.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const tags = form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const baseMetadata = currentMetadata
        ? { ...currentMetadata, updated_at: now }
        : {
            id: selectedId ?? "",
            created_at: now,
            updated_at: now,
            version: "1.0.0",
          };

      const playbook: Playbook = {
        metadata: {
          ...baseMetadata,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
          tags,
          updated_at: now,
          version: baseMetadata.version ?? "1.0.0",
        },
        project: getProject(),
        notes: form.notes.trim() || undefined,
        placeholders: undefined,
      };
      const saved = await savePlaybook(playbook);
      setCurrentMetadata(saved.metadata);
      toast({
        title: "Playbook saved",
        description: `${saved.metadata.name} is ready to share.`,
      });
      setSelectedId(saved.metadata.id);
      setForm({
        name: saved.metadata.name,
        description: saved.metadata.description ?? "",
        category: saved.metadata.category ?? "",
        tags: (saved.metadata.tags ?? []).join(", "),
        notes: saved.notes ?? "",
      });
      await refreshList();
    } catch (error) {
      console.error("Failed to save playbook", error);
      toast({
        title: "Failed to save playbook",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = async (item: PlaybookListItem) => {
    setLoadingSelectionId(item.id);
    try {
      const playbook = await fetchPlaybook(item.id);
      setSelectedId(playbook.metadata.id);
      setCurrentMetadata(playbook.metadata);
      setForm({
        name: playbook.metadata.name,
        description: playbook.metadata.description ?? "",
        category: playbook.metadata.category ?? "",
        tags: (playbook.metadata.tags ?? []).join(", "),
        notes: playbook.notes ?? "",
      });
    } catch (error) {
      console.error("Failed to load playbook", error);
      toast({
        title: "Failed to load playbook",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingSelectionId(null);
    }
  };

  const handleImport = async (playbookId: string) => {
    setImportingId(playbookId);
    try {
      const playbook = await fetchPlaybook(playbookId);
      onImportPlaybook(playbook);
      toast({
        title: "Playbook imported",
        description: `${playbook.metadata.name} loaded onto the canvas.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to import playbook", error);
      toast({
        title: "Failed to import playbook",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleDelete = async (playbookId: string) => {
    if (!window.confirm("Delete this playbook? This action cannot be undone.")) {
      return;
    }
    setDeletingId(playbookId);
    try {
      await deletePlaybook(playbookId);
      toast({
        title: "Playbook deleted",
        description: "The playbook has been removed.",
      });
      if (selectedId === playbookId) {
        setSelectedId(null);
        setForm(defaultForm);
        setCurrentMetadata(null);
        setLoadingSelectionId(null);
      }
      await refreshList();
    } catch (error) {
      console.error("Failed to delete playbook", error);
      toast({
        title: "Failed to delete playbook",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[520px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Playbooks &amp; Scenes
          </SheetTitle>
          <SheetDescription>
            Save the current canvas as a reusable playbook, or import an existing scene to bootstrap a new
            project.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Save current canvas</h3>
              <p className="text-xs text-muted-foreground">
                Capture the current agents, prompts, and tool wiring as a shareable playbook.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                placeholder="Playbook name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Textarea
                placeholder="Short description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
              <div className="flex gap-3">
                <Input
                  placeholder="Category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
                <Input
                  placeholder="Tags (comma separated)"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>
              <Textarea
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {selectedId ? "Update playbook" : "Save playbook"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setSelectedId(null);
                    setForm(defaultForm);
                    setCurrentMetadata(null);
                    setLoadingSelectionId(null);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  New
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Saved playbooks</h3>
              <Button variant="ghost" size="sm" onClick={() => void refreshList()} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
            <ScrollArea className="h-72 rounded-md border border-border bg-muted/20 p-2">
              {loading && playbooks.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                </div>
              ) : playbooks.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No playbooks saved yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {playbooks.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-md border border-border bg-background p-3 transition hover:border-primary/40 ${
                        selectedId === item.id ? "ring-2 ring-primary/40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void handleSelect(item)}
                            disabled={loadingSelectionId === item.id}
                          >
                            {loadingSelectionId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BookOpen className="h-4 w-4" />
                            )}
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => void handleImport(item.id)}
                            disabled={importingId === item.id}
                          >
                            {importingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UploadCloud className="h-4 w-4" />
                            )}
                            Import
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.category && <Badge variant="secondary">{item.category}</Badge>}
                        <Badge variant="secondary">
                          {item.node_count} nodes / {item.edge_count} edges
                        </Badge>
                        {item.tags?.map((tag) => (
                          <Badge key={tag} variant="outline">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Updated {new Date(item.updated_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

