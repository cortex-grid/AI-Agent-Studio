"""
TeamManager - Orchestrates MAF agents using Sequential/Concurrent patterns and streams events.
Follows MAF orchestration patterns and streaming from run_stream.
"""
import asyncio
from typing import Dict, Any, AsyncIterator, List, Optional

from .agent_factory import AgentFactory
from .tool_factory import ToolFactory


class ExecutionUnit:
    """Small wrapper that normalizes metadata for execution targets."""

    def __init__(self, node: Dict[str, Any], team_manager: "TeamManager", kind: str):
        self.node = node
        self.id = node.get("id")
        self.team_manager = team_manager
        self.kind = kind
        data = node.get("data") or {}
        self.label = data.get("label") or data.get("name") or node.get("name") or self.id

    async def run_stream(self, message: str) -> AsyncIterator[Dict[str, Any]]:
        raise NotImplementedError


class AgentUnit(ExecutionUnit):
    """Wraps an individual agent so we can decorate streamed events with context."""

    def __init__(self, node: Dict[str, Any], team_manager: "TeamManager", agent: Any):
        super().__init__(node, team_manager, "agent")
        self.agent = agent

    async def run_stream(self, message: str) -> AsyncIterator[Dict[str, Any]]:
        yield self.team_manager._attach_context(
            {"type": "notice", "data": {"message": f"{self.label} starting execution"}},
            self.id,
            self.label,
        )

        async for event in self.team_manager._run_agent_stream(self.agent, message):
            yield self.team_manager._attach_context(event, self.id, self.label)

        yield self.team_manager._attach_context(
            {"type": "notice", "data": {"message": f"{self.label} finished"}},
            self.id,
            self.label,
        )


class ManagerUnit(ExecutionUnit):
    """Coordinates a collection of child units (agents or managers)."""

    def __init__(
        self,
        node: Dict[str, Any],
        team_manager: "TeamManager",
        children: List[ExecutionUnit],
        kind: str = "teamManager",
    ):
        super().__init__(node, team_manager, kind)
        self.children = children
        data = node.get("data") or {}
        self.strategy = data.get("strategy", "sequential").lower()

    async def run_stream(self, message: str) -> AsyncIterator[Dict[str, Any]]:
        yield self.team_manager._attach_context(
            {
                "type": "notice",
                "data": {
                    "message": f"{self.label} coordinating {len(self.children)} member(s) via "
                    f"{self.strategy or 'sequential'} strategy",
                },
            },
            self.id,
            self.label,
        )

        if not self.children:
            yield self.team_manager._attach_context(
                {
                    "type": "error",
                    "data": {"message": f"{self.label} has no assigned team members"},
                },
                self.id,
                self.label,
            )
            return

        if self.strategy == "concurrent":
            async for event in self._run_concurrent(message):
                yield event
        elif self.strategy in {"sequential", "sequence"}:
            async for event in self._run_sequential(message):
                yield event
        else:
            yield self.team_manager._attach_context(
                {
                    "type": "notice",
                    "data": {
                        "message": f"{self.label} does not recognize '{self.strategy}' strategy; "
                        "defaulting to sequential execution",
                    },
                },
                self.id,
                self.label,
            )
            async for event in self._run_sequential(message):
                yield event

        yield self.team_manager._attach_context(
            {"type": "notice", "data": {"message": f"{self.label} finished coordination"}},
            self.id,
            self.label,
        )

    async def _run_sequential(self, message: str) -> AsyncIterator[Dict[str, Any]]:
        for child in self.children:
            yield self.team_manager._attach_context(
                {
                    "type": "notice",
                    "data": {"message": f"{self.label} delegating to {child.label}"},
                },
                self.id,
                self.label,
            )

            async for event in child.run_stream(message):
                yield self.team_manager._append_parent_context(event, self)

    async def _run_concurrent(self, message: str) -> AsyncIterator[Dict[str, Any]]:
        for child in self.children:
            yield self.team_manager._attach_context(
                {
                    "type": "notice",
                    "data": {"message": f"{self.label} launching {child.label} concurrently"},
                },
                self.id,
                self.label,
            )

        queue: asyncio.Queue = asyncio.Queue()
        sentinel = object()

        async def pump(unit: ExecutionUnit) -> None:
            try:
                async for child_event in unit.run_stream(message):
                    await queue.put((unit, child_event))
            finally:
                await queue.put((unit, sentinel))

        tasks = [asyncio.create_task(pump(child)) for child in self.children]
        remaining = len(tasks)

        try:
            while remaining:
                unit, payload = await queue.get()
                if payload is sentinel:
                    remaining -= 1
                    continue

                yield self.team_manager._append_parent_context(payload, self)
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


class TeamManager:
    """
    Manages a team of agents and orchestrates their execution.
    Supports sequential and concurrent strategies from MAF.
    """

    def __init__(self, project: Dict[str, Any]):
        self.project = project
        self.graph = project.get("graph", {})
        self.settings = project.get("settings", {})
        self.nodes = {n["id"]: n for n in self.graph.get("nodes", [])}
        self.edges = self.graph.get("edges", [])

        self.agent_node_ids = [
            node["id"] for node in self.graph.get("nodes", []) if node.get("kind") == "agent"
        ]
        self.manager_node_ids = [
            node["id"] for node in self.graph.get("nodes", []) if node.get("kind") == "teamManager"
        ]

        self.agent_nodes = {node_id: self.nodes[node_id] for node_id in self.agent_node_ids}
        self.manager_nodes = {node_id: self.nodes[node_id] for node_id in self.manager_node_ids}
        self.director_node = next(
            (node for node in self.graph.get("nodes", []) if node.get("kind") == "teamDirector"),
            None,
        )

        self.agent_factory = AgentFactory(
            default_provider=self.settings.get("defaultProvider", "openai"),
            default_model=self.settings.get("defaultModel", "gpt-4o-mini"),
        )
        self.tool_factory = ToolFactory()

        self.agents = {}
        self.tools = {}
        self.agent_units: Dict[str, AgentUnit] = {}
        self.manager_units: Dict[str, ManagerUnit] = {}
        self.execution_units: Dict[str, ExecutionUnit] = {}
        self.director_unit: Optional[ManagerUnit] = None
        self.root_manager_ids: List[str] = []
        self._incoming_index = self._build_incoming_index()
        self._built = False

    async def build(self):
        """
        Build the orchestration hierarchy (agents → team managers → director).
        """
        if self._built:
            return {
                "agents": len(self.agent_units),
                "team_managers": len(self.manager_units),
                "tools": len(self.tools),
                "director": bool(self.director_unit),
            }

        self._build_tools()

        for agent_id in self.agent_node_ids:
            await self._build_agent_unit(agent_id)

        for manager_id in self.manager_node_ids:
            await self._ensure_manager_unit(manager_id)

        self.root_manager_ids = self._compute_root_manager_ids()
        self.director_unit = await self._build_director_unit()

        self._built = True

        return {
            "agents": len(self.agent_units),
            "team_managers": len(self.manager_units),
            "tools": len(self.tools),
            "director": bool(self.director_unit),
        }

    async def run_stream(self, message: str, target: str = "team") -> AsyncIterator[Dict[str, Any]]:
        """
        Stream execution results as normalized events.
        Uses MAF run_stream pattern and emits frontend-friendly events.

        Args:
            message: User message
            target: "team" or specific agent ID

        Yields:
            Event dicts: {type: "text"|"tool_call"|"tool_result"|"notice"|"error", data: {...}}
        """
        yield {"type": "notice", "data": {"message": "Starting team execution..."}}

        if not self._built:
            await self.build()

        if target == "team":
            yield {"type": "notice", "data": {"message": "Running team workflow"}}

            if self.director_unit:
                async for event in self.director_unit.run_stream(message):
                    yield event
            else:
                found = False
                async for event in self._run_without_director(message):
                    found = True
                    yield event

                if not found:
                    yield {"type": "error", "data": {"message": "No agents or managers available"}}

        elif target in self.execution_units:
            unit = self.execution_units[target]
            async for event in unit.run_stream(message):
                yield event

        else:
            yield {"type": "error", "data": {"message": f"Target {target} not found"}}

        yield {"type": "notice", "data": {"message": "Execution complete"}}

    async def _run_agent_stream(self, agent, message: str) -> AsyncIterator[Dict[str, Any]]:
        """
        Run a single agent and stream events.
        Uses MAF run_stream pattern from azure_ai_basic.py streaming_example.
        """
        try:
            async for update in agent.run_stream(message):
                if hasattr(update, "delta") and update.delta:
                    yield {"type": "text", "data": {"delta": str(update.delta)}}
                if hasattr(update, "tool_calls") and update.tool_calls:
                    for tool_call in update.tool_calls:
                        yield {
                            "type": "tool_call",
                            "data": {
                                "name": getattr(tool_call, "name", "unknown"),
                                "args": getattr(tool_call, "arguments", {}),
                            }
                        }
                if not hasattr(update, "delta") and not hasattr(update, "tool_calls"):
                    yield {"type": "text", "data": {"delta": str(update)}}

        except Exception as e:
            yield {"type": "error", "data": {"message": str(e)}}

    async def _run_without_director(self, message: str) -> AsyncIterator[Dict[str, Any]]:
        """Fallback execution when a director node is not present."""
        if self.root_manager_ids:
            for manager_id in self.root_manager_ids:
                unit = self.manager_units.get(manager_id)
                if not unit:
                    continue
                async for event in unit.run_stream(message):
                    yield event
        elif self.manager_units:
            for manager_id in self.manager_node_ids:
                unit = self.manager_units.get(manager_id)
                if not unit:
                    continue
                async for event in unit.run_stream(message):
                    yield event
        else:
            for agent_id in self.agent_node_ids:
                unit = self.agent_units.get(agent_id)
                if not unit:
                    continue
                async for event in unit.run_stream(message):
                    yield event

    def _build_tools(self) -> None:
        for node_id, node in self.nodes.items():
            if node.get("kind") != "tool":
                continue
            try:
                tool = self.tool_factory.build_tool(node)
                if tool:
                    self.tools[node_id] = tool
            except Exception as exc:
                print(f"Warning: Failed to build tool {node_id}: {exc}")

    async def _build_agent_unit(self, agent_id: str) -> Optional[AgentUnit]:
        if agent_id in self.agent_units:
            return self.agent_units[agent_id]

        node = self.agent_nodes.get(agent_id) or self.nodes.get(agent_id)
        if not node:
            return None

        tool_ids = self._resolve_children(agent_id, {"tool"})
        agent_tools = [self.tools[tool_id] for tool_id in tool_ids if tool_id in self.tools]

        try:
            agent = await self.agent_factory.create_agent(node, tools=agent_tools)
        except Exception as exc:
            print(f"Warning: Failed to build agent {agent_id}: {exc}")
            return None

        self.agents[agent_id] = agent
        unit = AgentUnit(node, self, agent)
        self.agent_units[agent_id] = unit
        self.execution_units[agent_id] = unit
        return unit

    async def _ensure_manager_unit(
        self,
        manager_id: str,
        stack: Optional[List[str]] = None,
    ) -> Optional[ManagerUnit]:
        if manager_id in self.manager_units:
            return self.manager_units[manager_id]

        node = self.manager_nodes.get(manager_id) or self.nodes.get(manager_id)
        if not node:
            return None

        stack = stack or []
        if manager_id in stack:
            path = " -> ".join(stack + [manager_id])
            raise ValueError(f"Circular team manager dependency detected: {path}")

        stack.append(manager_id)

        child_units: List[ExecutionUnit] = []
        for child_id in self._resolve_children(manager_id, {"agent", "teamManager"}):
            child_node = self.nodes.get(child_id)
            if not child_node:
                continue

            if child_node.get("kind") == "agent":
                agent_unit = await self._build_agent_unit(child_id)
                if agent_unit:
                    child_units.append(agent_unit)
            elif child_node.get("kind") == "teamManager":
                manager_unit = await self._ensure_manager_unit(child_id, stack)
                if manager_unit:
                    child_units.append(manager_unit)

        stack.pop()

        unit = ManagerUnit(node, self, child_units)
        self.manager_units[manager_id] = unit
        self.execution_units[manager_id] = unit
        return unit

    def _compute_root_manager_ids(self) -> List[str]:
        roots: List[str] = []
        for manager_id in self.manager_node_ids:
            parents = self._incoming_index.get(manager_id, [])
            if not any(parent in self.manager_nodes for parent in parents):
                roots.append(manager_id)
        return roots

    async def _build_director_unit(self) -> Optional[ManagerUnit]:
        node = self.director_node
        created = False

        if not node:
            node = {
                "id": "teamDirector",
                "kind": "teamDirector",
                "data": {
                    "label": self.settings.get("teamDirectorLabel", "Team Director"),
                    "strategy": (
                        self.settings.get("teamDirectorStrategy")
                        or self.settings.get("teamStrategy")
                        or "sequential"
                    ),
                },
            }
            created = True

        if created:
            self.nodes[node["id"]] = node

        child_ids = self._resolve_children(node["id"], {"teamManager", "agent"})
        if not child_ids:
            if self.root_manager_ids:
                child_ids = self.root_manager_ids
            elif self.manager_node_ids:
                child_ids = self.manager_node_ids
            else:
                child_ids = self.agent_node_ids

        children: List[ExecutionUnit] = []
        for child_id in child_ids:
            unit = self.execution_units.get(child_id)
            if not unit:
                child_node = self.nodes.get(child_id)
                if not child_node:
                    continue
                if child_node.get("kind") == "agent":
                    unit = await self._build_agent_unit(child_id)
                elif child_node.get("kind") == "teamManager":
                    unit = await self._ensure_manager_unit(child_id)
            if unit:
                children.append(unit)

        if not children:
            return None

        director_unit = ManagerUnit(node, self, children, kind=node.get("kind", "teamDirector"))
        self.execution_units[node["id"]] = director_unit
        return director_unit

    def _resolve_children(self, source_id: str, allowed_kinds: Optional[set]) -> List[str]:
        results: List[str] = []
        for edge in self.edges:
            if edge.get("source") != source_id:
                continue
            target_id = edge.get("target")
            if not target_id:
                continue
            target_node = self.nodes.get(target_id)
            if not target_node:
                continue
            if allowed_kinds and target_node.get("kind") not in allowed_kinds:
                continue
            results.append(target_id)
        return results

    def _build_incoming_index(self) -> Dict[str, List[str]]:
        incoming: Dict[str, List[str]] = {}
        for edge in self.edges:
            source = edge.get("source")
            target = edge.get("target")
            if not source or not target:
                continue
            incoming.setdefault(target, []).append(source)
        return incoming

    def _copy_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        cloned = dict(event)
        if "data" in cloned and isinstance(cloned["data"], dict):
            cloned["data"] = dict(cloned["data"])
        if "context" in cloned and isinstance(cloned["context"], dict):
            cloned["context"] = dict(cloned["context"])
        return cloned

    def _attach_context(self, event: Dict[str, Any], unit_id: str, unit_label: str) -> Dict[str, Any]:
        cloned = self._copy_event(event)
        context = cloned.get("context")
        if not isinstance(context, dict):
            context = {}

        context.setdefault("unitId", unit_id)
        context.setdefault("unitLabel", unit_label)

        unit = self.execution_units.get(unit_id)
        if unit:
            context.setdefault("unitKind", unit.kind)

        cloned["context"] = context
        return cloned

    def _append_parent_context(self, event: Dict[str, Any], parent_unit: ManagerUnit) -> Dict[str, Any]:
        cloned = self._copy_event(event)
        context = cloned.get("context")
        if not isinstance(context, dict):
            context = {}

        lineage = list(context.get("lineage", []))
        if parent_unit.id not in lineage:
            lineage.append(parent_unit.id)
        context["lineage"] = lineage
        context["via"] = parent_unit.id
        context["viaLabel"] = parent_unit.label
        context["viaKind"] = parent_unit.kind
        cloned["context"] = context
        return cloned
