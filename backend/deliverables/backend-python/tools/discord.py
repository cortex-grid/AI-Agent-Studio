"""Discord bot tools for Microsoft Agent Framework."""
from __future__ import annotations

import os
from typing import Any, Dict, Optional
from typing_extensions import Annotated
from pydantic import Field

import requests

SAMPLE_PROMPTS = [
    "Post the deployment status message in the #release-updates channel.",
    "List the latest 20 messages from the on-call room.",
    "Delete the reminder message from channel XYZ.",
]


class DiscordTool:
    REQUIRED_SECRETS = ["DISCORD_BOT_TOKEN"]

    def __init__(self, bot_token: Optional[str] = None):
        self._token = bot_token or os.getenv("DISCORD_BOT_TOKEN")
        if not self._token:
            raise ValueError("Discord bot token is required (set DISCORD_BOT_TOKEN).")
        self._base = "https://discord.com/api/v10"
        self._headers = {
            "Authorization": f"Bot {self._token}",
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        endpoint: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self._base}{endpoint}"
        try:
            response = requests.request(method, url, headers=self._headers, json=payload, timeout=30)
            if response.status_code == 204:
                return {"ok": True}
            response.raise_for_status()
            return {"ok": True, "data": response.json()}
        except requests.exceptions.HTTPError as exc:
            detail = None
            try:
                detail = response.json()
            except Exception:  # noqa: BLE001
                detail = response.text
            return {"ok": False, "error": f"Discord API error: {exc}", "detail": detail}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Discord request failed: {exc}"}

    # ------------------------------------------------------------------ #
    # Tools
    # ------------------------------------------------------------------ #
    def send_message(
        self,
        channel_id: Annotated[str, Field(description="Target channel identifier.")],
        content: Annotated[str, Field(description="Message body.")],
    ) -> Dict[str, Any]:
        return self._request("POST", f"/channels/{channel_id}/messages", {"content": content})

    def get_channel_info(
        self,
        channel_id: Annotated[str, Field(description="Channel identifier.")],
    ) -> Dict[str, Any]:
        return self._request("GET", f"/channels/{channel_id}")

    def list_channels(
        self,
        guild_id: Annotated[str, Field(description="Guild (server) identifier.")],
    ) -> Dict[str, Any]:
        result = self._request("GET", f"/guilds/{guild_id}/channels")
        if not result["ok"]:
            return result
        channels = [
            {"id": ch["id"], "name": ch.get("name"), "type": ch.get("type")}
            for ch in result["data"]
            if ch.get("type") in (0, 5)  # text and announcement channels
        ]
        return {"ok": True, "channels": channels}

    def get_channel_messages(
        self,
        channel_id: Annotated[str, Field(description="Channel identifier.")],
        limit: Annotated[int, Field(description="Maximum number of messages.", ge=1, le=100)] = 20,
    ) -> Dict[str, Any]:
        result = self._request("GET", f"/channels/{channel_id}/messages?limit={int(limit)}")
        if not result["ok"]:
            return result
        messages = [
            {
                "id": msg["id"],
                "author": msg.get("author", {}).get("username"),
                "content": msg.get("content"),
                "timestamp": msg.get("timestamp"),
            }
            for msg in result["data"]
        ]
        return {"ok": True, "messages": messages}

    def delete_message(
        self,
        channel_id: Annotated[str, Field(description="Channel identifier.")],
        message_id: Annotated[str, Field(description="Message identifier to delete.")],
    ) -> Dict[str, Any]:
        return self._request("DELETE", f"/channels/{channel_id}/messages/{message_id}")
