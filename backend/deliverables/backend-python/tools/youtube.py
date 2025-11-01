"""YouTube utility tools for Microsoft Agent Framework."""
from __future__ import annotations

import json
from typing import Dict, Optional, List
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen
from typing_extensions import Annotated
from pydantic import Field

SAMPLE_PROMPTS = [
    "Get the metadata for https://www.youtube.com/watch?v=dQw4w9WgXcQ and summarise the title.",
    "Fetch captions for this training recording and highlight the top moments.",
    "Generate timestamp bullets for the latest all-hands video.",
]


class YouTubeTool:
    REQUIRED_SECRETS: List[str] = []

    def __init__(
        self,
        languages: Optional[List[str]] = None,
        proxies: Optional[Dict[str, str]] = None,
    ):
        try:
            from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ImportError(
                "The 'youtube-transcript-api' package is required. Install with `pip install youtube-transcript-api`."
            ) from exc

        self._transcript_api = YouTubeTranscriptApi()
        self._languages = languages
        self._proxies = proxies

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _video_id(url: str) -> Optional[str]:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if host == "youtu.be":
            return parsed.path.lstrip("/")
        if host.endswith("youtube.com"):
            if parsed.path == "/watch":
                return parse_qs(parsed.query).get("v", [None])[0]
            if parsed.path.startswith("/embed/") or parsed.path.startswith("/v/"):
                return parsed.path.split("/")[2]
        return None

    # ------------------------------------------------------------------ #
    # Tools
    # ------------------------------------------------------------------ #
    def video_metadata(
        self,
        url: Annotated[str, Field(description="YouTube video URL.")],
    ) -> Dict[str, Optional[str]]:
        video_id = self._video_id(url)
        if not video_id:
            return {"ok": False, "error": "Unable to extract video id from url."}

        endpoint = "https://www.youtube.com/oembed"
        params = f"format=json&url=https://www.youtube.com/watch?v={video_id}"
        try:
            with urlopen(f"{endpoint}?{params}") as response:
                data = json.loads(response.read().decode())
                metadata = {
                    "title": data.get("title"),
                    "author_name": data.get("author_name"),
                    "author_url": data.get("author_url"),
                    "provider_name": data.get("provider_name"),
                    "thumbnail_url": data.get("thumbnail_url"),
                }
                return {"ok": True, "video": metadata}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to fetch metadata: {exc}"}

    def captions(
        self,
        url: Annotated[str, Field(description="YouTube video URL.")],
    ) -> Dict[str, Optional[str]]:
        video_id = self._video_id(url)
        if not video_id:
            return {"ok": False, "error": "Unable to extract video id from url."}

        kwargs: Dict[str, object] = {}
        if self._languages:
            kwargs["languages"] = self._languages
        if self._proxies:
            kwargs["proxies"] = self._proxies

        try:
            transcript = self._transcript_api.fetch(video_id, **kwargs)
            if not transcript:
                return {"ok": False, "error": "No captions available."}
            text = " ".join(chunk["text"] for chunk in transcript if chunk.get("text"))
            return {"ok": True, "captions": text}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to fetch captions: {exc}"}

    def timestamps(
        self,
        url: Annotated[str, Field(description="YouTube video URL.")],
    ) -> Dict[str, Optional[List[str]]]:
        video_id = self._video_id(url)
        if not video_id:
            return {"ok": False, "error": "Unable to extract video id from url."}

        kwargs: Dict[str, object] = {}
        if self._languages:
            kwargs["languages"] = self._languages
        if self._proxies:
            kwargs["proxies"] = self._proxies

        try:
            transcript = self._transcript_api.fetch(video_id, **kwargs)
            if not transcript:
                return {"ok": False, "error": "No captions available for timestamps."}
            stamps = []
            for item in transcript:
                start = int(item.get("start", 0))
                minutes, seconds = divmod(start, 60)
                stamps.append(f"{minutes}:{seconds:02d} - {item.get('text', '').strip()}")
            return {"ok": True, "timestamps": stamps}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to build timestamps: {exc}"}
