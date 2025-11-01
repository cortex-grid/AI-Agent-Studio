from __future__ import annotations
from typing import Any, Dict, List
from typing_extensions import Annotated
from pydantic import Field
import os
import pandas as pd

class PandasTools:
    ALLOWED_CREATE_FUNCS = {"read_csv","read_json","read_parquet","read_excel"}
    ALLOWED_DF_METHODS = {"head","tail","describe","rename","astype","drop","dropna","fillna","sort_values","to_markdown","to_json","to_csv"}
    BASE_DATA_DIR = os.getenv("PANDAS_TOOLS_BASE_DIR")

    def __init__(self):
        self._frames: Dict[str, pd.DataFrame] = {}

    def _coerce_path(self, path: str) -> str:
        if not self.BASE_DATA_DIR: return path
        norm = os.path.abspath(path); base = os.path.abspath(self.BASE_DATA_DIR)
        if not norm.startswith(base + os.sep) and norm != base:
            raise PermissionError(f"Access outside base dir is not allowed: {path}")
        return norm

    def _to_text(self, obj: Any, max_chars: int = 20000) -> str:
        try:
            if hasattr(obj, "to_markdown"): txt = obj.to_markdown(index=False)
            elif hasattr(obj, "to_string"): txt = obj.to_string()
            else: txt = str(obj)
        except Exception:
            txt = str(obj)
        return txt if len(txt) <= max_chars else (txt[:max_chars] + "\n... [truncated]")

    def create_pandas_dataframe(self, dataframe_name: Annotated[str, Field(description="Name for the DataFrame")], create_using_function: Annotated[str, Field(description="One of read_csv/read_json/read_parquet/read_excel")], function_parameters: Annotated[Dict[str, Any], Field(description="kwargs for pandas reader")]) -> Dict[str, Any]:
        try:
            if dataframe_name in self._frames:
                return {"ok": False, "error": f"DataFrame already exists: {dataframe_name}"}
            if create_using_function not in self.ALLOWED_CREATE_FUNCS:
                return {"ok": False, "error": f"Function '{create_using_function}' not allowed"}
            params = dict(function_parameters or {})
            for key in ("filepath_or_buffer","path_or_buf"):
                if key in params and isinstance(params[key], str):
                    params[key] = self._coerce_path(params[key])
            reader = getattr(pd, create_using_function)
            df = reader(**params)
            if df is None or not isinstance(df, pd.DataFrame) or df.empty:
                return {"ok": False, "error":"Failed to create non-empty DataFrame"}
            self._frames[dataframe_name] = df
            return {"ok": True, "dataframe_name": dataframe_name, "shape": [int(df.shape[0]), int(df.shape[1]) ]}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def run_dataframe_operation(self, dataframe_name: Annotated[str, Field(description="Existing DataFrame name")], operation: Annotated[str, Field(description="Allowed DataFrame op")], operation_parameters: Annotated[Dict[str, Any], Field(description="kwargs for op")]) -> Dict[str, Any]:
        try:
            if dataframe_name not in self._frames:
                return {"ok": False, "error": f"Unknown DataFrame: {dataframe_name}"}
            if operation not in self.ALLOWED_DF_METHODS:
                return {"ok": False, "error": f"Operation '{operation}' not allowed"}
            df = self._frames[dataframe_name]
            out = getattr(df, operation)(**(operation_parameters or {}))
            txt = self._to_text(out if hasattr(out,"head") else out)
            shape = [int(out.shape[0]), int(getattr(out,"shape",[0,0])[1])] if hasattr(out,"shape") else [0,0]
            return {"ok": True, "result": txt, "shape": shape}
        except Exception as e:
            return {"ok": False, "error": str(e)}
