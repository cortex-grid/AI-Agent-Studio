# app/agents/tools/yfinance_tool.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from typing_extensions import Annotated
from pydantic import Field
import datetime as _dt

# pip install yfinance
try:
    import yfinance as yf
except ImportError as e:
    raise ImportError("`yfinance` is required. Install with: pip install yfinance") from e


def _now_iso() -> str:
    return _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


class YFinanceTool:
    """
    Microsoft Agent Framework (MAF) compatible Yahoo Finance tool.

    Exposes read-only function tools:
      - get_current_stock_price
      - get_company_info
      - get_stock_fundamentals
      - get_historical_stock_prices
      - get_analyst_recommendations
      - get_company_news
      - get_technical_indicators

    Notes:
      - Returns small, structured dicts (ok, data, error).
      - Caps rows for history/news to avoid huge payloads.
      - Suitable for use inside your 5-Whys discovery/domain steps.

    Usage:
        from agent_framework import ChatAgent
        from agent_framework.openai import OpenAIResponsesClient
        from app.agents.tools.yfinance_tool import YFinanceTool

        yf_tools = YFinanceTool()
        agent = ChatAgent(
            chat_client=OpenAIResponsesClient(),
            instructions="You can call finance tools to ground claims with market data.",
            tools=yf_tools.as_tools(),
        )
        # await agent.run("Get the last close and 1-month history for NESN.SW, and cite the numbers.")
    """

    def __init__(self, history_row_cap: int = 500, news_cap: int = 10):
        self.history_row_cap = max(1, int(history_row_cap))
        self.news_cap = max(1, int(news_cap))

    # -------------------------
    #  TOOLS (callables)
    # -------------------------

    def get_current_stock_price(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol, e.g., 'MSFT', 'NESN.SW'.")],
    ) -> Dict[str, Any]:
        """Fetch current/regular market price."""
        try:
            t = yf.Ticker(symbol)
            info = t.fast_info if hasattr(t, "fast_info") else {}
            # Prefer fast_info; fallback to .info
            price = getattr(info, "last_price", None) or info.get("last_price")
            currency = getattr(info, "currency", None) or info.get("currency")

            if price is None:
                # fallback to info (slower)
                i = t.info
                price = i.get("regularMarketPrice", i.get("currentPrice"))
                currency = i.get("currency", currency or "USD")

            if price is None:
                return {"ok": False, "symbol": symbol, "error": "Price unavailable"}

            return {
                "ok": True,
                "symbol": symbol,
                "price": float(price),
                "currency": currency or "USD",
                "as_of": _now_iso(),
            }
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    def get_company_info(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol.")],
    ) -> Dict[str, Any]:
        """Fetch general company profile/metadata."""
        try:
            info = yf.Ticker(symbol).info
            if not info:
                return {"ok": False, "symbol": symbol, "error": "Info unavailable"}
            data = {
                "Symbol": info.get("symbol", symbol),
                "Name": info.get("shortName") or info.get("longName"),
                "Sector": info.get("sector"),
                "Currency": info.get("currency", "USD"),
                "Current Stock Price": f"{info.get('regularMarketPrice', info.get('currentPrice'))} {info.get('currency', 'USD')}",
                "Market Cap": f"{info.get('marketCap', info.get('enterpriseValue'))} {info.get('currency', 'USD')}",
                "Industry": info.get("industry"),
                "Address": info.get("address1"),
                "City": info.get("city"),
                "State": info.get("state"),
                "Zip": info.get("zip"),
                "Country": info.get("country"),
                "EPS": info.get("trailingEps"),
                "P/E Ratio": info.get("trailingPE"),
                "52 Week Low": info.get("fiftyTwoWeekLow"),
                "52 Week High": info.get("fiftyTwoWeekHigh"),
                "50 Day Average": info.get("fiftyDayAverage"),
                "200 Day Average": info.get("twoHundredDayAverage"),
                "Website": info.get("website"),
                "Summary": info.get("longBusinessSummary"),
                "Analyst Recommendation": info.get("recommendationKey"),
                "Number Of Analyst Opinions": info.get("numberOfAnalystOpinions"),
                "Employees": info.get("fullTimeEmployees"),
                "Total Cash": info.get("totalCash"),
                "Free Cash flow": info.get("freeCashflow"),
                "Operating Cash flow": info.get("operatingCashflow"),
                "EBITDA": info.get("ebitda"),
                "Revenue Growth": info.get("revenueGrowth"),
                "Gross Margins": info.get("grossMargins"),
                "Ebitda Margins": info.get("ebitdaMargins"),

            }
            return {"ok": True, "symbol": symbol, "data": data, "as_of": _now_iso()}
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    def get_stock_fundamentals(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol.")],
    ) -> Dict[str, Any]:
        """Key fundamentals snapshot (compact)."""
        try:
            info = yf.Ticker(symbol).info
            if not info:
                return {"ok": False, "symbol": symbol, "error": "Fundamentals unavailable"}
            fundamentals = {
                "symbol": symbol,
                "company_name": info.get("longName") or info.get("shortName"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "market_cap": info.get("marketCap"),
                "pe_ratio_fwd": info.get("forwardPE"),
                "pb_ratio": info.get("priceToBook"),
                "dividend_yield": info.get("dividendYield"),
                "eps_trailing": info.get("trailingEps"),
                "beta": info.get("beta"),
                "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
                "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
                "currency": info.get("currency", "USD"),
            }
            return {"ok": True, "symbol": symbol, "data": fundamentals, "as_of": _now_iso()}
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    def get_historical_stock_prices(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol.")],
        period: Annotated[str, Field(description="1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max")] = "1mo",
        interval: Annotated[str, Field(description="1d,5d,1wk,1mo,3mo")] = "1d",
    ) -> Dict[str, Any]:
        """Historical OHLCV with a row cap."""
        try:
            hist = yf.Ticker(symbol).history(period=period, interval=interval)
            if hist is None or hist.empty:
                return {"ok": False, "symbol": symbol, "error": "No history"}

            hist = hist.tail(self.history_row_cap)
            rows = []
            for idx, row in hist.iterrows():
                dt = idx.to_pydatetime().replace(microsecond=0).isoformat()
                rows.append(
                    {
                        "date": dt,
                        "open": float(row.get("Open", 0.0)),
                        "high": float(row.get("High", 0.0)),
                        "low": float(row.get("Low", 0.0)),
                        "close": float(row.get("Close", 0.0)),
                        "volume": int(row.get("Volume", 0)) if not (row.get("Volume") != row.get("Volume")) else 0,  # NaN-safe
                    }
                )
            return {"ok": True, "symbol": symbol, "period": period, "interval": interval, "count": len(rows), "data": rows}
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    def get_analyst_recommendations(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol.")],
        max_rows: Annotated[int, Field(ge=1, le=1000, description="Cap result rows.")] = 100,
    ) -> Dict[str, Any]:
        """Analyst recommendations (if available)."""
        try:
            recs = yf.Ticker(symbol).recommendations
            if recs is None or recs.empty:
                return {"ok": False, "symbol": symbol, "error": "No recommendations"}

            recs = recs.tail(max_rows)
            rows = []
            for idx, row in recs.iterrows():
                dt = idx.to_pydatetime().replace(microsecond=0).isoformat()
                rows.append(
                    {
                        "date": dt,
                        "firm": str(row.get("Firm", "")),
                        "to_grade": str(row.get("To Grade", "")),
                        "from_grade": str(row.get("From Grade", "")),
                        "action": str(row.get("Action", "")),
                    }
                )
            return {"ok": True, "symbol": symbol, "count": len(rows), "data": rows}
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    def get_company_news(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol.")],
        num_stories: Annotated[int, Field(ge=1, le=50, description="Max number of stories to return.")] = 5,
    ) -> Dict[str, Any]:
        """Recent company news headlines with links."""
        try:
            news = yf.Ticker(symbol).news or []
            items = []
            for n in news[: min(self.news_cap, num_stories)]:
                items.append(
                    {
                        "title": n.get("title"),
                        "publisher": n.get("publisher"),
                        "link": n.get("link"),
                        "providerPublishTime": n.get("providerPublishTime"),
                        "type": n.get("type"),
                    }
                )
            return {"ok": True, "symbol": symbol, "count": len(items), "data": items}
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    def get_technical_indicators(
        self,
        symbol: Annotated[str, Field(description="Ticker symbol.")],
        period: Annotated[str, Field(description="1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max")] = "3mo",
    ) -> Dict[str, Any]:
        """Simple technical aggregates (SMA20/50/200) on close, capped."""
        try:
            hist = yf.Ticker(symbol).history(period=period, interval="1d")
            if hist is None or hist.empty:
                return {"ok": False, "symbol": symbol, "error": "No history"}

            close = hist["Close"].dropna()
            def _sma(series, n):
                return float(series.tail(n).mean()) if len(series) >= n else None

            indicators = {
                "SMA20": _sma(close, 20),
                "SMA50": _sma(close, 50),
                "SMA200": _sma(close, 200),
                "last_close": float(close.iloc[-1]) if not close.empty else None,
            }
            return {"ok": True, "symbol": symbol, "data": indicators}
        except Exception as e:
            return {"ok": False, "symbol": symbol, "error": str(e)}

    # -------------------------
    #  MAF integration helper
    # -------------------------
    def as_tools(self) -> List[object]:
        """
        Return list of tool functions for MAF ChatAgent.
        
        Example usage:
            from agent_framework import ChatAgent
            from agent_framework.openai import OpenAIChatClient
            from app.tools.yfinance_tool import YFinanceTool

            yf_tools = YFinanceTool()
            agent = ChatAgent(
                chat_client=OpenAIChatClient(),
                instructions="You can call finance tools to ground claims with market data.",
                tools=yf_tools.as_tools(),
            )
            # await agent.run("Get the last close and 1-month history for NESN.SW, and cite the numbers.")
        """
        return [
            self.get_current_stock_price,
            self.get_company_info,
            self.get_stock_fundamentals,
            self.get_historical_stock_prices,
            self.get_analyst_recommendations,
            self.get_company_news,
            self.get_technical_indicators,
        ]
