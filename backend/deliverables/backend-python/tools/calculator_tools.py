from __future__ import annotations
from typing import Dict, Any, List
from typing_extensions import Annotated
from pydantic import Field
import math

class CalculatorTools:
    def __init__(self, enable_all: bool = True, **kwargs):
        self.enable_all = enable_all

    def add(self, a: Annotated[float, Field(description="First number")], b: Annotated[float, Field(description="Second number")]) -> Dict[str, Any]:
        return {"operation":"addition","result": a+b}
    def subtract(self, a: Annotated[float, Field()], b: Annotated[float, Field()]) -> Dict[str, Any]:
        return {"operation":"subtraction","result": a-b}
    def multiply(self, a: Annotated[float, Field()], b: Annotated[float, Field()]) -> Dict[str, Any]:
        return {"operation":"multiplication","result": a*b}
    def divide(self, a: Annotated[float, Field()], b: Annotated[float, Field()]) -> Dict[str, Any]:
        if b == 0: return {"operation":"division","error":"Division by zero is undefined"}
        try: return {"operation":"division","result": a/b}
        except Exception as e: return {"operation":"division","error": str(e)}
    def exponentiate(self, a: Annotated[float, Field()], b: Annotated[float, Field()]) -> Dict[str, Any]:
        return {"operation":"exponentiation","result": math.pow(a,b)}
    def factorial(self, n: Annotated[int, Field(ge=0)]) -> Dict[str, Any]:
        try: return {"operation":"factorial","result": math.factorial(n)}
        except ValueError: return {"operation":"factorial","error":"Factorial of a negative number is undefined"}
    def is_prime(self, n: Annotated[int, Field()]) -> Dict[str, Any]:
        if n <= 1: return {"operation":"prime_check","result": False}
        if n <= 3: return {"operation":"prime_check","result": True}
        if n % 2 == 0 or n % 3 == 0: return {"operation":"prime_check","result": False}
        i = 5
        while i*i <= n:
            if n % i == 0 or n % (i+2) == 0: return {"operation":"prime_check","result": False}
            i += 6
        return {"operation":"prime_check","result": True}
    def square_root(self, n: Annotated[float, Field()]) -> Dict[str, Any]:
        if n < 0: return {"operation":"square_root","error":"Square root of a negative number is undefined"}
        return {"operation":"square_root","result": math.sqrt(n)}
    def as_tools(self) -> List[object]:
        return [self.add,self.subtract,self.multiply,self.divide,self.exponentiate,self.factorial,self.is_prime,self.square_root]
