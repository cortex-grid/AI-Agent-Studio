"""Playbook router."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter

from ..models.playbook import Playbook, PlaybookListItem
from ..services.playbook_store import PlaybookStore

router = APIRouter()
PLAYBOOK_DIR = Path(__file__).resolve().parents[2] / ".playbooks"
store = PlaybookStore(PLAYBOOK_DIR)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or uuid4().hex[:8]


@router.get("", response_model=list[PlaybookListItem])
async def list_playbooks() -> list[PlaybookListItem]:
    return store.list_playbooks()


@router.get("/{playbook_id}", response_model=Playbook)
async def get_playbook(playbook_id: str) -> Playbook:
    return store.load_playbook(playbook_id)


@router.post("", response_model=Playbook)
async def save_playbook(playbook: Playbook) -> Playbook:
    now = datetime.utcnow()
    metadata = playbook.metadata

    if not metadata.id:
        metadata.id = _slugify(metadata.name or uuid4().hex[:8])
    if metadata.created_at is None:
        metadata.created_at = now
    metadata.updated_at = now

    return store.save_playbook(playbook)


@router.delete("/{playbook_id}")
async def delete_playbook(playbook_id: str) -> dict[str, str]:
    store.delete_playbook(playbook_id)
    return {"status": "deleted", "id": playbook_id}
