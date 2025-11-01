# app/agents/tools/neo4j_tool.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from typing_extensions import Annotated
from pydantic import Field

import os
import re

# pip install neo4j
try:
    from neo4j import GraphDatabase, basic_auth
except ImportError as e:
    raise ImportError("`neo4j` package is required. Install with: pip install neo4j") from e


class Neo4jTool:
    """
    Microsoft Agent Framework (MAF) compatible Neo4j tool.

    - Exposes MAF function tools: list_labels, list_relationship_types, get_schema, run_cypher_query
    - Read-first guardrails; writes disabled by default (allow_writes=False)
    - Works with Neo4j Aura, self-hosted bolt/neo4j schemes, and NEO4J_* env vars.

    ENV (defaults in parentheses):
      NEO4J_URI            (bolt://localhost:7687)
      NEO4J_USERNAME       (required if not passed to __init__)
      NEO4J_PASSWORD       (required if not passed to __init__)
      NEO4J_DATABASE       ("neo4j")
      NEO4J_TIMEOUT_SEC    ("15")

    Example usage:
     from agent_framework import ChatAgent
     from agent_framework.openai import OpenAIResponsesClient
     from app.agents.tools.neo4j_tool import Neo4jTool

     neo = Neo4jTool(allow_writes=False)   # keep read-only for safety
     agent = ChatAgent(
         chat_client=OpenAIResponsesClient(),
         instructions="You can query the graph using the provided tools. Prefer read-only operations.",
         tools=neo.as_tools(),
     )

     Example (async context):
     result = await agent.run("List all labels in the graph by calling list_labels, then summarize.")
    """

    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
        allow_writes: bool = False,
        timeout_sec: Optional[int] = None,
        verify_connectivity: bool = True,
    ) -> None:
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USERNAME")
        self.password = password or os.getenv("NEO4J_PASSWORD")
        if not self.user or not self.password:
            raise ValueError("Neo4j username/password are required (pass to constructor or set NEO4J_USERNAME/NEO4J_PASSWORD).")

        self.database = database or os.getenv("NEO4J_DATABASE", "neo4j")
        self.allow_writes = allow_writes
        self.timeout_sec = int(timeout_sec or os.getenv("NEO4J_TIMEOUT_SEC", "15"))

        self._driver = GraphDatabase.driver(self.uri, auth=basic_auth(self.user, self.password))
        if verify_connectivity:
            self._driver.verify_connectivity()

    # ------------------------
    #  Helpers / internal API
    # ------------------------
    def close(self) -> None:
        try:
            self._driver.close()
        except Exception:
            pass

    @staticmethod
    def _looks_like_write(query: str) -> bool:
        """Heuristic to detect write operations when mode='auto' or 'write'."""
        q = re.sub(r"/\*.*?\*/", "", query or "", flags=re.S).strip().lower()  # strip /* */ comments
        q = re.sub(r"//.*?$", "", q, flags=re.M)  # strip // comments
        # crude detection of mutating Cypher
        keywords = ("create ", "merge ", "delete ", "detach delete", "set ", "remove ", "call dbms", "load csv")
        return any(kw in q for kw in keywords)

    def _tx_run(self, tx, query: str, params: Optional[Dict[str, Any]], max_rows: int) -> List[Dict[str, Any]]:
        res = tx.run(query, **(params or {}))
        data = res.data()
        if max_rows > 0:
            data = data[:max_rows]
        return data

    # ------------------------
    #  Tools exposed to MAF
    # ------------------------
    def list_labels(self) -> List[str]:
        """
        Return all node labels in the database.
        """
        with self._driver.session(database=self.database, fetch_size=1000) as session:
            records = session.run("CALL db.labels()")
            return [r.get("label") for r in records if r.get("label") is not None]

    def list_relationship_types(self) -> List[str]:
        """
        Return all relationship types in the database.
        """
        with self._driver.session(database=self.database, fetch_size=1000) as session:
            records = session.run("CALL db.relationshipTypes()")
            return [r.get("relationshipType") for r in records if r.get("relationshipType") is not None]

    def get_schema(self) -> Dict[str, Any]:
        """
        Return schema visualization (nodes & relationships) from db.schema.visualization().
        """
        with self._driver.session(database=self.database, fetch_size=1000) as session:
            result = session.run("CALL db.schema.visualization()")
            data = result.data()
            # usually single row with 'nodes' and 'relationships'
            return data[0] if data else {"nodes": [], "relationships": []}

    def run_cypher_query(
        self,
        query: Annotated[str, Field(description="Cypher query to execute.")],
        params: Annotated[Optional[Dict[str, Any]], Field(description="Query parameters dictionary.")] = None,
        mode: Annotated[str, Field(description="'read' | 'write' | 'auto' (defaults to 'read').")] = "read",
        max_rows: Annotated[int, Field(ge=0, description="Maximum rows to return (0 = no cap).")] = 1000,
    ) -> Dict[str, Any]:
        """
        Execute a Cypher query with guardrails.

        Returns:
          {
            "ok": true/false,
            "mode": "read"|"write",
            "count": <int>,
            "data": [ ... rows ... ],
            "error": "<message-if-any>"
          }
        """
        try:
            effective_mode = (mode or "read").lower()
            if effective_mode not in ("read", "write", "auto"):
                effective_mode = "read"

            if effective_mode in ("auto",):
                if self._looks_like_write(query):
                    effective_mode = "write"
                else:
                    effective_mode = "read"

            if effective_mode == "write" and not self.allow_writes:
                return {"ok": False, "mode": "write", "count": 0, "data": [], "error": "Writes are disabled (allow_writes=False)."}

            with self._driver.session(database=self.database) as session:
                if effective_mode == "read":
                    data = session.execute_read(self._tx_run, query, params, max_rows)
                else:
                    data = session.execute_write(self._tx_run, query, params, max_rows)

            return {"ok": True, "mode": effective_mode, "count": len(data), "data": data}
        except Exception as e:
            return {"ok": False, "mode": mode, "count": 0, "data": [], "error": str(e)}

    # ------------------------
    #  MAF integration helper
    # ------------------------
    def as_tools(self) -> List[object]:
        """
        Return a list of callables suitable for MAF's ChatAgent(tools=[...]).
        """
        return [
            self.list_labels,
            self.list_relationship_types,
            self.get_schema,
            self.run_cypher_query,
        ]



