from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import HTTPException

from ..models.evaluation import EvaluationScenario, EvaluationListItem


class EvaluationStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path_for(self, scenario_id: str) -> Path:
        safe_id = scenario_id.replace("/", "_")
        return self.directory / f"{safe_id}.json"

    def list_summaries(self) -> List[EvaluationListItem]:
        items: List[EvaluationListItem] = []
        for path in sorted(self.directory.glob("*.json")):
            try:
                with path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                scenario = EvaluationScenario.model_validate(payload)
                items.append(
                    EvaluationListItem(
                        id=scenario.id,
                        name=scenario.name,
                        description=scenario.description,
                        target_agent=scenario.target_agent,
                        updated_at=scenario.updated_at,
                    )
                )
            except Exception as exc:
                print(f"Failed to read evaluation scenario {path}: {exc}")
        return items

    def load(self, scenario_id: str) -> EvaluationScenario:
        path = self._path_for(scenario_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            return EvaluationScenario.model_validate(payload)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to read scenario: {exc}") from exc

    def save(self, scenario: EvaluationScenario) -> EvaluationScenario:
        path = self._path_for(scenario.id)
        scenario.updated_at = datetime.utcnow()
        data = scenario.model_dump(mode="json")
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return scenario

    def delete(self, scenario_id: str) -> None:
        path = self._path_for(scenario_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
        path.unlink()
