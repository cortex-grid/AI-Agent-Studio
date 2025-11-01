"""
AgentFactory - Creates MAF ChatAgent instances from node specifications.
Supports both OpenAI and Azure AI providers following MAF patterns.
"""
import os
from typing import Dict, Any, List, Optional
from agent_framework.openai import OpenAIChatClient
from agent_framework.azure import AzureAIAgentClient
from azure.identity.aio import AzureCliCredential


class AgentFactory:
    """Factory for creating MAF agents from node specifications."""
    
    def __init__(self, default_provider: str = "openai", default_model: str = "gpt-4o-mini"):
        self.default_provider = default_provider
        self.default_model = default_model
    
    async def create_agent(self, node: Dict[str, Any], tools: Optional[List[Any]] = None, **kwargs):
        """
        Create a ChatAgent from a node specification with full MAF parameter support.
        
        Args:
            node: Node with data containing provider, model, system, etc.
            tools: Optional list of tool instances (from ToolFactory)
            **kwargs: Additional create_agent parameters (context_providers, middleware, etc.)
        
        Returns:
            ChatAgent instance ready to run
        """
        data = node.get("data", {})
        provider = data.get("provider", self.default_provider)
        model = data.get("model", self.default_model)
        system_prompt = data.get("system", "You are a helpful AI agent.")
        agent_name = data.get("label") or data.get("name", node.get("id"))
        temperature = data.get("temperature", 0.7)
        description = data.get("description")
        
        # Choose client based on provider (following MAF patterns)
        if provider == "azure":
            # Azure AI Agent pattern from azure_ai_basic.py
            client = AzureAIAgentClient(
                credential=AzureCliCredential(),
                endpoint=os.getenv("AZURE_AI_PROJECT_ENDPOINT"),
                model_deployment_name=model or os.getenv("AZURE_AI_MODEL_DEPLOYMENT_NAME"),
            )
        else:
            # OpenAI Chat Client pattern - provide model_id to the client constructor
            model_id = data.get("model") or os.getenv("OPENAI_CHAT_MODEL_ID") or self.default_model
            client = OpenAIChatClient(
                api_key=os.getenv("OPENAI_API_KEY"),
                model_id=model_id,
            )
        
        # Build create_agent parameters
        model_id = data.get("model") or os.getenv("OPENAI_CHAT_MODEL_ID") or self.default_model
        agent_params = {
            "name": agent_name,
            "instructions": system_prompt,
            "model_id": model_id,
            "tools": tools or [],
        }
        
        # Add optional parameters from node data
        if temperature is not None:
            agent_params["temperature"] = float(temperature)
        
        if description:
            agent_params["description"] = description
        
        # Advanced MAF parameters from node data
        if "response_format" in data:
            agent_params["response_format"] = data["response_format"]
        
        if "top_p" in data:
            agent_params["top_p"] = data["top_p"]
        
        if "max_completion_tokens" in data:
            agent_params["max_completion_tokens"] = data["max_completion_tokens"]
        
        # Advanced parameters from kwargs
        if "context_providers" in kwargs:
            agent_params["context_providers"] = kwargs["context_providers"]
        
        if "middleware" in kwargs:
            agent_params["middleware"] = kwargs["middleware"]
        
        # Create agent with all parameters
        agent = client.create_agent(**agent_params)
        
        return agent
