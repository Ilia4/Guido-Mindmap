import asyncio
import base64
import json
import logging
import math
import os
import re
import shutil
import time
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, create_engine, text

load_dotenv()

logger = logging.getLogger("mindmap_api")

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "")
DB_PASS = os.getenv("DB_PASS", "")
LEGACY_DB_HOST = os.getenv("LEGACY_DB_HOST", DB_HOST)
LEGACY_DB_PORT = os.getenv("LEGACY_DB_PORT", DB_PORT)
LEGACY_DB_NAME = os.getenv("LEGACY_DB_NAME", "phpmyadmin")
LEGACY_DB_USER = os.getenv("LEGACY_DB_USER", DB_USER)
LEGACY_DB_PASS = os.getenv("LEGACY_DB_PASS", DB_PASS)
LEGACY_SYNC_ENABLED = str(os.getenv("LEGACY_SYNC_ENABLED", "1")).strip().lower() not in {"0", "false", "no", "off"}
LEGACY_SYNC_VERSION = max(1, int(os.getenv("LEGACY_SYNC_VERSION", "3") or "3"))
GUIDO_CORE_URL = os.getenv("GUIDO_CORE_URL", "").rstrip("/")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

def _build_mysql_engine(host: str, port: str, db_name: str, user: str, password: str):
    dsn = f"mysql+pymysql://{user}:{password}@{host}:{port}/{db_name}?charset=utf8mb4"
    return create_engine(dsn, pool_pre_ping=True)

engine = _build_mysql_engine(DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS)
legacy_engine = _build_mysql_engine(LEGACY_DB_HOST, LEGACY_DB_PORT, LEGACY_DB_NAME, LEGACY_DB_USER, LEGACY_DB_PASS) if LEGACY_SYNC_ENABLED and LEGACY_DB_NAME and LEGACY_DB_USER else None

app = FastAPI(title="Mindmap API", version="0.4")

DEFAULT_LEGACY_UPLOAD_DIR = "/var/www/html/api/uploads"
LEGACY_UPLOAD_DIR = os.getenv("MINDMAP_LEGACY_UPLOAD_DIR", DEFAULT_LEGACY_UPLOAD_DIR)
LOCAL_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
UPLOAD_DIR = os.getenv("MINDMAP_UPLOAD_DIR", DEFAULT_LEGACY_UPLOAD_DIR)
if not os.path.isdir(UPLOAD_DIR):
    UPLOAD_DIR = LOCAL_UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

origins = [item.strip() for item in CORS_ORIGINS.split(",") if item.strip()] if CORS_ORIGINS else ["*"]
if not origins:
    origins = ["*"]
use_wildcard = len(origins) == 1 and origins[0] == "*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if use_wildcard else origins,
    allow_credentials=False if use_wildcard else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="mindmap_uploads")


class ProjectOut(BaseModel):
    id: int
    user_id: int
    title: str
    note: Optional[str] = None
    folder_id: Optional[int] = None
    folder_name: Optional[str] = None
    nodes: int = 0
    edges: int = 0
    pinned: bool = False
    archived: bool = False
    is_owner: bool = True
    share_permission: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class ProjectArchiveIn(BaseModel):
    archived: bool = True


class ProjectCreateIn(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    folder_id: Optional[int] = None


class ProjectUpdateIn(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    folder_id: Optional[int] = None


class ProjectFolderOut(BaseModel):
    id: int
    name: str
    note: Optional[str] = None
    color: Optional[str] = None
    projects_count: int = 0
    active_projects_count: int = 0
    archived_projects_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProjectFolderCreateIn(BaseModel):
    name: str
    note: Optional[str] = None
    color: Optional[str] = None


class ProjectFolderUpdateIn(BaseModel):
    name: Optional[str] = None
    note: Optional[str] = None
    color: Optional[str] = None


class ProjectShareIn(BaseModel):
    email: str
    permission: str = "write"


class ProjectShareOut(BaseModel):
    user_id: int
    username: str
    email: Optional[str] = None
    permission: str = "write"
    last_active: Optional[datetime] = None


class ProjectShareListOut(BaseModel):
    project_id: int
    owner_id: int
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    shares: List[ProjectShareOut] = Field(default_factory=list)


class ServiceNotificationOut(BaseModel):
    id: int
    kind: str
    service_id: str = "mindmap"
    service_label: str = "MindMap"
    title: str
    text: Optional[str] = None
    route: Optional[str] = None
    project_id: Optional[int] = None
    card_id: Optional[str] = None
    actor_user_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_email: Optional[str] = None
    created_at: Optional[datetime] = None
    read_at: Optional[datetime] = None


class NotificationReadIn(BaseModel):
    ids: List[int] = Field(default_factory=list)


class TaskIn(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None
    done: Optional[bool] = None
    checked: Optional[bool] = None
    description: Optional[str] = None
    time: Optional[float] = None
    deadline: Optional[str] = None
    responsible: Optional[str] = None
    responsibleId: Optional[int] = None
    responsibleName: Optional[str] = None
    completedAt: Optional[Any] = None


class DocumentUploadIn(BaseModel):
    name: str
    type: Optional[str] = None
    size: Optional[int] = None
    data: str


class CardUpdateIn(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    importance: Optional[Any] = None
    urgency: Optional[Any] = None
    deadline: Optional[str] = None
    color: Optional[str] = None
    tasks: List[TaskIn] = Field(default_factory=list)
    checklist: List[TaskIn] = Field(default_factory=list)


class CardCreateIn(BaseModel):
    id: Optional[str] = None
    parentId: Optional[str] = None
    side: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    importance: Optional[Any] = None
    urgency: Optional[Any] = None
    color: Optional[str] = None


class CardOut(BaseModel):
    id: str
    x: float
    y: float
    width: float = 420
    height: float = 260
    title: str
    content: str = ""
    color: Optional[str] = None
    importance: Optional[int] = None
    urgency: Optional[int] = None
    deadline: Optional[str] = None
    totalHours: float = 0
    docsCount: int = 0
    imagesCount: int = 0
    tasksTotal: int = 0
    tasksDone: int = 0
    documents: List[Dict[str, Any]] = Field(default_factory=list)
    tasks: List[Dict[str, Any]] = Field(default_factory=list)


class LinkOut(BaseModel):
    id: str
    from_: str = Field(alias="from")
    to: str
    fromSide: Optional[str] = None
    toSide: Optional[str] = None


class BoardOut(BaseModel):
    project_id: int
    cards: List[CardOut] = Field(default_factory=list)
    links: List[LinkOut] = Field(default_factory=list)


@app.get("/health")
def health():
    return {"ok": True}


def _require_bearer(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header (expected Bearer token)")

    return parts[1].strip()


def _core_me(token: str) -> Dict[str, Any]:
    if not GUIDO_CORE_URL:
        raise HTTPException(status_code=500, detail="GUIDO_CORE_URL is not set")

    url = f"{GUIDO_CORE_URL}/auth/me"
    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(url, headers={"Authorization": f"Bearer {token}"})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to reach Guido Core: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail=f"Guido Core /auth/me rejected token (status {response.status_code})")

    data = response.json()
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="Guido Core /auth/me returned non-object JSON")
    return data


def _pick_core_fields(me: Dict[str, Any]) -> Tuple[int, Optional[str], Optional[str]]:
    core_id = (
        me.get("id")
        or me.get("user_id")
        or (me.get("user") or {}).get("id")
        or (me.get("data") or {}).get("id")
    )
    if core_id is None:
        raise HTTPException(status_code=500, detail="Guido Core /auth/me response: cannot find user id")

    email = (
        me.get("email")
        or (me.get("user") or {}).get("email")
        or (me.get("data") or {}).get("email")
    )
    username = (
        me.get("username")
        or me.get("name")
        or (me.get("user") or {}).get("username")
        or (me.get("user") or {}).get("name")
        or (me.get("data") or {}).get("username")
        or (me.get("data") or {}).get("name")
    )

    return int(core_id), (email or None), (username or None)


def _resolve_authenticated_user(authorization: Optional[str]) -> Dict[str, Any]:
    token = _require_bearer(authorization)
    me = _core_me(token)
    core_user_id, email, username = _pick_core_fields(me)
    local_user_id = _ensure_local_user(core_user_id=core_user_id, email=email, username_hint=username)
    _maybe_sync_legacy_user_data(local_user_id=local_user_id, email=email, username_hint=username)
    return {
        "token": token,
        "core_user_id": core_user_id,
        "local_user_id": local_user_id,
        "email": email,
        "username": username,
    }


def _ensure_local_user(core_user_id: int, email: Optional[str], username_hint: Optional[str]) -> int:
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id FROM users WHERE core_user_id = :cid LIMIT 1"),
            {"cid": core_user_id},
        ).mappings().first()
        if row:
            return int(row["id"])

        if email:
            row = conn.execute(
                text("SELECT id FROM users WHERE email = :email LIMIT 1"),
                {"email": email},
            ).mappings().first()
            if row:
                conn.execute(
                    text("UPDATE users SET core_user_id = :cid WHERE id = :id"),
                    {"cid": core_user_id, "id": int(row["id"])},
                )
                return int(row["id"])

        base_username = (username_hint or (email.split("@")[0] if email else None) or f"user{core_user_id}").strip()
        candidate = (base_username[:50] or f"user{core_user_id}")

        exists = conn.execute(
            text("SELECT 1 FROM users WHERE username = :username LIMIT 1"),
            {"username": candidate},
        ).first()
        if exists:
            candidate = (candidate[:40] + f"_{core_user_id}")[:50]

        conn.execute(
            text(
                """
                INSERT INTO users (username, password, email, core_user_id)
                VALUES (:username, :password, :email, :cid)
                """
            ),
            {
                "username": candidate,
                "password": "CORE_ONLY_NO_PASSWORD",
                "email": email,
                "cid": core_user_id,
            },
        )
        new_id = conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()
        return int(new_id["id"])


def _normalize_email(value: Any) -> Optional[str]:
    email = str(value or "").strip().lower()
    return email or None


def _ensure_project_columns(conn) -> None:
    columns = {
        "note": "ALTER TABLE projects ADD COLUMN note TEXT NULL AFTER name",
        "archived": "ALTER TABLE projects ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0 AFTER updated_at",
        "archived_at": "ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER archived",
        "folder_id": "ALTER TABLE projects ADD COLUMN folder_id INT NULL AFTER note",
    }
    for name, sql in columns.items():
        if not conn.execute(text(f"SHOW COLUMNS FROM projects LIKE '{name}'")).first():
            conn.execute(text(sql))


def _ensure_project_folders_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS project_folders (
              id INT NOT NULL AUTO_INCREMENT,
              user_id INT NOT NULL,
              name VARCHAR(255) NOT NULL,
              note TEXT NULL,
              color VARCHAR(20) NULL,
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_project_folders_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )

    required_columns = {
        "note": "ALTER TABLE project_folders ADD COLUMN note TEXT NULL AFTER name",
        "color": "ALTER TABLE project_folders ADD COLUMN color VARCHAR(20) NULL AFTER note",
        "created_at": "ALTER TABLE project_folders ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER color",
        "updated_at": "ALTER TABLE project_folders ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at",
    }
    for column_name, alter_sql in required_columns.items():
        exists = conn.execute(text(f"SHOW COLUMNS FROM project_folders LIKE '{column_name}'")).first()
        if not exists:
            conn.execute(text(alter_sql))


def _normalize_folder_name(value: Any) -> str:
    name = str(value or "").strip()
    return name[:255] or "Новая папка"


def _normalize_folder_note(value: Any) -> Optional[str]:
    note = str(value or "").strip()
    return note or None


def _normalize_folder_color(value: Any) -> Optional[str]:
    color = str(value or "").strip()
    if not color:
        return None
    if re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        return color.lower()
    return None


def _resolve_project_folder_id(conn, user_id: int, folder_id: Optional[Any]) -> Optional[int]:
    if folder_id in (None, "", 0, "0"):
        return None
    try:
        normalized = int(folder_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid folder_id")
    if normalized <= 0:
        return None
    _ensure_project_folders_table(conn)
    exists = conn.execute(
        text(
            """
            SELECT id
            FROM project_folders
            WHERE id = :folder_id
              AND user_id = :user_id
            LIMIT 1
            """
        ),
        {"folder_id": normalized, "user_id": user_id},
    ).mappings().first()
    if not exists:
        raise HTTPException(status_code=404, detail="Folder not found")
    return normalized


def _ensure_legacy_sync_table(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS legacy_sync_state (
          user_id INT NOT NULL,
          legacy_email VARCHAR(255) NULL,
          sync_version INT NOT NULL DEFAULT 0,
          last_synced_at DATETIME NULL,
          last_error TEXT NULL,
          PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """))


def _set_legacy_sync_state(conn, user_id: int, email: Optional[str], sync_version: int, error: Optional[str] = None) -> None:
    conn.execute(text("""
        INSERT INTO legacy_sync_state (user_id, legacy_email, sync_version, last_synced_at, last_error)
        VALUES (:user_id, :legacy_email, :sync_version, :last_synced_at, :last_error)
        ON DUPLICATE KEY UPDATE
          legacy_email = VALUES(legacy_email),
          sync_version = VALUES(sync_version),
          last_synced_at = VALUES(last_synced_at),
          last_error = VALUES(last_error)
    """), {
        "user_id": user_id,
        "legacy_email": _normalize_email(email),
        "sync_version": sync_version,
        "last_synced_at": datetime.utcnow(),
        "last_error": str(error or "").strip() or None,
    })


def _ensure_shadow_user(conn, email: Any, username: Any) -> int:
    normalized_email = _normalize_email(email)
    username_value = str(username or "").strip()
    if normalized_email:
        row = conn.execute(text("SELECT id FROM users WHERE LOWER(email) = :email LIMIT 1"), {"email": normalized_email}).mappings().first()
        if row:
            return int(row["id"])
    if username_value:
        row = conn.execute(text("SELECT id, email FROM users WHERE username = :username LIMIT 1"), {"username": username_value}).mappings().first()
        if row:
            if normalized_email and not _normalize_email(row.get("email")):
                conn.execute(text("UPDATE users SET email = :email WHERE id = :id"), {"email": normalized_email, "id": int(row["id"])})
            return int(row["id"])
    base = (username_value or (normalized_email.split("@")[0] if normalized_email else "legacy_user"))[:50] or "legacy_user"
    candidate = base
    suffix = 1
    while conn.execute(text("SELECT 1 FROM users WHERE username = :username LIMIT 1"), {"username": candidate}).first():
        candidate = f"{base[:40]}_{suffix}"[:50]
        suffix += 1
    conn.execute(text("INSERT INTO users (username, password, email) VALUES (:username, :password, :email)"), {
        "username": candidate,
        "password": "LEGACY_SYNC_ONLY",
        "email": normalized_email,
    })
    return int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])


def _legacy_document_values(row: Dict[str, Any]) -> Tuple[Optional[str], str, int]:
    path = str(row.get("filepath") or "").strip() or None
    url = str(row.get("file_url") or "").strip()
    if path and os.path.exists(path):
        name = os.path.basename(path)
        target = os.path.join(UPLOAD_DIR, name)
        if os.path.abspath(os.path.dirname(path)) != os.path.abspath(UPLOAD_DIR):
            if not os.path.exists(target):
                shutil.copy2(path, target)
            path = target
        return path, _public_file_url(None, path), int(row.get("filesize") or 0)
    return path, _public_file_url(url, path), int(row.get("filesize") or 0)


def _sync_legacy_full(conn, local_user_id: int, email: Optional[str], username_hint: Optional[str]) -> None:
    if legacy_engine is None:
        return
    email = _normalize_email(email)
    username = str(username_hint or "").strip()
    with legacy_engine.connect() as legacy_conn:
        users: List[Dict[str, Any]] = []
        seen: set[int] = set()
        if email:
            for row in legacy_conn.execute(text("SELECT id, username, email FROM users WHERE LOWER(email) = :email ORDER BY id"), {"email": email}).mappings().all():
                if int(row["id"]) not in seen:
                    seen.add(int(row["id"])); users.append(dict(row))
        if username:
            for row in legacy_conn.execute(text("SELECT id, username, email FROM users WHERE username = :username ORDER BY id"), {"username": username}).mappings().all():
                if int(row["id"]) not in seen:
                    seen.add(int(row["id"])); users.append(dict(row))
        if not users:
            return
        user_ids = sorted(int(row["id"]) for row in users)
        projects = legacy_conn.execute(text("SELECT DISTINCT p.id, p.name, p.owner_id, p.created_at, p.updated_at FROM projects p LEFT JOIN project_shares ps ON ps.project_id = p.id WHERE p.owner_id IN :user_ids OR ps.user_id IN :user_ids ORDER BY p.id").bindparams(bindparam("user_ids", expanding=True)), {"user_ids": user_ids}).mappings().all()
        if not projects:
            return
        project_ids = sorted(int(row["id"]) for row in projects)
        shares = legacy_conn.execute(text("SELECT project_id, user_id, permission, last_active FROM project_shares WHERE project_id IN :project_ids ORDER BY id").bindparams(bindparam("project_ids", expanding=True)), {"project_ids": project_ids}).mappings().all()
        involved = set(user_ids)
        involved.update(int(row["owner_id"]) for row in projects)
        involved.update(int(row["user_id"]) for row in shares)
        legacy_users = {int(row["id"]): dict(row) for row in legacy_conn.execute(text("SELECT id, username, email FROM users WHERE id IN :user_ids ORDER BY id").bindparams(bindparam("user_ids", expanding=True)), {"user_ids": sorted(involved)}).mappings().all()}
        local_users: Dict[int, int] = {}
        for legacy_id, row in legacy_users.items():
            row_email = _normalize_email(row.get("email"))
            row_username = str(row.get("username") or "").strip()
            if email and row_email == email:
                local_users[legacy_id] = local_user_id
            elif legacy_id in seen and username and not row_email and row_username == username:
                local_users[legacy_id] = local_user_id
            else:
                local_users[legacy_id] = _ensure_shadow_user(conn, row.get("email"), row.get("username"))
        project_map: Dict[int, int] = {}
        owner_map: Dict[int, int] = {}
        for row in projects:
            old_id = int(row["id"])
            owner_id = int(local_users.get(int(row["owner_id"]), local_user_id))
            name = str(row.get("name") or "").strip() or f"Project #{old_id}"
            existing = conn.execute(text("SELECT id, owner_id, name FROM projects WHERE id = :project_id LIMIT 1"), {"project_id": old_id}).mappings().first()
            if existing and (int(existing["owner_id"]) == owner_id or str(existing.get("name") or "").strip() == name):
                new_id = int(existing["id"])
            else:
                existing = None
                if row.get("created_at") is not None:
                    existing = conn.execute(text("SELECT id FROM projects WHERE owner_id = :owner_id AND name = :name AND created_at = :created_at LIMIT 1"), {"owner_id": owner_id, "name": name, "created_at": row.get("created_at")}).mappings().first()
                if not existing:
                    existing = conn.execute(text("SELECT id FROM projects WHERE owner_id = :owner_id AND name = :name ORDER BY id LIMIT 1"), {"owner_id": owner_id, "name": name}).mappings().first()
                if existing:
                    new_id = int(existing["id"])
                elif not conn.execute(text("SELECT 1 FROM projects WHERE id = :project_id LIMIT 1"), {"project_id": old_id}).first():
                    conn.execute(text("INSERT INTO projects (id, name, owner_id, created_at, updated_at, archived, archived_at) VALUES (:project_id, :name, :owner_id, :created_at, :updated_at, 0, NULL)"), {"project_id": old_id, "name": name, "owner_id": owner_id, "created_at": row.get("created_at"), "updated_at": row.get("updated_at")})
                    new_id = old_id
                else:
                    conn.execute(text("INSERT INTO projects (name, owner_id, created_at, updated_at, archived, archived_at) VALUES (:name, :owner_id, :created_at, :updated_at, 0, NULL)"), {"name": name, "owner_id": owner_id, "created_at": row.get("created_at"), "updated_at": row.get("updated_at")})
                    new_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])
            project_map[old_id] = new_id
            owner_map[new_id] = owner_id
        cards = legacy_conn.execute(text("SELECT id, project_id, card_id, x, y, width, height, content, title, type, is_main, importance, urgency, color, created_at, updated_at FROM cards WHERE project_id IN :project_ids ORDER BY id").bindparams(bindparam("project_ids", expanding=True)), {"project_ids": project_ids}).mappings().all()
        card_map: Dict[int, Dict[str, Any]] = {}
        for row in cards:
            old_card_id = int(row["id"])
            project_id = project_map.get(int(row["project_id"]))
            if not project_id:
                continue
            card_uid = str(row.get("card_id") or f"legacy_card_{old_card_id}")
            existing = conn.execute(text("SELECT id FROM cards WHERE project_id = :project_id AND card_id = :card_id LIMIT 1"), {"project_id": project_id, "card_id": card_uid}).mappings().first()
            if existing:
                new_card_db_id = int(existing["id"])
            elif not conn.execute(text("SELECT 1 FROM cards WHERE id = :card_id LIMIT 1"), {"card_id": old_card_id}).first():
                conn.execute(text("INSERT INTO cards (id, project_id, card_id, x, y, width, height, content, title, type, is_main, importance, urgency, color, created_at, updated_at) VALUES (:id, :project_id, :card_id, :x, :y, :width, :height, :content, :title, :type, :is_main, :importance, :urgency, :color, :created_at, :updated_at)"), {"id": old_card_id, "project_id": project_id, "card_id": card_uid, "x": float(row.get("x") or 0), "y": float(row.get("y") or 0), "width": row.get("width"), "height": row.get("height"), "content": str(row.get("content") or "").strip(), "title": str(row.get("title") or "").strip() or None, "type": str(row.get("type") or "text"), "is_main": 1 if row.get("is_main") else 0, "importance": _coalesce_scale_value(row.get("importance"), 1), "urgency": _coalesce_scale_value(row.get("urgency"), 1), "color": _normalize_color(row.get("color")), "created_at": row.get("created_at"), "updated_at": row.get("updated_at")})
                new_card_db_id = old_card_id
            else:
                conn.execute(text("INSERT INTO cards (project_id, card_id, x, y, width, height, content, title, type, is_main, importance, urgency, color, created_at, updated_at) VALUES (:project_id, :card_id, :x, :y, :width, :height, :content, :title, :type, :is_main, :importance, :urgency, :color, :created_at, :updated_at)"), {"project_id": project_id, "card_id": card_uid, "x": float(row.get("x") or 0), "y": float(row.get("y") or 0), "width": row.get("width"), "height": row.get("height"), "content": str(row.get("content") or "").strip(), "title": str(row.get("title") or "").strip() or None, "type": str(row.get("type") or "text"), "is_main": 1 if row.get("is_main") else 0, "importance": _coalesce_scale_value(row.get("importance"), 1), "urgency": _coalesce_scale_value(row.get("urgency"), 1), "color": _normalize_color(row.get("color")), "created_at": row.get("created_at"), "updated_at": row.get("updated_at")})
                new_card_db_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])
            card_map[old_card_id] = {"db_id": new_card_db_id, "project_id": project_id, "card_id": card_uid}
        if not card_map:
            return
        old_card_ids = sorted(card_map.keys())
        for row in legacy_conn.execute(text("SELECT project_id, from_card_id, to_card_id, from_type, to_type FROM connections WHERE project_id IN :project_ids ORDER BY id").bindparams(bindparam("project_ids", expanding=True)), {"project_ids": project_ids}).mappings().all():
            params = {"project_id": project_map.get(int(row["project_id"]), 0), "from_card_id": str(row.get("from_card_id") or "").strip(), "to_card_id": str(row.get("to_card_id") or "").strip(), "from_type": _normalize_connection_side(row.get("from_type")), "to_type": _normalize_connection_side(row.get("to_type"))}
            if not params["project_id"] or not params["from_card_id"] or not params["to_card_id"]:
                continue
            if not conn.execute(text("SELECT 1 FROM connections WHERE project_id = :project_id AND from_card_id = :from_card_id AND to_card_id = :to_card_id AND from_type = :from_type AND to_type = :to_type LIMIT 1"), params).first():
                conn.execute(text("INSERT INTO connections (project_id, from_card_id, to_card_id, from_type, to_type) VALUES (:project_id, :from_card_id, :to_card_id, :from_type, :to_type)"), params)
        for row in legacy_conn.execute(text("SELECT id, card_id, task_id, text, checked, time, description, responsible, completed_at, created_at FROM checklists WHERE card_id IN :card_ids ORDER BY id").bindparams(bindparam("card_ids", expanding=True)), {"card_ids": old_card_ids}).mappings().all():
            mapping = card_map.get(int(row["card_id"]))
            if not mapping:
                continue
            task_id = str(row.get("task_id") or f"legacy_task_{row.get('id') or uuid.uuid4().hex[:12]}")
            params = {"card_id": int(mapping["db_id"]), "task_id": task_id}
            if conn.execute(text("SELECT 1 FROM checklists WHERE card_id = :card_id AND task_id = :task_id LIMIT 1"), params).first():
                continue
            conn.execute(text("INSERT INTO checklists (card_id, task_id, text, checked, time, description, responsible, completed_at, created_at) VALUES (:card_id, :task_id, :text, :checked, :time, :description, :responsible, :completed_at, :created_at)"), {**params, "text": str(row.get("text") or "").strip(), "checked": 1 if row.get("checked") else 0, "time": _normalize_hours(row.get("time")), "description": str(row.get("description") or "").strip() or None, "responsible": str(row.get("responsible") or "").strip() or None, "completed_at": row.get("completed_at"), "created_at": row.get("created_at")})
        for row in legacy_conn.execute(text("SELECT id, card_id, task_id, deadline, created_at FROM deadlines WHERE card_id IN :card_ids ORDER BY id").bindparams(bindparam("card_ids", expanding=True)), {"card_ids": old_card_ids}).mappings().all():
            mapping = card_map.get(int(row["card_id"]))
            if not mapping:
                continue
            deadline = _parse_date_string(row.get("deadline"))
            if not deadline:
                continue
            params = {"card_id": int(mapping["db_id"]), "task_id": str(row.get("task_id") or "").strip() or None, "deadline": deadline}
            if not conn.execute(text("SELECT 1 FROM deadlines WHERE card_id = :card_id AND ((task_id = :task_id) OR (task_id IS NULL AND :task_id IS NULL)) AND deadline = :deadline LIMIT 1"), params).first():
                conn.execute(text("INSERT INTO deadlines (card_id, task_id, deadline, created_at) VALUES (:card_id, :task_id, :deadline, :created_at)"), {**params, "created_at": row.get("created_at")})
        for row in legacy_conn.execute(text("SELECT id, card_id, doc_id, filename, filepath, file_url, filetype, filesize, created_at FROM documents WHERE card_id IN :card_ids ORDER BY id").bindparams(bindparam("card_ids", expanding=True)), {"card_ids": old_card_ids}).mappings().all():
            mapping = card_map.get(int(row["card_id"]))
            if not mapping:
                continue
            doc_id = str(row.get("doc_id") or f"legacy_doc_{row.get('id') or uuid.uuid4().hex[:12]}")
            params = {"card_id": int(mapping["db_id"]), "doc_id": doc_id}
            if conn.execute(text("SELECT 1 FROM documents WHERE card_id = :card_id AND doc_id = :doc_id LIMIT 1"), params).first():
                continue
            path, url, size = _legacy_document_values(row)
            conn.execute(text("INSERT INTO documents (card_id, doc_id, filename, filepath, file_url, filetype, filesize, created_at) VALUES (:card_id, :doc_id, :filename, :filepath, :file_url, :filetype, :filesize, :created_at)"), {**params, "filename": str(row.get("filename") or "document").strip() or "document", "filepath": path, "file_url": url, "filetype": str(row.get("filetype") or "application/octet-stream"), "filesize": size, "created_at": row.get("created_at")})
        for row in shares:
            project_id = project_map.get(int(row["project_id"]))
            shared_user_id = local_users.get(int(row["user_id"]))
            if not project_id or not shared_user_id or int(shared_user_id) == int(owner_map.get(project_id, 0)):
                continue
            params = {"project_id": project_id, "user_id": int(shared_user_id)}
            if conn.execute(text("SELECT 1 FROM project_shares WHERE project_id = :project_id AND user_id = :user_id LIMIT 1"), params).first():
                continue
            conn.execute(text("INSERT INTO project_shares (project_id, user_id, permission, last_active, created_at) VALUES (:project_id, :user_id, :permission, :last_active, :created_at)"), {**params, "permission": _normalize_share_permission(row.get("permission")), "last_active": row.get("last_active"), "created_at": row.get("last_active")})


def _maybe_sync_legacy_user_data(local_user_id: int, email: Optional[str], username_hint: Optional[str]) -> None:
    if legacy_engine is None:
        return
    email = _normalize_email(email)
    username = str(username_hint or "").strip()
    if not email and not username:
        return
    try:
        with engine.begin() as conn:
            _ensure_project_columns(conn)
            _ensure_project_shares_table(conn)
            _ensure_supporting_tables(conn)
            _ensure_documents_table(conn)
            _ensure_card_size_columns(conn)
            _ensure_legacy_sync_table(conn)
            row = conn.execute(text("SELECT sync_version FROM legacy_sync_state WHERE user_id = :user_id LIMIT 1"), {"user_id": local_user_id}).mappings().first()
            if row and int(row.get("sync_version") or 0) >= LEGACY_SYNC_VERSION:
                return
            _sync_legacy_full(conn, local_user_id, email, username)
            _set_legacy_sync_state(conn, local_user_id, email, LEGACY_SYNC_VERSION)
    except Exception as exc:
        logger.exception("Legacy sync failed for user_id=%s", local_user_id)
        try:
            with engine.begin() as conn:
                _ensure_legacy_sync_table(conn)
                _set_legacy_sync_state(conn, local_user_id, email, 0, str(exc))
        except Exception:
            logger.exception("Legacy sync state update failed for user_id=%s", local_user_id)

def _normalize_share_permission(value: Any) -> str:
    permission = str(value or "write").strip().lower()
    return "read" if permission == "read" else "write"


def _ensure_project_shares_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS project_shares (
              id INT NOT NULL AUTO_INCREMENT,
              project_id INT NOT NULL,
              user_id INT NOT NULL,
              permission VARCHAR(20) NOT NULL DEFAULT 'write',
              last_active DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY uniq_project_share (project_id, user_id),
              KEY idx_project_shares_project_id (project_id),
              KEY idx_project_shares_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )

    required_columns = {
        "permission": "ALTER TABLE project_shares ADD COLUMN permission VARCHAR(20) NOT NULL DEFAULT 'write' AFTER user_id",
        "last_active": "ALTER TABLE project_shares ADD COLUMN last_active DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER permission",
        "created_at": "ALTER TABLE project_shares ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER last_active",
    }

    for column_name, alter_sql in required_columns.items():
        exists = conn.execute(text(f"SHOW COLUMNS FROM project_shares LIKE '{column_name}'")).first()
        if not exists:
            conn.execute(text(alter_sql))


def _get_project_access(project_id: int, user_id: int) -> Dict[str, Any]:
    with engine.begin() as conn:
        _ensure_project_shares_table(conn)
        row = conn.execute(
            text(
                """
                SELECT
                  p.id,
                  p.owner_id,
                  ps.permission
                FROM projects p
                LEFT JOIN project_shares ps
                  ON ps.project_id = p.id
                 AND ps.user_id = :user_id
                WHERE p.id = :project_id
                LIMIT 1
                """
            ),
            {"project_id": project_id, "user_id": user_id},
        ).mappings().first()

        if row and int(row["owner_id"]) != int(user_id) and row.get("permission"):
            conn.execute(
                text(
                    """
                    UPDATE project_shares
                    SET last_active = CURRENT_TIMESTAMP
                    WHERE project_id = :project_id
                      AND user_id = :user_id
                    """
                ),
                {"project_id": project_id, "user_id": user_id},
            )

    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = int(row["owner_id"]) == int(user_id)
    share_permission_raw = row.get("permission")
    if not is_owner and not share_permission_raw:
        raise HTTPException(status_code=403, detail="Forbidden")

    share_permission = "owner" if is_owner else _normalize_share_permission(share_permission_raw)
    return {
        "project_id": int(row["id"]),
        "owner_id": int(row["owner_id"]),
        "is_owner": is_owner,
        "share_permission": share_permission,
        "can_write": is_owner or share_permission == "write",
    }


def _require_project_access(
    project_id: int,
    user_id: int,
    *,
    require_owner: bool = False,
    require_write: bool = False,
) -> Dict[str, Any]:
    access = _get_project_access(project_id=project_id, user_id=user_id)
    if require_owner and not access["is_owner"]:
        raise HTTPException(status_code=403, detail="Only the owner can do that")
    if require_write and not access["can_write"]:
        raise HTTPException(status_code=403, detail="Write access is required")
    return access


def _require_project_owner(project_id: int, owner_id: int) -> None:
    _require_project_access(project_id=project_id, user_id=owner_id, require_owner=True)


def _ensure_supporting_tables(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS checklists (
              id INT NOT NULL AUTO_INCREMENT,
              card_id INT NOT NULL,
              task_id VARCHAR(255) NOT NULL,
              text TEXT NULL,
              checked TINYINT(1) NOT NULL DEFAULT 0,
              time FLOAT NULL DEFAULT 0,
              description TEXT NULL,
              completed_at DATETIME NULL,
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              responsible VARCHAR(255) NULL,
              PRIMARY KEY (id),
              KEY idx_checklists_card_id (card_id),
              KEY idx_checklists_task_id (task_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    _ensure_project_folders_table(conn)
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS deadlines (
              id INT NOT NULL AUTO_INCREMENT,
              card_id INT NOT NULL,
              task_id VARCHAR(255) NULL,
              deadline DATE NOT NULL,
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_deadlines_card_id (card_id),
              KEY idx_deadlines_task_id (task_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )


def _ensure_card_size_columns(conn) -> None:
    width_exists = conn.execute(text("SHOW COLUMNS FROM cards LIKE 'width'")).first()
    if not width_exists:
        conn.execute(text("ALTER TABLE cards ADD COLUMN width FLOAT NULL DEFAULT 420 AFTER y"))

    height_exists = conn.execute(text("SHOW COLUMNS FROM cards LIKE 'height'")).first()
    if not height_exists:
        conn.execute(text("ALTER TABLE cards ADD COLUMN height FLOAT NULL DEFAULT 260 AFTER width"))


def _ensure_documents_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS documents (
              id INT NOT NULL AUTO_INCREMENT,
              card_id INT NOT NULL,
              doc_id VARCHAR(255) NULL,
              filename VARCHAR(255) NULL,
              filepath TEXT NULL,
              file_url TEXT NULL,
              filetype VARCHAR(255) NULL,
              filesize BIGINT NULL DEFAULT 0,
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_documents_card_id (card_id),
              KEY idx_documents_doc_id (doc_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )

    required_columns = {
        "doc_id": "ALTER TABLE documents ADD COLUMN doc_id VARCHAR(255) NULL AFTER card_id",
        "filename": "ALTER TABLE documents ADD COLUMN filename VARCHAR(255) NULL AFTER doc_id",
        "filepath": "ALTER TABLE documents ADD COLUMN filepath TEXT NULL AFTER filename",
        "file_url": "ALTER TABLE documents ADD COLUMN file_url TEXT NULL AFTER filepath",
        "filetype": "ALTER TABLE documents ADD COLUMN filetype VARCHAR(255) NULL AFTER file_url",
        "filesize": "ALTER TABLE documents ADD COLUMN filesize BIGINT NULL DEFAULT 0 AFTER filetype",
    }

    for column_name, alter_sql in required_columns.items():
        exists = conn.execute(text(f"SHOW COLUMNS FROM documents LIKE '{column_name}'")).first()
        if not exists:
            conn.execute(text(alter_sql))


def _list_projects_for_user(user_id: int, limit: int) -> List[Dict[str, Any]]:
    sql = text(
        """
        SELECT
          p.id,
          p.owner_id,
          COALESCE(p.name, '') AS title,
          p.note AS note,
          p.folder_id AS folder_id,
          folders.name AS folder_name,
          COALESCE(card_counts.nodes, 0) AS nodes,
          COALESCE(conn_counts.edges, 0) AS edges,
          0 AS pinned,
          COALESCE(p.archived, 0) AS archived,
          CASE WHEN p.owner_id = :user_id THEN 1 ELSE 0 END AS is_owner,
          CASE WHEN p.owner_id = :user_id THEN 'owner' ELSE access_shares.permission END AS share_permission,
          owners.username AS owner_name,
          owners.email AS owner_email,
          p.created_at,
          p.updated_at
        FROM projects p
        LEFT JOIN (
          SELECT
            ps.project_id,
            MAX(ps.permission) AS permission
          FROM project_shares ps
          WHERE ps.user_id = :user_id
          GROUP BY ps.project_id
        ) AS access_shares
          ON access_shares.project_id = p.id
        LEFT JOIN users owners
          ON owners.id = p.owner_id
        LEFT JOIN project_folders folders
          ON folders.id = p.folder_id
        LEFT JOIN (
          SELECT c.project_id, COUNT(*) AS nodes
          FROM cards c
          GROUP BY c.project_id
        ) AS card_counts
          ON card_counts.project_id = p.id
        LEFT JOIN (
          SELECT cn.project_id, COUNT(*) AS edges
          FROM connections cn
          GROUP BY cn.project_id
        ) AS conn_counts
          ON conn_counts.project_id = p.id
        WHERE p.owner_id = :user_id
           OR access_shares.project_id IS NOT NULL
        ORDER BY p.updated_at DESC
        LIMIT :limit
        """
    )

    with engine.begin() as conn:
        _ensure_project_columns(conn)
        _ensure_project_folders_table(conn)
        _ensure_project_shares_table(conn)
        rows = conn.execute(sql, {"user_id": user_id, "limit": limit}).mappings().all()

    projects: List[Dict[str, Any]] = []
    for row in rows:
        projects.append(
            {
                "id": int(row["id"]),
                "user_id": int(row["owner_id"]),
                "title": row["title"] or "",
                "note": row.get("note"),
                "folder_id": int(row["folder_id"]) if row.get("folder_id") is not None else None,
                "folder_name": row.get("folder_name"),
                "nodes": int(row.get("nodes") or 0),
                "edges": int(row.get("edges") or 0),
                "pinned": bool(row.get("pinned") or 0),
                "archived": bool(row.get("archived") or 0),
                "is_owner": bool(row.get("is_owner") or 0),
                "share_permission": row.get("share_permission"),
                "owner_name": row.get("owner_name"),
                "owner_email": row.get("owner_email"),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        )
    return projects


def _list_project_folders_for_user(user_id: int) -> List[Dict[str, Any]]:
    sql = text(
        """
        SELECT
          f.id,
          f.name,
          f.note,
          f.color,
          f.created_at,
          f.updated_at,
          COALESCE(project_stats.projects_count, 0) AS projects_count,
          COALESCE(project_stats.active_projects_count, 0) AS active_projects_count,
          COALESCE(project_stats.archived_projects_count, 0) AS archived_projects_count
        FROM project_folders f
        LEFT JOIN (
          SELECT
            p.folder_id,
            COUNT(*) AS projects_count,
            SUM(CASE WHEN COALESCE(p.archived, 0) = 0 THEN 1 ELSE 0 END) AS active_projects_count,
            SUM(CASE WHEN COALESCE(p.archived, 0) = 1 THEN 1 ELSE 0 END) AS archived_projects_count
          FROM projects p
          WHERE p.owner_id = :user_id
            AND p.folder_id IS NOT NULL
          GROUP BY p.folder_id
        ) AS project_stats
          ON project_stats.folder_id = f.id
        WHERE f.user_id = :user_id
        ORDER BY f.updated_at DESC, f.id DESC
        """
    )
    with engine.begin() as conn:
        _ensure_project_columns(conn)
        _ensure_project_folders_table(conn)
        rows = conn.execute(sql, {"user_id": user_id}).mappings().all()

    items: List[Dict[str, Any]] = []
    for row in rows:
        items.append(
            {
                "id": int(row["id"]),
                "name": str(row.get("name") or "").strip() or f"Папка #{row['id']}",
                "note": row.get("note"),
                "color": row.get("color"),
                "projects_count": int(row.get("projects_count") or 0),
                "active_projects_count": int(row.get("active_projects_count") or 0),
                "archived_projects_count": int(row.get("archived_projects_count") or 0),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        )
    return items


def _find_local_user_by_email(email: Any) -> Optional[Dict[str, Any]]:
    normalized = str(email or "").strip().lower()
    if not normalized:
        return None

    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id, username, email
                FROM users
                WHERE LOWER(email) = :email
                LIMIT 1
                """
            ),
            {"email": normalized},
        ).mappings().first()

    return dict(row) if row else None


def _list_project_shares(project_id: int) -> Dict[str, Any]:
    with engine.begin() as conn:
        _ensure_project_shares_table(conn)

        owner_row = conn.execute(
            text(
                """
                SELECT
                  p.id AS project_id,
                  p.owner_id,
                  u.username AS owner_name,
                  u.email AS owner_email
                FROM projects p
                LEFT JOIN users u
                  ON u.id = p.owner_id
                WHERE p.id = :project_id
                LIMIT 1
                """
            ),
            {"project_id": project_id},
        ).mappings().first()

        if not owner_row:
            raise HTTPException(status_code=404, detail="Project not found")

        share_rows = conn.execute(
            text(
                """
                SELECT
                  u.id AS user_id,
                  COALESCE(u.username, '') AS username,
                  u.email,
                  COALESCE(ps.permission, 'write') AS permission,
                  ps.last_active
                FROM project_shares ps
                JOIN users u
                  ON u.id = ps.user_id
                WHERE ps.project_id = :project_id
                ORDER BY COALESCE(ps.last_active, ps.created_at) DESC, u.username ASC
                """
            ),
            {"project_id": project_id},
        ).mappings().all()

    return {
        "project_id": int(owner_row["project_id"]),
        "owner_id": int(owner_row["owner_id"]),
        "owner_name": owner_row.get("owner_name"),
        "owner_email": owner_row.get("owner_email"),
        "shares": [
            {
                "user_id": int(row["user_id"]),
                "username": row.get("username") or "",
                "email": row.get("email"),
                "permission": _normalize_share_permission(row.get("permission")),
                "last_active": row.get("last_active"),
            }
            for row in share_rows
        ],
    }


def _ensure_notifications_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_notifications (
              id BIGINT NOT NULL AUTO_INCREMENT,
              user_id INT NOT NULL,
              kind VARCHAR(80) NOT NULL,
              service_id VARCHAR(80) NOT NULL DEFAULT 'mindmap',
              service_label VARCHAR(120) NOT NULL DEFAULT 'MindMap',
              title VARCHAR(255) NOT NULL,
              text TEXT NULL,
              route VARCHAR(255) NULL,
              project_id INT NULL,
              card_id VARCHAR(255) NULL,
              actor_user_id INT NULL,
              actor_name VARCHAR(255) NULL,
              actor_email VARCHAR(255) NULL,
              payload_json LONGTEXT NULL,
              read_at DATETIME NULL,
              created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_user_notifications_user_id_id (user_id, id),
              KEY idx_user_notifications_user_id_read_at (user_id, read_at),
              KEY idx_user_notifications_project_id (project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )

    required_columns = {
        "service_id": "ALTER TABLE user_notifications ADD COLUMN service_id VARCHAR(80) NOT NULL DEFAULT 'mindmap' AFTER kind",
        "service_label": "ALTER TABLE user_notifications ADD COLUMN service_label VARCHAR(120) NOT NULL DEFAULT 'MindMap' AFTER service_id",
        "route": "ALTER TABLE user_notifications ADD COLUMN route VARCHAR(255) NULL AFTER text",
        "project_id": "ALTER TABLE user_notifications ADD COLUMN project_id INT NULL AFTER route",
        "card_id": "ALTER TABLE user_notifications ADD COLUMN card_id VARCHAR(255) NULL AFTER project_id",
        "actor_user_id": "ALTER TABLE user_notifications ADD COLUMN actor_user_id INT NULL AFTER card_id",
        "actor_name": "ALTER TABLE user_notifications ADD COLUMN actor_name VARCHAR(255) NULL AFTER actor_user_id",
        "actor_email": "ALTER TABLE user_notifications ADD COLUMN actor_email VARCHAR(255) NULL AFTER actor_name",
        "payload_json": "ALTER TABLE user_notifications ADD COLUMN payload_json LONGTEXT NULL AFTER actor_email",
        "read_at": "ALTER TABLE user_notifications ADD COLUMN read_at DATETIME NULL AFTER payload_json",
        "created_at": "ALTER TABLE user_notifications ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER read_at",
    }

    for column_name, alter_sql in required_columns.items():
        exists = conn.execute(text(f"SHOW COLUMNS FROM user_notifications LIKE '{column_name}'")).first()
        if not exists:
            conn.execute(text(alter_sql))


def _serialize_notification_row(row: Any) -> Dict[str, Any]:
    return {
        "id": int(row["id"]),
        "kind": str(row.get("kind") or "mindmap_event"),
        "service_id": str(row.get("service_id") or "mindmap"),
        "service_label": str(row.get("service_label") or "MindMap"),
        "title": str(row.get("title") or "").strip() or "Новое уведомление",
        "text": row.get("text"),
        "route": row.get("route"),
        "project_id": int(row["project_id"]) if row.get("project_id") is not None else None,
        "card_id": str(row.get("card_id")) if row.get("card_id") is not None else None,
        "actor_user_id": int(row["actor_user_id"]) if row.get("actor_user_id") is not None else None,
        "actor_name": row.get("actor_name"),
        "actor_email": row.get("actor_email"),
        "created_at": row.get("created_at"),
        "read_at": row.get("read_at"),
    }


def _list_user_notifications(user_id: int, *, limit: int = 50, unread_only: bool = True) -> List[Dict[str, Any]]:
    query = """
        SELECT
          id,
          kind,
          service_id,
          service_label,
          title,
          text,
          route,
          project_id,
          card_id,
          actor_user_id,
          actor_name,
          actor_email,
          created_at,
          read_at
        FROM user_notifications
        WHERE user_id = :user_id
    """
    if unread_only:
        query += " AND read_at IS NULL"
    query += " ORDER BY id DESC LIMIT :limit"

    with engine.begin() as conn:
        _ensure_notifications_table(conn)
        rows = conn.execute(text(query), {"user_id": user_id, "limit": limit}).mappings().all()

    return [_serialize_notification_row(row) for row in rows]


def _list_user_notifications_since(user_id: int, after_id: int, *, limit: int = 50) -> List[Dict[str, Any]]:
    with engine.begin() as conn:
        _ensure_notifications_table(conn)
        rows = conn.execute(
            text(
                """
                SELECT
                  id,
                  kind,
                  service_id,
                  service_label,
                  title,
                  text,
                  route,
                  project_id,
                  card_id,
                  actor_user_id,
                  actor_name,
                  actor_email,
                  created_at,
                  read_at
                FROM user_notifications
                WHERE user_id = :user_id
                  AND id > :after_id
                  AND read_at IS NULL
                ORDER BY id ASC
                LIMIT :limit
                """
            ),
            {"user_id": user_id, "after_id": after_id, "limit": limit},
        ).mappings().all()

    return [_serialize_notification_row(row) for row in rows]


def _create_user_notification(
    conn,
    *,
    user_id: int,
    kind: str,
    title: str,
    text_value: Optional[str] = None,
    route: Optional[str] = None,
    project_id: Optional[int] = None,
    card_id: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    actor_email: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    service_id: str = "mindmap",
    service_label: str = "MindMap",
) -> Dict[str, Any]:
    _ensure_notifications_table(conn)

    conn.execute(
        text(
            """
            INSERT INTO user_notifications (
              user_id,
              kind,
              service_id,
              service_label,
              title,
              text,
              route,
              project_id,
              card_id,
              actor_user_id,
              actor_name,
              actor_email,
              payload_json
            )
            VALUES (
              :user_id,
              :kind,
              :service_id,
              :service_label,
              :title,
              :text_value,
              :route,
              :project_id,
              :card_id,
              :actor_user_id,
              :actor_name,
              :actor_email,
              :payload_json
            )
            """
        ),
        {
            "user_id": user_id,
            "kind": kind,
            "service_id": service_id,
            "service_label": service_label,
            "title": title,
            "text_value": text_value,
            "route": route,
            "project_id": project_id,
            "card_id": card_id,
            "actor_user_id": actor_user_id,
            "actor_name": actor_name,
            "actor_email": actor_email,
            "payload_json": json.dumps(payload or {}, ensure_ascii=False),
        },
    )

    inserted_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])
    row = conn.execute(
        text(
            """
            SELECT
              id,
              kind,
              service_id,
              service_label,
              title,
              text,
              route,
              project_id,
              card_id,
              actor_user_id,
              actor_name,
              actor_email,
              created_at,
              read_at
            FROM user_notifications
            WHERE id = :id
            LIMIT 1
            """
        ),
        {"id": inserted_id},
    ).mappings().first()

    return _serialize_notification_row(row)


def _normalize_scale_value(value: Any) -> Optional[int]:
    if value in (None, "", "—"):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if 1 <= number <= 10 else None


def _coalesce_scale_value(value: Any, fallback: Any = 1) -> int:
    normalized = _normalize_scale_value(value)
    if normalized is not None:
        return normalized

    fallback_normalized = _normalize_scale_value(fallback)
    return fallback_normalized if fallback_normalized is not None else 1


def _normalize_color(value: Any) -> str:
    color = str(value or "").strip()
    if len(color) == 7 and color.startswith("#"):
        return color
    return "#71717a"


def _normalize_connection_side(value: Any) -> str:
    side = str(value or "").strip().lower()
    return side if side in {"top", "right", "bottom", "left"} else "right"


def _opposite_connection_side(side: str) -> str:
    mapping = {
        "top": "bottom",
        "bottom": "top",
        "left": "right",
        "right": "left",
    }
    return mapping.get(side, "left")


def _sanitize_upload_filename(filename: Any) -> str:
    raw = str(filename or "").strip()
    if not raw:
        raw = "file"
    sanitized = re.sub(r"[^0-9A-Za-zА-Яа-я._-]+", "_", raw)
    sanitized = sanitized.strip("._") or "file"
    return sanitized[:180]


def _public_file_url(file_url: Any, filepath: Any) -> str:
    raw_url = str(file_url or "").strip()
    if raw_url.startswith(("http://", "https://", "/")):
        return raw_url

    file_name = ""
    if raw_url:
        file_name = os.path.basename(raw_url)
    elif filepath:
        file_name = os.path.basename(str(filepath))

    return f"/uploads/{file_name}" if file_name else ""


def _serialize_document_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id")),
        "dbId": int(row.get("id") or 0),
        "docId": str(row.get("doc_id") or row.get("id") or ""),
        "name": str(row.get("filename") or "Документ").strip() or "Документ",
        "file_url": _public_file_url(row.get("file_url"), row.get("filepath")),
        "type": str(row.get("filetype") or "application/octet-stream"),
        "size": int(row.get("filesize") or 0),
    }


def _delete_document_file(file_path: Any) -> None:
    path = str(file_path or "").strip()
    if not path:
        return
    try:
        if os.path.exists(path) and os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


def _normalize_card_dimension(
    value: Any,
    default: float,
    minimum: float,
    maximum: Optional[float] = None,
) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    normalized = max(minimum, number)
    if maximum is not None:
        normalized = min(maximum, normalized)
    return round(normalized, 2)


def _normalize_hours(value: Any) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(number) or number < 0:
        return 0.0
    return round(number, 2)


def _parse_date_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()

    raw = str(value).strip()
    if not raw:
        return None

    if len(raw) >= 10:
        candidate = raw[:10]
        try:
            return date.fromisoformat(candidate).isoformat()
        except ValueError:
            pass

    try:
        number = float(raw)
    except ValueError:
        return None

    if number > 1_000_000_000_000:
        number /= 1000
    try:
        return datetime.utcfromtimestamp(number).date().isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _parse_completed_at(value: Any, done: bool) -> Optional[datetime]:
    if not done or value in (None, "", False):
        return None

    if isinstance(value, datetime):
        return value.replace(tzinfo=None)

    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 1_000_000_000_000:
            timestamp /= 1000
        try:
            return datetime.fromtimestamp(timestamp)
        except (OverflowError, OSError, ValueError):
            return datetime.utcnow()

    raw = str(value).strip()
    if not raw:
        return datetime.utcnow()

    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed.replace(tzinfo=None)
    except ValueError:
        pass

    try:
        timestamp = float(raw)
    except ValueError:
        return datetime.utcnow()

    if timestamp > 1_000_000_000_000:
        timestamp /= 1000
    try:
        return datetime.fromtimestamp(timestamp)
    except (OverflowError, OSError, ValueError):
        return datetime.utcnow()


def _coerce_task_items(payload: CardUpdateIn) -> List[Dict[str, Any]]:
    source = payload.tasks or payload.checklist or []
    tasks: List[Dict[str, Any]] = []

    for item in source:
        title = (item.title if item.title is not None else item.text) or ""
        title = str(title).strip() or "Без названия задачи"

        done = bool(item.done if item.done is not None else item.checked)
        responsible = item.responsibleName or item.responsible or ""
        deadline = _parse_date_string(item.deadline)

        tasks.append(
            {
                "id": str(item.id or f"task_{uuid.uuid4().hex[:12]}"),
                "title": title,
                "done": done,
                "description": str(item.description or "").strip(),
                "time": _normalize_hours(item.time),
                "deadline": deadline,
                "responsible": str(responsible).strip(),
                "completed_at": _parse_completed_at(item.completedAt, done),
            }
        )

    return tasks


def _serialize_datetime(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def _fetch_board(project_id: int) -> Dict[str, Any]:
    with engine.begin() as conn:
        _ensure_supporting_tables(conn)
        _ensure_card_size_columns(conn)
        _ensure_documents_table(conn)

        card_rows = conn.execute(
            text(
                """
                SELECT
                  c.id AS db_id,
                  c.card_id AS id,
                  COALESCE(c.x, 0) AS x,
                  COALESCE(c.y, 0) AS y,
                  c.width,
                  c.height,
                  COALESCE(NULLIF(c.title, ''), NULLIF(c.content, ''), '') AS title,
                  COALESCE(c.content, '') AS content,
                  c.importance,
                  c.urgency,
                  c.color
                FROM cards c
                WHERE c.project_id = :project_id
                ORDER BY c.id
                """
            ),
            {"project_id": project_id},
        ).mappings().all()

        link_rows = conn.execute(
            text(
                """
                SELECT
                  cn.id AS id,
                  cn.from_card_id AS `from`,
                  cn.to_card_id AS `to`,
                  cn.from_type AS fromSide,
                  cn.to_type AS toSide
                FROM connections cn
                WHERE cn.project_id = :project_id
                ORDER BY cn.id
                """
            ),
            {"project_id": project_id},
        ).mappings().all()

        card_db_ids = [int(row["db_id"]) for row in card_rows]
        checklist_rows: List[Dict[str, Any]] = []
        deadline_rows: List[Dict[str, Any]] = []
        document_rows: List[Dict[str, Any]] = []

        if card_db_ids:
            checklist_query = text(
                """
                SELECT
                  card_id,
                  task_id,
                  text,
                  checked,
                  time,
                  description,
                  responsible,
                  completed_at
                FROM checklists
                WHERE card_id IN :card_ids
                ORDER BY id
                """
            ).bindparams(bindparam("card_ids", expanding=True))

            deadline_query = text(
                """
                SELECT
                  card_id,
                  task_id,
                  deadline
                FROM deadlines
                WHERE card_id IN :card_ids
                ORDER BY id
                """
            ).bindparams(bindparam("card_ids", expanding=True))

            documents_query = text(
                """
                SELECT
                  id,
                  card_id,
                  doc_id,
                  filename,
                  filepath,
                  file_url,
                  filetype,
                  filesize
                FROM documents
                WHERE card_id IN :card_ids
                ORDER BY id
                """
            ).bindparams(bindparam("card_ids", expanding=True))

            checklist_rows = conn.execute(checklist_query, {"card_ids": card_db_ids}).mappings().all()
            deadline_rows = conn.execute(deadline_query, {"card_ids": card_db_ids}).mappings().all()
            document_rows = conn.execute(documents_query, {"card_ids": card_db_ids}).mappings().all()

    task_deadlines: Dict[Tuple[int, str], str] = {}
    card_deadlines: Dict[int, str] = {}
    for row in deadline_rows:
        deadline = _parse_date_string(row.get("deadline"))
        if not deadline:
            continue
        task_id = row.get("task_id")
        card_id = int(row["card_id"])
        if task_id:
            task_deadlines[(card_id, str(task_id))] = deadline
        else:
            card_deadlines[card_id] = deadline

    tasks_by_card: Dict[int, List[Dict[str, Any]]] = {}
    for row in checklist_rows:
        card_db_id = int(row["card_id"])
        task_id = str(row.get("task_id") or f"task_{uuid.uuid4().hex[:12]}")
        done = bool(row.get("checked") or 0)
        task = {
            "id": task_id,
            "title": str(row.get("text") or "").strip(),
            "text": str(row.get("text") or "").strip(),
            "done": done,
            "checked": done,
            "description": str(row.get("description") or "").strip(),
            "time": _normalize_hours(row.get("time")),
            "deadline": task_deadlines.get((card_db_id, task_id), ""),
            "responsible": str(row.get("responsible") or "").strip(),
            "responsibleName": str(row.get("responsible") or "").strip(),
            "responsibleId": None,
            "completedAt": _serialize_datetime(row.get("completed_at")),
        }
        tasks_by_card.setdefault(card_db_id, []).append(task)

    documents_by_card: Dict[int, List[Dict[str, Any]]] = {}
    for row in document_rows:
        card_db_id = int(row["card_id"])
        documents_by_card.setdefault(card_db_id, []).append(_serialize_document_row(row))

    cards: List[Dict[str, Any]] = []
    for row in card_rows:
        card_db_id = int(row["db_id"])
        tasks = tasks_by_card.get(card_db_id, [])
        documents = documents_by_card.get(card_db_id, [])
        total_hours = round(sum(_normalize_hours(task.get("time")) for task in tasks), 2)
        tasks_done = sum(1 for task in tasks if task.get("done"))
        docs_count = sum(1 for doc in documents if not str(doc.get("type") or "").startswith("image/"))
        images_count = sum(1 for doc in documents if str(doc.get("type") or "").startswith("image/"))
        title = (row.get("title") or "").strip() or "Без названия"
        content = (row.get("content") or "").strip() or title

        cards.append(
            {
                "id": str(row["id"]),
                "x": float(row.get("x") or 0),
                "y": float(row.get("y") or 0),
                "width": _normalize_card_dimension(row.get("width"), 420, 340),
                "height": _normalize_card_dimension(row.get("height"), 260, 220),
                "title": title,
                "content": content,
                "color": _normalize_color(row.get("color")),
                "importance": _normalize_scale_value(row.get("importance")),
                "urgency": _normalize_scale_value(row.get("urgency")),
                "deadline": card_deadlines.get(card_db_id),
                "totalHours": total_hours,
                "docsCount": docs_count,
                "imagesCount": images_count,
                "tasksTotal": len(tasks),
                "tasksDone": tasks_done,
                "documents": documents,
                "tasks": tasks,
            }
        )

    links: List[Dict[str, Any]] = []
    for row in link_rows:
        links.append(
            {
                "id": str(row["id"]),
                "from": str(row["from"]),
                "to": str(row["to"]),
                "fromSide": row.get("fromSide"),
                "toSide": row.get("toSide"),
            }
        )

    return {"project_id": project_id, "cards": cards, "links": links}


@app.get("/api/projects", response_model=List[ProjectOut])
def list_projects(
    user_id: Optional[int] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
):
    if user_id is None:
        raise HTTPException(status_code=400, detail="user_id is required for now")
    return _list_projects_for_user(user_id=int(user_id), limit=limit)


@app.get("/api/projects/me", response_model=List[ProjectOut])
def list_projects_me(
    authorization: Optional[str] = Header(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
):
    auth = _resolve_authenticated_user(authorization)
    return _list_projects_for_user(user_id=auth["local_user_id"], limit=limit)


@app.get("/api/project-folders/me", response_model=List[ProjectFolderOut])
def list_project_folders_me(
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    return _list_project_folders_for_user(user_id=auth["local_user_id"])


@app.post("/api/project-folders", response_model=ProjectFolderOut)
def create_project_folder(
    payload: ProjectFolderCreateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    name = _normalize_folder_name(payload.name)
    note = _normalize_folder_note(payload.note)
    color = _normalize_folder_color(payload.color)

    with engine.begin() as conn:
        _ensure_project_folders_table(conn)
        conn.execute(
            text(
                """
                INSERT INTO project_folders (user_id, name, note, color)
                VALUES (:user_id, :name, :note, :color)
                """
            ),
            {"user_id": auth["local_user_id"], "name": name, "note": note, "color": color},
        )
        folder_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])

    created = next(
        (folder for folder in _list_project_folders_for_user(user_id=auth["local_user_id"]) if int(folder["id"]) == folder_id),
        None,
    )
    if not created:
        raise HTTPException(status_code=500, detail="Created folder could not be reloaded")
    return created


@app.put("/api/project-folders/{folder_id}", response_model=ProjectFolderOut)
def update_project_folder(
    folder_id: int,
    payload: ProjectFolderUpdateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    name = _normalize_folder_name(payload.name)
    note = _normalize_folder_note(payload.note)
    color = _normalize_folder_color(payload.color)

    with engine.begin() as conn:
        _ensure_project_folders_table(conn)
        updated = conn.execute(
            text(
                """
                UPDATE project_folders
                SET name = :name,
                    note = :note,
                    color = :color
                WHERE id = :folder_id
                  AND user_id = :user_id
                """
            ),
            {
                "folder_id": folder_id,
                "user_id": auth["local_user_id"],
                "name": name,
                "note": note,
                "color": color,
            },
        )
    if updated.rowcount < 1:
        raise HTTPException(status_code=404, detail="Folder not found")

    updated_item = next(
        (folder for folder in _list_project_folders_for_user(user_id=auth["local_user_id"]) if int(folder["id"]) == folder_id),
        None,
    )
    if not updated_item:
        raise HTTPException(status_code=500, detail="Updated folder could not be reloaded")
    return updated_item


@app.delete("/api/project-folders/{folder_id}")
def delete_project_folder(
    folder_id: int,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    with engine.begin() as conn:
        _ensure_project_columns(conn)
        _ensure_project_folders_table(conn)
        conn.execute(
            text(
                """
                UPDATE projects
                SET folder_id = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE owner_id = :user_id
                  AND folder_id = :folder_id
                """
            ),
            {"user_id": auth["local_user_id"], "folder_id": folder_id},
        )
        deleted = conn.execute(
            text(
                """
                DELETE FROM project_folders
                WHERE id = :folder_id
                  AND user_id = :user_id
                """
            ),
            {"folder_id": folder_id, "user_id": auth["local_user_id"]},
        )
    if deleted.rowcount < 1:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"ok": True, "folder_id": folder_id}


@app.post("/api/projects", response_model=ProjectOut)
def create_project(
    payload: ProjectCreateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)

    title = str(payload.title or "").strip() or "Новый проект"
    note = str(payload.note or "").strip() or None

    with engine.begin() as conn:
        _ensure_project_columns(conn)
        _ensure_project_folders_table(conn)
        _ensure_project_shares_table(conn)
        folder_id = _resolve_project_folder_id(conn, auth["local_user_id"], payload.folder_id)
        conn.execute(
            text(
                """
                INSERT INTO projects (name, note, folder_id, owner_id, created_at, updated_at, archived, archived_at)
                VALUES (:title, :note, :folder_id, :owner_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, NULL)
                """
            ),
            {
                "title": title,
                "note": note,
                "folder_id": folder_id,
                "owner_id": auth["local_user_id"],
            },
        )
        project_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])

    created_project = next(
        (project for project in _list_projects_for_user(user_id=auth["local_user_id"], limit=200) if int(project["id"]) == project_id),
        None,
    )
    if not created_project:
        raise HTTPException(status_code=500, detail="Created project could not be reloaded")
    return created_project


@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_owner=True)

    title = str(payload.title or "").strip() or "Новый проект"
    note = str(payload.note or "").strip() or None

    with engine.begin() as conn:
        _ensure_project_columns(conn)
        _ensure_project_folders_table(conn)
        folder_id = _resolve_project_folder_id(conn, auth["local_user_id"], payload.folder_id)
        updated = conn.execute(
            text(
                """
                UPDATE projects
                SET name = :title,
                    note = :note,
                    folder_id = :folder_id,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :project_id
                  AND owner_id = :owner_id
                """
            ),
            {
                "project_id": project_id,
                "owner_id": auth["local_user_id"],
                "title": title,
                "note": note,
                "folder_id": folder_id,
            },
        )
    if updated.rowcount < 1:
        raise HTTPException(status_code=404, detail="Project not found")

    updated_project = next(
        (project for project in _list_projects_for_user(user_id=auth["local_user_id"], limit=200) if int(project["id"]) == project_id),
        None,
    )
    if not updated_project:
        raise HTTPException(status_code=500, detail="Updated project could not be reloaded")
    return updated_project


@app.get("/api/projects/{project_id}/shares", response_model=ProjectShareListOut)
def list_project_shares(
    project_id: int,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"])
    return _list_project_shares(project_id)


@app.post("/api/projects/{project_id}/shares")
def share_project(
    project_id: int,
    payload: ProjectShareIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    access = _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_owner=True)

    email = str(payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")

    target_user = _find_local_user_by_email(email)
    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="User with this email was not found in mindmap. Ask them to open mindmap once first.",
        )

    target_user_id = int(target_user["id"])
    if target_user_id == int(access["owner_id"]):
        raise HTTPException(status_code=400, detail="The owner already has full access")

    permission = _normalize_share_permission(payload.permission)
    notification_payload: Optional[Dict[str, Any]] = None
    with engine.begin() as conn:
        _ensure_project_shares_table(conn)
        _ensure_notifications_table(conn)

        existing = conn.execute(
            text(
                """
                SELECT id
                FROM project_shares
                WHERE project_id = :project_id
                  AND user_id = :user_id
                LIMIT 1
                """
            ),
            {"project_id": project_id, "user_id": target_user_id},
        ).mappings().first()
        if existing:
            raise HTTPException(status_code=409, detail="Access already exists for this user")

        project_row = conn.execute(
            text(
                """
                SELECT name AS title
                FROM projects
                WHERE id = :project_id
                LIMIT 1
                """
            ),
            {"project_id": project_id},
        ).mappings().first()
        project_title = str((project_row or {}).get("title") or "").strip() or f"Проект #{project_id}"

        conn.execute(
            text(
                """
                INSERT INTO project_shares (project_id, user_id, permission, last_active)
                VALUES (:project_id, :user_id, :permission, CURRENT_TIMESTAMP)
                """
            ),
            {"project_id": project_id, "user_id": target_user_id, "permission": permission},
        )

        actor_name = str(auth.get("username") or "").strip() or None
        actor_email = str(auth.get("email") or "").strip() or None
        actor_label = actor_name or actor_email or f"Пользователь #{auth['local_user_id']}"

        notification_payload = _create_user_notification(
            conn,
            user_id=target_user_id,
            kind="mindmap_access_granted",
            title=f"Доступ к проекту «{project_title}»",
            text_value=f"{actor_label} выдал вам доступ к проекту «{project_title}».",
            route="/mindmap",
            project_id=project_id,
            actor_user_id=auth["local_user_id"],
            actor_name=actor_name,
            actor_email=actor_email,
            payload={
                "permission": permission,
                "project_title": project_title,
                "shared_user_email": target_user.get("email"),
                "shared_user_name": target_user.get("username"),
            },
        )

    return {
        "ok": True,
        "project_id": project_id,
        "user_id": target_user_id,
        "permission": permission,
        "notification": notification_payload,
    }


@app.delete("/api/projects/{project_id}/shares/{shared_user_id}")
def revoke_project_share(
    project_id: int,
    shared_user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    access = _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_owner=True)

    if int(shared_user_id) == int(access["owner_id"]):
        raise HTTPException(status_code=400, detail="The owner cannot be removed from the project")

    with engine.begin() as conn:
        _ensure_project_shares_table(conn)
        deleted = conn.execute(
            text(
                """
                DELETE FROM project_shares
                WHERE project_id = :project_id
                  AND user_id = :user_id
                """
            ),
            {"project_id": project_id, "user_id": shared_user_id},
        )

    if deleted.rowcount < 1:
        raise HTTPException(status_code=404, detail="Shared access was not found")

    return {"ok": True, "project_id": project_id, "user_id": shared_user_id}


@app.get("/api/notifications", response_model=List[ServiceNotificationOut])
def list_notifications(
    authorization: Optional[str] = Header(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    unread_only: bool = Query(default=True),
):
    auth = _resolve_authenticated_user(authorization)
    return _list_user_notifications(user_id=auth["local_user_id"], limit=limit, unread_only=unread_only)


@app.post("/api/notifications/read")
def mark_notifications_read(
    payload: NotificationReadIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    ids: List[int] = []
    for item in payload.ids:
        try:
            value = int(item)
        except (TypeError, ValueError):
            continue
        if value > 0:
            ids.append(value)
    ids = sorted(set(ids))
    if not ids:
        return {"ok": True, "updated": 0}

    with engine.begin() as conn:
        _ensure_notifications_table(conn)
        updated = conn.execute(
            text(
                """
                UPDATE user_notifications
                SET read_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id
                  AND read_at IS NULL
                  AND id IN :ids
                """
            ).bindparams(bindparam("ids", expanding=True)),
            {"user_id": auth["local_user_id"], "ids": ids},
        )

    return {"ok": True, "updated": int(updated.rowcount or 0)}


@app.get("/api/notifications/stream")
async def stream_notifications(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    since_id: int = Query(default=0, ge=0),
):
    auth = _resolve_authenticated_user(authorization)
    user_id = int(auth["local_user_id"])

    async def event_generator():
        cursor = max(0, int(since_id))
        heartbeat_at = time.monotonic()

        while True:
            if await request.is_disconnected():
                break

            items = await asyncio.to_thread(_list_user_notifications_since, user_id, cursor, limit=50)
            if items:
                for item in items:
                    cursor = max(cursor, int(item["id"]))
                    yield (
                        f"id: {item['id']}\n"
                        "event: notification\n"
                        f"data: {json.dumps(item, ensure_ascii=False, default=lambda value: value.isoformat() if isinstance(value, datetime) else str(value))}\n\n"
                    )
                heartbeat_at = time.monotonic()
                continue

            now = time.monotonic()
            if now - heartbeat_at >= 15:
                yield ": ping\n\n"
                heartbeat_at = now

            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.delete("/api/projects/{project_id}")
def delete_project(
    project_id: int,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_owner=True)

    with engine.begin() as conn:
        _ensure_supporting_tables(conn)
        _ensure_documents_table(conn)
        _ensure_project_shares_table(conn)

        card_db_ids = [int(item) for item in conn.execute(
            text("SELECT id FROM cards WHERE project_id = :project_id"),
            {"project_id": project_id},
        ).scalars().all()]

        if card_db_ids:
            doc_rows = conn.execute(
                text("SELECT filepath FROM documents WHERE card_id IN :card_ids").bindparams(
                    bindparam("card_ids", expanding=True)
                ),
                {"card_ids": card_db_ids},
            ).mappings().all()
            checklist_delete = text("DELETE FROM checklists WHERE card_id IN :card_ids").bindparams(
                bindparam("card_ids", expanding=True)
            )
            deadline_delete = text("DELETE FROM deadlines WHERE card_id IN :card_ids").bindparams(
                bindparam("card_ids", expanding=True)
            )
            documents_delete = text("DELETE FROM documents WHERE card_id IN :card_ids").bindparams(
                bindparam("card_ids", expanding=True)
            )
            conn.execute(checklist_delete, {"card_ids": card_db_ids})
            conn.execute(deadline_delete, {"card_ids": card_db_ids})
            conn.execute(documents_delete, {"card_ids": card_db_ids})
            for row in doc_rows:
                _delete_document_file(row.get("filepath"))

        conn.execute(text("DELETE FROM connections WHERE project_id = :project_id"), {"project_id": project_id})
        conn.execute(text("DELETE FROM cards WHERE project_id = :project_id"), {"project_id": project_id})
        conn.execute(text("DELETE FROM project_shares WHERE project_id = :project_id"), {"project_id": project_id})
        deleted = conn.execute(
            text("DELETE FROM projects WHERE id = :project_id AND owner_id = :owner_id"),
            {"project_id": project_id, "owner_id": auth["local_user_id"]},
        )

    if deleted.rowcount < 1:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"ok": True, "project_id": project_id}


@app.post("/api/projects/{project_id}/archive")
def set_project_archived(
    project_id: int,
    payload: ProjectArchiveIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_owner=True)

    archived_value = 1 if payload.archived else 0
    with engine.begin() as conn:
        updated = conn.execute(
            text(
                """
                UPDATE projects
                SET archived = :archived,
                    archived_at = CASE WHEN :archived = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :project_id AND owner_id = :owner_id
                """
            ),
            {"archived": archived_value, "project_id": project_id, "owner_id": auth["local_user_id"]},
        )

    if updated.rowcount < 1:
        raise HTTPException(status_code=404, detail="Project not found")

    return {"ok": True, "project_id": project_id, "archived": bool(payload.archived)}


@app.get("/api/projects/{project_id}/board", response_model=BoardOut)
def get_project_board(
    project_id: int,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"])
    return _fetch_board(project_id)


@app.post("/api/projects/{project_id}/cards")
def create_card(
    project_id: int,
    payload: CardCreateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_write=True)

    card_id = str(payload.id or f"c_{uuid.uuid4().hex[:20]}")
    title = str(payload.title or payload.content or "").strip() or "Новая карточка"
    content = str(payload.content or payload.title or "").strip() or title
    importance = _coalesce_scale_value(payload.importance, 1)
    urgency = _coalesce_scale_value(payload.urgency, 1)
    color = _normalize_color(payload.color)
    x = _normalize_card_dimension(payload.x, 0, -1_000_000, 1_000_000)
    y = _normalize_card_dimension(payload.y, 0, -1_000_000, 1_000_000)
    width = _normalize_card_dimension(payload.width, 420, 340)
    height = _normalize_card_dimension(payload.height, 260, 220)
    connection_side = _normalize_connection_side(payload.side)
    parent_card_id = str(payload.parentId or "").strip() or None

    created_link_id: Optional[int] = None

    with engine.begin() as conn:
        _ensure_card_size_columns(conn)

        existing = conn.execute(
            text(
                """
                SELECT id
                FROM cards
                WHERE project_id = :project_id
                  AND card_id = :card_id
                LIMIT 1
                """
            ),
            {"project_id": project_id, "card_id": card_id},
        ).mappings().first()
        if existing:
            raise HTTPException(status_code=409, detail="Card with this id already exists")

        parent_row = None
        if parent_card_id:
            parent_row = conn.execute(
                text(
                    """
                    SELECT id, card_id
                    FROM cards
                    WHERE project_id = :project_id
                      AND card_id = :card_id
                    LIMIT 1
                    """
                ),
                {"project_id": project_id, "card_id": parent_card_id},
            ).mappings().first()

            if not parent_row:
                raise HTTPException(status_code=404, detail="Parent card not found")

        conn.execute(
            text(
                """
                INSERT INTO cards (
                  project_id,
                  card_id,
                  x,
                  y,
                  width,
                  height,
                  content,
                  title,
                  type,
                  is_main,
                  importance,
                  urgency,
                  color
                )
                VALUES (
                  :project_id,
                  :card_id,
                  :x,
                  :y,
                  :width,
                  :height,
                  :content,
                  :title,
                  'text',
                  0,
                  :importance,
                  :urgency,
                  :color
                )
                """
            ),
            {
                "project_id": project_id,
                "card_id": card_id,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "content": content,
                "title": title,
                "importance": importance,
                "urgency": urgency,
                "color": color,
            },
        )

        if parent_row:
            conn.execute(
                text(
                    """
                    INSERT INTO connections (
                      project_id,
                      from_card_id,
                      to_card_id,
                      from_type,
                      to_type
                    )
                    VALUES (
                      :project_id,
                      :from_card_id,
                      :to_card_id,
                      :from_type,
                      :to_type
                    )
                    """
                ),
                {
                    "project_id": project_id,
                    "from_card_id": str(parent_row["card_id"]),
                    "to_card_id": card_id,
                    "from_type": connection_side,
                    "to_type": _opposite_connection_side(connection_side),
                },
            )
            created_link_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])

        conn.execute(
            text("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = :project_id"),
            {"project_id": project_id},
        )

    board = _fetch_board(project_id)
    created_card = next((card for card in board["cards"] if card["id"] == card_id), None)
    if not created_card:
        raise HTTPException(status_code=500, detail="Created card could not be reloaded")

    created_link = None
    if created_link_id is not None:
        created_link = next((link for link in board["links"] if str(link["id"]) == str(created_link_id)), None)

    return {"ok": True, "project_id": project_id, "card": created_card, "link": created_link}


@app.post("/api/projects/{project_id}/cards/{card_id}/documents")
def upload_card_document(
    project_id: int,
    card_id: str,
    payload: DocumentUploadIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_write=True)

    if not payload.data or not payload.data.startswith("data:"):
        raise HTTPException(status_code=400, detail="Document payload must be a data URL")

    match = re.match(r"^data:([^;]+);base64,(.+)$", payload.data, re.DOTALL)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid document data format")

    mime_type = str(payload.type or match.group(1) or "application/octet-stream").strip() or "application/octet-stream"
    try:
        binary_data = base64.b64decode(match.group(2), validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Failed to decode uploaded file") from exc

    original_name = _sanitize_upload_filename(payload.name)
    stored_name = f"{uuid.uuid4().hex}_{original_name}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    public_url = f"/uploads/{stored_name}"
    doc_id = f"doc_{uuid.uuid4().hex[:16]}"
    file_size = int(payload.size or len(binary_data) or 0)

    try:
        with open(file_path, "wb") as file_obj:
            file_obj.write(binary_data)

        with engine.begin() as conn:
            _ensure_documents_table(conn)

            card_row = conn.execute(
                text(
                    """
                    SELECT id
                    FROM cards
                    WHERE project_id = :project_id AND card_id = :card_id
                    LIMIT 1
                    """
                ),
                {"project_id": project_id, "card_id": card_id},
            ).mappings().first()

            if not card_row:
                raise HTTPException(status_code=404, detail="Card not found")

            card_db_id = int(card_row["id"])
            conn.execute(
                text(
                    """
                    INSERT INTO documents (card_id, doc_id, filename, filepath, file_url, filetype, filesize)
                    VALUES (:card_id, :doc_id, :filename, :filepath, :file_url, :filetype, :filesize)
                    """
                ),
                {
                    "card_id": card_db_id,
                    "doc_id": doc_id,
                    "filename": original_name,
                    "filepath": file_path,
                    "file_url": public_url,
                    "filetype": mime_type,
                    "filesize": file_size,
                },
            )
            inserted_id = int(conn.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().first()["id"])
            conn.execute(
                text("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = :project_id"),
                {"project_id": project_id},
            )
    except HTTPException:
        _delete_document_file(file_path)
        raise
    except OSError as exc:
        _delete_document_file(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}") from exc
    except Exception as exc:
        _delete_document_file(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to register uploaded file: {exc}") from exc

    board = _fetch_board(project_id)
    updated_card = next((card for card in board["cards"] if card["id"] == card_id), None)
    if not updated_card:
        raise HTTPException(status_code=500, detail="Uploaded document could not be reloaded")

    return {
        "ok": True,
        "project_id": project_id,
        "document": _serialize_document_row(
            {
                "id": inserted_id,
                "doc_id": doc_id,
                "filename": original_name,
                "filepath": file_path,
                "file_url": public_url,
                "filetype": mime_type,
                "filesize": file_size,
            }
        ),
        "card": updated_card,
    }


@app.delete("/api/projects/{project_id}/cards/{card_id}/documents/{document_id}")
def delete_card_document(
    project_id: int,
    card_id: str,
    document_id: int,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_write=True)

    file_path = ""
    with engine.begin() as conn:
        _ensure_documents_table(conn)

        card_row = conn.execute(
            text(
                """
                SELECT id
                FROM cards
                WHERE project_id = :project_id AND card_id = :card_id
                LIMIT 1
                """
            ),
            {"project_id": project_id, "card_id": card_id},
        ).mappings().first()

        if not card_row:
            raise HTTPException(status_code=404, detail="Card not found")

        card_db_id = int(card_row["id"])
        document_row = conn.execute(
            text(
                """
                SELECT id, filepath
                FROM documents
                WHERE id = :document_id AND card_id = :card_id
                LIMIT 1
                """
            ),
            {"document_id": document_id, "card_id": card_db_id},
        ).mappings().first()

        if not document_row:
            raise HTTPException(status_code=404, detail="Document not found")

        file_path = str(document_row.get("filepath") or "")
        conn.execute(
            text("DELETE FROM documents WHERE id = :document_id AND card_id = :card_id"),
            {"document_id": document_id, "card_id": card_db_id},
        )
        conn.execute(
            text("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = :project_id"),
            {"project_id": project_id},
        )

    _delete_document_file(file_path)

    board = _fetch_board(project_id)
    updated_card = next((card for card in board["cards"] if card["id"] == card_id), None)
    if not updated_card:
        raise HTTPException(status_code=500, detail="Updated card could not be reloaded")

    return {"ok": True, "project_id": project_id, "document_id": document_id, "card": updated_card}


@app.delete("/api/projects/{project_id}/cards/{card_id}")
def delete_card(
    project_id: int,
    card_id: str,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_write=True)

    file_paths: List[str] = []

    with engine.begin() as conn:
        _ensure_supporting_tables(conn)
        _ensure_documents_table(conn)

        card_row = conn.execute(
            text(
                """
                SELECT id
                FROM cards
                WHERE project_id = :project_id AND card_id = :card_id
                LIMIT 1
                """
            ),
            {"project_id": project_id, "card_id": card_id},
        ).mappings().first()

        if not card_row:
            raise HTTPException(status_code=404, detail="Card not found")

        card_db_id = int(card_row["id"])
        doc_rows = conn.execute(
            text(
                """
                SELECT filepath
                FROM documents
                WHERE card_id = :card_id
                """
            ),
            {"card_id": card_db_id},
        ).mappings().all()
        file_paths = [str(row.get("filepath") or "").strip() for row in doc_rows if str(row.get("filepath") or "").strip()]

        conn.execute(text("DELETE FROM documents WHERE card_id = :card_id"), {"card_id": card_db_id})
        conn.execute(text("DELETE FROM checklists WHERE card_id = :card_id"), {"card_id": card_db_id})
        conn.execute(text("DELETE FROM deadlines WHERE card_id = :card_id"), {"card_id": card_db_id})
        conn.execute(
            text(
                """
                DELETE FROM connections
                WHERE project_id = :project_id
                  AND (from_card_id = :card_id OR to_card_id = :card_id)
                """
            ),
            {"project_id": project_id, "card_id": card_id},
        )
        deleted = conn.execute(
            text(
                """
                DELETE FROM cards
                WHERE id = :card_db_id AND project_id = :project_id
                """
            ),
            {"card_db_id": card_db_id, "project_id": project_id},
        )
        conn.execute(
            text("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = :project_id"),
            {"project_id": project_id},
        )

    if deleted.rowcount < 1:
        raise HTTPException(status_code=404, detail="Card not found")

    for file_path in file_paths:
        _delete_document_file(file_path)

    return {"ok": True, "project_id": project_id, "card_id": card_id}


@app.put("/api/projects/{project_id}/cards/{card_id}")
def update_card(
    project_id: int,
    card_id: str,
    payload: CardUpdateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _resolve_authenticated_user(authorization)
    _require_project_access(project_id=project_id, user_id=auth["local_user_id"], require_write=True)

    title = str(payload.title or payload.content or "").strip() or "Без названия"
    content = str(payload.content or payload.title or "").strip() or title
    color = _normalize_color(payload.color)
    card_deadline = _parse_date_string(payload.deadline)
    tasks = _coerce_task_items(payload)

    with engine.begin() as conn:
        _ensure_supporting_tables(conn)
        _ensure_card_size_columns(conn)

        card_row = conn.execute(
            text(
                """
                SELECT id, x, y, width, height, importance, urgency
                FROM cards
                WHERE project_id = :project_id AND card_id = :card_id
                LIMIT 1
                """
            ),
            {"project_id": project_id, "card_id": card_id},
        ).mappings().first()

        if not card_row:
            raise HTTPException(status_code=404, detail="Card not found")

        importance = _coalesce_scale_value(payload.importance, card_row.get("importance"))
        urgency = _coalesce_scale_value(payload.urgency, card_row.get("urgency"))

        card_db_id = int(card_row["id"])
        x = _normalize_card_dimension(
            payload.x if payload.x is not None else card_row.get("x"),
            0,
            -1000000,
            1000000,
        )
        y = _normalize_card_dimension(
            payload.y if payload.y is not None else card_row.get("y"),
            0,
            -1000000,
            1000000,
        )
        width = _normalize_card_dimension(
            payload.width if payload.width is not None else card_row.get("width"),
            420,
            340,
        )
        height = _normalize_card_dimension(
            payload.height if payload.height is not None else card_row.get("height"),
            260,
            220,
        )

        updated = conn.execute(
            text(
                """
                UPDATE cards
                SET title = :title,
                    content = :content,
                    x = :x,
                    y = :y,
                    width = :width,
                    height = :height,
                    importance = :importance,
                    urgency = :urgency,
                    color = :color,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :card_db_id AND project_id = :project_id
                """
            ),
            {
                "title": title,
                "content": content,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "importance": importance,
                "urgency": urgency,
                "color": color,
                "card_db_id": card_db_id,
                "project_id": project_id,
            },
        )

        if updated.rowcount < 1:
            raise HTTPException(status_code=404, detail="Card not found")

        conn.execute(text("DELETE FROM checklists WHERE card_id = :card_db_id"), {"card_db_id": card_db_id})
        conn.execute(text("DELETE FROM deadlines WHERE card_id = :card_db_id"), {"card_db_id": card_db_id})

        checklist_insert = text(
            """
            INSERT INTO checklists (card_id, task_id, text, checked, time, description, responsible, completed_at)
            VALUES (:card_id, :task_id, :text, :checked, :time, :description, :responsible, :completed_at)
            """
        )
        deadline_insert = text(
            """
            INSERT INTO deadlines (card_id, task_id, deadline)
            VALUES (:card_id, :task_id, :deadline)
            """
        )

        for task in tasks:
            conn.execute(
                checklist_insert,
                {
                    "card_id": card_db_id,
                    "task_id": task["id"],
                    "text": task["title"],
                    "checked": 1 if task["done"] else 0,
                    "time": task["time"],
                    "description": task["description"] or None,
                    "responsible": task["responsible"] or None,
                    "completed_at": task["completed_at"],
                },
            )
            if task["deadline"]:
                conn.execute(
                    deadline_insert,
                    {"card_id": card_db_id, "task_id": task["id"], "deadline": task["deadline"]},
                )

        if card_deadline:
            conn.execute(
                deadline_insert,
                {"card_id": card_db_id, "task_id": None, "deadline": card_deadline},
            )

        conn.execute(
            text("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = :project_id"),
            {"project_id": project_id},
        )

    board = _fetch_board(project_id)
    updated_card = next((card for card in board["cards"] if card["id"] == card_id), None)
    if not updated_card:
        raise HTTPException(status_code=500, detail="Saved card could not be reloaded")

    return {"ok": True, "project_id": project_id, "card": updated_card}
