import type { RequestHandler } from "express";

type Options = {
  nodeEnv: string | undefined;
  apiUrl: string | undefined;
  fetchUpstream?: typeof fetch;
};

function isSharedRequest(method: string, path: string): boolean {
  if (method === "POST") {
    return /^\/(?:verify-key|payment-review|pin-review)$/.test(path);
  }
  return method === "GET" &&
    /^\/(?:payment-review|pin-review)\/[0-9a-f-]{36}$/i.test(path);
}

// Preview must use the production review database as well as its bot; sending
// with a shared token but saving locally would make production callbacks fail.
export function createSharedReviewProxy(options: Options): RequestHandler {
  if (options.nodeEnv === "production" || !options.apiUrl?.trim()) {
    return (_req, _res, next) => next();
  }

  const base = new URL(options.apiUrl);
  if (
    base.protocol !== "https:" || base.username || base.password ||
    base.search || base.hash
  ) {
    throw new Error("Shared review API must be an HTTPS URL without credentials or query parameters.");
  }
  const fetchUpstream = options.fetchUpstream ?? fetch;

  return async (req, res, next): Promise<void> => {
    if (!isSharedRequest(req.method, req.path)) {
      next();
      return;
    }
    const target = new URL(base);
    target.pathname = `${base.pathname.replace(/\/$/, "")}${req.path}`;
    res.setHeader("Cache-Control", "no-store");

    try {
      // Never forward cookies/authorization or retry submissions: the published
      // API validates consent and owns all review decisions and key state.
      const response = await fetchUpstream(target, {
        method: req.method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        ...(req.method === "POST" ? { body: JSON.stringify(req.body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      const data: unknown = await response.json();
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      res.status(response.status).json(data);
    } catch (error) {
      req.log.warn({
        failureKind: error instanceof Error ? error.name : "unknown",
      }, "Shared production review API unavailable");
      // Do not fall back to a local review or a second bot.
      res.status(503).json({ error: "review_unavailable" });
    }
  };
}
