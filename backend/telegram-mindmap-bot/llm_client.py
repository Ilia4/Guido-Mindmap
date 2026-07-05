from __future__ import annotations

import json
from dataclasses import dataclass

import httpx


@dataclass(slots=True)
class LlmSettings:
    bridge_url: str
    bridge_secret: str
    provider: str
    model: str
    auth_profile_id: str
    agent_id: str


class LlmBridgeClient:
    def __init__(self, settings: LlmSettings) -> None:
        self.settings = settings

    def complete_json(self, message: str, *, timeout_ms: int = 240000, max_tokens: int = 2200) -> dict:
        if not self.settings.bridge_url:
            raise RuntimeError("LLM bridge URL is not configured")

        payload = {
            "message": message,
            "provider": self.settings.provider,
            "model": self.settings.model,
            "authProfileId": self.settings.auth_profile_id,
            "agentId": self.settings.agent_id,
            "timeoutMs": int(timeout_ms),
            "maxTokens": int(max_tokens),
        }
        headers = {"Content-Type": "application/json"}
        if self.settings.bridge_secret:
            headers["X-Bridge-Secret"] = self.settings.bridge_secret

        with httpx.Client(timeout=(timeout_ms / 1000.0) + 30.0) as client:
            response = client.post(f"{self.settings.bridge_url}/reply", json=payload, headers=headers)
        response.raise_for_status()
        body = response.json()
        reply = str(body.get("reply") or "").strip()
        if not reply:
            raise RuntimeError("LLM bridge returned empty reply")
        try:
            return json.loads(reply)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"LLM bridge returned invalid JSON: {reply[:500]}") from exc
