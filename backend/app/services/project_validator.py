"""Validation helpers for project payloads prior to export."""
from __future__ import annotations

from typing import Dict, Any, List, Optional

from pydantic import ValidationError

from ..models.project import Project, Node


class ProjectValidationError(ValueError):
    """Raised when a project payload fails validation."""

    def __init__(self, issues: List[str]):
        self.issues = issues
        message = "; ".join(issues)
        super().__init__(message)


AGENT_KINDS = {"agent", "teamManager", "teamDirector"}
HOSTED_TOOL_SUBTYPES = {"code-interpreter", "file-search", "google-search", "bing-search"}
MCP_TOOL_SUBTYPES = {"mcp-tool"}


def validate_project_payload(payload: Dict[str, Any]) -> Project:
    """
    Validate the incoming project payload and return the parsed Project model.

    Args:
        payload: Raw project dict

    Raises:
        ProjectValidationError: if structural or semantic issues are found.

    Returns:
        Parsed Project model.
    """
    issues: List[str] = []

    try:
        project = Project.model_validate(payload)
    except ValidationError as exc:
        raise ProjectValidationError([exc.__str__()]) from exc

    for node in project.graph.nodes:
        issues.extend(_validate_node(node))

    if issues:
        raise ProjectValidationError(issues)

    return project


def _validate_node(node: Node) -> List[str]:
    issues: List[str] = []
    data = node.data or {}
    resolved_kind = node.kind or data.kind

    if resolved_kind in AGENT_KINDS:
        if not data.label:
            issues.append(f"Agent node '{node.id}' missing label.")
        if not data.provider:
            issues.append(f"Agent node '{node.id}' missing provider.")
        if not data.model:
            issues.append(f"Agent node '{node.id}' missing model.")

    if resolved_kind == "tool":
        subtype = data.subtype
        if not subtype:
            issues.append(f"Tool node '{node.id}' missing subtype.")
        else:
            issues.extend(_validate_tool(node.id, subtype, data.toolConfig))

    return issues


def _validate_tool(node_id: str, subtype: Optional[str], config: Optional[Dict[str, Any]]) -> List[str]:
    issues: List[str] = []
    config = config or {}

    if not subtype:
        return [f"Tool node '{node_id}' missing subtype."]

    if subtype in HOSTED_TOOL_SUBTYPES:
        return issues  # hosted tools rely on platform defaults

    if subtype in MCP_TOOL_SUBTYPES:
        endpoint = config.get("apiEndpoint") or config.get("endpoint")
        if not endpoint:
            issues.append(f"MCP tool '{node_id}' requires apiEndpoint.")
        return issues

    # Function-style tools should have some configuration defaults (optional)
    # At minimum ensure subtype is slug-like
    if " " in subtype:
        issues.append(f"Function tool '{node_id}' subtype should not contain spaces.")

    return issues
