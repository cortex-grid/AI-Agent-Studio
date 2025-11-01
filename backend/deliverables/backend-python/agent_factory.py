"""
AgentFactory - Creates MAF agents with full parameter support.
"""
import os
from typing import List, Dict, Any, Optional

from agent_framework.openai import OpenAIChatClient
from agent_framework.azure import AzureAIAgentClient


class AgentFactory:
    """Factory for creating MAF agents from node specifications."""
    
    def __init__(self):
        # Model fallback chain
        self.default_model = os.getenv("OPENAI_CHAT_MODEL_ID") or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"
        
        # Provider detection
        self.use_azure = os.getenv("USE_AZURE", "false").lower() == "true"
        self.use_openai_fallback = os.getenv("USE_OPENAI_FALLBACK", "false").lower() == "true"
        
        # Initialize clients
        self._openai_client = None
        self._azure_client = None
    
    def _get_openai_client(self, model_id: str):
        """Get or create OpenAI client."""
        if not self._openai_client:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not set in environment")
            
            self._openai_client = OpenAIChatClient(
                api_key=api_key,
                model_id=model_id
            )
        return self._openai_client
    
    def _get_azure_client(self):
        """Get or create Azure AI client."""
        if not self._azure_client:
            project_endpoint = os.getenv("AZURE_PROJECT_ENDPOINT")
            if not project_endpoint:
                raise ValueError("AZURE_PROJECT_ENDPOINT not set for Azure provider")
            
            self._azure_client = AzureAIAgentClient(endpoint=project_endpoint)
        return self._azure_client
    
    def create_agent(
        self,
        node: Dict[str, Any],
        tools: Optional[List[Any]] = None,
        **kwargs
    ):
        """
        Create MAF agent from node specification.
        
        Args:
            node: Agent node with data containing system, model, etc.
            tools: List of MAF tool instances (from ToolFactory)
            **kwargs: Additional create_agent parameters
        
        Returns:
            MAF agent instance
        """
        data = node.get("data", {})
        
        # Extract agent properties
        name = data.get("label", f"agent_{node.get('id')}")
        instructions = data.get("system", "You are a helpful assistant.")
        model = data.get("model", self.default_model)
        provider = data.get("provider", "openai" if not self.use_azure else "azure")
        temperature = data.get("temperature")
        description = data.get("description")
        
        # Determine which client to use
        if provider == "azure":
            client = self._get_azure_client()
        elif provider == "openai" or self.use_openai_fallback:
            client = self._get_openai_client(model)
        else:
            raise ValueError(f"Unsupported provider: {provider}")
        
        # Build create_agent parameters
        agent_params = {
            "name": name,
            "instructions": instructions,
            "model_id": model,
        }
        
        # Add optional parameters
        if tools:
            agent_params["tools"] = tools
        
        if temperature is not None:
            agent_params["temperature"] = float(temperature)
        
        if description:
            agent_params["description"] = description
        
        # Advanced parameters from kwargs
        if "context_providers" in kwargs:
            agent_params["context_providers"] = kwargs["context_providers"]
        
        if "middleware" in kwargs:
            agent_params["middleware"] = kwargs["middleware"]
        
        # Additional MAF parameters
        if "response_format" in data:
            agent_params["response_format"] = data["response_format"]
        
        if "top_p" in data:
            agent_params["top_p"] = data["top_p"]
        
        if "max_completion_tokens" in data:
            agent_params["max_completion_tokens"] = data["max_completion_tokens"]
        
        # Create the agent
        agent = client.create_agent(**agent_params)
        
        return agent
    
    def create_orchestrated_agent(
        self,
        manager_node: Dict[str, Any],
        child_agents: List[Any],
        **kwargs
    ):
        """
        Create orchestrated team manager agent.
        
        Args:
            manager_node: Manager node with data containing strategy
            child_agents: List of child MAF agents
            **kwargs: Additional parameters
        
        Returns:
            MAF orchestrated agent
        """
        data = manager_node.get("data", {})
        strategy = data.get("strategy", "sequential")
        
        # Manager properties
        name = data.get("label", f"manager_{manager_node.get('id')}")
        instructions = data.get("system", "You are a team manager coordinating multiple agents.")
        model = data.get("model", self.default_model)
        provider = data.get("provider", "openai" if not self.use_azure else "azure")
        
        # Get client
        if provider == "azure":
            client = self._get_azure_client()
        elif provider == "openai" or self.use_openai_fallback:
            client = self._get_openai_client(model)
        else:
            raise ValueError(f"Unsupported provider: {provider}")
        
        # Create orchestrated agent based on strategy
        if strategy == "sequential":
            from agent_framework import SequentialBuilder
            
            builder = SequentialBuilder()
            for agent in child_agents:
                builder.add_agent(agent)
            
            orchestrated = builder.build(
                name=name,
                instructions=instructions,
                model_id=model
            )
        
        elif strategy == "concurrent":
            from agent_framework import ConcurrentBuilder
            
            builder = ConcurrentBuilder()
            for agent in child_agents:
                builder.add_agent(agent)
            
            orchestrated = builder.build(
                name=name,
                instructions=instructions,
                model_id=model
            )
        
        elif strategy == "magentic":
            from agent_framework import MagenticBuilder
            
            builder = MagenticBuilder()
            for agent in child_agents:
                builder.add_agent(agent)
            
            orchestrated = builder.build(
                name=name,
                instructions=instructions,
                model_id=model
            )
        
        else:
            raise ValueError(f"Unsupported orchestration strategy: {strategy}")
        
        return orchestrated

    def create_team_director(
        self,
        director_node: Dict[str, Any],
        manager_agents: List[Any],
        **kwargs
    ):
        """
        Compose a top-level director that orchestrates multiple manager agents.
        Falls back to sequential strategy if none is specified.
        """
        node_copy = dict(director_node)
        node_data = dict(node_copy.get("data", {}))
        node_copy["data"] = node_data

        node_data.setdefault(
            "system",
            "You are the team director responsible for orchestrating manager agents.",
        )
        node_data.setdefault("strategy", node_data.get("strategy", "sequential"))

        return self.create_orchestrated_agent(
            node_copy,
            manager_agents,
            **kwargs,
        )
