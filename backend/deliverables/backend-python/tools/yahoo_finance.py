"""
Compatibility wrapper for the Yahoo Finance tool.

The canvas emits the subtype `yahoo-finance`, so the exporter looks for a
module named `yahoo_finance`. The existing implementation lives in
`yfinance_tool.py`, so we re-export its tool class here.
"""

from .yfinance_tool import YFinanceTool


class YahooFinanceTool(YFinanceTool):
    """
    Thin subclass so downstream code can instantiate `YahooFinanceTool`
    without needing to know about the original class name.
    """

    pass


__all__ = ["YahooFinanceTool", "YFinanceTool"]
