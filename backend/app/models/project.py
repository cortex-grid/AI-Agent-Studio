from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class NodeData(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    system: Optional[str] = None
    toolConfig: Optional[Dict[str, Any]] = None
    subtype: Optional[str] = None
    description: Optional[str] = None
    strategy: Optional[str] = None
    threadPolicy: Optional[str] = None
    kind: Optional[str] = None


class Node(BaseModel):
    id: str
    kind: Optional[str] = None
    type: Optional[str] = None
    data: NodeData = Field(default_factory=NodeData)
    position: Optional[Dict[str, Any]] = None
    dragging: Optional[bool] = None


class Edge(BaseModel):
    id: Optional[str] = None
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class Graph(BaseModel):
    nodes: List[Node] = Field(default_factory=list)
    edges: List[Edge] = Field(default_factory=list)


class Project(BaseModel):
    id: Optional[str] = None
    name: str
    settings: Optional[Dict[str, Any]] = None
    graph: Graph = Field(default_factory=Graph)
