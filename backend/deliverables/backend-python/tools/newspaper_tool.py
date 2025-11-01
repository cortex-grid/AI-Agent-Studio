# app/agents/tools/newspaper_tool.py
from __future__ import annotations
from typing import Dict, Any, List
from typing_extensions import Annotated
from pydantic import Field

# pip install newspaper3k lxml_html_clean
try:
    from newspaper import Article
except ImportError as e:
    raise ImportError("`newspaper3k` is required. Install with: pip install newspaper3k lxml_html_clean") from e


class NewspaperTool:
    """
    MAF-compatible tool to fetch and parse article text from a URL.
    Returns structured dict (ok, url, title, text, top_image).

    Usage:
        from agent_framework import ChatAgent
        from agent_framework.openai import OpenAIResponsesClient
        from app.agents.tools.newspaper_tool import NewspaperTool

        news_tool = NewspaperTool()
        agent = ChatAgent(
            chat_client=OpenAIResponsesClient(),
            instructions="You can fetch full-text articles with the newspaper tool; quote carefully and summarize.",
            tools=news_tool.as_tools(),
        )
        # await agent.run("Fetch the article text from <URL> and summarize the main reasons mentioned.")

    """

    def get_article_text(
        self,
        url: Annotated[str, Field(description="HTTP/HTTPS URL of the article.")],
        fetch_images: Annotated[bool, Field(description="Whether to parse top image.")] = False,
        max_chars: Annotated[int, Field(ge=256, le=200000, description="Max characters to return.")] = 20000,
    ) -> Dict[str, Any]:
        try:
            art = Article(url)
            art.download()
            art.parse()
            text = (art.text or "").strip()
            if max_chars and len(text) > max_chars:
                text = text[:max_chars] + "…"
            payload = {
                "ok": True,
                "url": url,
                "title": getattr(art, "title", None),
                "text": text,
            }
            if fetch_images:
                payload["top_image"] = getattr(art, "top_image", None)
            return payload
        except Exception as e:
            return {"ok": False, "url": url, "error": str(e)}

    def as_tools(self) -> List[object]:
        return [self.get_article_text]
