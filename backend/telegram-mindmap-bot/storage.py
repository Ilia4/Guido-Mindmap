from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass(slots=True)
class SyncTarget:
    id: int
    chat_id: int
    chat_title: str
    thread_id: Optional[int]
    thread_title: Optional[str]
    created_by_user_id: int
    created_by_username: str
    owner_user_id: Optional[int]
    owner_email: Optional[str]
    mindmap_folder_id: Optional[int]
    mindmap_project_id: Optional[int]
    sync_enabled: bool
    created_at: str
    updated_at: str
    last_synced_at: Optional[str]
    last_sync_status: Optional[str]
    last_sync_error: Optional[str]


@dataclass(slots=True)
class StoredMessage:
    id: int
    target_id: int
    message_id: int
    chat_id: int
    thread_id: Optional[int]
    telegram_user_id: int
    author_name: str
    text: str
    sent_at: str
    created_at: str


@dataclass(slots=True)
class LlmCardState:
    id: int
    target_id: int
    sync_key: str
    card_id: str
    title: str
    status: str
    parent_sync_key: Optional[str]
    updated_at: str


class BotStorage:
    def __init__(self, db_path: str) -> None:
        self.db_path = str(Path(db_path).expanduser().resolve())
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sync_targets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id INTEGER NOT NULL,
                    chat_title TEXT NOT NULL DEFAULT '',
                    thread_id INTEGER NULL,
                    thread_title TEXT NULL,
                    created_by_user_id INTEGER NOT NULL,
                    created_by_username TEXT NOT NULL DEFAULT '',
                    owner_user_id INTEGER NULL,
                    owner_email TEXT NULL,
                    mindmap_folder_id INTEGER NULL,
                    mindmap_project_id INTEGER NULL,
                    sync_enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_synced_at TEXT NULL,
                    last_sync_status TEXT NULL,
                    last_sync_error TEXT NULL,
                    UNIQUE(chat_id, thread_id)
                )
                """
            )
            columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info(sync_targets)").fetchall()}
            if "owner_user_id" not in columns:
                conn.execute("ALTER TABLE sync_targets ADD COLUMN owner_user_id INTEGER NULL")
            if "owner_email" not in columns:
                conn.execute("ALTER TABLE sync_targets ADD COLUMN owner_email TEXT NULL")
            if "mindmap_folder_id" not in columns:
                conn.execute("ALTER TABLE sync_targets ADD COLUMN mindmap_folder_id INTEGER NULL")
            if "mindmap_project_id" not in columns:
                conn.execute("ALTER TABLE sync_targets ADD COLUMN mindmap_project_id INTEGER NULL")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS stored_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_id INTEGER NOT NULL,
                    message_id INTEGER NOT NULL,
                    chat_id INTEGER NOT NULL,
                    thread_id INTEGER NULL,
                    telegram_user_id INTEGER NOT NULL,
                    author_name TEXT NOT NULL DEFAULT '',
                    text TEXT NOT NULL DEFAULT '',
                    sent_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(target_id, message_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_card_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_id INTEGER NOT NULL,
                    sync_key TEXT NOT NULL,
                    card_id TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'todo',
                    parent_sync_key TEXT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(target_id, sync_key),
                    UNIQUE(target_id, card_id)
                )
                """
            )

    def upsert_sync_target(
        self,
        *,
        chat_id: int,
        chat_title: str,
        thread_id: Optional[int],
        thread_title: Optional[str],
        created_by_user_id: int,
        created_by_username: str,
        owner_user_id: Optional[int],
        owner_email: Optional[str],
    ) -> SyncTarget:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT id
                FROM sync_targets
                WHERE chat_id = ? AND ((thread_id = ?) OR (thread_id IS NULL AND ? IS NULL))
                LIMIT 1
                """,
                (chat_id, thread_id, thread_id),
            ).fetchone()

            if existing:
                conn.execute(
                    """
                    UPDATE sync_targets
                    SET chat_title = ?,
                        thread_title = ?,
                        created_by_user_id = ?,
                        created_by_username = ?,
                        owner_user_id = ?,
                        owner_email = ?,
                        sync_enabled = 1,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        chat_title,
                        thread_title,
                        created_by_user_id,
                        created_by_username,
                        owner_user_id,
                        owner_email,
                        now,
                        int(existing["id"]),
                    ),
                )
                target_id = int(existing["id"])
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO sync_targets (
                        chat_id,
                        chat_title,
                        thread_id,
                        thread_title,
                        created_by_user_id,
                        created_by_username,
                        owner_user_id,
                        owner_email,
                        mindmap_folder_id,
                        mindmap_project_id,
                        sync_enabled,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)
                    """,
                    (
                        chat_id,
                        chat_title,
                        thread_id,
                        thread_title,
                        created_by_user_id,
                        created_by_username,
                        owner_user_id,
                        owner_email,
                        now,
                        now,
                    ),
                )
                target_id = int(cursor.lastrowid)

            row = conn.execute("SELECT * FROM sync_targets WHERE id = ?", (target_id,)).fetchone()

        return self._row_to_target(row)

    def disable_sync_target(self, *, chat_id: int, thread_id: Optional[int]) -> bool:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            result = conn.execute(
                """
                UPDATE sync_targets
                SET sync_enabled = 0,
                    updated_at = ?
                WHERE chat_id = ? AND ((thread_id = ?) OR (thread_id IS NULL AND ? IS NULL))
                """,
                (now, chat_id, thread_id, thread_id),
            )
            return int(result.rowcount or 0) > 0

    def get_sync_target(self, *, chat_id: int, thread_id: Optional[int]) -> Optional[SyncTarget]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM sync_targets
                WHERE chat_id = ? AND ((thread_id = ?) OR (thread_id IS NULL AND ? IS NULL))
                LIMIT 1
                """,
                (chat_id, thread_id, thread_id),
            ).fetchone()
        return self._row_to_target(row) if row else None

    def list_enabled_targets(self) -> list[SyncTarget]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM sync_targets
                WHERE sync_enabled = 1
                ORDER BY updated_at DESC, id DESC
                """
            ).fetchall()
        return [self._row_to_target(row) for row in rows]

    def mark_sync_result(
        self,
        *,
        target_id: int,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE sync_targets
                SET last_synced_at = ?,
                    last_sync_status = ?,
                    last_sync_error = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, status, error, now, target_id),
            )

    def update_mindmap_binding(
        self,
        *,
        target_id: int,
        folder_id: Optional[int],
        project_id: Optional[int],
    ) -> None:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE sync_targets
                SET mindmap_folder_id = ?,
                    mindmap_project_id = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (folder_id, project_id, now, target_id),
            )

    def store_message(
        self,
        *,
        target_id: int,
        message_id: int,
        chat_id: int,
        thread_id: Optional[int],
        telegram_user_id: int,
        author_name: str,
        text: str,
        sent_at: str,
    ) -> bool:
        now = datetime.utcnow().isoformat(timespec="seconds")
        clean_text = str(text or "").strip()
        if not clean_text:
            return False

        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT id
                FROM stored_messages
                WHERE target_id = ? AND message_id = ?
                LIMIT 1
                """,
                (target_id, message_id),
            ).fetchone()
            if existing:
                return False

            conn.execute(
                """
                INSERT INTO stored_messages (
                    target_id,
                    message_id,
                    chat_id,
                    thread_id,
                    telegram_user_id,
                    author_name,
                    text,
                    sent_at,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    target_id,
                    message_id,
                    chat_id,
                    thread_id,
                    telegram_user_id,
                    str(author_name or "").strip(),
                    clean_text,
                    sent_at,
                    now,
                ),
            )
        return True

    def list_messages_for_target(self, *, target_id: int, limit: int = 200) -> list[StoredMessage]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM stored_messages
                WHERE target_id = ?
                ORDER BY sent_at ASC, id ASC
                LIMIT ?
                """,
                (target_id, int(limit)),
            ).fetchall()
        return [self._row_to_message(row) for row in rows]

    def upsert_llm_card_state(
        self,
        *,
        target_id: int,
        sync_key: str,
        card_id: str,
        title: str,
        status: str,
        parent_sync_key: Optional[str],
    ) -> LlmCardState:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT id
                FROM llm_card_state
                WHERE target_id = ? AND sync_key = ?
                LIMIT 1
                """,
                (target_id, sync_key),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE llm_card_state
                    SET card_id = ?,
                        title = ?,
                        status = ?,
                        parent_sync_key = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (card_id, title, status, parent_sync_key, now, int(existing["id"])),
                )
                row_id = int(existing["id"])
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO llm_card_state (
                        target_id,
                        sync_key,
                        card_id,
                        title,
                        status,
                        parent_sync_key,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (target_id, sync_key, card_id, title, status, parent_sync_key, now),
                )
                row_id = int(cursor.lastrowid)

            row = conn.execute("SELECT * FROM llm_card_state WHERE id = ?", (row_id,)).fetchone()
        return self._row_to_llm_card_state(row)

    def list_llm_card_states(self, *, target_id: int) -> list[LlmCardState]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM llm_card_state
                WHERE target_id = ?
                ORDER BY updated_at ASC, id ASC
                """,
                (target_id,),
            ).fetchall()
        return [self._row_to_llm_card_state(row) for row in rows]

    def delete_llm_card_states(self, *, target_id: int, sync_keys: list[str]) -> None:
        if not sync_keys:
            return
        placeholders = ", ".join(["?"] * len(sync_keys))
        with self._connect() as conn:
            conn.execute(
                f"DELETE FROM llm_card_state WHERE target_id = ? AND sync_key IN ({placeholders})",
                (target_id, *sync_keys),
            )

    @staticmethod
    def _row_to_target(row: sqlite3.Row) -> SyncTarget:
        return SyncTarget(
            id=int(row["id"]),
            chat_id=int(row["chat_id"]),
            chat_title=str(row["chat_title"] or ""),
            thread_id=int(row["thread_id"]) if row["thread_id"] is not None else None,
            thread_title=str(row["thread_title"]) if row["thread_title"] is not None else None,
            created_by_user_id=int(row["created_by_user_id"]),
            created_by_username=str(row["created_by_username"] or ""),
            owner_user_id=int(row["owner_user_id"]) if row["owner_user_id"] is not None else None,
            owner_email=str(row["owner_email"]) if row["owner_email"] is not None else None,
            mindmap_folder_id=int(row["mindmap_folder_id"]) if row["mindmap_folder_id"] is not None else None,
            mindmap_project_id=int(row["mindmap_project_id"]) if row["mindmap_project_id"] is not None else None,
            sync_enabled=bool(row["sync_enabled"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            last_synced_at=str(row["last_synced_at"]) if row["last_synced_at"] is not None else None,
            last_sync_status=str(row["last_sync_status"]) if row["last_sync_status"] is not None else None,
            last_sync_error=str(row["last_sync_error"]) if row["last_sync_error"] is not None else None,
        )

    @staticmethod
    def _row_to_message(row: sqlite3.Row) -> StoredMessage:
        return StoredMessage(
            id=int(row["id"]),
            target_id=int(row["target_id"]),
            message_id=int(row["message_id"]),
            chat_id=int(row["chat_id"]),
            thread_id=int(row["thread_id"]) if row["thread_id"] is not None else None,
            telegram_user_id=int(row["telegram_user_id"]),
            author_name=str(row["author_name"] or ""),
            text=str(row["text"] or ""),
            sent_at=str(row["sent_at"]),
            created_at=str(row["created_at"]),
        )

    @staticmethod
    def _row_to_llm_card_state(row: sqlite3.Row) -> LlmCardState:
        return LlmCardState(
            id=int(row["id"]),
            target_id=int(row["target_id"]),
            sync_key=str(row["sync_key"] or ""),
            card_id=str(row["card_id"] or ""),
            title=str(row["title"] or ""),
            status=str(row["status"] or "todo"),
            parent_sync_key=str(row["parent_sync_key"]) if row["parent_sync_key"] is not None else None,
            updated_at=str(row["updated_at"]),
        )
