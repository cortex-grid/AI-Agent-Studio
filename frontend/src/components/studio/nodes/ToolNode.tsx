import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Wrench, Code, FileSearch, Webhook, DollarSign, Table, Search, Globe, Newspaper, Calculator, Map } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const ToolNode = memo(({ data, selected }: NodeProps) => {
  const getIcon = () => {
    switch (data.subtype) {
      case "code-interpreter": return Code;
      case "file-search": return FileSearch;
      case "mcp-tool": return Webhook;
      case "yahoo-finance": return DollarSign;
      case "pandas": return Table;
      case "google-search": return Search;
      case "duckduckgo": return Globe;
      case "newspaper": return Newspaper;
      case "calculator": return Calculator;
      case "google-maps": return Map;
      default: return Wrench;
    }
  };

  const Icon = getIcon();

  // Map of tools that require environment API keys
  const toolEnvReq: Record<string, { envVar: string; message?: string }> = {
    "google-search": { envVar: "GOOGLE_API_KEY", message: "Requires GOOGLE_API_KEY" },
    "edge-browser": { envVar: "EDGE_API_KEY", message: "Requires EDGE_API_KEY" },
  };

  const req = toolEnvReq[data.subtype];
  // Vite exposes env vars via import.meta.env in the browser build
  const _env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  const hasKey = req ? Boolean(_env[req.envVar]) : true;

  return (
    <Card
      className={`flex flex-col items-center gap-2 bg-card border-2 transition-all p-3 ${
        selected ? "border-accent shadow-glow" : "border-border hover:border-accent/50"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-accent"
      />

      <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
        <Icon className="w-5 h-5 text-accent" />
      </div>
      <h3 className="font-semibold text-sm text-center">{data.label}</h3>
      {req && !hasKey && (
        <Badge variant="outline" className="text-[10px] mt-1 text-red-700 bg-red-50 border-red-100">
          {req.message}
        </Badge>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-accent"
      />
    </Card>
  );
});

ToolNode.displayName = "ToolNode";
