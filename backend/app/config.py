"""
Configuration management for the backend.
Loads environment variables for Azure, OpenAI, and MCP endpoints.
"""
import os
from typing import Optional


class Config:
    """
    Centralized configuration from environment variables.
    Follows task.md §8 configuration requirements.
    """
    
    # Provider selection
    PROVIDER: str = os.getenv("PROVIDER", "openai")  # "openai" or "azure"
    
    # OpenAI configuration
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    # Azure configuration
    AZURE_OPENAI_ENDPOINT: Optional[str] = os.getenv("AZURE_OPENAI_ENDPOINT")
    AZURE_OPENAI_DEPLOYMENT: Optional[str] = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    AZURE_OPENAI_API_VERSION: str = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    
    # Azure AI Projects (for AzureAIAgentClient)
    AZURE_AI_PROJECT_ENDPOINT: Optional[str] = os.getenv("AZURE_AI_PROJECT_ENDPOINT")
    AZURE_AI_PROJECT_SUBSCRIPTION_ID: Optional[str] = os.getenv("AZURE_AI_PROJECT_SUBSCRIPTION_ID")
    AZURE_AI_PROJECT_RESOURCE_GROUP: Optional[str] = os.getenv("AZURE_AI_PROJECT_RESOURCE_GROUP")
    AZURE_AI_PROJECT_NAME: Optional[str] = os.getenv("AZURE_AI_PROJECT_NAME")
    
    # MCP endpoints (comma-separated for multiple servers)
    MCP_ENDPOINTS: str = os.getenv("MCP_ENDPOINTS", "")
    
    # Tool-specific API keys
    GOOGLE_SEARCH_API_KEY: Optional[str] = os.getenv("GOOGLE_SEARCH_API_KEY")
    GOOGLE_SEARCH_ENGINE_ID: Optional[str] = os.getenv("GOOGLE_SEARCH_ENGINE_ID")
    BING_SEARCH_API_KEY: Optional[str] = os.getenv("BING_SEARCH_API_KEY")
    
    # Server settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    @classmethod
    def validate(cls):
        """Validate required configuration based on provider."""
        if cls.PROVIDER == "openai":
            if not cls.OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY is required when PROVIDER=openai")
        elif cls.PROVIDER == "azure":
            if not cls.AZURE_AI_PROJECT_ENDPOINT:
                raise ValueError("AZURE_AI_PROJECT_ENDPOINT is required when PROVIDER=azure")
        else:
            raise ValueError(f"Invalid PROVIDER: {cls.PROVIDER}. Must be 'openai' or 'azure'")
    
    @classmethod
    def get_mcp_endpoints(cls) -> list[str]:
        """Parse MCP_ENDPOINTS into a list."""
        if not cls.MCP_ENDPOINTS:
            return []
        return [ep.strip() for ep in cls.MCP_ENDPOINTS.split(",") if ep.strip()]


# Singleton instance
config = Config()
