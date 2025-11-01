from __future__ import annotations

from datetime import datetime
from typing import Optional, Dict, Any

from pydantic import BaseModel, Field

from .project import Project


class PlaybookMetadata(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    version: Optional[str] = None
    author: Optional[str] = None


class Playbook(BaseModel):
    metadata: PlaybookMetadata
    project: Project
    notes: Optional[str] = None
    placeholders: Optional[Dict[str, Any]] = None


class PlaybookListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    updated_at: datetime
    node_count: int
    edge_count: int
