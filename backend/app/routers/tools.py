"""Tool catalog endpoints."""
from fastapi import APIRouter

from ..services.tool_catalog import get_tool_catalog, get_capability_bundles

router = APIRouter(tags=["tools"])


@router.get("/catalog")
async def list_tool_catalog():
    """Return available tools and metadata for discovery UI."""
    return {"items": get_tool_catalog()}


@router.get("/bundles")
async def list_tool_bundles():
    """Return curated capability bundles."""
    return {"items": get_capability_bundles()}
