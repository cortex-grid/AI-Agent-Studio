from __future__ import annotations

import json
from pathlib import Path
from typing import List

from fastapi import HTTPException

from ..models.playbook import Playbook, PlaybookListItem


class PlaybookStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def list_playbooks(self) -> List[PlaybookListItem]:
        items: List[PlaybookListItem] = []
        for path in sorted(self.directory.glob("*.json")):
            try:
                with path.open("r", encoding="utf-8") as handle:
                    raw = json.load(handle)
                playbook = Playbook.model_validate(raw)
                project = playbook.project
                node_count = len(project.graph.nodes)
                edge_count = len(project.graph.edges)
                items.append(
                    PlaybookListItem(
                        id=playbook.metadata.id,
                        name=playbook.metadata.name,
                        description=playbook.metadata.description,
                        category=playbook.metadata.category,
                        tags=playbook.metadata.tags,
                        updated_at=playbook.metadata.updated_at,
                        node_count=node_count,
                        edge_count=edge_count,
                    )
                )
            except Exception as exc:
                print(f"Failed to load playbook {path}: {exc}")
        return items

    def load_playbook(self, playbook_id: str) -> Playbook:
        path = self._path_for(playbook_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
        try:
            with path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
            return Playbook.model_validate(raw)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to load playbook: {exc}") from exc

    def save_playbook(self, playbook: Playbook) -> Playbook:
        path = self._path_for(playbook.metadata.id)
        payload = json.dumps(playbook.model_dump(mode="json"), indent=2)
        path.write_text(payload, encoding="utf-8")
        return playbook

    def delete_playbook(self, playbook_id: str) -> None:
        path = self._path_for(playbook_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Playbook {playbook_id} not found")
        path.unlink()

    def _path_for(self, playbook_id: str) -> Path:
        safe_id = playbook_id.replace("/", "_")
        return self.directory / f"{safe_id}.json"
