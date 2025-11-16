"""
CanvasGenerator - MAF-powered agent that generates ReactFlow graphs from natural language.
Similar to AzureArchitectAgent but for Agent Canvas node generation.
"""
import os
import json
from typing import Dict, Any, List, Optional
from agent_framework.openai import OpenAIChatClient
from agent_framework.azure import AzureAIAgentClient
from azure.identity.aio import AzureCliCredential
from app.config import config


class CanvasGenerator:
    """MAF agent that generates agent/tool nodes and edges from natural language descriptions."""
    
    def __init__(self):
        self.client = None
        self.agent = None
        self._next_node_id = 1
        self._node_positions = {}  # Track positions for auto-layout
    
    async def initialize(self):
        """Initialize the MAF client and create the generation agent."""
        provider = config.PROVIDER
        model_id = os.getenv("OPENAI_CHAT_MODEL_ID") or os.getenv("OPENAI_MODEL") or config.OPENAI_MODEL

        # Initialize client based on provider
        if provider == "azure":
            self.client = AzureAIAgentClient(
                credential=AzureCliCredential(),
                endpoint=config.AZURE_AI_PROJECT_ENDPOINT,
                model_deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT") or model_id,
            )
        else:
            self.client = OpenAIChatClient(
                api_key=config.OPENAI_API_KEY,
                model_id=model_id,
            )

        # Define tools for node generation
        tools = [
            self._generate_agent_node,
            self._generate_tool_node,
            self._generate_team_manager_node,
            self._generate_edge,
        ]

        # Create agent with instructions for graph generation, pass model_id per MAF API
        # Some MAF/OpenAI client implementations expect model_id (not 'model') on create_agent
        self.agent = self.client.create_agent(
            name="CanvasGenerator",
            instructions=self._get_system_instructions(),
            tools=tools,
            temperature=0.7,
            model_id=model_id,
        )
    
    def _get_system_instructions(self) -> str:
        """System instructions for the generation agent."""
        return """You are an expert AI agent that generates ReactFlow graph structures for multi-agent systems.

Your job is to parse natural language descriptions and create proper agent nodes, tool nodes, and edges that represent the requested system.

**Node Types:**
1. **Agent Node** (chat-agent): Single AI agent with specific role and tools
   - Properties: label, model, provider, system, description, temperature (0-2), top_p, max_completion_tokens
2. **Team Manager Node** (team-manager): Orchestrates multiple agents (sequential/concurrent/magentic)
   - Properties: label, model, provider, system, description, strategy, threadPolicy, temperature
3. **Tool Node**: Capabilities that agents can use (code-interpreter, file-search, yahoo-finance, google-search, mcp-tool, etc.)
   - Properties: label, subtype, description, toolConfig (tool-specific settings)

**Available Tools:**
- code-interpreter: Execute Python code
- file-search: Search through documents
- yahoo-finance: Financial data & stock prices
- google-search: Web search via Google
- duckduckgo: Privacy-focused web search
- pandas: Data analysis & manipulation
- newspaper: Article extraction & parsing
- calculator: Mathematical operations
- google-maps: Location & routing data
- csv-toolkit: Inspect CSV files, list columns, and run DuckDB SQL queries
- confluence: Fetch and author pages in Confluence workspaces
- jira: Review, create, and update Jira issues
- clickup: Manage ClickUp tasks and lists
- youtube: Retrieve video metadata, captions, and timestamps
- discord: Post updates or read history from Discord channels
- mcp-tool: Model Context Protocol server

**Edges:**
- Connect tools to agents: tool → agent (agent uses tool)
- Connect agents to team managers: agent → team-manager (manager orchestrates agent)
- Connect team managers to other agents for hierarchical structures

**Your Response:**
Always return a valid JSON object with this structure:
{
  "nodes": [
    {
      "id": "agent-1",
      "type": "agent",
      "position": {"x": 250, "y": 100},
      "data": {
        "label": "Agent Name",
        "model": "gpt-4o-mini",
        "provider": "openai",
        "description": "What this agent does",
        "kind": "agent",
        "subtype": "chat-agent",
        "system": "You are a helpful agent that...",
        "temperature": 0.7
      }
    },
    {
      "id": "tool-1",
      "type": "tool",
      "position": {"x": 250, "y": 250},
      "data": {
        "label": "Tool Name",
        "kind": "tool",
        "subtype": "yahoo-finance",
        "description": "Tool description",
        "toolConfig": {}
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "tool-1",
      "target": "agent-1",
      "type": "default"
    }
  ],
  "success": true,
  "message": "Generated X agents and Y tools"
}

**Layout Guidelines:**
- Space nodes 200px apart vertically
- Tools should be positioned above their connected agents
- Team managers should be at the bottom of their agent groups
- Use x: 250 + (index * 300) for horizontal spacing when multiple parallel agents
- Use y: 100 + (level * 200) for vertical spacing

**Examples:**

User: "I need a finance analyst agent with yahoo finance tool"
Response:
{
  "nodes": [
    {"id": "tool-1", "type": "tool", "position": {"x": 250, "y": 100}, "data": {"label": "Yahoo Finance", "kind": "tool", "subtype": "yahoo-finance", "description": "Financial data & stock prices"}},
    {"id": "agent-1", "type": "agent", "position": {"x": 250, "y": 300}, "data": {"label": "Finance Analyst", "model": "gpt-4o-mini", "provider": "openai", "kind": "agent", "subtype": "chat-agent", "system": "You are a finance analyst. Use Yahoo Finance to get stock data and provide insights.", "description": "Analyzes financial data and provides insights"}}
  ],
  "edges": [
    {"id": "edge-1", "source": "tool-1", "target": "agent-1", "type": "default"}
  ],
  "success": true,
  "message": "Generated 1 agent and 1 tool"
}

User: "Create a research team: one agent searches web, another analyzes data, and a team manager coordinates them"
Response:
{
  "nodes": [
    {"id": "tool-1", "type": "tool", "position": {"x": 250, "y": 100}, "data": {"label": "Google Search", "kind": "tool", "subtype": "google-search", "description": "Web search"}},
    {"id": "agent-1", "type": "agent", "position": {"x": 250, "y": 300}, "data": {"label": "Web Researcher", "model": "gpt-4o-mini", "provider": "openai", "kind": "agent", "subtype": "chat-agent", "system": "You are a web researcher. Search for information and summarize findings.", "description": "Searches web for information"}},
    {"id": "tool-2", "type": "tool", "position": {"x": 550, "y": 100}, "data": {"label": "Code Interpreter", "kind": "tool", "subtype": "code-interpreter", "description": "Execute Python code"}},
    {"id": "agent-2", "type": "agent", "position": {"x": 550, "y": 300}, "data": {"label": "Data Analyst", "model": "gpt-4o-mini", "provider": "openai", "kind": "agent", "subtype": "chat-agent", "system": "You are a data analyst. Analyze data and create insights.", "description": "Analyzes data"}},
    {"id": "manager-1", "type": "agent", "position": {"x": 400, "y": 500}, "data": {"label": "Research Manager", "model": "gpt-4o-mini", "provider": "openai", "kind": "teamManager", "subtype": "team-manager", "system": "You orchestrate the research team. Delegate tasks to researchers and analysts.", "description": "Coordinates research team"}}
  ],
  "edges": [
    {"id": "edge-1", "source": "tool-1", "target": "agent-1", "type": "default"},
    {"id": "edge-2", "source": "tool-2", "target": "agent-2", "type": "default"},
    {"id": "edge-3", "source": "agent-1", "target": "manager-1", "type": "default"},
    {"id": "edge-4", "source": "agent-2", "target": "manager-1", "type": "default"}
  ],
  "success": true,
  "message": "Generated 3 agents and 2 tools"
}

Always return valid JSON. Be creative with agent names and system prompts based on the user's description."""
    
    def _generate_agent_node(
        self,
        label: str,
        description: str,
        system_prompt: str,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        temperature: float = 0.7
    ) -> str:
        """
        Generate a single agent node.
        
        Args:
            label: Agent name/label
            description: What the agent does
            system_prompt: System instructions for the agent
            model: Model to use (default: gpt-4o-mini)
            provider: Provider (default: openai)
            temperature: Sampling temperature (default: 0.7)
        
        Returns:
            JSON string with node definition
        """
        node_id = f"agent-{self._next_node_id}"
        self._next_node_id += 1
        
        # Calculate position (auto-layout)
        x = 250 + (len(self._node_positions) % 3) * 300
        y = 100 + (len(self._node_positions) // 3) * 200
        self._node_positions[node_id] = {"x": x, "y": y}
        
        node = {
            "id": node_id,
            "type": "agent",
            "position": {"x": x, "y": y},
            "data": {
                "label": label,
                "model": model,
                "provider": provider,
                "description": description,
                "kind": "agent",
                "subtype": "chat-agent",
                "system": system_prompt,
                "temperature": temperature
            }
        }
        
        return json.dumps(node)
    
    def _generate_tool_node(
        self,
        label: str,
        tool_type: str,
        description: str
    ) -> str:
        """
        Generate a tool node.
        
        Args:
            label: Tool name
            tool_type: Type of tool (yahoo-finance, google-search, code-interpreter, etc.)
            description: What the tool does
        
        Returns:
            JSON string with node definition
        """
        node_id = f"tool-{self._next_node_id}"
        self._next_node_id += 1
        
        # Position above agents
        x = 250 + (len(self._node_positions) % 3) * 300
        y = 100 + (len(self._node_positions) // 3) * 200
        self._node_positions[node_id] = {"x": x, "y": y}
        
        node = {
            "id": node_id,
            "type": "tool",
            "position": {"x": x, "y": y},
            "data": {
                "label": label,
                "kind": "tool",
                "subtype": tool_type,
                "description": description,
                "toolConfig": {}
            }
        }
        
        return json.dumps(node)
    
    def _generate_team_manager_node(
        self,
        label: str,
        description: str,
        system_prompt: str,
        model: str = "gpt-4o-mini",
        provider: str = "openai"
    ) -> str:
        """
        Generate a team manager node.
        
        Args:
            label: Manager name
            description: What the manager does
            system_prompt: System instructions for orchestration
            model: Model to use (default: gpt-4o-mini)
            provider: Provider (default: openai)
        
        Returns:
            JSON string with node definition
        """
        node_id = f"manager-{self._next_node_id}"
        self._next_node_id += 1
        
        # Position at bottom as orchestrator
        x = 250 + (len(self._node_positions) % 3) * 300
        y = 100 + (len(self._node_positions) // 3) * 200 + 200  # Extra spacing
        self._node_positions[node_id] = {"x": x, "y": y}
        
        node = {
            "id": node_id,
            "type": "agent",
            "position": {"x": x, "y": y},
            "data": {
                "label": label,
                "model": model,
                "provider": provider,
                "description": description,
                "kind": "teamManager",
                "subtype": "team-manager",
                "system": system_prompt,
                "strategy": "sequential",
                "threadPolicy": "singleTeamThread",
                "temperature": 0.7
            }
        }
        
        return json.dumps(node)
    
    def _generate_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str = "default"
    ) -> str:
        """
        Generate an edge connecting two nodes.
        
        Args:
            source_id: Source node ID
            target_id: Target node ID
            edge_type: Edge type (default: "default")
        
        Returns:
            JSON string with edge definition
        """
        edge_id = f"edge-{self._next_node_id}"
        self._next_node_id += 1
        
        edge = {
            "id": edge_id,
            "source": source_id,
            "target": target_id,
            "type": edge_type
        }
        
        return json.dumps(edge)
    async def generate(
        self,
        user_message: str,
        current_graph: Optional[Dict[str, Any]] = None,
        conversation_context: Optional[List[Dict[str, str]]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        preferred_tools: Optional[List[str]] = None,
        workflow_preference: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate nodes and edges from natural language description.

        Args:
            user_message: Natural language description of desired agent system
            current_graph: Optional existing graph to add to

        Returns:
            Dict with {nodes: [...], edges: [...], success: bool, message: str}
        """
        # Ensure agent initialized
        if not self.agent:
            await self.initialize()

        # Reset counters for a fresh generation
        self._next_node_id = 1
        self._node_positions = {}

        # If there's a current graph, note offsets so new nodes don't overlap
        if current_graph and current_graph.get("nodes"):
            max_x = max((n.get("position", {}).get("x", 0) for n in current_graph["nodes"]), default=0)
            self._node_positions["offset"] = {"x": max_x + 300, "y": 100}

        # Build context message
        context = f"Generate ReactFlow nodes and edges for: {user_message}"
        if current_graph:
            context += f"\n\nCurrent graph has {len(current_graph.get('nodes', []))} nodes. Add new nodes to the right."
        if conversation_context:
            formatted_history = "\n".join(
                f"{msg.get('role', 'user').capitalize()}: {msg.get('content', '').strip()}"
                for msg in conversation_context[-10:]
                if msg.get("content")
            )
            if formatted_history:
                context += (
                    "\n\nRecent conversation for additional context:\n"
                    f"{formatted_history}\n\n"
                    "Ensure the updated graph continues this plan without duplicating existing nodes unless requested."
                )
        if attachments:
            attachment_lines = []
            for asset in attachments[:5]:
                name = asset.get("filename", "attachment")
                ctype = asset.get("content_type", "application/octet-stream")
                size = len(asset.get("base64", "")) * 0.75  # approx decoded bytes
                size_kb = f"{size/1024:.1f}KB"
                attachment_lines.append(f"- {name} ({ctype}, ~{size_kb})")
            if attachment_lines:
                context += (
                    "\n\nThe user attached reference documents:\n"
                    + "\n".join(attachment_lines)
                    + "\nIf useful, incorporate insights from these attachments when designing agents or tools."
                )
            for asset in attachments[:3]:
                base64_data = asset.get("base64")
                if not base64_data:
                    continue
                truncated = base64_data[:4000]
                name = asset.get("filename", "attachment")
                ctype = asset.get("content_type", "application/octet-stream")
                context += (
                    f"\n\nAttachment payload ({name}, {ctype}):\n"
                    f"BASE64_START:{truncated}"
                    f"{'...BASE64_TRUNCATED' if len(base64_data) > len(truncated) else ':BASE64_END'}"
                )
        if preferred_tools:
            tool_list = ", ".join(preferred_tools[:10])
            context += (
                "\n\nThe user would like to leverage the following existing tools if possible: "
                f"{tool_list}. Prefer reusing or wiring these tools before suggesting new ones."
            )
        if workflow_preference:
            context += (
                "\n\nWorkflow preference: "
                f"{workflow_preference}. Adapt the orchestration strategy accordingly."
            )

        result_text = ""
        try:
            # Run MAF agent to generate structure
            if not self.agent or not hasattr(self.agent, "run"):
                raise RuntimeError("Generation agent is not initialized")

            response = await self.agent.run(context)
            result_text = getattr(response, "result", None) or str(response)

            # Extract JSON if wrapped in markdown
            if "```json" in result_text:
                json_start = result_text.find("{")
                json_end = result_text.rfind("}") + 1
                result_text = result_text[json_start:json_end]
            elif "```" in result_text:
                lines = result_text.split("\n")
                json_lines: List[str] = []
                in_code = False
                for line in lines:
                    if line.strip().startswith("```"):
                        in_code = not in_code
                        continue
                    if in_code:
                        json_lines.append(line)
                result_text = "\n".join(json_lines)

            result = json.loads(result_text)

            # Validate returned structure
            if not isinstance(result, dict):
                raise ValueError("Response is not a dictionary")
            if "nodes" not in result or "edges" not in result:
                raise ValueError("Response missing 'nodes' or 'edges' keys")

            # Merge with existing graph if provided
            if current_graph:
                result["nodes"] = current_graph.get("nodes", []) + result.get("nodes", [])
                result["edges"] = current_graph.get("edges", []) + result.get("edges", [])

            result["success"] = True
            result.setdefault("message", f"Generated {len(result['nodes'])} nodes and {len(result['edges'])} edges")

            return result

        except json.JSONDecodeError as e:
            return {
                "nodes": [],
                "edges": [],
                "success": False,
                "message": f"Failed to parse JSON response: {str(e)}",
                "raw_response": result_text,
            }
        except Exception as e:
            return {
                "nodes": [],
                "edges": [],
                "success": False,
                "message": f"Generation failed: {str(e)}",
            }


# Global instance
_generator: Optional["CanvasGenerator"] = None


async def get_generator() -> "CanvasGenerator":
    """Get or create the global CanvasGenerator instance."""
    global _generator
    if _generator is None:
        _generator = CanvasGenerator()
        await _generator.initialize()
    return _generator
