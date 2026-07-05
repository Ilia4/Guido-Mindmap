from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(slots=True)
class Settings:
    bot_token: str
    bot_timezone: str
    sync_hour: int
    sync_minute: int
    storage_db_path: str
    guido_core_base: str
    telegram_bridge_secret: str
    mindmap_api_base: str
    mindmap_api_token: str
    mindmap_db_host: str
    mindmap_db_port: int
    mindmap_db_name: str
    mindmap_db_user: str
    mindmap_db_pass: str
    llm_bridge_url: str
    llm_bridge_secret: str
    llm_provider: str
    llm_model: str
    llm_auth_profile_id: str
    llm_agent_id: str


def load_settings() -> Settings:
    return Settings(
        bot_token=os.getenv("BOT_TOKEN", "").strip(),
        bot_timezone=os.getenv("BOT_TIMEZONE", "Europe/Moscow").strip() or "Europe/Moscow",
        sync_hour=int(os.getenv("SYNC_HOUR", "9").strip() or "9"),
        sync_minute=int(os.getenv("SYNC_MINUTE", "0").strip() or "0"),
        storage_db_path=os.getenv("STORAGE_DB_PATH", "./bot_storage.sqlite3").strip() or "./bot_storage.sqlite3",
        guido_core_base=os.getenv("GUIDO_CORE_BASE", "").strip().rstrip("/"),
        telegram_bridge_secret=os.getenv("TELEGRAM_BRIDGE_SECRET", "").strip(),
        mindmap_api_base=os.getenv("MINDMAP_API_BASE", "").strip().rstrip("/"),
        mindmap_api_token=os.getenv("MINDMAP_API_TOKEN", "").strip(),
        mindmap_db_host=os.getenv("MINDMAP_DB_HOST", "127.0.0.1").strip() or "127.0.0.1",
        mindmap_db_port=int(os.getenv("MINDMAP_DB_PORT", "3306").strip() or "3306"),
        mindmap_db_name=os.getenv("MINDMAP_DB_NAME", "").strip(),
        mindmap_db_user=os.getenv("MINDMAP_DB_USER", "").strip(),
        mindmap_db_pass=os.getenv("MINDMAP_DB_PASS", "").strip(),
        llm_bridge_url=os.getenv("LLM_BRIDGE_URL", "").strip().rstrip("/"),
        llm_bridge_secret=os.getenv("LLM_BRIDGE_SECRET", "").strip(),
        llm_provider=os.getenv("LLM_PROVIDER", "openai-codex").strip() or "openai-codex",
        llm_model=os.getenv("LLM_MODEL", "gpt-5.3-codex").strip() or "gpt-5.3-codex",
        llm_auth_profile_id=os.getenv("LLM_AUTH_PROFILE_ID", "openai-codex:default").strip(),
        llm_agent_id=os.getenv("LLM_AGENT_ID", "main").strip() or "main",
    )
