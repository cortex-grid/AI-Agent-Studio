"""
Generation router - MAF-powered endpoint for creating agent graphs from natural language.
"""
import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional, List, AsyncIterator
from app.services.canvas_generator import get_generator


router = APIRouter(prefix="/api/generate", tags=["generate"])


class ConversationMessage(BaseModel):
    """Single turn of prior conversation context."""
    role: str
    content: str


class AttachmentPayload(BaseModel):
    filename: str
    content_type: Optional[str] = None
    base64: str


class GenerateRequest(BaseModel):
    """Request model for graph generation."""
    message: str
    current_graph: Optional[Dict[str, Any]] = None
    context: Optional[List[ConversationMessage]] = None
    assets: Optional[List[AttachmentPayload]] = None
    preferred_tools: Optional[List[str]] = None
    workflow_preference: Optional[str] = None


class GenerateResponse(BaseModel):
    """Response model for graph generation."""
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    success: bool
    message: str
    raw_response: Optional[str] = None


@router.post("/", response_model=GenerateResponse)
async def generate_graph(request: GenerateRequest):
    """
    Generate ReactFlow nodes and edges from natural language description.
    
    This endpoint uses a MAF agent to parse user descriptions and create
    proper agent nodes, tool nodes, and edges representing the requested system.
    
    Examples:
    - "I need a finance analyst with yahoo finance tool"
    - "Create a research team with web search and data analysis"
    - "Team manager that orchestrates agents for finance operations"
    
    Args:
        request: GenerateRequest with message and optional current_graph
    
    Returns:
        GenerateResponse with nodes, edges, success status, and message
    """
    try:
        if not request.message or not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        
        # Get the MAF-powered generator
        generator = await get_generator()
        
        # Generate graph structure
        result = await generator.generate(
            user_message=request.message,
            current_graph=request.current_graph if request.current_graph else None,
            conversation_context=[msg.model_dump() for msg in request.context] if request.context else None,
            attachments=[asset.model_dump() for asset in request.assets] if request.assets else None,
            preferred_tools=request.preferred_tools or None,
            workflow_preference=request.workflow_preference,
        )
        
        return GenerateResponse(**result)
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {str(e)}"
        )


async def _stream_generation_events(request: GenerateRequest) -> AsyncIterator[str]:
    generator = await get_generator()

    yield json.dumps({"type": "status", "data": "Analyzing your prompt…"}) + "\n"
    await asyncio.sleep(0)

    try:
        result = await generator.generate(
            user_message=request.message,
            current_graph=request.current_graph if request.current_graph else None,
            conversation_context=[msg.model_dump() for msg in request.context] if request.context else None,
            attachments=[asset.model_dump() for asset in request.assets] if request.assets else None,
            preferred_tools=request.preferred_tools or None,
            workflow_preference=request.workflow_preference,
        )

        message = result.get("message") or "Agent composition generated successfully."
        fragments = [frag for frag in message.split(" ") if frag]
        chunk = ""
        for index, frag in enumerate(fragments, start=1):
            if chunk:
                chunk += " "
            chunk += frag
            if index % 6 == 0 or index == len(fragments):
                yield json.dumps({"type": "text", "data": {"delta": chunk + " "}}) + "\n"
                chunk = ""
                await asyncio.sleep(0)

        payload = {
            "nodes": result.get("nodes", []),
            "edges": result.get("edges", []),
            "message": message,
            "success": result.get("success", True),
            "raw_response": result.get("raw_response"),
        }
        yield json.dumps({"type": "result", "data": payload}) + "\n"
    except Exception as exc:  # noqa: BLE001
        error_detail = str(exc)
        yield json.dumps({"type": "error", "data": {"message": error_detail}}) + "\n"


@router.post("/stream")
async def generate_graph_stream(request: GenerateRequest):
    async def generator():
        async for chunk in _stream_generation_events(request):
            yield chunk

    return StreamingResponse(generator(), media_type="application/x-ndjson")


@router.get("/health")
async def health_check():
    """Check if the generation service is ready."""
    try:
        generator = await get_generator()
        return {
            "status": "healthy",
            "generator_initialized": generator.agent is not None
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }
