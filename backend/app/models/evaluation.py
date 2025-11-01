from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .project import Project


class ScenarioMessage(BaseModel):
    role: str
    content: str


class ScenarioAssertion(BaseModel):
    description: str
    path: Optional[str] = None  # Future JSONPath support
    equals: Optional[Any] = None
    contains: Optional[str] = None
    not_contains: Optional[str] = None


class EvaluationScenario(BaseModel):
    id: str = ""
    name: str
    description: Optional[str] = None
    target_agent: str = "team"
    messages: List[ScenarioMessage] = Field(default_factory=list)
    assertions: List[ScenarioAssertion] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EvaluationListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    target_agent: str
    updated_at: datetime


class EvaluationResult(BaseModel):
    scenario_id: str
    passed: bool
    failures: List[str] = Field(default_factory=list)
    transcript: List[ScenarioMessage] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EvaluationSuite(BaseModel):
    scenarios: List[EvaluationScenario] = Field(default_factory=list)


class EvaluationRunRequest(BaseModel):
    project: Project
