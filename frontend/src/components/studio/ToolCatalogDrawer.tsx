import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ExternalLink, Sparkles } from "lucide-react";
import type { CapabilityBundle, ToolCatalogItem } from "@/lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  hosted: "Hosted",
  function: "Custom Function",
  mcp: "MCP",
};

interface ToolCatalogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tools: ToolCatalogItem[];
  bundles: CapabilityBundle[];
  onDragStart: (event: React.DragEvent, subtype: string) => void;
  onSelectBundle: (bundle: CapabilityBundle) => void;
}

export const ToolCatalogDrawer = ({
  open,
  onOpenChange,
  tools,
  bundles,
  onDragStart,
  onSelectBundle,
}: ToolCatalogDrawerProps) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"tools" | "bundles">("tools");

  const filteredTools = useMemo(() => {
    if (tab !== "tools") return tools;
    const term = search.trim().toLowerCase();
    if (!term) return tools;

    return tools.filter((tool) => {
      const haystack = [
        tool.subtype,
        tool.label,
        tool.description,
        ...(tool.requires ?? []),
        ...(tool.sample_prompts ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [tools, search, tab]);

  const filteredBundles = useMemo(() => {
    if (tab !== "bundles") return bundles;
    const term = search.trim().toLowerCase();
    if (!term) return bundles;

    return bundles.filter((bundle) => {
      const haystack = [
        bundle.id,
        bundle.title,
        bundle.description,
        bundle.summary,
        ...(bundle.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [bundles, search, tab]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[380px] sm:w-[460px] p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Tool Catalog
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Explore Microsoft Agent Framework hosted tools and custom function tools included with your export.
          </p>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tools, capabilities, secrets..."
              className="pl-10"
            />
          </div>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "tools" | "bundles")} className="h-[calc(100%-140px)]">
          <TabsList className="mx-6 mb-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="tools" className="text-xs">Tools</TabsTrigger>
            <TabsTrigger value="bundles" className="text-xs">Capability Bundles</TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="h-full mt-0">
            <ScrollArea className="px-6 pb-6 h-full">
              <div className="space-y-4">
                {filteredTools.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No tools matched &ldquo;{search}&rdquo;. Try a different keyword.
                  </div>
                )}

                {filteredTools.map((tool) => (
                  <div
                    key={tool.subtype}
                    className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                    draggable
                    onDragStart={(event) => onDragStart(event, tool.subtype)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold leading-tight">{tool.label}</h4>
                        <p className="text-xs text-muted-foreground">{tool.subtype}</p>
                      </div>
                      <Badge variant="outline">
                        {CATEGORY_LABELS[tool.category] ?? tool.category}
                      </Badge>
                    </div>

                    {tool.description && (
                      <p className="mt-3 text-sm text-muted-foreground">{tool.description}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {tool.requires?.length ? (
                        tool.requires.map((item) => (
                          <Badge key={item} variant="secondary" className="text-xs">
                            {item}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="secondary" className="text-xs opacity-75">
                          No special secrets required
                        </Badge>
                      )}
                    </div>

                    {tool.sample_prompts?.length ? (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Sample prompts
                        </p>
                        <ul className="space-y-1.5">
                          {tool.sample_prompts.map((prompt) => (
                            <li key={prompt} className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                              {prompt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="mt-4 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-2 text-primary"
                        onClick={() => {
                          navigator.clipboard.writeText(tool.subtype).catch(() => {
                            /* noop */
                          });
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Copy subtype
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="bundles" className="h-full mt-0">
            <ScrollArea className="px-6 pb-6 h-full">
              <div className="space-y-4">
                {filteredBundles.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No bundles matched &ldquo;{search}&rdquo;. Try a different keyword.
                  </div>
                )}

                {filteredBundles.map((bundle) => (
                  <div
                    key={bundle.id}
                    className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold leading-tight flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          {bundle.title}
                        </h4>
                        <p className="text-xs text-muted-foreground">{bundle.category}</p>
                      </div>
                      <Badge variant="outline">{bundle.nodes.length} nodes</Badge>
                    </div>

                    <p className="mt-3 text-sm text-muted-foreground">{bundle.description}</p>
                    {bundle.summary && (
                      <p className="mt-2 text-xs text-muted-foreground">{bundle.summary}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {bundle.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{bundle.edges.length} connections</span>
                      <Button size="sm" className="gap-2" onClick={() => onSelectBundle(bundle)}>
                        <Sparkles className="h-4 w-4" />
                        Add to canvas
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
