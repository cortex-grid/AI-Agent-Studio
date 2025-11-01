"""
Token cost logging middleware with OpenTelemetry compatibility.
Tracks token usage and estimated costs per request, agent, and team.
"""
import time
import json
from typing import Callable, Optional, Dict, Any
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime


# Token cost estimates (per 1K tokens) as of October 2024
# Update these with current pricing
TOKEN_COSTS = {
    "gpt-4o": {"input": 0.0025, "output": 0.0100},
    "gpt-4o-mini": {"input": 0.000150, "output": 0.000600},
    "gpt-4-turbo": {"input": 0.0100, "output": 0.0300},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
}


class TokenCostLogger:
    """
    Logs token usage and costs with OpenTelemetry attributes.
    Compatible with Azure Monitor, Datadog, and other OTEL backends.
    """
    
    def __init__(self):
        self.logs = []
    
    def log_usage(
        self,
        request_id: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        duration_ms: float,
        endpoint: str,
        agent_id: Optional[str] = None,
        project_id: Optional[str] = None,
        target: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Log token usage with OTEL-compatible attributes.
        
        OpenTelemetry Semantic Conventions:
        - gen_ai.request.model
        - gen_ai.usage.input_tokens
        - gen_ai.usage.output_tokens
        - gen_ai.response.finish_reason
        """
        costs = TOKEN_COSTS.get(model, {"input": 0, "output": 0})
        total_cost = (
            (input_tokens / 1000) * costs["input"] +
            (output_tokens / 1000) * costs["output"]
        )
        
        log_entry = {
            # Standard attributes
            "timestamp": datetime.now().isoformat(),
            "request_id": request_id,
            "endpoint": endpoint,
            "duration_ms": duration_ms,
            
            # OpenTelemetry GenAI semantic conventions
            "gen_ai.request.model": model,
            "gen_ai.usage.input_tokens": input_tokens,
            "gen_ai.usage.output_tokens": output_tokens,
            "gen_ai.usage.total_tokens": input_tokens + output_tokens,
            
            # Cost tracking
            "cost.input_usd": (input_tokens / 1000) * costs["input"],
            "cost.output_usd": (output_tokens / 1000) * costs["output"],
            "cost.total_usd": total_cost,
            "cost.currency": "USD",
            
            # Application-specific
            "agent.id": agent_id,
            "agent.target": target,
            "project.id": project_id,
            "metadata": metadata or {},
        }
        
        self.logs.append(log_entry)
        
        # Print in OTEL-compatible JSON format
        print(json.dumps({
            "level": "info",
            "message": "Token usage logged",
            "attributes": log_entry,
        }))
        
        return log_entry
    
    def get_summary(
        self,
        project_id: Optional[str] = None,
        agent_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get usage summary with optional filters."""
        filtered_logs = self.logs
        
        if project_id:
            filtered_logs = [l for l in filtered_logs if l.get("project.id") == project_id]
        if agent_id:
            filtered_logs = [l for l in filtered_logs if l.get("agent.id") == agent_id]
        
        if not filtered_logs:
            return {
                "total_requests": 0,
                "total_tokens": 0,
                "total_cost_usd": 0,
                "input_tokens": 0,
                "output_tokens": 0,
            }
        
        return {
            "total_requests": len(filtered_logs),
            "total_tokens": sum(l["gen_ai.usage.total_tokens"] for l in filtered_logs),
            "total_cost_usd": sum(l["cost.total_usd"] for l in filtered_logs),
            "input_tokens": sum(l["gen_ai.usage.input_tokens"] for l in filtered_logs),
            "output_tokens": sum(l["gen_ai.usage.output_tokens"] for l in filtered_logs),
            "avg_duration_ms": sum(l["duration_ms"] for l in filtered_logs) / len(filtered_logs),
            "models": list(set(l["gen_ai.request.model"] for l in filtered_logs)),
        }


# Singleton instance
_logger: Optional[TokenCostLogger] = None


def get_token_logger() -> TokenCostLogger:
    """Get or create the token logger singleton."""
    global _logger
    if _logger is None:
        _logger = TokenCostLogger()
    return _logger


class TokenCostMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware that tracks token costs for chat endpoints.
    Integrates with MAF response metadata.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Only track chat endpoints
        if not request.url.path.startswith("/api/chat"):
            return await call_next(request)
        
        request_id = f"req-{int(time.time() * 1000)}"
        start_time = time.time()
        
        # Store request ID in state for downstream use
        request.state.request_id = request_id
        request.state.token_logger = get_token_logger()
        
        response = await call_next(request)
        
        duration_ms = (time.time() - start_time) * 1000
        
        # For streaming responses, token tracking happens in the stream handler
        # For non-streaming, we can track here if response includes usage data
        
        return response


def log_agent_usage(
    request_id: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_ms: float,
    agent_id: Optional[str] = None,
    project_id: Optional[str] = None,
    target: Optional[str] = None
):
    """
    Helper function to log agent token usage.
    Call this from TeamManager after agent execution.
    """
    logger = get_token_logger()
    return logger.log_usage(
        request_id=request_id,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        duration_ms=duration_ms,
        endpoint="agent_execution",
        agent_id=agent_id,
        project_id=project_id,
        target=target,
    )
