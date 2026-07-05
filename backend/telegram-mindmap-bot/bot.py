from __future__ import annotations

import asyncio
import json
import logging
import socket
import time
import urllib.parse
import urllib.request
from contextlib import suppress
from typing import Optional

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import Message
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo

from config import load_settings
from guido_core_client import GuidoCoreClient
from llm_client import LlmBridgeClient, LlmSettings
from storage import BotStorage
from sync_service import MindmapSyncService


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("telegram_mindmap_bot")

_original_getaddrinfo = socket.getaddrinfo


def _ipv4_only_getaddrinfo(host: str, port: int, family: int = 0, type: int = 0, proto: int = 0, flags: int = 0):
    return _original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


socket.getaddrinfo = _ipv4_only_getaddrinfo

settings = load_settings()
storage = BotStorage(settings.storage_db_path)
guido_core = GuidoCoreClient(
    base_url=settings.guido_core_base,
    bridge_secret=settings.telegram_bridge_secret,
)
sync_service = MindmapSyncService(
    storage=storage,
    mindmap_api_base=settings.mindmap_api_base,
    mindmap_api_token=settings.mindmap_api_token,
    db_host=settings.mindmap_db_host,
    db_port=settings.mindmap_db_port,
    db_name=settings.mindmap_db_name,
    db_user=settings.mindmap_db_user,
    db_pass=settings.mindmap_db_pass,
    llm_client=LlmBridgeClient(
        LlmSettings(
            bridge_url=settings.llm_bridge_url,
            bridge_secret=settings.llm_bridge_secret,
            provider=settings.llm_provider,
            model=settings.llm_model,
            auth_profile_id=settings.llm_auth_profile_id,
            agent_id=settings.llm_agent_id,
        )
    ),
)

dp = Dispatcher()
scheduler = AsyncIOScheduler(timezone=ZoneInfo(settings.bot_timezone))


def _chat_title(message: Message) -> str:
    chat = message.chat
    return str(chat.title or chat.full_name or chat.username or chat.id)


def _thread_id(message: Message) -> Optional[int]:
    value = getattr(message, "message_thread_id", None)
    return int(value) if value is not None else None


def _thread_title(message: Message) -> Optional[str]:
    if getattr(message, "is_topic_message", False):
        thread_id = _thread_id(message)
        return f"Topic #{thread_id}" if thread_id is not None else "Forum topic"
    return None


def _scope_label(message: Message) -> str:
    base = _chat_title(message)
    title = _thread_title(message)
    return f"{base} / {title}" if title else base


def _telegram_send_message(chat_id: int, text: str, message_thread_id: Optional[int] = None) -> None:
    payload = {
        "chat_id": str(chat_id),
        "text": text,
    }
    if message_thread_id is not None:
        payload["message_thread_id"] = str(message_thread_id)

    data = urllib.parse.urlencode(payload).encode("utf-8")
    url = f"https://api.telegram.org/bot{settings.bot_token}/sendMessage"
    last_error: Exception | None = None

    for attempt in range(3):
        request = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = json.loads(response.read().decode("utf-8"))
            if not raw.get("ok"):
                raise RuntimeError(f"Telegram sendMessage failed: {raw}")
            return
        except Exception as exc:
            last_error = exc
            logger.warning("sendMessage failed on attempt %s for chat %s: %s", attempt + 1, chat_id, exc)
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))

    assert last_error is not None
    raise last_error


async def _reply(message: Message, text: str) -> None:
    await asyncio.to_thread(
        _telegram_send_message,
        int(message.chat.id),
        text,
        _thread_id(message),
    )


def _author_name(message: Message) -> str:
    user = message.from_user
    if not user:
        return "Unknown"
    return str(user.username or user.full_name or user.id)


async def _run_daily_sync() -> None:
    logger.info("Daily sync started")
    results = await sync_service.sync_all_enabled(reason="daily_schedule")
    logger.info("Daily sync finished: %s target(s)", len(results))


@dp.message(Command("start"))
async def cmd_start(message: Message) -> None:
    await _reply(
        message,
        "Бот запущен.\n\n"
        "Команды:\n"
        "/sync - подписать текущую группу или тему на ежедневный sync\n"
        "/unsync - снять подписку с текущей группы или темы\n"
        "/status - показать статус подписки\n"
        "/sync_now - запустить sync вручную",
    )


@dp.message(Command("sync"))
async def cmd_sync(message: Message) -> None:
    user = message.from_user
    if not user:
        await _reply(message, "Не удалось определить пользователя Telegram.")
        return

    try:
        linked_user = guido_core.resolve_linked_user(user.id)
    except Exception as exc:
        logger.exception("resolve_linked_user failed for telegram_user_id=%s", user.id)
        await _reply(message, f"Не удалось проверить привязку Guido: {exc}")
        return

    if not linked_user:
        await _reply(
            message,
            "Этот Telegram-аккаунт не привязан к Guido.\n"
            "Сначала откройте в Guido настройки и привяжите Telegram, потом повторите /sync.",
        )
        return

    target = storage.upsert_sync_target(
        chat_id=message.chat.id,
        chat_title=_chat_title(message),
        thread_id=_thread_id(message),
        thread_title=_thread_title(message),
        created_by_user_id=user.id,
        created_by_username=user.username or user.full_name or str(user.id),
        owner_user_id=linked_user.user_id,
        owner_email=linked_user.email,
    )

    await _reply(
        message,
        "Sync включен.\n"
        f"Объект: {_scope_label(message)}\n"
        f"Владелец Guido: {linked_user.email}\n"
        f"Подписка ID: {target.id}\n"
        f"Ежедневный запуск: {settings.sync_hour:02d}:{settings.sync_minute:02d} ({settings.bot_timezone})",
    )


@dp.message(Command("unsync"))
async def cmd_unsync(message: Message) -> None:
    disabled = storage.disable_sync_target(chat_id=message.chat.id, thread_id=_thread_id(message))
    if not disabled:
        await _reply(message, "Для этой группы или темы подписка не найдена.")
        return

    await _reply(message, f"Sync выключен для: {_scope_label(message)}")


@dp.message(Command("status"))
async def cmd_status(message: Message) -> None:
    target = storage.get_sync_target(chat_id=message.chat.id, thread_id=_thread_id(message))
    if not target:
        await _reply(message, f"Подписка не настроена для: {_scope_label(message)}")
        return

    state = "включен" if target.sync_enabled else "выключен"
    await _reply(
        message,
        f"Статус sync: {state}\n"
        f"Объект: {_scope_label(message)}\n"
        f"Владелец Guido: {target.owner_email or 'не определен'}\n"
        f"Последний запуск: {target.last_synced_at or 'еще не было'}\n"
        f"Последний статус: {target.last_sync_status or 'нет'}\n"
        f"Последняя ошибка: {target.last_sync_error or 'нет'}",
    )


@dp.message(Command("sync_now"))
async def cmd_sync_now(message: Message) -> None:
    try:
        result = await sync_service.sync_chat_target(
            chat_id=message.chat.id,
            thread_id=_thread_id(message),
            reason="manual_command",
        )
        await _reply(message, f"Ручной sync завершен.\n{result}")
    except ValueError as exc:
        await _reply(message, str(exc))
    except Exception as exc:
        logger.exception("Manual sync failed")
        await _reply(message, f"Sync завершился с ошибкой: {exc}")


@dp.message(F.text.startswith("/"))
async def unknown_command(message: Message) -> None:
    await _reply(message, "Неизвестная команда. Используй /start")


@dp.message(F.text)
async def capture_message(message: Message) -> None:
    text = str(message.text or "").strip()
    if not text or text.startswith("/"):
        return

    target = storage.get_sync_target(chat_id=message.chat.id, thread_id=_thread_id(message))
    if not target or not target.sync_enabled:
        return

    user = message.from_user
    if not user:
        return

    stored = storage.store_message(
        target_id=target.id,
        message_id=int(message.message_id),
        chat_id=int(message.chat.id),
        thread_id=_thread_id(message),
        telegram_user_id=int(user.id),
        author_name=_author_name(message),
        text=text,
        sent_at=message.date.isoformat(),
    )
    if stored:
        logger.info(
            "Stored message for target_id=%s chat=%s thread=%s message_id=%s",
            target.id,
            message.chat.id,
            _thread_id(message),
            message.message_id,
        )


async def main() -> None:
    if not settings.bot_token:
        raise RuntimeError("BOT_TOKEN is empty. Fill it in .env before start.")

    scheduler.add_job(
        _run_daily_sync,
        CronTrigger(hour=settings.sync_hour, minute=settings.sync_minute, timezone=ZoneInfo(settings.bot_timezone)),
        id="daily_sync",
        replace_existing=True,
    )
    scheduler.start()

    logger.info("Bot started")
    logger.info(
        "Daily sync schedule: %02d:%02d (%s)",
        settings.sync_hour,
        settings.sync_minute,
        settings.bot_timezone,
    )

    try:
        while True:
            bot = Bot(settings.bot_token)
            try:
                await dp.start_polling(bot)
            except Exception as exc:
                logger.exception("Polling crashed, restarting in 5 seconds: %s", exc)
                with suppress(Exception):
                    await bot.session.close()
                await asyncio.sleep(5)
            else:
                break
    finally:
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    asyncio.run(main())
