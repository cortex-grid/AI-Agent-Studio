"""Confluence helper tools for Microsoft Agent Framework.

Provides read/write helpers backed by `atlassian-python-api`.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from typing_extensions import Annotated
from pydantic import Field

SAMPLE_PROMPTS = [
    "Fetch the latest release notes page from the Engineering space.",
    "List the first 25 Confluence spaces so I can choose where to document runbooks.",
    "Create a draft incident report page under the 'Operations' parent page.",
]


class ConfluenceTool:
    REQUIRED_SECRETS = ["CONFLUENCE_URL", "CONFLUENCE_USERNAME", "CONFLUENCE_API_KEY"]

    def __init__(
        self,
        url: Optional[str] = None,
        username: Optional[str] = None,
        api_key: Optional[str] = None,
        verify_ssl: bool = True,
    ):
        try:
            from atlassian import Confluence  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ImportError(
                "The 'atlassian-python-api' package is required for ConfluenceTool. "
                "Install with `pip install atlassian-python-api`."
            ) from exc

        import os

        resolved_url = url or os.getenv("CONFLUENCE_URL")
        resolved_user = username or os.getenv("CONFLUENCE_USERNAME")
        resolved_api_key = api_key or os.getenv("CONFLUENCE_API_KEY") or os.getenv("CONFLUENCE_PASSWORD")

        if not resolved_url or not resolved_user or not resolved_api_key:
            raise ValueError(
                "Confluence credentials are missing. Provide url, username and api_key via "
                "constructor or environment variables (CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_API_KEY)."
            )

        self._client = Confluence(
            url=resolved_url,
            username=resolved_user,
            password=resolved_api_key,
            verify_ssl=verify_ssl,
        )
        self._base_url = resolved_url.rstrip("/")

    # ------------------------------------------------------------------ #
    # Helper utilities
    # ------------------------------------------------------------------ #
    def _space_key(self, space: str) -> str:
        if not space:
            raise ValueError("Space key/name is required.")
        return space

    # ------------------------------------------------------------------ #
    # Public tool methods
    # ------------------------------------------------------------------ #
    def list_spaces(
        self,
        limit: Annotated[int, Field(description="Maximum number of spaces to return.", ge=1, le=200)] = 25,
    ) -> Dict[str, Any]:
        try:
            data = self._client.get_all_spaces(start=0, limit=int(limit))
            spaces = [
                {"key": item.get("key"), "name": item.get("name"), "type": item.get("type")}
                for item in data.get("results", []) if item
            ]
            return {"ok": True, "spaces": spaces}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to list spaces: {exc}"}

    def list_pages(
        self,
        space: Annotated[str, Field(description="Confluence space key (e.g., 'ENG').")],
        limit: Annotated[int, Field(description="Maximum number of pages to fetch.", ge=1, le=200)] = 50,
    ) -> Dict[str, Any]:
        try:
            space_key = self._space_key(space)
            pages = self._client.get_all_pages_from_space(
                space_key,
                start=0,
                limit=int(limit),
                content_type="page",
            )
            results = [
                {
                    "id": page.get("id"),
                    "title": page.get("title"),
                    "url": f"{self._base_url}{page.get('_links', {}).get('webui', '')}",
                }
                for page in pages or []
            ]
            return {"ok": True, "pages": results}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to list pages in {space}: {exc}"}

    def get_page(
        self,
        space: Annotated[str, Field(description="Confluence space key.")],
        title: Annotated[str, Field(description="Page title to retrieve.")],
        expand: Annotated[str, Field(description="Expand clause.")] = "body.storage",
    ) -> Dict[str, Any]:
        try:
            space_key = self._space_key(space)
            page = self._client.get_page_by_title(space_key, title, expand=expand)
            if not page:
                return {"ok": False, "error": f"Page '{title}' not found in space '{space}'."}

            return {
                "ok": True,
                "page": {
                    "id": page.get("id"),
                    "title": page.get("title"),
                    "url": f"{self._base_url}{page.get('_links', {}).get('webui', '')}",
                    "version": page.get("version", {}).get("number"),
                    "body": page.get("body", {}).get("storage", {}).get("value"),
                },
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to fetch page: {exc}"}

    def create_page(
        self,
        space: Annotated[str, Field(description="Space key where the page will be created.")],
        title: Annotated[str, Field(description="Title for the new page.")],
        body: Annotated[str, Field(description="HTML body content for the page.")],
        parent_id: Annotated[Optional[str], Field(description="Optional parent page ID.")] = None,
    ) -> Dict[str, Any]:
        try:
            space_key = self._space_key(space)
            result = self._client.create_page(space_key, title, body, parent_id=parent_id)
            return {
                "ok": True,
                "page": {
                    "id": result.get("id"),
                    "title": result.get("title"),
                    "url": f"{self._base_url}{result.get('_links', {}).get('webui', '')}",
                },
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to create page: {exc}"}

    def update_page(
        self,
        page_id: Annotated[str, Field(description="Identifier of the page to update.")],
        title: Annotated[str, Field(description="New title for the page.")],
        body: Annotated[str, Field(description="Updated HTML content.")],
    ) -> Dict[str, Any]:
        try:
            result = self._client.update_page(page_id, title, body, representation="storage")
            return {
                "ok": True,
                "page": {
                    "id": result.get("id"),
                    "title": result.get("title"),
                    "version": result.get("version", {}).get("number"),
                },
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to update page: {exc}"}
