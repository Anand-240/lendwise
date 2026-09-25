from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger("lendwise.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Request ID, access log (no PII: method, path template, status, ms) and security headers."""

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if 8 <= len(incoming) <= 64 and incoming.replace("-", "").isalnum() else uuid.uuid4().hex
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        log.info("%s %s %s %.1fms rid=%s", request.method, path, response.status_code, elapsed, request_id)
        response.headers["X-Request-ID"] = request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        return response


class RateLimiter:
    """In-memory sliding-window limiter (per process). Good enough for a single-instance demo."""

    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> float | None:
        """Record a hit; return seconds to wait if the limit is exceeded, else None."""
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return self.window - (now - q[0])
        q.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()


def client_key(request: Request) -> str:
    # Requests arrive via the Next.js proxy, which forwards the browser's IP.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
