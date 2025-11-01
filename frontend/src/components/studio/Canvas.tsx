import { useCallback, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowInstance,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { AgentNode } from "./nodes/AgentNode";
import { ToolNode } from "./nodes/ToolNode";

const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
};

type NodeDataShape = Node["data"] & {
  label?: string;
  name?: string;
  kind?: string;
  subtype?: string;
  provider?: string;
  model?: string;
  system?: string;
  temperature?: number;
  toolConfig?: Record<string, unknown>;
  strategy?: string;
  threadPolicy?: string;
};

const sanitizeNode = (node: Node): Node => {
  const data = (node.data || {}) as NodeDataShape;
  const declaredKind = node.kind || data.kind;
  const subtype = data.subtype ?? (node.type === "tool" ? "custom-tool" : undefined);
  const isTool = declaredKind === "tool" || node.type === "tool";
  const isTeamManager = subtype === "team-manager" || declaredKind === "teamManager";
  const isTeamDirector = subtype === "team-director" || declaredKind === "teamDirector";
  const isCoordinator = isTeamManager || isTeamDirector;
  const baseLabel =
    data.label ||
    data.name ||
    (isTool
      ? (subtype?.replace(/[-_]/g, " ") ?? "Tool")
      : isTeamDirector
      ? "Team Director"
      : isTeamManager
      ? "Team Manager"
      : "Agent");
  const safeName =
    data.name ||
    baseLabel ||
    (isTool ? "tool-node" : isTeamDirector ? "team-director-node" : "agent-node");

  const safeKind = isTool ? "tool" : isTeamDirector ? "teamDirector" : isTeamManager ? "teamManager" : "agent";

  const sanitized: Node = {
    ...node,
    type: node.type ?? (isTool ? "tool" : "agent"),
    kind: safeKind,
    data: {
      ...data,
      label: baseLabel,
      name: safeName,
      kind: safeKind,
      subtype,
      toolConfig: isTool ? data.toolConfig ?? {} : data.toolConfig,
      provider: isTool ? data.provider : data.provider ?? "openai",
      model: isTool ? data.model : data.model ?? "gpt-4o-mini",
      system: isTool ? data.system : data.system ?? "",
      temperature: isTool ? data.temperature : data.temperature ?? 0.7,
      strategy: data.strategy ?? (isCoordinator ? "sequential" : data.strategy),
      threadPolicy: data.threadPolicy ?? (isCoordinator ? "singleTeamThread" : data.threadPolicy),
    },
  };

  return sanitized;
};

const sanitizeEdge = (edge: Edge): Edge => ({
  ...edge,
  data: edge.data ?? {},
});

const initialNodes: Node[] = [
  {
    id: "agent-1",
    type: "agent",
    position: { x: 250, y: 100 },
    data: { 
      label: "Planner",
      name: "Planner",
      model: "gpt-4o-mini",
      provider: "openai",
      description: "Analyzes requests and creates plans",
      kind: "agent",
      subtype: "chat-agent",
      temperature: 0.7
    },
  },
];

const initialEdges: Edge[] = [];

interface CanvasProps {
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  onGraphChange: () => void;
}

export interface CanvasRef {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  addGeneratedNodes: (newNodes: Node[], newEdges: Edge[]) => void;
  replaceGraph: (newNodes: Node[], newEdges: Edge[]) => void;
  removeNodes: (ids: string[]) => void;
  removeEdges: (ids: string[]) => void;
}

export const Canvas = forwardRef<CanvasRef, CanvasProps>(({ selectedNode, onSelectNode, onGraphChange }, ref) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes.map(sanitizeNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges.map(sanitizeEdge));
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getNodes: () => nodes.map(sanitizeNode),
    getEdges: () => edges.map(sanitizeEdge),
    addGeneratedNodes: (newNodes: Node[], newEdges: Edge[]) => {
      const normalizedNodes = newNodes.map(sanitizeNode);
      const normalizedEdges = newEdges.map(sanitizeEdge);
      setNodes((nds) => [...nds, ...normalizedNodes]);
      setEdges((eds) => [...eds, ...normalizedEdges]);
    },
    replaceGraph: (newNodes: Node[], newEdges: Edge[]) => {
      setNodes(() => newNodes.map(sanitizeNode));
      setEdges(() => newEdges.map(sanitizeEdge));
      onSelectNode(null);
      setTimeout(() => {
        reactFlowInstance?.fitView({ padding: 0.2, includeHiddenNodes: true });
      }, 50);
    },
    removeNodes: (ids: string[]) => {
      setNodes((nds) => nds.filter((n) => !ids.includes(n.id)));
      setEdges((eds) => eds.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)));
    },
    removeEdges: (ids: string[]) => {
      setEdges((eds) => eds.filter((e) => !ids.includes(e.id)));
    },
  }));

  // Delete key handler: remove selected node and its connected edges
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      if (isEditableTarget(e.target)) return;
      if (!selectedNode) return;

      e.preventDefault();
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
      setEdges((eds) => eds.filter((edge) => edge.source !== selectedNode && edge.target !== selectedNode));
      onSelectNode(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode, setNodes, setEdges, onSelectNode]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const data = JSON.parse(event.dataTransfer.getData("application/reactflow"));
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const toolLabels: Record<string, string> = {
        "chat-agent": "New Agent",
        "team-manager": "Team Manager",
        "code-interpreter": "Code Interpreter",
        "file-search": "File Search",
        "mcp-tool": "MCP Tool",
        "yahoo-finance": "Yahoo Finance",
        "pandas": "Pandas",
        "google-search": "Google Search",
        "duckduckgo": "DuckDuckGo",
        "newspaper": "Newspaper",
        "calculator": "Calculator",
        "google-maps": "Google Maps",
        "csv-toolkit": "CSV Toolkit",
        "confluence": "Confluence",
        "jira": "Jira",
        "clickup": "ClickUp",
        "youtube": "YouTube",
        "discord": "Discord",
      };

      const kind =
        data.nodeType === "tool"
          ? "tool"
          : data.subtype === "team-director"
          ? "teamDirector"
          : data.subtype === "team-manager"
          ? "teamManager"
          : "agent";

      const newNode: Node = {
        id: `${data.nodeType}-${Date.now()}`,
        type: data.nodeType,
        position,
        data: {
          label:
            toolLabels[data.subtype] ||
            (data.subtype === "team-director"
              ? "Team Director"
              : data.subtype === "team-manager"
              ? "Team Manager"
              : "New Node"),
          subtype: data.subtype,
          // mark kind based on nodeType (tool, agent) or specific orchestrators
          kind,
          // default provider/model/system for agents; tool nodes get a toolConfig holder
          ...(data.nodeType === "tool"
            ? { toolConfig: {} }
            : {
                provider: "openai",
                model: "gpt-4o-mini",
                system: "",
                temperature: 0.7
              }),
          ...((data.subtype === "team-manager" || data.subtype === "team-director") && {
            strategy: "sequential",
            threadPolicy: "singleTeamThread",
          })
        },
      };

      setNodes((nds) => nds.concat(sanitizeNode(newNode)));
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  // Provide a way for Inspector to update nodes
  const updateNode = useCallback(
    (id: string, updates: Partial<Node["data"]>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id ? sanitizeNode({ ...node, data: { ...node.data, ...updates } }) : node
        )
      );
    },
    [setNodes]
  );

  // Store update function reference
  useEffect(() => {
    // expose a typed global updater for convenience (declared in src/types/global.d.ts)
    window.__updateCanvasNode = updateNode;
    return () => {
      // cleanup global updater
    // remove the global updater if present
    delete (window as unknown as { __updateCanvasNode?: (id: string, updates: Partial<Node["data"]>) => void }).__updateCanvasNode;
    };
  }, [updateNode]);

  useEffect(() => {
    onGraphChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  return (
    <div className="flex-1 bg-background relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={16} 
          size={1}
          className="opacity-40"
        />
        <Controls className="bg-card border-border" />
        <MiniMap 
          className="bg-card border border-border"
          nodeColor={(node) => 
            node.type === "agent" ? "hsl(217 91% 60%)" : "hsl(173 80% 40%)"
          }
        />
            {/* Dimmed background watermark */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Try to load public/logo.png; if missing the img will 404 silently in dev. */}
              <img
                src="/logo.png"
                alt="logo"
                className="max-w-[40%] opacity-10 dark:opacity-6 select-none"
                style={{ filter: 'grayscale(1) blur(0.5px)', width: '40%', height: 'auto' }}
              />
            </div>
      </ReactFlow>
    </div>
  );
});

Canvas.displayName = "Canvas";
