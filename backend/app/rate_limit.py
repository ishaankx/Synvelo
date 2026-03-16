"""
Rate limiting + AI usage metering.

General endpoints: 100 requests/minute per key (org_id or IP).
AI endpoints (scoring, brief, follow-up, RAG): 10 requests/minute per key.

Usage metering tracks AI API calls per org per month in Redis.
"""
import logging
from datetime import datetime, timezone

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("synvelo.ratelimit")


def _get_rate_limit_key(request: Request) -> str:
    """Use org_id from JWT or header as rate limit key, fall back to IP."""
    # Check if org_id was resolved by a dependency — it's stored in request state
    # by the middleware. Fallback: check header, then IP.
    org_id = request.headers.get("x-org-id")
    if org_id:
        return f"org:{org_id}"
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        # Use a hash of the token prefix to group by user without decoding here
        return f"tok:{auth[7:15]}"
    return get_remote_address(request)


limiter = Limiter(
    key_func=_get_rate_limit_key,
    storage_uri=settings.redis_url,
    default_limits=["100/minute"],
)

# Rate strings for AI-heavy endpoints
AI_RATE = "10/minute"
GENERAL_RATE = "100/minute"


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    logger.warning("Rate limit exceeded: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please try again later.",
            "retry_after": str(exc.detail),
        },
    )


# ── Usage metering ──────────────────────────────────────────────────────────

async def track_ai_usage(org_id: str, endpoint: str) -> None:
    """Increment AI usage counter for this org in Redis.

    Key format: ai_usage:{org_id}:{YYYY-MM}
    Each key auto-expires after 90 days.
    """
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
        hash_key = f"ai_usage:{org_id}:{month_key}"
        await r.hincrby(hash_key, endpoint, 1)
        await r.hincrby(hash_key, "total", 1)
        await r.expire(hash_key, 90 * 86400)  # 90-day TTL
        await r.aclose()
    except Exception as e:
        logger.debug("Usage tracking unavailable: %s", e)


async def get_ai_usage(org_id: str, month: str | None = None) -> dict:
    """Get AI usage counters for an org for a given month."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        if not month:
            month = datetime.now(timezone.utc).strftime("%Y-%m")
        hash_key = f"ai_usage:{org_id}:{month}"
        usage = await r.hgetall(hash_key)
        await r.aclose()
        return {k: int(v) for k, v in usage.items()} if usage else {}
    except Exception as e:
        logger.debug("Usage read unavailable: %s", e)
        return {}
