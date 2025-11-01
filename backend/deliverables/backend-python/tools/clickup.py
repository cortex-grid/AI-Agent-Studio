"""ClickUp workspace helper tools for Microsoft Agent Framework."""
from __future__ import annotations

import os
from typing import Any, Dict, Optional
from typing_extensions import Annotated
from pydantic import Field

import requests

SAMPLE_PROMPTS = [
    "List the ClickUp spaces we have access to so I can choose the right backlog.",
    "Create a new onboarding task in the customer-success list with a short description.",
    "Update task XYZ to status 'in progress' and add a note.",
]


class ClickUpTool:
    REQUIRED_SECRETS = ["CLICKUP_API_KEY", "CLICKUP_TEAM_ID"]

    def __init__(
        self,
        api_key: Optional[str] = None,
        team_id: Optional[str] = None,
    ):
        self._api_key = api_key or os.getenv("CLICKUP_API_KEY")
        self._team_id = team_id or os.getenv("CLICKUP_TEAM_ID") or os.getenv("MASTER_SPACE_ID")
        if not self._api_key or not self._team_id:
            raise ValueError(
                "ClickUp credentials missing. Provide api_key and team_id via constructor or "
                "environment variables (CLICKUP_API_KEY, CLICKUP_TEAM_ID)."
            )
        self._base_url = "https://api.clickup.com/api/v2"
        self._headers = {"Authorization": self._api_key}

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self._base_url}/{endpoint}"
        try:
            response = requests.request(method, url, headers=self._headers, params=params, json=payload, timeout=30)
            response.raise_for_status()
            return {"ok": True, "data": response.json() if response.text else None}
        except requests.exceptions.HTTPError as exc:
            try:
                detail = response.json()
            except Exception:  # noqa: BLE001
                detail = response.text
            return {"ok": False, "error": f"ClickUp API error: {exc}", "detail": detail}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Request failed: {exc}"}

    # ------------------------------------------------------------------ #
    # Tool methods
    # ------------------------------------------------------------------ #
    def list_spaces(self) -> Dict[str, Any]:
        """Return spaces available to the configured team."""
        result = self._request("GET", f"team/{self._team_id}/space")
        if not result["ok"]:
            return result
        spaces = [
            {"id": space["id"], "name": space["name"], "private": space.get("private", False)}
            for space in result["data"].get("spaces", [])
        ]
        return {"ok": True, "spaces": spaces}

    def list_lists(
        self,
        space_id: Annotated[str, Field(description="Target ClickUp space identifier.")],
    ) -> Dict[str, Any]:
        result = self._request("GET", f"space/{space_id}/list")
        if not result["ok"]:
            return result
        lists = [
            {"id": item["id"], "name": item["name"], "status": item.get("status")}
            for item in result["data"].get("lists", [])
        ]
        return {"ok": True, "lists": lists}

    def list_tasks(
        self,
        list_id: Annotated[str, Field(description="ClickUp list identifier to inspect.")],
    ) -> Dict[str, Any]:
        result = self._request("GET", f"list/{list_id}/task")
        if not result["ok"]:
            return result
        tasks = []
        for task in result["data"].get("tasks", []):
            tasks.append(
                {
                    "id": task["id"],
                    "name": task.get("name"),
                    "status": task.get("status", {}).get("status"),
                    "assignees": [assignee.get("username") for assignee in task.get("assignees", [])],
                    "url": task.get("url"),
                }
            )
        return {"ok": True, "tasks": tasks}

    def get_task(
        self,
        task_id: Annotated[str, Field(description="ClickUp task identifier.")],
    ) -> Dict[str, Any]:
        return self._request("GET", f"task/{task_id}")

    def create_task(
        self,
        list_id: Annotated[str, Field(description="List identifier where the task will be created.")],
        name: Annotated[str, Field(description="Task title.")],
        description: Annotated[Optional[str], Field(description="Task description.")] = None,
        status: Annotated[Optional[str], Field(description="Initial status.")] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"name": name}
        if description:
            payload["description"] = description
        if status:
            payload["status"] = status
        return self._request("POST", f"list/{list_id}/task", payload=payload)

    def update_task(
        self,
        task_id: Annotated[str, Field(description="Task identifier.")],
        name: Annotated[Optional[str], Field(description="Updated task name.")] = None,
        description: Annotated[Optional[str], Field(description="Updated description.")] = None,
        status: Annotated[Optional[str], Field(description="New status.")] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if status is not None:
            payload["status"] = status
        if not payload:
            return {"ok": False, "error": "No fields provided to update."}
        return self._request("PUT", f"task/{task_id}", payload=payload)

    def delete_task(
        self,
        task_id: Annotated[str, Field(description="Task identifier to delete.")],
    ) -> Dict[str, Any]:
        result = self._request("DELETE", f"task/{task_id}")
        if not result["ok"]:
            return result
        return {"ok": True, "task": task_id}
