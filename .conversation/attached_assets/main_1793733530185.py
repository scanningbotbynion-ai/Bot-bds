"""
Telegram-controlled access key for Chinese Auto Bot.

Setup:
    pip install fastapi uvicorn httpx
    export TELEGRAM_BOT_TOKEN="123456:ABC..."          # from @BotFather (keep it secret)
    export ADMIN_IDS="111111111"                       # your Telegram user id(s), comma-separated
    export ALLOWED_ORIGIN="https://your-site.example"  # origin of your web app
    python main.py        (on Replit just press Run)

Telegram commands (admins only):
    /key              show the current key
    /newkey           generate and save a random 6-character key
    /setkey NEWKEY    set a specific key (4-32 letters/numbers)

Your web app calls:
    POST /api/verify-key   {"key": "AKDBDJ"}   ->   {"ok": true | false}
"""
import asyncio
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ADMIN_IDS = {int(x) for x in os.environ.get("ADMIN_IDS", "").split(",") if x.strip()}
KEY_FILE = Path(os.environ.get("KEY_FILE", "access_key.json"))
ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
API = f"https://api.telegram.org/bot{TOKEN}"
KEY_RE = re.compile(r"^[A-Za-z0-9]{4,32}$")


def load_key() -> str:
    try:
        return json.loads(KEY_FILE.read_text())["key"]
    except Exception:
        return "AKDBDJ"  # default until you change it from Telegram


def save_key(key: str) -> None:
    KEY_FILE.write_text(json.dumps({"key": key}))


app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=[ORIGIN], allow_methods=["POST"], allow_headers=["*"]
)

attempts: dict[str, list[float]] = {}


def rate_limited(ip: str, limit: int = 10, window: int = 60) -> bool:
    now = time.time()
    recent = [t for t in attempts.get(ip, []) if now - t < window]
    recent.append(now)
    attempts[ip] = recent
    return len(recent) > limit


@app.post("/api/verify-key")
async def verify_key(request: Request):
    ip = request.client.host if request.client else "unknown"
    if rate_limited(ip):
        return {"ok": False, "error": "too_many_attempts"}
    try:
        body = await request.json()
        given = str(body.get("key", "")).strip().upper()
    except Exception:
        return {"ok": False}
    return {"ok": hmac.compare_digest(given.encode(), load_key().upper().encode())}


async def tg(client: httpx.AsyncClient, method: str, **params):
    r = await client.post(f"{API}/{method}", json=params, timeout=60)
    return r.json()


async def handle(client: httpx.AsyncClient, msg: dict):
    uid = msg.get("from", {}).get("id")
    chat = msg["chat"]["id"]
    if uid not in ADMIN_IDS:
        await tg(client, "sendMessage", chat_id=chat, text="Not authorized.")
        return
    cmd, _, arg = (msg.get("text") or "").strip().partition(" ")
    cmd = cmd.split("@")[0].lower()
    arg = arg.strip()
    if cmd == "/key":
        reply = f"Current key: {load_key()}"
    elif cmd == "/newkey":
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        new = "".join(secrets.choice(alphabet) for _ in range(6))
        save_key(new)
        reply = f"New key: {new}"
    elif cmd == "/setkey":
        if KEY_RE.match(arg):
            save_key(arg.upper())
            reply = f"Key changed to: {arg.upper()}"
        else:
            reply = "Usage: /setkey NEWKEY  (4-32 letters or numbers)"
    else:
        reply = "Commands: /key, /newkey, /setkey NEWKEY"
    await tg(client, "sendMessage", chat_id=chat, text=reply)


async def poll():
    offset = 0
    async with httpx.AsyncClient() as client:
        while True:
            try:
                data = await tg(client, "getUpdates", offset=offset, timeout=30)
                for upd in data.get("result", []):
                    offset = upd["update_id"] + 1
                    if "message" in upd:
                        await handle(client, upd["message"])
            except Exception:
                await asyncio.sleep(3)


@app.on_event("startup")
async def start_bot():
    asyncio.create_task(poll())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
