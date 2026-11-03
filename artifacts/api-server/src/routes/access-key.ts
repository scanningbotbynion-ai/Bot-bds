import { Router, type IRouter, type Request } from "express";
import { getAccessKeyState, keysMatch } from "../lib/access-key";

const router: IRouter = Router();
const KEY_PATTERN = /^[A-Za-z0-9]{4,32}$/;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const attempts = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter(
    (time) => now - time < RATE_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT) {
    attempts.set(ip, recent);
    return true;
  }

  recent.push(now);
  attempts.set(ip, recent);

  if (attempts.size > 10_000) {
    for (const [address, times] of attempts) {
      if (times.every((time) => now - time >= RATE_WINDOW_MS)) {
        attempts.delete(address);
      }
    }
  }

  return false;
}

function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

router.post("/verify-key", async (request, response) => {
  if (isRateLimited(clientIp(request))) {
    response.status(429).json({ ok: false, error: "too_many_attempts" });
    return;
  }

  const rawKey = request.body?.key;
  if (typeof rawKey !== "string") {
    response.status(400).json({ ok: false, error: "invalid_request" });
    return;
  }

  const given = rawKey.trim().toUpperCase();
  if (!KEY_PATTERN.test(given)) {
    response.json({ ok: false });
    return;
  }

  try {
    const state = await getAccessKeyState();
    response.json({ ok: keysMatch(given, state.key) });
  } catch (error) {
    request.log.error({ err: error }, "Access-key verification failed");
    response.status(503).json({ ok: false, error: "service_unavailable" });
  }
});

export default router;
