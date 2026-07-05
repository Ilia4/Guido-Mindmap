from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass(slots=True)
class GuidoLinkedUser:
    user_id: int
    email: str
    role: str
    telegram_connected: bool


class GuidoCoreClient:
    def __init__(self, base_url: str, bridge_secret: str) -> None:
        self.base_url = str(base_url or "").strip().rstrip("/")
        self.bridge_secret = str(bridge_secret or "").strip()

    def resolve_linked_user(self, telegram_user_id: int) -> GuidoLinkedUser | None:
        if not self.base_url or not self.bridge_secret:
            raise RuntimeError("GUIDO_CORE_BASE or TELEGRAM_BRIDGE_SECRET is empty")

        request = urllib.request.Request(
            f"{self.base_url}/auth/telegram/internal/resolve-user",
            data=json.dumps({"telegram_id": int(telegram_user_id)}).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "X-Telegram-Bridge-Secret": self.bridge_secret,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Guido Core resolve-user failed: HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Guido Core resolve-user failed: {exc}") from exc

        return GuidoLinkedUser(
            user_id=int(data["user_id"]),
            email=str(data["email"]),
            role=str(data.get("role") or "user"),
            telegram_connected=bool(data.get("telegram_connected")),
        )
