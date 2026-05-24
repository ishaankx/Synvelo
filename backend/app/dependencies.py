import asyncio
import logging
import time
import httpx
import jwt as pyjwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

logger = logging.getLogger("synvelo.auth")

bearer_scheme = HTTPBearer(auto_error=False)

# JWKS cache. TTL=1h. asyncio.Lock prevents stampede when many requests arrive
# while the cache is empty/expired.
_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0
_jwks_lock = asyncio.Lock()


async def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    fresh = (
        _jwks_cache is not None
        and not force_refresh
        and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS
    )
    if fresh:
        return _jwks_cache  # type: ignore[return-value]

    async with _jwks_lock:
        # Re-check inside the lock — another waiter may have just refreshed.
        now = time.time()
        if (
            _jwks_cache is not None
            and not force_refresh
            and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS
        ):
            return _jwks_cache

        if not settings.supabase_url:
            _jwks_cache = {"keys": []}
            _jwks_fetched_at = now
            return _jwks_cache

        url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                _jwks_cache = resp.json()
                _jwks_fetched_at = now
                logger.info("JWKS fetched: %d keys", len(_jwks_cache.get("keys", [])))
                return _jwks_cache
        except Exception as e:
            logger.warning("Could not fetch JWKS: %s", e)
            # Keep the previous cache if we had one — better than nothing.
            if _jwks_cache is None:
                _jwks_cache = {"keys": []}
                _jwks_fetched_at = now
            return _jwks_cache


async def _try_verify_with_jwks(token: str, kid: str) -> dict | None:
    """Try to verify token using JWKS keys. Returns payload or None."""
    for force in [False, True]:  # try cached first, then force refresh
        jwks = await _get_jwks(force_refresh=force)
        keys = jwks.get("keys", [])
        if not keys:
            continue

        # Try exact kid match first, then all keys
        ordered = [k for k in keys if k.get("kid", "").lower() == kid.lower()]
        ordered += [k for k in keys if k.get("kid", "").lower() != kid.lower()]

        for key in ordered:
            kty = key.get("kty", "")
            try:
                if kty == "EC":
                    signing_key = pyjwt.algorithms.ECAlgorithm.from_jwk(key)
                    algs = ["ES256", "ES384", "ES512"]
                elif kty == "RSA":
                    signing_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key)
                    algs = ["RS256", "RS384", "RS512"]
                else:
                    continue

                payload = pyjwt.decode(
                    token, signing_key,
                    algorithms=algs,
                    options={"verify_aud": False},
                )
                return payload

            except pyjwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Token expired")
            except pyjwt.InvalidAlgorithmError:
                continue
            except pyjwt.InvalidTokenError:
                continue
            except Exception:
                continue

    return None


async def _decode_supabase_jwt(token: str) -> dict:
    try:
        header = pyjwt.get_unverified_header(token)
        kid = header.get("kid", "")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Malformed token: {e}")

    # --- Attempt 1 & 2: JWKS (with cache refresh on retry) ---
    payload = await _try_verify_with_jwks(token, kid)
    if payload is not None:
        return payload

    # --- Attempt 3: Legacy HS256 secret ---
    if settings.supabase_jwt_secret:
        try:
            payload = pyjwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except pyjwt.InvalidTokenError:
            pass

    raise HTTPException(status_code=401, detail="Could not verify token with any available key")


async def get_org_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = await _decode_supabase_jwt(credentials.credentials)
    user_metadata = payload.get("user_metadata") or {}
    app_metadata  = payload.get("app_metadata") or {}
    org_id = user_metadata.get("org_id") or app_metadata.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="User has no organisation. Complete onboarding first.")
    return org_id


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _decode_supabase_jwt(credentials.credentials)
