"""
CSV Toolkit for Microsoft Agent Framework.

Provides light-weight helpers for listing, reading, and querying CSV data
from whitelisted files or directories. Designed to be MAF compatible and
return structured dictionaries (`ok`, `data`, `error`) instead of raw strings.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from typing_extensions import Annotated
from pydantic import Field

SAMPLE_PROMPTS = [
    "List the available CSV datasets and summarize their columns.",
    "Read the first 20 rows from `sales_q1` and highlight top performers.",
    "Run `SELECT region, SUM(revenue) AS total FROM sales GROUP BY region` on the sales dataset.",
]


class CsvToolkit:
    """
    CSV helper toolset compatible with Microsoft Agent Framework.

    Configure the tool via `toolConfig`:
        {
            "directories": ["./data/csv"],
            "files": ["./exports/customers.csv"],
            "rowLimit": 200
        }

    Features:
      - Enumerate CSV files registered with the toolkit.
      - Read rows (with optional cap) into structured JSON.
      - Inspect header columns.
      - Execute ad-hoc SQL queries using DuckDB (optional dependency).
    """

    REQUIRED_SECRETS: List[str] = []

    def __init__(
        self,
        directories: Optional[Iterable[str]] = None,
        files: Optional[Iterable[str]] = None,
        row_limit: Optional[int] = None,
        duckdb_kwargs: Optional[Dict[str, Any]] = None,
    ):
        self._sources: List[Path] = []
        self._duckdb_kwargs = duckdb_kwargs or {}
        self.row_limit = int(row_limit) if row_limit else None

        for path_like in files or []:
            path = Path(path_like).expanduser().resolve()
            if path.is_file() and path.suffix.lower() == ".csv":
                self._sources.append(path)

        for dir_like in directories or []:
            dir_path = Path(dir_like).expanduser().resolve()
            if dir_path.is_dir():
                self._sources.extend(sorted(dir_path.glob("*.csv")))

        self._sources = sorted({p.resolve() for p in self._sources if p.exists()})

    # ------------------------------------------------------------------ #
    # Helper methods
    # ------------------------------------------------------------------ #
    def _ensure_file(self, csv_name: str) -> Optional[Path]:
        candidates = {p.stem: p for p in self._sources}
        return candidates.get(csv_name)

    def _limit_rows(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if self.row_limit is None:
            return rows
        return rows[: self.row_limit]

    def as_tools(self):
        return [
            self.list_csv_files,
            self.read_csv_file,
            self.get_columns,
            self.query_csv_file,
        ]

    # ------------------------------------------------------------------ #
    # Tools
    # ------------------------------------------------------------------ #
    def list_csv_files(self) -> Dict[str, Any]:
        """Return available CSV identifiers (stem names)."""
        files = [
            {"name": path.stem, "path": str(path)}
            for path in self._sources
        ]
        return {"ok": True, "files": files}

    def read_csv_file(
        self,
        csv_name: Annotated[str, Field(description="Registered CSV name (file stem).")],
        row_limit: Annotated[Optional[int], Field(description="Optional override row limit.")] = None,
    ) -> Dict[str, Any]:
        """Read rows from a registered CSV file."""
        path = self._ensure_file(csv_name)
        if not path:
            return {"ok": False, "error": f"CSV '{csv_name}' not configured.", "available": self.list_csv_files()["files"]}

        limit = row_limit if row_limit is not None else self.row_limit
        try:
            with path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                rows = list(reader)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to read '{csv_name}': {exc}"}

        if limit is not None:
            rows = rows[: max(0, int(limit))]

        return {"ok": True, "rows": rows, "count": len(rows), "truncated": limit is not None and len(rows) == limit}

    def get_columns(
        self,
        csv_name: Annotated[str, Field(description="Registered CSV name (file stem).")],
    ) -> Dict[str, Any]:
        """Return header columns for a CSV file."""
        path = self._ensure_file(csv_name)
        if not path:
            return {"ok": False, "error": f"CSV '{csv_name}' not configured.", "available": self.list_csv_files()["files"]}

        try:
            with path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                columns = reader.fieldnames or []
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to read columns: {exc}"}

        return {"ok": True, "columns": columns}

    def query_csv_file(
        self,
        csv_name: Annotated[str, Field(description="Registered CSV name (file stem).")],
        sql_query: Annotated[str, Field(description="DuckDB SQL query using the CSV name as table identifier.")],
    ) -> Dict[str, Any]:
        """Execute a DuckDB query over a registered CSV file."""
        path = self._ensure_file(csv_name)
        if not path:
            return {"ok": False, "error": f"CSV '{csv_name}' not configured.", "available": self.list_csv_files()["files"]}

        try:
            import duckdb
        except ImportError:  # pragma: no cover - optional dependency
            return {"ok": False, "error": "duckdb is required for queries. Install with `pip install duckdb`."}

        try:
            connection = duckdb.connect(**self._duckdb_kwargs)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Failed to open DuckDB connection: {exc}"}

        table_identifier = csv_name.replace("-", "_")

        try:
            connection.execute(f"CREATE TABLE {table_identifier} AS SELECT * FROM read_csv_auto('{path.as_posix()}');")
            formatted_sql = sql_query.replace("`", "").split(";")[0]
            result = connection.execute(formatted_sql)
            data = result.fetchall()
            columns = [col[0] for col in result.description] if result.description else []
            records = [
                {columns[idx]: value for idx, value in enumerate(row)}
                for row in data
            ]
            return {"ok": True, "columns": columns, "rows": records, "rowCount": len(records)}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Query failed: {exc}"}
        finally:
            try:
                connection.close()
            except Exception:
                pass
