"""Jira helper tools for Microsoft Agent Framework.

Wraps commonly used Jira Cloud/Server operations using the `jira` SDK.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from typing_extensions import Annotated
from pydantic import Field

SAMPLE_PROMPTS = [
    "Fetch the full details for issue ENG-123 and summarize the description.",
    "Create a follow-up task in project OPS with a summary and description.",
    "Run a JQL query for open incidents assigned to the platform team.",
]


class JiraTool:
    REQUIRED_SECRETS = ["JIRA_SERVER_URL", "JIRA_USERNAME", "JIRA_API_TOKEN"]

    def __init__(
        self,
        server_url: Optional[str] = None,
        username: Optional[str] = None,
        api_token: Optional[str] = None,
    ):
        try:
            from jira import JIRA  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ImportError("The 'jira' package is required. Install with `pip install jira`.") from exc

        import os

        self._server = server_url or os.getenv("JIRA_SERVER_URL")
        self._username = username or os.getenv("JIRA_USERNAME")
        self._token = api_token or os.getenv("JIRA_API_TOKEN") or os.getenv("JIRA_PASSWORD")

        if not self._server or not self._username or not self._token:
            raise ValueError(
                "Jira credentials missing. Provide server_url, username and api_token via "
                "constructor or environment variables (JIRA_SERVER_URL, JIRA_USERNAME, JIRA_API_TOKEN)."
            )

        self._client = JIRA(server=self._server, basic_auth=(self._username, self._token))

    # ------------------------------------------------------------------ #
    # Helper
    # ------------------------------------------------------------------ #
    @staticmethod
    def _issue_summary(issue: Any) -> Dict[str, Any]:
        fields = issue.fields
        return {
            "key": issue.key,
            "summary": fields.summary,
            "status": getattr(fields.status, "name", None),
            "project": getattr(fields.project, "key", None),
            "assignee": getattr(getattr(fields, "assignee", None), "displayName", None),
            "reporter": getattr(getattr(fields, "reporter", None), "displayName", None),
            "url": None,
        }

    # ------------------------------------------------------------------ #
    # Tools
    # ------------------------------------------------------------------ #
    def get_issue(
        self,
        issue_key: Annotated[str, Field(description="Issue key (e.g., ENG-123).")],
    ) -> Dict[str, Any]:
        try:
            issue = self._client.issue(issue_key)
            summary = self._issue_summary(issue)
            summary["description"] = issue.fields.description or ""
            summary["url"] = f"{self._server}/browse/{issue.key}"
            return {"ok": True, "issue": summary}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to fetch issue {issue_key}: {exc}"}

    def create_issue(
        self,
        project_key: Annotated[str, Field(description="Project key where the issue will be created.")],
        summary: Annotated[str, Field(description="Short summary for the issue.")],
        description: Annotated[str, Field(description="Issue description.")],
        issue_type: Annotated[str, Field(description="Jira issue type.", example="Task")] = "Task",
    ) -> Dict[str, Any]:
        try:
            issue_dict = {
                "project": {"key": project_key},
                "summary": summary,
                "description": description,
                "issuetype": {"name": issue_type},
            }
            issue = self._client.create_issue(fields=issue_dict)
            return {
                "ok": True,
                "issue": {
                    "key": issue.key,
                    "url": f"{self._server}/browse/{issue.key}",
                },
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to create issue: {exc}"}

    def search(
        self,
        jql: Annotated[str, Field(description="JQL query string.")],
        max_results: Annotated[int, Field(description="Maximum results.", ge=1, le=200)] = 50,
    ) -> Dict[str, Any]:
        try:
            issues = self._client.search_issues(jql, maxResults=int(max_results))
            summaries = []
            for issue in issues:
                data = self._issue_summary(issue)
                data["url"] = f"{self._server}/browse/{issue.key}"
                summaries.append(data)
            return {"ok": True, "issues": summaries}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to search issues: {exc}", "jql": jql}

    def add_comment(
        self,
        issue_key: Annotated[str, Field(description="Issue key (e.g., OPS-77).")],
        comment: Annotated[str, Field(description="Comment text to append.")],
    ) -> Dict[str, Any]:
        try:
            self._client.add_comment(issue_key, comment)
            return {"ok": True, "issue": issue_key}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to add comment: {exc}"}

    def log_work(
        self,
        issue_key: Annotated[str, Field(description="Issue key (e.g., OPS-77).")],
        time_spent: Annotated[str, Field(description="Time spent, e.g., '2h' or '30m'.")],
        comment: Annotated[Optional[str], Field(description="Optional worklog comment.")] = None,
    ) -> Dict[str, Any]:
        try:
            self._client.add_worklog(issue_key, timeSpent=time_spent, comment=comment)
            return {"ok": True, "issue": issue_key, "timeSpent": time_spent}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to log work: {exc}"}
