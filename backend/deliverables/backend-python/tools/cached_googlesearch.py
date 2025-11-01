import time
from typing import Optional, Tuple, Dict, Any
import threading
from .google_web_search import GoogleSearchTool


class CachedGoogleSearchTools:
    """Wrapper around GoogleSearchTool.GoogleSearchTools with an in-memory TTL cache.

    Cache key is (query, max_results, language). TTL default 300 seconds.
    Thread-safe.
    """

    def __init__(self, fixed_max_results: Optional[int] = None, fixed_language: Optional[str] = None, ttl: int = 300, **kwargs):
        self._tools = GoogleSearchTool(fixed_max_results=fixed_max_results, fixed_language=fixed_language, **kwargs)
        self._cache_ttl = ttl
        self._cache: Dict[Tuple[str, int, str], Tuple[float, str]] = {}
        self._lock = threading.Lock()

    def google_search(self, query: str, max_results: int = 5, language: str = "en") -> str:
        key = (query.strip(), int(max_results), str(language))
        now = time.time()
        with self._lock:
            entry = self._cache.get(key)
            if entry:
                ts, value = entry
                if now - ts < self._cache_ttl:
                    return value
                else:
                    # expired
                    del self._cache[key]

        # not cached or expired; perform search
        result = self._tools.google_search(query, max_results=max_results, language=language)
        with self._lock:
            try:
                self._cache[key] = (now, result)
            except Exception:
                pass
        return result

    # Expose attributes if needed
    def __getattr__(self, name: str):
        return getattr(self._tools, name)
