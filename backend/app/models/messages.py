from pydantic import BaseModel
from typing import Any, Dict, Optional


class ChatRequest(BaseModel):
    projectId: Optional[str]
    target: str
    message: str
    thread: Optional[str] = "auto"
    mcp: Optional[bool] = False
    metadata: Optional[Dict[str, Any]] = None


class ChatEvent(BaseModel):
    type: str
    data: Dict[str, Any]


class ExportRequest(BaseModel):
    project: Dict[str, Any]
