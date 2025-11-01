"""
GraphBuilder - Parses project.json edges to build agent-tool mappings and orchestration trees.
"""
from typing import Dict, List, Set, Any


class GraphBuilder:
    """Builds agent-tool mappings and orchestration hierarchies from graph edges."""
    
    def __init__(self, nodes: List[Dict], edges: List[Dict]):
        self.nodes = {node["id"]: node for node in nodes}
        self.edges = edges
    
    def build_agent_tool_map(self) -> Dict[str, List[str]]:
        """
        Build mapping of agent IDs to their tool node IDs.
        
        Looks for edges: tool -> agent
        
        Returns:
            {agent_id: [tool_id1, tool_id2, ...]}
        """
        agent_tools = {}
        
        for edge in self.edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            
            if not source_id or not target_id:
                continue
            
            source_node = self.nodes.get(source_id)
            target_node = self.nodes.get(target_id)
            
            if not source_node or not target_node:
                continue
            
            # Tool -> Agent connection
            if source_node.get("type") == "tool" and target_node.get("type") == "agent":
                if target_id not in agent_tools:
                    agent_tools[target_id] = []
                agent_tools[target_id].append(source_id)
        
        return agent_tools
    
    def build_orchestration_tree(self) -> Dict[str, List[str]]:
        """
        Build mapping of orchestrator IDs (team managers/directors) to their child nodes.
        
        Looks for edges: agent -> orchestrator (where target.data.kind in {"teamManager", "teamDirector"})
        
        Returns:
            {orchestrator_id: [child_agent_or_manager_id, ...]}
        """
        manager_children = {}
        
        for edge in self.edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            
            if not source_id or not target_id:
                continue
            
            source_node = self.nodes.get(source_id)
            target_node = self.nodes.get(target_id)
            
            if not source_node or not target_node:
                continue
            
            # Agent -> Manager/Director connection
            if (source_node.get("type") == "agent" and 
                target_node.get("type") == "agent" and
                target_node.get("data", {}).get("kind") in {"teamManager", "teamDirector"}):
                
                if target_id not in manager_children:
                    manager_children[target_id] = []
                manager_children[target_id].append(source_id)
        
        return manager_children
    
    def get_root_agents(self) -> List[str]:
        """
        Get agent IDs that are not children of any manager.
        These are the top-level agents/managers to expose in the API.
        
        Returns:
            List of agent IDs that have no outgoing edges to managers
        """
        # Find all agents that are children of managers
        child_agents = set()
        for edge in self.edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            
            if not source_id or not target_id:
                continue
            
            target_node = self.nodes.get(target_id)
            if (target_node and 
                target_node.get("type") == "agent" and
                target_node.get("data", {}).get("kind") in {"teamManager", "teamDirector"}):
                child_agents.add(source_id)
        
        # Return all agents not in child_agents
        root_agents = []
        for node_id, node in self.nodes.items():
            if node.get("type") == "agent" and node_id not in child_agents:
                root_agents.append(node_id)
        
        return root_agents
    
    def get_tool_dependencies(self, agent_id: str) -> List[str]:
        """
        Get tool node IDs that an agent depends on.
        
        Args:
            agent_id: Agent node ID
        
        Returns:
            List of tool node IDs
        """
        tool_map = self.build_agent_tool_map()
        return tool_map.get(agent_id, [])
    
    def get_manager_team(self, manager_id: str) -> List[str]:
        """
        Get child agent IDs for a team manager.
        
        Args:
            manager_id: Manager node ID
        
        Returns:
            List of child agent node IDs
        """
        orchestration_tree = self.build_orchestration_tree()
        return orchestration_tree.get(manager_id, [])
    
    def is_manager(self, node_id: str) -> bool:
        """Check if a node is an orchestrator (team manager or director)."""
        node = self.nodes.get(node_id)
        if not node:
            return False
        return (node.get("type") == "agent" and 
                node.get("data", {}).get("kind") in {"teamManager", "teamDirector"})
    
    def get_orchestration_strategy(self, manager_id: str) -> str:
        """
        Get orchestration strategy for a team manager.
        
        Args:
            manager_id: Manager node ID
        
        Returns:
            Strategy name: "sequential", "concurrent", or "magentic"
        """
        node = self.nodes.get(manager_id)
        if not node:
            return "sequential"  # Default
        
        return node.get("data", {}).get("strategy", "sequential")
    
    def validate_graph(self) -> List[str]:
        """
        Validate graph structure and return list of warnings/errors.
        
        Returns:
            List of validation messages
        """
        warnings = []
        
        # Check for orphaned tools (tools not connected to any agent)
        agent_tools = self.build_agent_tool_map()
        connected_tools = set()
        for tools in agent_tools.values():
            connected_tools.update(tools)
        
        for node_id, node in self.nodes.items():
            if node.get("type") == "tool" and node_id not in connected_tools:
                warnings.append(f"Tool '{node.get('data', {}).get('label', node_id)}' is not connected to any agent")
        
        # Check for managers with no children
        orchestration_tree = self.build_orchestration_tree()
        for node_id, node in self.nodes.items():
            if self.is_manager(node_id) and node_id not in orchestration_tree:
                warnings.append(f"Coordinator '{node.get('data', {}).get('label', node_id)}' has no child agents")
        
        # Check for circular dependencies (basic check)
        # A more thorough check would use DFS/cycle detection
        
        return warnings
