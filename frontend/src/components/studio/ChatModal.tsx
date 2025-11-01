import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Bot, User, Users, Loader2, AlertCircle, Wrench, GitBranch, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { streamChat, type Project, type ChatContext } from "@/lib/api";
import { Node, Edge } from "reactflow";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    agent?: string;
    type?: "text" | "tool_call" | "tool_result" | "notice" | "error";
    context?: import("@/lib/api").ChatContext;
  };
}

type GenNodeData = { label?: string; kind?: string };

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  nodes?: Node<GenNodeData>[];
  onGenerateNodes?: (nodes: Node<GenNodeData>[], edges: Edge[]) => void;
}

export const ChatModal = ({ isOpen, onClose, project, nodes = [], onGenerateNodes }: ChatModalProps) => {
  const [mode, setMode] = useState<"generate" | "chat">("generate");
  const [target, setTarget] = useState<string>("team");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const nodeLookup = useMemo(() => {
    const map = new Map<string, Node<GenNodeData>>();
    nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [nodes]);

  const resolveNodeMeta = useCallback(
    (id?: string, fallbackLabel?: string, fallbackKind?: string) => {
      if (!id) {
        return {
          id,
          label: fallbackLabel,
          kind: fallbackKind,
        };
      }

      const node = nodeLookup.get(id);
      const label = node?.data?.label ?? fallbackLabel ?? id;
      const kind = node?.data?.kind ?? fallbackKind;

      return { id, label, kind };
    },
    [nodeLookup]
  );

  const formatKindLabel = useCallback((kind?: string) => {
    switch (kind) {
      case "teamDirector":
        return "Team Director";
      case "teamManager":
        return "Team Manager";
      case "agent":
        return "Agent";
      case "tool":
        return "Tool";
      default:
        if (!kind) return "Node";
        return kind
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }, []);

  const buildContextTrail = useCallback(
    (context?: ChatContext) => {
      if (!context) return [];

      const seen = new Set<string>();
      const trail: Array<{ id?: string; label: string; kind?: string }> = [];

      const append = (id?: string, fallbackLabel?: string, fallbackKind?: string) => {
        const meta = resolveNodeMeta(id, fallbackLabel, fallbackKind);
        if (!meta.label) return;
        const key = meta.id ?? `${meta.label}:${meta.kind ?? ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        trail.push({ id: meta.id, label: meta.label, kind: meta.kind });
      };

      const lineage = context.lineage && context.lineage.length ? [...context.lineage] : [];
      lineage.reverse();
      for (const ancestor of lineage) {
        append(ancestor);
      }

      if (context.via) {
        append(context.via, context.viaLabel ?? context.via, context.viaKind);
      }

      append(context.unitId, context.unitLabel ?? context.unitId, context.unitKind);

      return trail;
    },
    [resolveNodeMeta]
  );

  const agentNodes = useMemo(() => {
    const rank: Record<string, number> = {
      teamDirector: 0,
      teamManager: 1,
      agent: 2,
    };

    return nodes
      .filter((n) => {
        const kind = n.data.kind;
        return kind === "agent" || kind === "teamManager" || kind === "teamDirector";
      })
      .sort((a, b) => {
        const aRank = rank[a.data.kind ?? "agent"] ?? 3;
        const bRank = rank[b.data.kind ?? "agent"] ?? 3;
        if (aRank !== bRank) return aRank - bRank;
        const aLabel = a.data.label ?? a.id;
        const bLabel = b.data.label ?? b.id;
        return aLabel.localeCompare(bLabel);
      });
  }, [nodes]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput("");
    setIsStreaming(true);

    if (mode === "generate") {
      // GENERATION MODE: Use MAF to create agent/tool nodes from natural language
      try {
        const { generateGraph } = await import("@/lib/api");
        const result = await generateGraph({ message: userInput, currentGraph: project.graph });
        
        if (result.success) {
          // Add generated nodes to canvas
          if (onGenerateNodes && result.nodes.length > 0) {
            onGenerateNodes(result.nodes as Node<GenNodeData>[], result.edges as Edge[]);
          }
          
          // Add success message
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant" as const,
              content: `${result.message}\n\nGenerated:\n${result.nodes
                .map((n: Node<GenNodeData>) => `- ${n.data?.label} (${n.data?.kind})`)
                .join("\n")}`,
              timestamp: new Date(),
              metadata: { type: "text" },
            },
          ]);
          
          toast({
            title: "Nodes Generated",
            description: result.message,
          });
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error("Generation error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant" as const,
            content: `Generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            timestamp: new Date(),
            metadata: { type: "error" },
          },
        ]);
        toast({
          title: "Generation Failed",
          description: error instanceof Error ? error.message : "Failed to generate nodes",
          variant: "destructive",
        });
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    // CHAT MODE: Execute existing agents in the project
    const assistantMessageId = (Date.now() + 1).toString();
    let assistantContent = "";

    try {
      // Cache project on backend before streaming
      await import("@/lib/api").then(m => m.cacheProject(project));
      
      const stream = streamChat({
        projectId: project.id,
        target,
        message: userInput,
        thread: `thread-${Date.now()}`,
      });

      for await (const event of stream) {
        const context = event.context;
        const baseMetadata: Message["metadata"] = {
          type: event.type,
          agent: context?.unitLabel,
          context,
        };

        if (event.type === "text" && event.data.delta) {
          assistantContent += event.data.delta;

          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMessageId);
            if (existing) {
              return prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: assistantContent,
                      metadata: { ...baseMetadata, type: "text" },
                    }
                  : m
              );
            }

            return [
              ...prev,
              {
                id: assistantMessageId,
                role: "assistant" as const,
                content: assistantContent,
                timestamp: new Date(),
                metadata: { ...baseMetadata, type: "text" },
              },
            ];
          });
        } else if (event.type === "notice" && event.data.message) {
          setMessages((prev) => [
            ...prev,
            {
              id: `notice-${Date.now()}`,
              role: "system" as const,
              content: event.data.message,
              timestamp: new Date(),
              metadata: { ...baseMetadata, type: "notice" },
            },
          ]);
        } else if (event.type === "tool_call" && event.data.name) {
          const contextLabel = context?.unitLabel ?? context?.unitKind;
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              role: "system" as const,
              content: `${contextLabel ? `[${contextLabel}] ` : ""}Using tool: ${event.data.name}`,
              timestamp: new Date(),
              metadata: { ...baseMetadata, type: "tool_call" },
            },
          ]);
        } else if (event.type === "tool_result" && event.data.result) {
          setMessages((prev) => [
            ...prev,
            {
              id: `tool-result-${Date.now()}`,
              role: "system" as const,
              content: `Tool result: ${JSON.stringify(event.data.result, null, 2)}`,
              timestamp: new Date(),
              metadata: { ...baseMetadata, type: "tool_result" },
            },
          ]);
        } else if (event.type === "error" && event.data.message) {
          toast({
            title: "Error",
            description: event.data.message,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Chat stream error:", error);
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Failed to connect to backend",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DialogTitle>
                {mode === "generate" ? "PALETTE Generate Agents" : "CHAT Team Chat"}
              </DialogTitle>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                <Button
                  size="sm"
                  variant={mode === "generate" ? "secondary" : "ghost"}
                  onClick={() => setMode("generate")}
                  disabled={isStreaming}
                  className="h-7 text-xs"
                >
                  Generate
                </Button>
                <Button
                  size="sm"
                  variant={mode === "chat" ? "secondary" : "ghost"}
                  onClick={() => setMode("chat")}
                  disabled={isStreaming}
                  className="h-7 text-xs"
                >
                  Chat
                </Button>
              </div>
            </div>
            {mode === "chat" && (
              <Select value={target} onValueChange={setTarget} disabled={isStreaming}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Full Team</span>
                    </div>
                  </SelectItem>
                  {agentNodes.map((node) => {
                    const kindLabel = formatKindLabel(node.data.kind);
                    const KindIcon =
                      node.data.kind === "teamDirector"
                        ? Users
                        : node.data.kind === "teamManager"
                        ? Brain
                        : Bot;
                    return (
                      <SelectItem key={node.id} value={node.id}>
                        <div className="flex items-center gap-2">
                          <KindIcon className="w-4 h-4" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{node.data.label || node.id}</span>
                            <span className="text-xs text-muted-foreground">{kindLabel}</span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                {mode === "generate" ? (
                  <Wrench className="w-8 h-8 text-primary" />
                ) : (
                  <Users className="w-8 h-8 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {mode === "generate" ? "Generate your agent system" : "Start a conversation"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {mode === "generate" 
                  ? "Describe the agents and tools you need in natural language. AI will create the proper ReactFlow nodes for you."
                  : "Chat with your agent team to test workflows and see how they collaborate."}
              </p>
              {mode === "generate" && (
                <div className="mt-4 text-xs text-muted-foreground max-w-md space-y-1">
                  <p className="font-medium">Examples:</p>
                  <p>- "I need a finance analyst with yahoo finance tool"</p>
                  <p>- "Create a research team with web search and data analysis"</p>
                  <p>- "Team manager that orchestrates agents for customer support"</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((message) => {
                const contextTrail = buildContextTrail(message.metadata?.context);
                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === "user"
                          ? "bg-primary/20"
                          : message.role === "system"
                          ? "bg-muted"
                          : "bg-accent/20"
                      }`}
                    >
                      {message.role === "user" ? (
                        <User className="w-4 h-4 text-primary" />
                      ) : message.role === "system" ? (
                        message.metadata?.type === "tool_call" ? (
                          <Wrench className="w-4 h-4 text-muted-foreground" />
                        ) : message.metadata?.type === "error" ? (
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        ) : (
                          <Bot className="w-4 h-4 text-muted-foreground" />
                        )
                      ) : (
                        <Bot className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    <Card
                      className={`p-4 max-w-[80%] ${
                        message.role === "user"
                          ? "bg-primary/10 border-primary/30"
                          : message.role === "system"
                          ? "bg-muted/50 border-muted"
                          : "bg-card"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {contextTrail.length > 0 && (
                        <div className="mt-3 text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          {contextTrail.map((item, index) => (
                            <span
                              key={`${item.id ?? item.label}-${index}`}
                              className="flex items-center gap-1"
                            >
                              {index > 0 && <span className="opacity-60">→</span>}
                              <Badge
                                variant="outline"
                                className="text-[10px] font-medium border-muted bg-muted/30"
                              >
                                {item.label}
                                <span className="uppercase text-[9px] tracking-wide ml-1 text-muted-foreground">
                                  {formatKindLabel(item.kind)}
                                </span>
                              </Badge>
                            </span>
                          ))}
                        </div>
                      )}
                      {message.metadata?.type && message.role === "system" && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {message.metadata.type}
                        </Badge>
                      )}
                    </Card>
                  </div>
                );
              })}
              {isStreaming && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-accent/20">
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  </div>
                  <Card className="p-4 bg-card">
                    <p className="text-sm text-muted-foreground">Processing...</p>
                  </Card>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask your agent team..."
              className="flex-1"
              disabled={isStreaming}
            />
            <Button
              onClick={handleSend}
              className="bg-primary hover:bg-primary/90"
              disabled={isStreaming || !input.trim()}
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
