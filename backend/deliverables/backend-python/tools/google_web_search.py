from __future__ import annotations
from typing import Any, Dict, List, Optional
import logging
import random
import time
import re
import html
from urllib.parse import unquote, urlparse, parse_qs

from pydantic import Field

# Requires: pip install googlesearch-python pycountry requests
try:
    from googlesearch import search as _gsearch
except ImportError as e:
    _gsearch = None  # optional - we'll fallback to requests-based scraping

try:
    import pycountry
except ImportError as e:
    raise ImportError("`pycountry` is required. Install with: pip install pycountry") from e

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except Exception:
    requests = None


LOG = logging.getLogger(__name__)


class GoogleSearchTool:
    """
    Minimal Google Search tool for Microsoft Agent Framework (MAF).

    Usage with MAF:
        from agent_framework import ChatAgent
        from agent_framework.openai import OpenAIResponsesClient

        gs = GoogleSearchTool()
        agent = ChatAgent(
            chat_client=OpenAIResponsesClient(),
            instructions="You can search the web using the google_search tool.",
            tools=gs.as_tools(),  # exposes the google_search callable
        )

        # Then: await agent.run("Find the latest news on lithium prices and cite sources.")
    """

    def __init__(
        self,
        fixed_max_results: Optional[int] = None,
        fixed_language: Optional[str] = None,
        proxy: Optional[str] = None,
        timeout: Optional[int] = 10,
        dev_mode: bool = False,
        debug: bool = False,
    ) -> None:
        """
        Args:
            fixed_max_results: Force a maximum number of results (overrides per-call max_results).
            fixed_language: Force a language (overrides per-call language).
            proxy: Optional HTTP/HTTPS proxy string. Example: "http://user:pass@host:port".
            timeout: Request timeout in seconds (library default is ~10).
        """
        self.fixed_max_results = fixed_max_results
        self.fixed_language = fixed_language
        self.proxy = proxy
        self.timeout = timeout
        # When dev_mode=True the tool will return deterministic mock results useful for testing
        self.dev_mode = dev_mode
        # When debug=True the tool will add additional debugging fields to the returned dict and log extra details
        self.debug = debug

    # ---- Helper methods -----------------------------------------------------

    @staticmethod
    def _iso639_1(lang: str) -> str:
        """Normalize language to ISO 639-1 two-letter code; default to 'en'."""
        if not lang:
            return "en"
        lang = lang.strip()
        if len(lang) == 2:
            return lang.lower()
        try:
            match = pycountry.languages.lookup(lang)
            if hasattr(match, "alpha_2"):
                return match.alpha_2.lower()
        except Exception:
            pass
        return "en"

    # ---- Tool exposed to the agent -----------------------------------------

    def google_search(
        self,
        query: str,
        max_results: int = 5,
        language: str = "en",
        site: str = "",
        tld: str = "com",
        safe: str = "moderate",
    ) -> Dict[str, Any]:
        """
        Search Google and return structured results.

        Returns:
            {
              "ok": true,
              "query": "...",
              "language": "en",
              "count": 5,
              "items": [
                {"title":"...", "url":"...", "description":"..."},
                ...
              ]
            }
        """
        # Apply fixed overrides if configured
        max_results = int(self.fixed_max_results or max_results)
        language = self._iso639_1(self.fixed_language or language)

        # Compose query with site restriction if provided (accepts either raw domain or 'site:domain')
        q = query.strip()
        if site:
            q = f"{q} site:{site.replace('site:', '').strip()}"
        # Dev mode: return deterministic mock items so the rest of the pipeline can be exercised
        if self.dev_mode:
            mock = [
                {"title": f"{q} - Mock Result {i+1}", "url": f"https://{site or 'linkedin.com'}/in/mock-profile-{i+1}", "description": "Mocked result for development/testing."}
                for i in range(min(3, max_results))
            ]
            return {"ok": True, "query": q, "language": language, "count": len(mock), "items": mock, "source": "mock"}

        debug_info: Dict[str, Any] = {}

        # First try: use googlesearch-python if available
        if _gsearch is not None:
            try:
                # Some installs of googlesearch support advanced=True and return objects with title/url/description
                results = list(_gsearch(q, num_results=max_results, lang=language, safe=safe, proxy=self.proxy, advanced=True))
                items: List[Dict[str, str]] = []
                for r in results:
                    items.append(
                        {
                            "title": getattr(r, "title", "") or "",
                            "url": getattr(r, "url", "") or "",
                            "description": getattr(r, "description", "") or "",
                        }
                    )
                debug_info["method"] = "googlesearch-python"
                debug_info["raw_count"] = len(items)
                if self.debug:
                    LOG.debug("google_search using googlesearch-python: q=%s count=%s", q, len(items))

                # If we got results, return them
                if items:
                    out = {"ok": True, "query": q, "language": language, "count": len(items), "items": items}
                    if self.debug:
                        out["debug"] = debug_info
                    return out

            except TypeError as te:
                # Known incompatibility (some versions don't accept 'advanced' or args)
                debug_info["googlesearch_error"] = str(te)
                LOG.debug("googlesearch-python TypeError: %s", te)
            except Exception as e:
                debug_info["googlesearch_error"] = str(e)
                LOG.debug("googlesearch-python error: %s", e)

        # Fallback: requests-based scraping of Google results page with rotating headers
        if requests is None:
            return {"ok": False, "query": q, "language": language, "error": "requests library not available", "debug": debug_info}

        try:
            items = self._requests_search(q, max_results=max_results, language=language)
            debug_info["method"] = "requests-fallback"
            debug_info["raw_count"] = len(items)
            if self.debug:
                LOG.debug("google_search fallback: q=%s count=%s", q, len(items))

            out = {"ok": True, "query": q, "language": language, "count": len(items), "items": items}
            if self.debug:
                out["debug"] = debug_info
            return out

        except Exception as e:
            debug_info["requests_error"] = str(e)
            LOG.exception("google_search requests fallback failed")
            return {"ok": False, "query": q, "language": language, "error": str(e), "debug": debug_info}

    # Expose as a list of callables for MAF's ChatAgent(tools=[...])
    def as_tools(self) -> List[object]:
        # Return a simplified callable with plain annotations to avoid Pydantic model rebuild
        return [self._callable_wrapper]

    # A simple wrapper with plain typing (no Annotated) so MAF/pydantic can build models reliably
    def _callable_wrapper(self, query: str, max_results: int = 5, language: str = "en", site: str = "", tld: str = "com", safe: str = "moderate") -> Dict[str, Any]:
        return self.google_search(query=query, max_results=max_results, language=language, site=site, tld=tld, safe=safe)

    # ----------------- requests-based fallback scraping -----------------
    def _default_headers(self) -> Dict[str, str]:
        """Return a rotated set of headers to emulate different browsers/locales."""
        user_agents = [
            # A short list of modern user-agent strings
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        ]
        accept_lang = ["en-US,en;q=0.9", "de-DE,de;q=0.9,en;q=0.8", "fr-FR,fr;q=0.9,en;q=0.8"]
        headers = {
            "User-Agent": random.choice(user_agents),
            "Accept-Language": random.choice(accept_lang),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Referer": "https://www.google.com/",
        }
        return headers

    def _create_session(self):
        if requests is None:
            raise RuntimeError("requests is required for the requests-based fallback")
        session = requests.Session()
        # Configure retries/adapters if available - be defensive because imports may have failed
        try:
            # Attempt to use urllib3 Retry/requests HTTPAdapter if available
            RetryCls = globals().get("Retry")
            HTTPAdapterCls = globals().get("HTTPAdapter")
            if RetryCls and HTTPAdapterCls:
                retries = RetryCls(total=3, backoff_factor=0.3, status_forcelist=(429, 500, 502, 503, 504))
                adapter = HTTPAdapterCls(max_retries=retries)
                session.mount("https://", adapter)
                session.mount("http://", adapter)
            else:
                LOG.debug("Retry/HTTPAdapter not available; skipping adapter setup")
        except Exception:
            LOG.debug("Retry/HTTPAdapter setup unavailable; continuing without custom retries", exc_info=True)

        if self.proxy:
            try:
                session.proxies.update({"http": self.proxy, "https": self.proxy})
            except Exception:
                LOG.debug("Failed to set proxy on session", exc_info=True)
        return session

    def _requests_search(self, q: str, max_results: int = 5, language: str = "en") -> List[Dict[str, str]]:
        """Best-effort scraping of Google SERP. Returns a list of {title,url,description}.

        Note: scraping Google may be blocked or rate-limited; this is a development fallback only.
        """
        session = self._create_session()
        # polite random delay to avoid immediate bot patterns
        time.sleep(random.uniform(0.5, 1.2))

        params = {"q": q, "num": str(max_results), "hl": language}
        headers = self._default_headers()
        if self.debug:
            LOG.debug("_requests_search headers=%s params=%s", headers, params)

        resp = session.get("https://www.google.com/search", params=params, headers=headers, timeout=self.timeout)
        html_text = resp.text

        # Parse links that look like /url?q=<real-url>&
        results: List[Dict[str, str]] = []
        # Find occurrences of '/url?q=' and extract the URL and nearby <h3> title when possible
        link_matches = re.findall(r"/url\?q=(https?://[^&\"]+)[^\"]*", html_text)
        # find titles (a naive approach: <h3>...</h3>)
        title_matches = re.findall(r"<h3[^>]*>(.*?)</h3>", html_text, flags=re.IGNORECASE | re.DOTALL)

        # Clean up and pair up
        for i, raw in enumerate(link_matches[:max_results]):
            try:
                url = unquote(raw)
                title = html.unescape(title_matches[i].strip()) if i < len(title_matches) else url
                # Simple description extraction: find a snippet near the link (best-effort)
                desc_match = re.search(re.escape(raw) + r"[\s\S]{0,300}?<span class=\"\">(.*?)</span>", html_text)
                description = html.unescape(desc_match.group(1)) if desc_match else ""
                results.append({"title": title, "url": url, "description": description})
            except Exception:
                continue

        # As a last attempt, if we found nothing, try to extract direct <a href="/url?q=..."> anchors
        if not results:
            anchors = re.findall(r"<a[^>]+href=\"(/url\?q=[^\"]+)\"[^>]*>(.*?)</a>", html_text, flags=re.IGNORECASE | re.DOTALL)
            for i, (href, anchor_html) in enumerate(anchors[:max_results]):
                m = re.search(r"/url\?q=(https?://[^&\"]+)", href)
                if not m:
                    continue
                url = unquote(m.group(1))
                title_tag = re.sub(r"<.*?>", "", anchor_html)
                title = html.unescape(title_tag.strip()) or url
                results.append({"title": title, "url": url, "description": ""})

        return results
