from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Optional

import pymysql
from pymysql.cursors import DictCursor

from llm_client import LlmBridgeClient
from storage import BotStorage, LlmCardState, StoredMessage, SyncTarget


logger = logging.getLogger(__name__)


class MindmapSyncService:
    def __init__(
        self,
        storage: BotStorage,
        mindmap_api_base: str = "",
        mindmap_api_token: str = "",
        *,
        db_host: str = "127.0.0.1",
        db_port: int = 3306,
        db_name: str = "",
        db_user: str = "",
        db_pass: str = "",
        llm_client: Optional[LlmBridgeClient] = None,
    ) -> None:
        self.storage = storage
        self.mindmap_api_base = mindmap_api_base
        self.mindmap_api_token = mindmap_api_token
        self.db_host = str(db_host or "127.0.0.1").strip() or "127.0.0.1"
        self.db_port = int(db_port or 3306)
        self.db_name = str(db_name or "").strip()
        self.db_user = str(db_user or "").strip()
        self.db_pass = str(db_pass or "")
        self.llm_client = llm_client

    def _connect(self):
        if not self.db_name or not self.db_user:
            raise RuntimeError("Mindmap DB settings are not configured")
        return pymysql.connect(
            host=self.db_host,
            port=self.db_port,
            user=self.db_user,
            password=self.db_pass,
            database=self.db_name,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
        )

    async def sync_target(self, target: SyncTarget, *, reason: str) -> str:
        try:
            scope = f"chat={target.chat_id}"
            if target.thread_id is not None:
                scope += f", thread={target.thread_id}"

            logger.info("Sync started for %s, reason=%s", scope, reason)
            messages = self.storage.list_messages_for_target(target_id=target.id, limit=500)
            existing_states = self.storage.list_llm_card_states(target_id=target.id)

            with self._connect() as conn:
                folder_id, project_id, cards_count = self._sync_to_mindmap(
                    conn,
                    target=target,
                    messages=messages,
                    existing_states=existing_states,
                )
                conn.commit()

            self.storage.update_mindmap_binding(
                target_id=target.id,
                folder_id=folder_id,
                project_id=project_id,
            )
            result_message = (
                f"Synced {len(messages)} message(s) to mindmap: "
                f"folder_id={folder_id}, project_id={project_id}, cards={cards_count}"
            )
            self.storage.mark_sync_result(target_id=target.id, status="ok", error=None)
            logger.info(result_message)
            return result_message
        except Exception as exc:
            self.storage.mark_sync_result(target_id=target.id, status="error", error=str(exc))
            logger.exception("Sync failed for target_id=%s", target.id)
            raise

    async def sync_all_enabled(self, *, reason: str) -> list[str]:
        results: list[str] = []
        for target in self.storage.list_enabled_targets():
            results.append(await self.sync_target(target, reason=reason))
        return results

    async def sync_chat_target(
        self,
        *,
        chat_id: int,
        thread_id: Optional[int],
        reason: str,
    ) -> str:
        target = self.storage.get_sync_target(chat_id=chat_id, thread_id=thread_id)
        if not target or not target.sync_enabled:
            raise ValueError("Current chat/topic is not subscribed for sync")
        return await self.sync_target(target, reason=reason)

    def _sync_to_mindmap(
        self,
        conn,
        *,
        target: SyncTarget,
        messages: list[StoredMessage],
        existing_states: list[LlmCardState],
    ) -> tuple[int, int, int]:
        local_owner_id = self._resolve_local_owner_id(conn, target=target)
        folder_id = self._ensure_folder(conn, local_owner_id=local_owner_id, target=target)
        project_id = self._ensure_project(conn, local_owner_id=local_owner_id, folder_id=folder_id, target=target, messages=messages)

        plan = self._build_plan(target=target, messages=messages, existing_states=existing_states)
        root_card_id = f"llm_{target.id}_root"
        root_title = self._truncate(plan.get("root_title") or self._project_title(target), 255)
        root_summary = str(plan.get("root_summary") or self._fallback_root_summary(target, messages)).strip()

        self._upsert_card(
            conn,
            project_id=project_id,
            card_id=root_card_id,
            title=root_title,
            content=root_summary,
            x=0.0,
            y=0.0,
            width=480.0,
            height=300.0,
            importance=3,
            urgency=3,
            color="#f4efe4",
            tasks=[],
        )

        desired_cards = self._normalize_plan_cards(plan.get("cards"), existing_states=existing_states, target_id=target.id)
        state_by_key = {item.sync_key: item for item in existing_states}

        for index, card in enumerate(desired_cards):
            x, y, from_side, to_side = self._compute_layout(index)
            parent_sync_key = card["parent_sync_key"]
            parent_card_id = root_card_id
            if parent_sync_key:
                parent_state = state_by_key.get(parent_sync_key)
                if parent_state:
                    parent_card_id = parent_state.card_id

            self._upsert_card(
                conn,
                project_id=project_id,
                card_id=card["card_id"],
                title=card["title"],
                content=card["content"],
                x=x,
                y=y,
                width=430.0,
                height=260.0,
                importance=2,
                urgency=2,
                color=self._status_color(card["status"]),
                tasks=card["tasks"],
            )
            self._ensure_connection(
                conn,
                project_id=project_id,
                from_card_id=parent_card_id,
                to_card_id=card["card_id"],
                from_side=from_side,
                to_side=to_side,
            )
            self.storage.upsert_llm_card_state(
                target_id=target.id,
                sync_key=card["sync_key"],
                card_id=card["card_id"],
                title=card["title"],
                status=card["status"],
                parent_sync_key=parent_sync_key,
            )
            state_by_key[card["sync_key"]] = LlmCardState(
                id=0,
                target_id=target.id,
                sync_key=card["sync_key"],
                card_id=card["card_id"],
                title=card["title"],
                status=card["status"],
                parent_sync_key=parent_sync_key,
                updated_at="",
            )

        desired_keys = {item["sync_key"] for item in desired_cards}
        stale_states = [state for state in existing_states if state.sync_key not in desired_keys]
        if stale_states:
            self._delete_cards_by_ids(conn, project_id=project_id, card_ids=[state.card_id for state in stale_states])
            self.storage.delete_llm_card_states(target_id=target.id, sync_keys=[state.sync_key for state in stale_states])

        return folder_id, project_id, len(desired_cards) + 1

    def _build_plan(self, *, target: SyncTarget, messages: list[StoredMessage], existing_states: list[LlmCardState]) -> dict:
        if not self.llm_client:
            raise RuntimeError("LLM client is not configured")

        prompt = self._build_llm_prompt(target=target, messages=messages, existing_states=existing_states)
        plan = self.llm_client.complete_json(prompt, timeout_ms=240000, max_tokens=2600)
        if not isinstance(plan, dict):
            raise RuntimeError("LLM plan is not an object")
        return plan

    def _build_llm_prompt(self, *, target: SyncTarget, messages: list[StoredMessage], existing_states: list[LlmCardState]) -> str:
        existing_payload = [
            {
                "sync_key": item.sync_key,
                "title": item.title,
                "status": item.status,
                "parent_sync_key": item.parent_sync_key,
            }
            for item in existing_states
        ]
        message_payload = [
            {
                "message_id": item.message_id,
                "author": item.author_name,
                "sent_at": item.sent_at,
                "text": item.text,
            }
            for item in messages[-200:]
        ]

        schema = {
            "root_title": "string",
            "root_summary": "string",
            "cards": [
                {
                    "sync_key": "stable-string-key-use-existing-when-same-task",
                    "title": "string",
                    "summary": "string",
                    "status": "todo|in_progress|done|blocked",
                    "parent_sync_key": "string-or-null",
                    "checklist": [{"text": "string", "done": True}],
                }
            ],
        }

        return (
            "You maintain a task tree for one Telegram topic inside a mindmap.\n"
            "You must return ONLY valid JSON.\n"
            "Do not include markdown.\n"
            "Do not rename existing work unless the messages clearly indicate that the task meaning changed.\n"
            "Reuse existing sync_key values for the same task.\n"
            "Create new sync_key values only for genuinely new tasks.\n"
            "A message may refine, complete, or block an existing task.\n"
            "If a task is completed in the messages, mark status=done and checklist items done when appropriate.\n"
            "Ignore pure chatter unless it changes task state.\n"
            "Return a compact but complete current structure, not just diffs.\n\n"
            f"Telegram group: {target.chat_title}\n"
            f"Telegram topic: {target.thread_title or 'whole chat'}\n\n"
            "Existing cards:\n"
            f"{json.dumps(existing_payload, ensure_ascii=False)}\n\n"
            "Recent messages:\n"
            f"{json.dumps(message_payload, ensure_ascii=False)}\n\n"
            "Return JSON with this shape:\n"
            f"{json.dumps(schema, ensure_ascii=False)}"
        )

    def _normalize_plan_cards(self, raw_cards: Any, *, existing_states: list[LlmCardState], target_id: int) -> list[dict]:
        existing_by_key = {item.sync_key: item for item in existing_states}
        cards: list[dict] = []
        for index, item in enumerate(raw_cards or []):
            if not isinstance(item, dict):
                continue
            sync_key = self._normalize_sync_key(item.get("sync_key") or f"task-{index+1}")
            if not sync_key:
                sync_key = f"task-{index+1}"
            title = self._truncate(str(item.get("title") or "").strip() or sync_key, 255)
            summary = str(item.get("summary") or "").strip()
            status = self._normalize_status(item.get("status"))
            parent_sync_key = self._normalize_sync_key(item.get("parent_sync_key")) if item.get("parent_sync_key") else None
            tasks = self._normalize_checklist(item.get("checklist"))
            state = existing_by_key.get(sync_key)
            card_id = state.card_id if state else self._make_card_id(target_id=target_id, sync_key=sync_key)
            cards.append(
                {
                    "sync_key": sync_key,
                    "card_id": card_id,
                    "title": title,
                    "content": self._build_card_content(summary=summary, status=status),
                    "status": status,
                    "parent_sync_key": parent_sync_key,
                    "tasks": tasks,
                }
            )
        return cards

    @staticmethod
    def _normalize_checklist(value: Any) -> list[dict]:
        items: list[dict] = []
        for index, item in enumerate(value or []):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            items.append(
                {
                    "id": f"chk_{index+1}_{hashlib.md5(text.encode('utf-8')).hexdigest()[:8]}",
                    "title": text[:255],
                    "done": bool(item.get("done")),
                    "time": 0.0,
                    "description": "",
                    "deadline": "",
                    "responsible": "",
                    "completed_at": None,
                }
            )
        return items

    @staticmethod
    def _build_card_content(*, summary: str, status: str) -> str:
        body = summary.strip()
        if body:
            return f"Status: {status}\n\n{body}"
        return f"Status: {status}"

    @staticmethod
    def _compute_layout(index: int) -> tuple[float, float, str, str]:
        column = index % 2
        row = index // 2
        x = 620.0 if column == 0 else -620.0
        y = float(row * 240)
        from_side = "right" if column == 0 else "left"
        to_side = "left" if column == 0 else "right"
        return x, y, from_side, to_side

    @staticmethod
    def _status_color(status: str) -> str:
        return {
            "todo": "#ffffff",
            "in_progress": "#fff4cc",
            "done": "#dff5e1",
            "blocked": "#ffdede",
        }.get(status, "#ffffff")

    @staticmethod
    def _normalize_status(value: Any) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"todo", "in_progress", "done", "blocked"}:
            return normalized
        return "todo"

    @staticmethod
    def _normalize_sync_key(value: Any) -> str:
        raw = str(value or "").strip().lower()
        raw = re.sub(r"[^a-z0-9_-]+", "-", raw)
        raw = re.sub(r"-{2,}", "-", raw).strip("-_")
        return raw[:80]

    @staticmethod
    def _make_card_id(*, target_id: int, sync_key: str) -> str:
        digest = hashlib.md5(sync_key.encode("utf-8")).hexdigest()[:16]
        return f"llm_{target_id}_{digest}"

    @staticmethod
    def _truncate(value: str, limit: int) -> str:
        text = str(value or "").strip()
        return text[:limit] if len(text) > limit else text

    def _resolve_local_owner_id(self, conn, *, target: SyncTarget) -> int:
        if target.owner_user_id is None:
            raise RuntimeError("Target has no owner_user_id")
        with conn.cursor() as cur:
            if target.owner_email:
                cur.execute(
                    """
                    SELECT id
                    FROM users
                    WHERE core_user_id = %s OR LOWER(email) = LOWER(%s)
                    ORDER BY CASE WHEN core_user_id = %s THEN 0 ELSE 1 END, id ASC
                    LIMIT 1
                    """,
                    (target.owner_user_id, target.owner_email, target.owner_user_id),
                )
            else:
                cur.execute("SELECT id FROM users WHERE core_user_id = %s LIMIT 1", (target.owner_user_id,))
            row = cur.fetchone()
        if not row:
            raise RuntimeError(f"Mindmap local user not found for Guido owner {target.owner_user_id}")
        return int(row["id"])

    def _ensure_folder(self, conn, *, local_owner_id: int, target: SyncTarget) -> int:
        folder_name = (target.chat_title or "").strip() or f"Telegram {target.chat_id}"
        folder_note = f"Autosynced from Telegram chat {target.chat_id}"
        with conn.cursor() as cur:
            if target.mindmap_folder_id:
                cur.execute("SELECT id FROM project_folders WHERE id = %s AND user_id = %s LIMIT 1", (target.mindmap_folder_id, local_owner_id))
                if cur.fetchone():
                    cur.execute("UPDATE project_folders SET name = %s, note = %s WHERE id = %s AND user_id = %s", (folder_name, folder_note, target.mindmap_folder_id, local_owner_id))
                    return int(target.mindmap_folder_id)
            cur.execute("SELECT id FROM project_folders WHERE user_id = %s AND name = %s ORDER BY id ASC LIMIT 1", (local_owner_id, folder_name))
            row = cur.fetchone()
            if row:
                folder_id = int(row["id"])
                cur.execute("UPDATE project_folders SET note = %s WHERE id = %s AND user_id = %s", (folder_note, folder_id, local_owner_id))
                return folder_id
            cur.execute("INSERT INTO project_folders (user_id, name, note, color) VALUES (%s, %s, %s, %s)", (local_owner_id, folder_name, folder_note, "#d7e8ff"))
            return int(cur.lastrowid)

    def _ensure_project(self, conn, *, local_owner_id: int, folder_id: int, target: SyncTarget, messages: list[StoredMessage]) -> int:
        project_title = self._project_title(target)
        project_note = self._build_project_note(target=target, messages=messages)
        with conn.cursor() as cur:
            if target.mindmap_project_id:
                cur.execute("SELECT id FROM projects WHERE id = %s AND owner_id = %s LIMIT 1", (target.mindmap_project_id, local_owner_id))
                if cur.fetchone():
                    cur.execute(
                        "UPDATE projects SET name = %s, note = %s, folder_id = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND owner_id = %s",
                        (project_title, project_note, folder_id, target.mindmap_project_id, local_owner_id),
                    )
                    return int(target.mindmap_project_id)
            cur.execute(
                "SELECT id FROM projects WHERE owner_id = %s AND folder_id = %s AND name = %s ORDER BY id ASC LIMIT 1",
                (local_owner_id, folder_id, project_title),
            )
            row = cur.fetchone()
            if row:
                project_id = int(row["id"])
                cur.execute("UPDATE projects SET note = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND owner_id = %s", (project_note, project_id, local_owner_id))
                return project_id
            cur.execute(
                "INSERT INTO projects (name, note, folder_id, owner_id, created_at, updated_at, archived, archived_at) VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, NULL)",
                (project_title, project_note, folder_id, local_owner_id),
            )
            return int(cur.lastrowid)

    @staticmethod
    def _project_title(target: SyncTarget) -> str:
        title = str(target.thread_title or "").strip()
        if title:
            return title[:255]
        chat_title = str(target.chat_title or "").strip()
        return (chat_title or f"Telegram {target.chat_id}")[:255]

    @staticmethod
    def _build_project_note(*, target: SyncTarget, messages: list[StoredMessage]) -> str:
        last_message = messages[-1].sent_at if messages else "none"
        return (
            f"Source: Telegram chat={target.chat_id}"
            + (f", thread={target.thread_id}" if target.thread_id is not None else "")
            + f"\nStored messages: {len(messages)}"
            + f"\nLast message: {last_message}"
            + "\nMode: AI sync from Telegram"
        )

    @staticmethod
    def _fallback_root_summary(target: SyncTarget, messages: list[StoredMessage]) -> str:
        lines = [
            f"Group: {target.chat_title}",
            f"Topic: {target.thread_title or 'whole chat'}",
            f"Messages: {len(messages)}",
            "",
            "Last messages:",
        ]
        for item in messages[-5:]:
            preview = re.sub(r"\s+", " ", item.text).strip()[:140]
            lines.append(f"- {item.author_name}: {preview}")
        return "\n".join(lines).strip()

    def _upsert_card(
        self,
        conn,
        *,
        project_id: int,
        card_id: str,
        title: str,
        content: str,
        x: float,
        y: float,
        width: float,
        height: float,
        importance: int,
        urgency: int,
        color: str,
        tasks: list[dict],
    ) -> None:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cards WHERE project_id = %s AND card_id = %s LIMIT 1", (project_id, card_id))
            row = cur.fetchone()
            if row:
                card_db_id = int(row["id"])
                cur.execute(
                    """
                    UPDATE cards
                    SET title = %s, content = %s, x = %s, y = %s, width = %s, height = %s,
                        importance = %s, urgency = %s, color = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    """,
                    (title, content, x, y, width, height, importance, urgency, color, card_db_id),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO cards (
                        project_id, card_id, x, y, width, height, content, title, type, is_main, importance, urgency, color
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'text', %s, %s, %s, %s)
                    """,
                    (project_id, card_id, x, y, width, height, content, title, 1 if card_id.endswith("_root") else 0, importance, urgency, color),
                )
                card_db_id = int(cur.lastrowid)
            cur.execute("DELETE FROM checklists WHERE card_id = %s", (card_db_id,))
            for task in tasks:
                cur.execute(
                    """
                    INSERT INTO checklists (card_id, task_id, text, checked, time, description, responsible, completed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        card_db_id,
                        str(task["id"]),
                        str(task["title"]),
                        1 if task.get("done") else 0,
                        float(task.get("time") or 0.0),
                        str(task.get("description") or ""),
                        str(task.get("responsible") or ""),
                        task.get("completed_at"),
                    ),
                )

    def _ensure_connection(self, conn, *, project_id: int, from_card_id: str, to_card_id: str, from_side: str, to_side: str) -> None:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM connections WHERE project_id = %s AND from_card_id = %s AND to_card_id = %s LIMIT 1",
                (project_id, from_card_id, to_card_id),
            )
            row = cur.fetchone()
            if row:
                cur.execute("UPDATE connections SET from_type = %s, to_type = %s WHERE id = %s", (from_side, to_side, int(row["id"])))
            else:
                cur.execute(
                    "INSERT INTO connections (project_id, from_card_id, to_card_id, from_type, to_type) VALUES (%s, %s, %s, %s, %s)",
                    (project_id, from_card_id, to_card_id, from_side, to_side),
                )

    def _delete_cards_by_ids(self, conn, *, project_id: int, card_ids: list[str]) -> None:
        if not card_ids:
            return
        placeholders = ", ".join(["%s"] * len(card_ids))
        with conn.cursor() as cur:
            cur.execute(f"SELECT id FROM cards WHERE project_id = %s AND card_id IN ({placeholders})", [project_id, *card_ids])
            rows = cur.fetchall()
            if not rows:
                return
            card_db_ids = [int(row["id"]) for row in rows]
            placeholders_db = ", ".join(["%s"] * len(card_db_ids))
            cur.execute(f"DELETE FROM checklists WHERE card_id IN ({placeholders_db})", card_db_ids)
            cur.execute(
                f"DELETE FROM connections WHERE project_id = %s AND (from_card_id IN ({placeholders}) OR to_card_id IN ({placeholders}))",
                [project_id, *card_ids, *card_ids],
            )
            cur.execute(f"DELETE FROM cards WHERE id IN ({placeholders_db})", card_db_ids)
