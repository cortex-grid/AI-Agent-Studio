"""
FastAPI backend for Agent Canvas.
Provides export and chat endpoints powered by Microsoft Agent Framework.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routers import export, chat, templates, generate, tools, playbooks, evaluations
from .config import config
from .middleware.token_logger import TokenCostMiddleware, get_token_logger

# Load environment variables from .env file
load_dotenv()

# Validate configuration on startup
try:
    config.validate()
except ValueError as e:
    print(f"Configuration error: {e}")
    print("Please check your .env file and environment variables.")

app = FastAPI(
    title="Agent Canvas Backend",
    description="MAF-powered backend for agent orchestration and export",
    version="0.1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add token cost tracking middleware
app.add_middleware(TokenCostMiddleware)

app.include_router(export.router, prefix="/api/export")
app.include_router(chat.router, prefix="/api/chat")
app.include_router(generate.router)  # Already has /api/generate prefix
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(tools.router, prefix="/api/tools")
app.include_router(playbooks.router, prefix="/api/playbooks", tags=["playbooks"])
app.include_router(evaluations.router, prefix="/api/evaluations", tags=["evaluations"])


@app.get("/api/health")
async def health():
    """Health check endpoint with config info."""
    return {
        "status": "ok",
        "provider": config.PROVIDER,
        "model": config.OPENAI_MODEL if config.PROVIDER == "openai" else config.AZURE_OPENAI_DEPLOYMENT,
    }


@app.get("/api/usage")
async def get_usage(project_id: str = None, agent_id: str = None):
    """
    Get token usage and cost summary.
    Supports filtering by project_id and agent_id.
    OpenTelemetry-compatible metrics.
    """
    logger = get_token_logger()
    summary = logger.get_summary(project_id=project_id, agent_id=agent_id)
    return {
        "summary": summary,
        "filters": {
            "project_id": project_id,
            "agent_id": agent_id,
        },
    }


