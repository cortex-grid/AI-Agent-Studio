"""Tool catalog service for surfacing available tools to the frontend."""
from __future__ import annotations

from dataclasses import dataclass, asdict
import ast
from pathlib import Path
from typing import Dict, Any, List, Optional

from .project_validator import HOSTED_TOOL_SUBTYPES, MCP_TOOL_SUBTYPES

BASE_DIR = Path(__file__).resolve().parent.parent
DELIVERABLE_TOOLS_DIR = BASE_DIR.parent / "deliverables" / "backend-python" / "tools"


@dataclass
class ToolMetadata:
    subtype: str
    label: str
    category: str  # hosted | mcp | function
    description: Optional[str] = None
    module: Optional[str] = None
    requires: Optional[List[str]] = None
    sample_prompts: Optional[List[str]] = None
    source: Optional[str] = None  # deliverables path or framework identifier

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        # Remove None fields for lean payloads
        return {k: v for k, v in data.items() if v not in (None, [], {})}


@dataclass
class CapabilityBundle:
    id: str
    title: str
    description: str
    category: str
    tags: List[str]
    summary: Optional[str]
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        # Convert Path etc if needed (but nodes/edges already serializable)
        return data


BUILT_IN_TOOL_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "code-interpreter": {
        "label": "Code Interpreter",
        "description": "Azure-hosted Python execution sandbox with persistent session support.",
        "requires": ["AZURE_AI_PROJECT_CONNECTION (optional)"],
        "sample_prompts": [
            "Run unit tests for the latest commit.",
            "Summarize this CSV and highlight anomalies.",
        ],
    },
    "file-search": {
        "label": "File Search",
        "description": "Vector-backed file retrieval over project documents.",
        "requires": ["AZURE_AI_VECTOR_STORE_ID (optional)"],
        "sample_prompts": [
            "Find deployment instructions for Kubernetes.",
            "Search the runbook for rollback guidance.",
        ],
    },
    "google-search": {
        "label": "Google Web Search",
        "description": "Hosted web search powered by Bing Grounding/Google connectors.",
        "requires": ["BING_CONNECTION_NAME or BING_CONNECTION_ID"],
        "sample_prompts": [
            "Look up the latest release notes for Azure Container Apps.",
        ],
    },
    "bing-search": {
        "label": "Bing Web Search",
        "description": "Hosted Bing search connector for grounded answers.",
        "requires": ["BING_CONNECTION_NAME or BING_CONNECTION_ID"],
        "sample_prompts": ["Search for the most recent Microsoft Build keynote highlights."],
    },
    "mcp-tool": {
        "label": "Model Context Protocol",
        "description": "Connect to MCP-compatible servers over HTTP for structured tool calls.",
        "requires": ["External MCP endpoint URL reachable by the backend."],
        "sample_prompts": ["Query the compliance MCP service for today's outstanding tasks."],
    },
}

FUNCTION_TOOL_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "csv-toolkit": {
        "label": "CSV Toolkit",
        "description": "Inspect whitelisted CSV files, list columns, and run DuckDB SQL queries.",
        "sample_prompts": [
            "List the available CSV datasets we configured for this project.",
            "Preview the first 25 rows from the sales summary file.",
            "Run `SELECT region, SUM(revenue) FROM sales GROUP BY region` using the CSV toolkit.",
        ],
        "requires": [],
    },
    "confluence": {
        "label": "Confluence",
        "description": "Read and write Confluence pages in your documentation spaces.",
        "sample_prompts": [
            "Fetch the latest release notes page from the Engineering space.",
            "Create a draft incident report in the Operations space under the parent page 12345.",
        ],
        "requires": ["CONFLUENCE_URL", "CONFLUENCE_USERNAME", "CONFLUENCE_API_KEY"],
    },
    "jira": {
        "label": "Jira",
        "description": "Search, create, and update Jira issues programmatically.",
        "sample_prompts": [
            "Look up ENG-42 and summarise its status and assignee.",
            "Create a follow-up task in project OPS with a short description.",
        ],
        "requires": ["JIRA_SERVER_URL", "JIRA_USERNAME", "JIRA_API_TOKEN"],
    },
    "clickup": {
        "label": "ClickUp",
        "description": "Create and manage ClickUp tasks, spaces, and lists.",
        "sample_prompts": [
            "List the tasks in the customer-onboarding list.",
            "Create a ClickUp task called 'Prepare QBR deck' in the Marketing space.",
        ],
        "requires": ["CLICKUP_API_KEY", "CLICKUP_TEAM_ID"],
    },
    "youtube": {
        "label": "YouTube",
        "description": "Fetch video metadata, captions, and generate timestamps from YouTube URLs.",
        "sample_prompts": [
            "Pull captions for the latest town-hall recording and summarise key moments.",
            "Get metadata for this training video and share the thumbnail link.",
        ],
        "requires": [],
    },
    "discord": {
        "label": "Discord",
        "description": "Send messages and inspect channels using a Discord bot token.",
        "sample_prompts": [
            "Post a deployment complete notification to the #release-updates channel.",
            "List the latest 10 messages from the on-call chat.",
        ],
        "requires": ["DISCORD_BOT_TOKEN"],
    },
}


CAPABILITY_BUNDLES: List[CapabilityBundle] = [
    CapabilityBundle(
        id="bundle-azure-search",
        title="Knowledge Retrieval Starter",
        description="Single agent paired with Azure Cognitive Search style File Search tool for doc grounding.",
        category="Search",
        summary="Great for FAQ assistants backed by your documentation.",
        tags=["azure", "search", "retrieval"],
        nodes=[
            {
                "id": "agent-knowledge",
                "type": "agent",
                "kind": "agent",
                "data": {
                    "label": "Knowledge Specialist",
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "system": "Answer questions using the connected knowledge base. Cite sources when available.",
                    "subtype": "chat-agent",
                },
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "tool-knowledge-search",
                "type": "tool",
                "kind": "tool",
                "data": {
                    "label": "Knowledge Base Search",
                    "subtype": "file-search",
                    "toolConfig": {"vectorStoreIds": ["REPLACE_WITH_VECTOR_STORE_ID"]},
                    "description": "Vector search connection to Azure Cognitive Search or OpenAI Files.",
                },
                "position": {"x": 220, "y": 120},
            },
        ],
        edges=[
            {"id": "edge-agent-knowledge-tool", "source": "agent-knowledge", "target": "tool-knowledge-search"},
        ],
    ),
    CapabilityBundle(
        id="bundle-sharepoint-sync",
        title="SharePoint Knowledge Sync",
        description="Adds a SharePoint ingestion agent and MCP tool for on-demand document sync.",
        category="SharePoint",
        summary="Keep SharePoint sites synchronized with your agent workspace.",
        tags=["sharepoint", "sync", "mcp"],
        nodes=[
            {
                "id": "agent-sharepoint",
                "type": "agent",
                "kind": "agent",
                "data": {
                    "label": "SharePoint Coordinator",
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "system": "Monitor SharePoint updates and trigger sync tasks using the SharePoint MCP tool.",
                    "subtype": "chat-agent",
                },
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "tool-sharepoint-mcp",
                "type": "tool",
                "kind": "tool",
                "data": {
                    "label": "SharePoint MCP",
                    "subtype": "mcp-tool",
                    "toolConfig": {"apiEndpoint": "https://your-sharepoint-connector"},
                    "description": "MCP endpoint that surfaces SharePoint document operations.",
                },
                "position": {"x": 220, "y": 120},
            },
        ],
        edges=[
            {"id": "edge-agent-sharepoint-tool", "source": "agent-sharepoint", "target": "tool-sharepoint-mcp"},
        ],
    ),
    CapabilityBundle(
        id="bundle-devops-ops",
        title="DevOps Command Center",
        description="Team manager orchestrating analysis and automation agents with code interpreter support.",
        category="DevOps",
        summary="Breakdown incidents and generate remediation scripts automatically.",
        tags=["devops", "automation", "code"],
        nodes=[
            {
                "id": "manager-ops",
                "type": "agent",
                "kind": "teamManager",
                "data": {
                    "label": "Ops Manager",
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system": "Triage incidents, delegate investigation and remediation tasks.",
                    "strategy": "sequential",
                    "threadPolicy": "singleTeamThread",
                    "subtype": "team-manager",
                },
                "position": {"x": 0, "y": 0},
            },
            {
                "id": "agent-analyst",
                "type": "agent",
                "kind": "agent",
                "data": {
                    "label": "Incident Analyst",
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "system": "Summarize logs and identify root causes.",
                    "subtype": "chat-agent",
                },
                "position": {"x": -180, "y": 160},
            },
            {
                "id": "agent-automation",
                "type": "agent",
                "kind": "agent",
                "data": {
                    "label": "Automation Engineer",
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "system": "Author remediation scripts and verify using the code tool.",
                    "subtype": "chat-agent",
                },
                "position": {"x": 180, "y": 160},
            },
            {
                "id": "tool-code-interpreter",
                "type": "tool",
                "kind": "tool",
                "data": {
                    "label": "Code Interpreter",
                    "subtype": "code-interpreter",
                    "description": "Azure hosted code execution environment.",
                },
                "position": {"x": 0, "y": 320},
            },
        ],
        edges=[
            {"id": "edge-manager-analyst", "source": "manager-ops", "target": "agent-analyst"},
            {"id": "edge-manager-automation", "source": "manager-ops", "target": "agent-automation"},
            {"id": "edge-automation-code", "source": "agent-automation", "target": "tool-code-interpreter"},
        ],
    ),
]


def get_tool_catalog() -> List[Dict[str, Any]]:
    """Return tool metadata payload for the frontend."""
    catalog: List[ToolMetadata] = []

    # Hosted tools (built into framework)
    for subtype in sorted(HOSTED_TOOL_SUBTYPES):
        override = BUILT_IN_TOOL_OVERRIDES.get(subtype, {})
        catalog.append(
            ToolMetadata(
                subtype=subtype,
                label=override.get("label", subtype.replace("-", " ").title()),
                category="hosted",
                description=override.get("description"),
                requires=override.get("requires"),
                sample_prompts=override.get("sample_prompts"),
                source="framework",
            )
        )

    # MCP tools
    for subtype in sorted(MCP_TOOL_SUBTYPES):
        override = BUILT_IN_TOOL_OVERRIDES.get(subtype, {})
        catalog.append(
            ToolMetadata(
                subtype=subtype,
                label=override.get("label", "MCP Tool"),
                category="mcp",
                description=override.get("description"),
                requires=override.get("requires"),
                sample_prompts=override.get("sample_prompts"),
                source="framework",
            )
        )

    # Function tools shipped in deliverables
    if DELIVERABLE_TOOLS_DIR.exists():
        for tool_path in sorted(DELIVERABLE_TOOLS_DIR.iterdir()):
            if tool_path.is_dir():
                module_path = tool_path / "__init__.py"
                if not module_path.exists():
                    continue
                subtype = tool_path.name.replace("_", "-")
                catalog.append(_metadata_from_module(subtype, module_path))
            elif tool_path.suffix == ".py":
                subtype = tool_path.stem.replace("_", "-")
                catalog.append(_metadata_from_module(subtype, tool_path))

    # Return serialized dictionaries
    return [tool.to_dict() for tool in catalog]


def get_capability_bundles() -> List[Dict[str, Any]]:
    """Return curated capability bundles for marketplace UI."""
    return [bundle.to_dict() for bundle in CAPABILITY_BUNDLES]


def _metadata_from_module(subtype: str, module_path: Path) -> ToolMetadata:
    """Extract metadata from a tool module."""
    description = None
    sample_prompts: Optional[List[str]] = None
    requires: Optional[List[str]] = None

    try:
        module_ast = ast.parse(module_path.read_text(encoding="utf-8"))
        module_doc = ast.get_docstring(module_ast)
        if module_doc:
            first_line = module_doc.strip().splitlines()[0]
            description = first_line

        for node in module_ast.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        if target.id in {"SAMPLE_PROMPTS", "EXAMPLE_PROMPTS"} and isinstance(node.value, (ast.List, ast.Tuple)):
                            sample_prompts = [_literal_eval_str(elt) for elt in node.value.elts if _literal_eval_str(elt)]
                if target.id in {"REQUIRES", "REQUIRED_SECRETS"} and isinstance(node.value, (ast.List, ast.Tuple)):
                    requires = [_literal_eval_str(elt) for elt in node.value.elts if _literal_eval_str(elt)]
    except Exception:
        # If parsing fails we leave optional fields empty
        description = description or "Custom tool module."

    override = FUNCTION_TOOL_OVERRIDES.get(subtype, {})
    label = override.get("label", subtype.replace("-", " ").title())
    description = override.get("description", description)
    requires = override.get("requires") or requires
    sample_prompts = override.get("sample_prompts") or sample_prompts

    return ToolMetadata(
        subtype=subtype,
        label=label,
        category="function",
        description=description,
        module=str(module_path.relative_to(DELIVERABLE_TOOLS_DIR.parent)),
        requires=requires,
        sample_prompts=sample_prompts,
        source="deliverables",
    )


def _literal_eval_str(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None
