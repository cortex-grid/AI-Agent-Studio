from typing import Dict, Any, List
from typing_extensions import Annotated
from pydantic import Field, BaseModel
import pandas as pd
from .pandas_tools import PandasTools

# Explicit Pydantic models to avoid forward reference issues
class DataFrameCreateInput(BaseModel):
    dataframe_name: str = Field(description="Name for the DataFrame")
    create_using_function: str = Field(description="One of read_csv/read_json/read_parquet/read_excel")
    function_parameters: Dict[str, Any] = Field(description="kwargs for pandas reader")

class DataFrameOperationInput(BaseModel):
    dataframe_name: str = Field(description="Existing DataFrame name")
    operation: str = Field(description="Allowed DataFrame operation")
    operation_parameters: Dict[str, Any] = Field(description="kwargs for operation")

class QuickSummaryInput(BaseModel):
    dataframe_name: str = Field(description="Existing DataFrame name")
    show_head: int = Field(default=5, ge=0, le=50, description="Number of rows to show in head")

class EnhancedPandasTools:
    def __init__(self):
        self.pt = PandasTools()

    def create_pandas_dataframe(self, input_data: DataFrameCreateInput) -> Dict[str, Any]:
        """Create a pandas DataFrame using specified reader function"""
        return self.pt.create_pandas_dataframe(
            input_data.dataframe_name, 
            input_data.create_using_function, 
            input_data.function_parameters
        )

    def run_dataframe_operation(self, input_data: DataFrameOperationInput) -> Dict[str, Any]:
        """Run an operation on an existing DataFrame"""
        return self.pt.run_dataframe_operation(
            input_data.dataframe_name, 
            input_data.operation, 
            input_data.operation_parameters
        )

    def quick_summary(self, input_data: QuickSummaryInput) -> Dict[str, Any]:
        """Get a quick summary of a DataFrame including head, dtypes, and null counts"""
        frames = self.pt._frames  # type: ignore
        if input_data.dataframe_name not in frames:
            return {"ok": False, "error": f"Unknown DataFrame: {input_data.dataframe_name}"}
        
        df: pd.DataFrame = frames[input_data.dataframe_name]
        dtypes = {c: str(t) for c, t in df.dtypes.items()}
        nulls = {c: int(df[c].isna().sum()) for c in df.columns}
        head = df.head(input_data.show_head)
        
        try:
            head_txt = head.to_markdown(index=False)
        except Exception:
            head_txt = head.to_string(index=False)
        
        return {
            "ok": True, 
            "shape": [int(df.shape[0]), int(df.shape[1])], 
            "dtypes": dtypes, 
            "nulls": nulls, 
            "head": head_txt
        }

    def as_tools(self) -> List[object]:
        return [self.create_pandas_dataframe, self.run_dataframe_operation, self.quick_summary]
