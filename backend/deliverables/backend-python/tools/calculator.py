"""
Wrapper module for the `calculator` subtype exposed by Agent Canvas.

The full implementation lives in `calculator_tools.py`; this module re-exports
the callable surface so the exporter can locate `tools/calculator.py` when
it normalises the subtype name.
"""

from .calculator_tools import CalculatorTools


class Calculator(CalculatorTools):
    """
    Backwards-compatible alias.  Consumers can instantiate `Calculator` or
    rely on the inherited `as_tools()` to retrieve individual operations.
    """

    pass


__all__ = ["Calculator", "CalculatorTools"]
