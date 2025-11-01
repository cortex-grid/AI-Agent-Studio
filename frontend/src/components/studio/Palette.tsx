import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Wrench,
  Cable,
  Brain,
  Network,
  Code,
  FileSearch,
  Webhook,
  DollarSign,
  Table,
  Search,
  Globe,
  Newspaper,
  Calculator,
  Map as MapIcon,
  Loader2,
  List,
  BookOpen,
  ClipboardList,
  ListChecks,
  Youtube,
  MessageCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToolCatalogDrawer } from "./ToolCatalogDrawer";
import {
  fetchCapabilityBundles,
  fetchToolCatalog,
  type CapabilityBundle,
  type ToolCatalogItem,
} from "@/lib/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const agentTypes = [
  { id: "chat-agent", label: "Chat Agent", icon: Bot, description: "Single ChatAgent with tools" },
  { id: "team-manager", label: "Team Manager", icon: Brain, description: "Orchestrates multiple agents" },
  { id: "team-director", label: "Team Director", icon: Network, description: "Coordinates team managers" },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "code-interpreter": Code,
  "file-search": FileSearch,
  "mcp-tool": Webhook,
  "yahoo-finance": DollarSign,
  "yfinance-tool": DollarSign,
  "pandas": Table,
  "pandas-tools": Table,
  "google-search": Search,
  "bing-search": Search,
  "duckduckgo": Globe,
  "newspaper": Newspaper,
  "newspaper-tool": Newspaper,
  "calculator": Calculator,
  "calculator-tools": Calculator,
  "google-maps": MapIcon,
  "csv-toolkit": Table,
  "csv_toolkit": Table,
  "confluence": BookOpen,
  "jira": ClipboardList,
  "clickup": ListChecks,
  "youtube": Youtube,
  "discord": MessageCircle,
};

const fallbackMetadata: Record<
  string,
  { label: string; description: string; category: string }
> = {
  "code-interpreter": { label: "Code Interpreter", description: "Execute Python code in a sandbox.", category: "automation" },
  "file-search": { label: "File Search", description: "Search across uploaded documents.", category: "knowledge" },
  "google-search": { label: "Google Search", description: "Web search via connectors.", category: "knowledge" },
  "bing-search": { label: "Bing Search", description: "Microsoft Bing grounding search.", category: "knowledge" },
  "duckduckgo": { label: "DuckDuckGo", description: "Privacy-first web search.", category: "knowledge" },
  "yahoo-finance": { label: "Yahoo Finance", description: "Financial data & stock prices.", category: "data" },
  "yfinance-tool": { label: "Yahoo Finance", description: "Financial data & stock prices.", category: "data" },
  "pandas": { label: "Pandas Toolkit", description: "Data manipulation helpers.", category: "data" },
  "pandas-tools": { label: "Pandas Toolkit", description: "Data manipulation helpers.", category: "data" },
  "csv-toolkit": { label: "CSV Toolkit", description: "Inspect and query CSV datasets.", category: "data" },
  "csv_toolkit": { label: "CSV Toolkit", description: "Inspect and query CSV datasets.", category: "data" },
  "calculator": { label: "Calculator", description: "Perform mathematical operations.", category: "automation" },
  "calculator-tools": { label: "Calculator", description: "Perform mathematical operations.", category: "automation" },
  "mcp-tool": { label: "MCP Tool", description: "Bridge to Model Context Protocol services.", category: "automation" },
  "newspaper": { label: "Newspaper", description: "Article extraction & parsing.", category: "knowledge" },
  "google-maps": { label: "Google Maps", description: "Location lookup and routing.", category: "automation" },
  "confluence": { label: "Confluence", description: "Read and author Confluence pages.", category: "knowledge" },
  "jira": { label: "Jira", description: "Manage Jira issues and workflows.", category: "work" },
  "clickup": { label: "ClickUp", description: "Operate on ClickUp spaces and tasks.", category: "work" },
  "youtube": { label: "YouTube", description: "Fetch video metadata and captions.", category: "knowledge" },
  "discord": { label: "Discord", description: "Send messages and review channel history.", category: "communications" },
};

const toTitleCase = (value: string) =>
  value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const TOOL_SECTIONS = [
  {
    id: "knowledge",
    title: "Knowledge & Search",
    description: "Locate information across the web and internal docs.",
    toolIds: ["file-search", "google-search", "bing-search", "duckduckgo", "confluence", "youtube", "newspaper-tool"],
  },
  {
    id: "work-management",
    title: "Work Management",
    description: "Integrate with project planning tools to track tasks and tickets.",
    toolIds: ["jira", "clickup", "discord"],
  },
  {
    id: "data-analysis",
    title: "Data & Analysis",
    description: "Work with structured data and numeric calculations.",
    toolIds: ["code-interpreter", "pandas", "csv-toolkit", "calculator", "yahoo-finance"],
  },
  {
    id: "automation",
    title: "Automation & Connectivity",
    description: "Connect to services, execute code, and extend with MCP tools.",
    toolIds: ["mcp-tool", "google-maps"],
  },
];

interface PaletteProps {
  onAddBundle: (bundle: CapabilityBundle) => void;
}

export const Palette = ({ onAddBundle }: PaletteProps) => {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogItem[]>([]);
  const [capabilityBundles, setCapabilityBundles] = useState<CapabilityBundle[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingCatalog(true);
      try {
        const [tools, bundles] = await Promise.all([fetchToolCatalog(), fetchCapabilityBundles()]);
        if (!cancelled) {
          setToolCatalog(tools);
          setCapabilityBundles(bundles);
        }
      } catch (error) {
        console.error("Failed to load tool catalog", error);
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
  }, []);

  const toolMap = useMemo(() => {
    const map = new Map<string, ToolCatalogItem>();
    for (const item of toolCatalog) {
      map.set(item.subtype, item);
    }
    return map;
  }, [toolCatalog]);

  const getToolList = useCallback((ids: string[]) => {
    return ids
      .map((id) => {
        const entry = toolMap.get(id);
        const fallback = fallbackMetadata[id];
        if (!entry && !fallback) return null;
        return {
          subtype: id,
          label: entry?.label ?? fallback?.label ?? toTitleCase(id),
          description: entry?.description ?? fallback?.description ?? "Custom tool module.",
        };
      })
      .filter((value) => Boolean(value)) as { subtype: string; label: string; description: string }[];
  }, [toolMap]);

  const categorizedTools = useMemo(
    () =>
      TOOL_SECTIONS.map((section) => ({
        ...section,
        tools: getToolList(section.toolIds),
      })).filter((section) => section.tools.length > 0),
    [getToolList]
  );
  const quickTools = useMemo(() =>
    getToolList(["file-search", "code-interpreter", "calculator", "google-search", "google-maps", "pandas", "csv-toolkit"]).map((t) => ({
      ...t,
      icon: iconMap[t.subtype] ?? undefined,
    })),
  [getToolList]);
  const onDragStart = (event: React.DragEvent, nodeType: string, subtype: string) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify({ nodeType, subtype }));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 border-r border-border bg-sidebar overflow-y-auto flex-shrink-0">
      <div className="p-4 space-y-6">
        {/* Agents */}
        <div>
          <h3 className="text-sm font-semibold text-sidebar-foreground mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Agents
          </h3>
          <div className="space-y-2">
            {agentTypes.map((type) => (
              <Card
                key={type.id}
                draggable
                onDragStart={(event) => onDragStart(event, "agent", type.id)}
                className="p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors bg-sidebar-accent border-sidebar-border"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <type.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{type.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{type.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-sidebar-foreground flex items-center gap-2">
              <Wrench className="w-4 h-4 text-accent" />
              Tools
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setCatalogOpen(true)}
              title="Browse tool catalog"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          {/* Categorized tool sections (Knowledge, Data, Automation...) */}
          <div className="mt-4">
            {categorizedTools.map((section) => (
              <div key={section.id} className="mb-3">
                <Accordion type="single" collapsible>
                  <AccordionItem value={section.id}>
                    <AccordionTrigger className="text-sm font-medium">{section.title}</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 mt-2">
                        {section.tools.map((tool) => {
                          const Icon = iconMap[tool.subtype] ?? Wrench;
                          return (
                            <Card
                              key={tool.subtype}
                              draggable
                              onDragStart={(event) => onDragStart(event, "tool", tool.subtype)}
                              className="p-3 cursor-grab active:cursor-grabbing hover:border-accent/50 transition-colors bg-sidebar-accent border-sidebar-border"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                                  <Icon className="w-4 h-4 text-accent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{tool.label}</p>
                                  {tool.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
                                  )}
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            ))}
          </div>
        </div>

        {/* Connectors */}
        <div>
          <h3 className="text-sm font-semibold text-sidebar-foreground mb-3 flex items-center gap-2">
            <Cable className="w-4 h-4 text-secondary" />
            Connectors
          </h3>
          <Card className="p-3 bg-sidebar-accent border-sidebar-border">
            <p className="text-sm text-muted-foreground">
              Connect nodes by dragging from output handles to input handles
            </p>
          </Card>
        </div>
      </div>

      <ToolCatalogDrawer
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        tools={toolCatalog}
        bundles={capabilityBundles}
        onDragStart={(event, subtype) => onDragStart(event, "tool", subtype)}
        onSelectBundle={(bundle) => {
          onAddBundle(bundle);
          setCatalogOpen(false);
        }}
      />
    </div>
  );
};






