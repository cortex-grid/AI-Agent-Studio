"""
Memory persistence service using SQLite.
Stores conversation threads and message history.
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager


class MemoryStore:
    """
    SQLite-based conversation memory storage.
    Supports thread-based conversation history.
    """
    
    def __init__(self, db_path: str = "memory.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Threads table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    target TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            """)
            
            # Messages table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT,
                    FOREIGN KEY (thread_id) REFERENCES threads(id)
                )
            """)
            
            # Indexes
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_threads_project 
                ON threads(project_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_thread 
                ON messages(thread_id)
            """)
            
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """Get database connection with context manager."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    def create_thread(
        self,
        thread_id: str,
        project_id: str,
        target: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a new conversation thread."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO threads (id, project_id, target, metadata)
                VALUES (?, ?, ?, ?)
            """, (
                thread_id,
                project_id,
                target,
                json.dumps(metadata) if metadata else None
            ))
            conn.commit()
        return thread_id
    
    def add_message(
        self,
        thread_id: str,
        message_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Add a message to a thread."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO messages (id, thread_id, role, content, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (
                message_id,
                thread_id,
                role,
                content,
                json.dumps(metadata) if metadata else None
            ))
            
            # Update thread timestamp
            cursor.execute("""
                UPDATE threads SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (thread_id,))
            
            conn.commit()
    
    def get_messages(self, thread_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get messages from a thread."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, role, content, created_at, metadata
                FROM messages
                WHERE thread_id = ?
                ORDER BY created_at ASC
                LIMIT ?
            """, (thread_id, limit))
            
            messages = []
            for row in cursor.fetchall():
                messages.append({
                    "id": row["id"],
                    "role": row["role"],
                    "content": row["content"],
                    "created_at": row["created_at"],
                    "metadata": json.loads(row["metadata"]) if row["metadata"] else None
                })
            return messages
    
    def get_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        """Get thread details."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, project_id, target, created_at, updated_at, metadata
                FROM threads
                WHERE id = ?
            """, (thread_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            return {
                "id": row["id"],
                "project_id": row["project_id"],
                "target": row["target"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else None
            }
    
    def get_project_threads(self, project_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get all threads for a project."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, project_id, target, created_at, updated_at, metadata
                FROM threads
                WHERE project_id = ?
                ORDER BY updated_at DESC
                LIMIT ?
            """, (project_id, limit))
            
            threads = []
            for row in cursor.fetchall():
                threads.append({
                    "id": row["id"],
                    "project_id": row["project_id"],
                    "target": row["target"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "metadata": json.loads(row["metadata"]) if row["metadata"] else None
                })
            return threads
    
    def delete_thread(self, thread_id: str):
        """Delete a thread and all its messages."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM messages WHERE thread_id = ?", (thread_id,))
            cursor.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
            conn.commit()
    
    def get_conversation_context(
        self,
        thread_id: str,
        max_messages: int = 10
    ) -> List[Dict[str, str]]:
        """
        Get conversation context for MAF agents.
        Returns messages in format suitable for agent context.
        """
        messages = self.get_messages(thread_id, limit=max_messages)
        return [
            {"role": msg["role"], "content": msg["content"]}
            for msg in messages
        ]


# Singleton instance
_store: Optional[MemoryStore] = None


def get_memory_store(db_path: str = "memory.db") -> MemoryStore:
    """Get or create the memory store singleton."""
    global _store
    if _store is None:
        _store = MemoryStore(db_path)
    return _store
