from __future__ import annotations

from typing import List

from fastapi import HTTPException

from ..models.evaluation import (
    EvaluationScenario,
    EvaluationResult,
    ScenarioAssertion,
    ScenarioMessage,
)
from ..models.project import Project
from .team_manager import TeamManager


async def _collect_response(team_manager: TeamManager, prompt: str, target: str) -> tuple[str, List[dict]]:
    events = []
    async for event in team_manager.run_stream(prompt, target):
        events.append(event)
    text_parts = [e["data"].get("delta", "") for e in events if e.get("type") == "text"]
    final_text = "".join(text_parts)
    return final_text, events


def _evaluate_assertions(text: str, assertions: List[ScenarioAssertion]) -> List[str]:
    failures: List[str] = []
    for assertion in assertions:
        description = assertion.description or "assertion"
        if assertion.equals is not None and text.strip() != str(assertion.equals).strip():
            failures.append(f"{description}: expected exact match.")
        if assertion.contains and assertion.contains not in text:
            failures.append(f"{description}: expected substring '{assertion.contains}'.")
        if assertion.not_contains and assertion.not_contains in text:
            failures.append(f"{description}: forbidden substring '{assertion.not_contains}' present.")
    return failures


async def run_scenario(project: Project, scenario: EvaluationScenario) -> EvaluationResult:
    if not scenario.messages:
        raise HTTPException(status_code=400, detail="Scenario requires at least one user message.")

    prompt = scenario.messages[-1].content
    target = scenario.target_agent or "team"

    team_manager = TeamManager(project.model_dump(mode="json"))
    await team_manager.build()

    text, events = await _collect_response(team_manager, prompt, target)

    transcript = list(scenario.messages)
    transcript.append(ScenarioMessage(role="assistant", content=text))

    failures = _evaluate_assertions(text, scenario.assertions)

    return EvaluationResult(
        scenario_id=scenario.id,
        passed=len(failures) == 0,
        failures=failures,
        transcript=transcript,
        metadata={"events": events, "response": text},
    )
