"""Evaluation scenarios router."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from ..models.evaluation import (
    EvaluationScenario,
    EvaluationListItem,
    EvaluationResult,
    EvaluationRunRequest,
)
from ..services.evaluation_store import EvaluationStore
from ..services.evaluation_runner import run_scenario

router = APIRouter()
EVALUATION_DIR = Path(__file__).resolve().parents[2] / ".evaluations"
store = EvaluationStore(EVALUATION_DIR)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or uuid4().hex[:8]


@router.get("", response_model=list[EvaluationListItem])
async def list_scenarios() -> list[EvaluationListItem]:
    return store.list_summaries()


@router.get("/{scenario_id}", response_model=EvaluationScenario)
async def get_scenario(scenario_id: str) -> EvaluationScenario:
    return store.load(scenario_id)


@router.post("", response_model=EvaluationScenario)
async def save_scenario(scenario: EvaluationScenario) -> EvaluationScenario:
    now = datetime.utcnow()
    if not scenario.id:
        scenario.id = _slugify(scenario.name)
        scenario.created_at = now
    scenario.updated_at = now
    if not scenario.messages:
        raise HTTPException(status_code=400, detail="Scenario requires at least one message")
    scenario = EvaluationScenario.model_validate(scenario.model_dump())
    return store.save(scenario)


@router.delete("/{scenario_id}")
async def delete_scenario(scenario_id: str) -> dict[str, str]:
    store.delete(scenario_id)
    return {"status": "deleted", "id": scenario_id}


@router.post("/{scenario_id}/run", response_model=EvaluationResult)
async def run_saved_scenario(scenario_id: str, payload: EvaluationRunRequest) -> EvaluationResult:
    scenario = store.load(scenario_id)
    result = await run_scenario(payload.project, scenario)
    return result
