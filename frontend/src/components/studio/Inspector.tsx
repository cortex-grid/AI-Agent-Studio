import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Settings2 } from "lucide-react";
import { ChatInterface } from "./ChatInterface";
import { useReactFlow } from "reactflow";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface InspectorProps {
  selectedNode: string | null;
}

declare global {
  interface Window {
    __updateCanvasNode?: (id: string, updates: Record<string, unknown>) => void;
  }
}

export const Inspector = ({ selectedNode }: InspectorProps) => {
  const [activeTab, setActiveTab] = useState<string>("properties");
  const { getNode } = useReactFlow();
  const node = selectedNode ? getNode(selectedNode) : null;
  const isTeamManager = node?.data?.kind === "teamManager";
  const isTeamDirector = node?.data?.kind === "teamDirector";
  const isCoordinator = isTeamManager || isTeamDirector;
  const [label, setLabel] = useState<string>(node?.data?.label || "");
  const [system, setSystem] = useState<string>(node?.data?.system || "");
  const { toast } = useToast();

  // Local editable state for responsive inputs
  const [description, setDescription] = useState<string>(node?.data?.description || "");
  const [temperature, setTemperature] = useState<number>(node?.data?.temperature ?? 0.7);
  const [topP, setTopP] = useState<number | undefined>(node?.data?.top_p ?? undefined);
  const [maxCompletionTokens, setMaxCompletionTokens] = useState<number | undefined>(node?.data?.max_completion_tokens ?? undefined);
  const [responseFormat, setResponseFormat] = useState<string | undefined>(node?.data?.response_format ?? undefined);

  // Tool-specific local state
  const [apiEndpoint, setApiEndpoint] = useState<string>((node?.data?.toolConfig?.apiEndpoint) || "");
  const [vectorStoreIdsStr, setVectorStoreIdsStr] = useState<string>((node?.data?.toolConfig?.vectorStoreIds || []).join(", "));
  const [connectionName, setConnectionName] = useState<string>((node?.data?.toolConfig?.connectionName) || "");
  const [connectionId, setConnectionId] = useState<string>((node?.data?.toolConfig?.connectionId) || "");
  const [apiKey, setApiKey] = useState<string>((node?.data?.toolConfig?.apiKey) || "");

  // Keep local label state in sync when the selected node changes
  useEffect(() => {
    setLabel(node?.data?.label || "");
  }, [node?.id, node?.data?.label]);

  // Keep local system prompt in sync when the selected node changes
  useEffect(() => {
    setSystem(node?.data?.system || "");
  }, [node?.id, node?.data?.system]);

  // Sync local editable fields when the selected node changes
  useEffect(() => {
    setDescription(node?.data?.description || "");
    setTemperature(node?.data?.temperature ?? 0.7);
    setTopP(node?.data?.top_p ?? undefined);
    setMaxCompletionTokens(node?.data?.max_completion_tokens ?? undefined);
    setResponseFormat(node?.data?.response_format ?? undefined);

    setApiEndpoint((node?.data?.toolConfig?.apiEndpoint) || "");
    setVectorStoreIdsStr((node?.data?.toolConfig?.vectorStoreIds || []).join(", "));
    setConnectionName((node?.data?.toolConfig?.connectionName) || "");
    setConnectionId((node?.data?.toolConfig?.connectionId) || "");
    setApiKey((node?.data?.toolConfig?.apiKey) || "");
  }, [
    selectedNode,
    node?.data?.description,
    node?.data?.temperature,
    node?.data?.top_p,
    node?.data?.max_completion_tokens,
    node?.data?.response_format,
    node?.data?.toolConfig?.apiEndpoint,
    node?.data?.toolConfig?.vectorStoreIds,
    node?.data?.toolConfig?.connectionName,
    node?.data?.toolConfig?.connectionId,
    node?.data?.toolConfig?.apiKey,
  ]);

  const handleFieldChange = (field: string, value: unknown): void => {
    if (!selectedNode) return;
    if (typeof window.__updateCanvasNode === "function") {
      window.__updateCanvasNode(selectedNode, { [field]: value } as Record<string, unknown>);
    }
  };

  const saveAndNotify = (message = "Saved") => {
    toast({ title: message });
  };

  // Debounced save helpers (typed)
  const saveTimersRef = useRef<Record<string, number | null>>({});
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});

  const scheduleSave = (field: string, value: Record<string, unknown> | unknown, delay = 700) => {
    if (!selectedNode) return;

    // clear existing timer
    const prev = saveTimersRef.current[field];
    if (prev) {
      window.clearTimeout(prev);
    }

    // schedule update
    const timer = window.setTimeout(() => {
      if (selectedNode && typeof window.__updateCanvasNode === "function") {
        // coerce value into an object when needed
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          window.__updateCanvasNode(selectedNode, value as Record<string, unknown>);
        } else {
          window.__updateCanvasNode(selectedNode, { [field]: value } as Record<string, unknown>);
        }

        // show saved indicator briefly
        setSavedFields((s) => ({ ...s, [field]: true }));
        window.setTimeout(() => setSavedFields((s) => ({ ...s, [field]: false })), 1500);
      }
      saveTimersRef.current[field] = null;
    }, delay);

    saveTimersRef.current[field] = timer;
  };

  // Cleanup on unmount
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => { if (t) window.clearTimeout(t); });
    };
  }, []);

  if (!selectedNode) {
    return (
      <div className="w-80 border-l border-border bg-sidebar flex items-center justify-center flex-shrink-0">
        <div className="text-center p-6">
          <Settings2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">
            Select a node to view properties
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-sidebar overflow-y-auto flex-shrink-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="border-b border-border px-4 pt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="properties" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Properties
            </TabsTrigger>
            {/* <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Chat
            </TabsTrigger> */}
          </TabsList>
        </div>

        <TabsContent value="properties" className="flex-1 p-4 space-y-4 mt-0">
          <Card className="p-4 bg-sidebar-accent border-sidebar-border space-y-4">
            <div>
              <Label htmlFor="name">
                {node?.data?.kind === "teamDirector"
                  ? "Director Name"
                  : node?.data?.kind === "teamManager"
                  ? "Manager Name"
                  : node?.data?.kind === "tool"
                  ? "Tool Name"
                  : "Agent Name"}
              </Label>
              <Input 
                id="name" 
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => {
                  handleFieldChange("label", label);
                  saveAndNotify("Name saved");
                }}
                className="mt-2"
              />
            </div>

            {node?.data?.kind === "tool" ? (
              // Tools: show tool-specific settings
              <>
                <div className="mt-3">
                  <Label>Tool Configuration</Label>
                  <p className="text-xs text-muted-foreground mb-3">Configure tool-specific settings</p>
                  
                  <div className="space-y-3">
                    {/* MCP-specific endpoint */}
                    {node?.data?.subtype === "mcp-tool" && (
                      <div>
                        <Label htmlFor="apiEndpoint" className="text-xs">MCP API Endpoint</Label>
                        <Input
                          id="apiEndpoint"
                          value={apiEndpoint}
                          onChange={(e) => {
                            const v = e.target.value;
                            setApiEndpoint(v);
                            scheduleSave("toolConfig", { ...(node?.data?.toolConfig || {}), apiEndpoint: v });
                          }}
                          placeholder="https://api.example.com/mcp"
                          className="mt-1"
                        />
                        {savedFields["toolConfig"] && <div className="text-xs text-green-500 mt-1">Saved</div>}
                      </div>
                    )}

                    {/* File Search - vector store IDs */}
                    {node?.data?.subtype === "file-search" && (
                      <div>
                        <Label htmlFor="vectorStoreIds" className="text-xs">Vector Store IDs (comma-separated)</Label>
                        <Input
                          id="vectorStoreIds"
                          value={vectorStoreIdsStr}
                          onChange={(e) => {
                            const v = e.target.value;
                            setVectorStoreIdsStr(v);
                            const ids = v.split(",").map(s => s.trim()).filter(Boolean);
                            scheduleSave("toolConfig", { ...(node?.data?.toolConfig || {}), vectorStoreIds: ids });
                          }}
                          placeholder="vs_123, vs_456"
                          className="mt-1"
                        />
                        {savedFields["toolConfig"] && <div className="text-xs text-green-500 mt-1">Saved</div>}
                      </div>
                    )}

                    {/* Google/Bing Search - connection name */}
                    {(node?.data?.subtype === "google-search" || node?.data?.subtype === "bing-search") && (
                      <>
                        <div>
                          <Label htmlFor="connectionName" className="text-xs">Connection Name</Label>
                          <Input
                            id="connectionName"
                            value={connectionName}
                            onChange={(e) => {
                              const v = e.target.value;
                              setConnectionName(v);
                              scheduleSave("toolConfig", { ...(node?.data?.toolConfig || {}), connectionName: v });
                            }}
                            placeholder="my-search-connection"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="connectionId" className="text-xs">Connection ID (Alternative)</Label>
                          <Input
                            id="connectionId"
                            value={connectionId}
                            onChange={(e) => {
                              const v = e.target.value;
                              setConnectionId(v);
                              scheduleSave("toolConfig", { ...(node?.data?.toolConfig || {}), connectionId: v });
                            }}
                            placeholder="conn_123456"
                            className="mt-1"
                          />
                        </div>
                      </>
                    )}

                    {/* Generic API Key for custom tools */}
                    <div>
                      <Label htmlFor="apiKey" className="text-xs">API Key (if required)</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        value={apiKey}
                        onChange={(e) => {
                          const v = e.target.value;
                          setApiKey(v);
                          scheduleSave("toolConfig", { ...(node?.data?.toolConfig || {}), apiKey: v });
                        }}
                        placeholder="sk-..."
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : isCoordinator ? (
              <>
                <div>
                  <Label htmlFor="strategy">Orchestration Strategy</Label>
                  <Select 
      value={node?.data?.strategy || "sequential"}
        onValueChange={(v) => scheduleSave("strategy", v)}
                  >
                    <SelectTrigger id="strategy" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sequential">Sequential</SelectItem>
                      <SelectItem value="concurrent">Concurrent</SelectItem>
                      <SelectItem value="magentic">Magentic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="threadPolicy">Thread Policy</Label>
                  <Select 
                    value={node?.data?.threadPolicy || "singleTeamThread"}
                    onValueChange={(v) => scheduleSave("threadPolicy", v)}
                  >
                    <SelectTrigger id="threadPolicy" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="singleTeamThread">Single Team Thread</SelectItem>
                      <SelectItem value="perAgent">Per-Agent Threads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description"
                    value={description}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDescription(v);
                      scheduleSave("description", v);
                    }}
                    placeholder={
                      isTeamDirector
                        ? "Describe the team director's role..."
                        : "Describe the team manager's role..."
                    }
                    className="mt-2 min-h-[100px]"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="provider">Provider</Label>
                  <Select 
                    value={node?.data?.provider || "openai"}
                    onValueChange={(v) => scheduleSave("provider", v)}
                  >
                    <SelectTrigger id="provider" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="azure">Azure OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="model">Model</Label>
                  <Select 
                    value={node?.data?.model || "gpt-4o-mini"}
                    onValueChange={(v) => scheduleSave("model", v)}
                  >
                    <SelectTrigger id="model" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-5">gpt-5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="system">System Prompt</Label>
                  <Textarea 
                    id="system"
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                    onBlur={() => { handleFieldChange("system", system); saveAndNotify("System prompt saved"); }}
                    placeholder="You are a helpful agent..."
                    className="mt-2 min-h-[120px]"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea 
                    id="description"
                    value={description}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDescription(v);
                      scheduleSave("description", v);
                    }}
                    placeholder="Describe this agent's purpose..."
                    className="mt-2 min-h-[60px]"
                  />
                  {savedFields["description"] && <div className="text-xs text-green-500 mt-1">Saved</div>}
                </div>

                <div>
                  <Label htmlFor="temperature">Temperature</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input 
                      id="temperature"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value || "0");
                        setTemperature(v);
                        scheduleSave("temperature", v);
                      }}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {temperature}
                    </span>
                    {savedFields["temperature"] && (
                      <span className="text-xs text-green-500 ml-2">Saved</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Controls randomness (0-2). Higher = more creative.
                  </p>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Advanced Parameters
                  </summary>
                  <div className="mt-3 space-y-3 pl-2 border-l-2 border-muted">
                    <div>
                      <Label htmlFor="top_p" className="text-xs">Top P</Label>
                      <Input 
                        id="top_p"
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={topP ?? ""}
                        onChange={(e) => {
                          const v = e.target.value ? parseFloat(e.target.value) : undefined;
                          setTopP(v);
                          scheduleSave("top_p", v);
                        }}
                        placeholder="0.9 (default)"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="max_completion_tokens" className="text-xs">Max Completion Tokens</Label>
                      <Input 
                        id="max_completion_tokens"
                        type="number"
                        min="1"
                        value={maxCompletionTokens ?? ""}
                        onChange={(e) => {
                          const v = e.target.value ? parseInt(e.target.value) : undefined;
                          setMaxCompletionTokens(v);
                          scheduleSave("max_completion_tokens", v);
                        }}
                        placeholder="4096 (default)"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="response_format" className="text-xs">Response Format</Label>
                      <Select 
                        value={responseFormat || "text"}
                        onValueChange={(v) => {
                          const val = v === "text" ? undefined : v;
                          setResponseFormat(val);
                          scheduleSave("response_format", val);
                        }}
                      >
                        <SelectTrigger id="response_format" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text (default)</SelectItem>
                          <SelectItem value="json_object">JSON Object</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </details>
                {/* agent-specific fields remain here */}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="flex-1 mt-0">
          <ChatInterface nodeId={selectedNode} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
