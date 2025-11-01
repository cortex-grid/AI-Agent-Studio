"""
Chat router - Wires frontend chat requests to TeamManager.run_stream.
Supports SSE streaming of agent execution events with memory persistence.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from datetime import datetime
from ..models.messages import ChatRequest
from ..models.project import Project
from ..services.team_manager import TeamManager
import json

router = APIRouter()

# In-memory project cache (in production, load from DB)
_projects = {}


def _set_project(project_id: str, project_data: dict):
    """Cache a project for testing."""
    _projects[project_id] = project_data


@router.post("/cache")
async def cache_project(project: Project):
    """
    Cache a project for chat testing.
    In production, this would save to a database.
    """
    project_dict = project.model_dump() if hasattr(project, 'model_dump') else project.dict()
    _projects[project.id] = project_dict
    return {"status": "cached", "projectId": project.id}


@router.get("/threads/{project_id}")
async def get_threads(project_id: str, limit: int = 50):
    """Get all threads for a project."""
    from ..services.memory_store import get_memory_store
    memory = get_memory_store()
    threads = memory.get_project_threads(project_id, limit)
    return {"threads": threads}


@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str, limit: int = 100):
    """Get messages from a specific thread."""
    from ..services.memory_store import get_memory_store
    memory = get_memory_store()
    
    thread = memory.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    messages = memory.get_messages(thread_id, limit)
    return {"thread": thread, "messages": messages}


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    """Delete a thread and all its messages."""
    from ..services.memory_store import get_memory_store
    memory = get_memory_store()
    
    thread = memory.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    memory.delete_thread(thread_id)
    return {"status": "deleted", "threadId": thread_id}


async def _stream_events(
    team_manager: TeamManager,
    message: str,
    target: str,
    thread_id: str,
    project_id: str
):
    """
    Stream TeamManager events as line-delimited JSON.
    Follows SSE/NDJSON pattern from task.md §6.
    Persists messages to memory store.
    """
    from ..services.memory_store import get_memory_store
    memory = get_memory_store()
    
    # Ensure thread exists
    if not memory.get_thread(thread_id):
        memory.create_thread(thread_id, project_id, target)
    
    # Store user message
    user_msg_id = f"msg-{int(datetime.now().timestamp() * 1000)}"
    memory.add_message(thread_id, user_msg_id, "user", message)
    
    # Stream assistant response
    assistant_content = ""
    try:
        async for event in team_manager.run_stream(message, target):
            yield json.dumps(event) + "\n"
            
            # Accumulate text for storage
            if event.get("type") == "text" and event.get("data", {}).get("delta"):
                assistant_content += event["data"]["delta"]
    except Exception as e:
        yield json.dumps({"type": "error", "data": {"message": str(e)}}) + "\n"
    finally:
        # Store assistant response
        if assistant_content:
            assistant_msg_id = f"msg-{int(datetime.now().timestamp() * 1000) + 1}"
            memory.add_message(thread_id, assistant_msg_id, "assistant", assistant_content)


@router.post("/stream")
async def chat_stream(payload: ChatRequest):
    """
    SSE endpoint for chat with streaming responses.
    
    Request: {projectId, target, message, thread?, mcp?, metadata?}
    Response: Line-delimited JSON events
    """
    project = _projects.get(payload.projectId)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {payload.projectId} not found")
    
    team_manager = TeamManager(project)
    await team_manager.build()
    
    target = payload.target or "team"
    thread_id = payload.thread or f"thread-{int(datetime.now().timestamp())}"
    project_id = payload.projectId or "unknown"
    
    return StreamingResponse(
        _stream_events(team_manager, payload.message, target, thread_id, project_id),
        media_type="application/x-ndjson",
    )


@router.post("/run")
async def chat_run(payload: ChatRequest):
    """
    Non-streaming endpoint for chat (collects all events and returns final result).
    """
    project = _projects.get(payload.projectId)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {payload.projectId} not found")
    
    team_manager = TeamManager(project)
    await team_manager.build()
    
    target = payload.target or "team"
    
    # Collect all events
    events = []
    async for event in team_manager.run_stream(payload.message, target):
        events.append(event)
    
    # Extract final text response
    text_parts = [e["data"].get("delta", "") for e in events if e.get("type") == "text"]
    final_text = "".join(text_parts)
    
    return JSONResponse({
        "text": final_text,
        "events": events,
    })
