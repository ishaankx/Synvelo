import httpx
import jwt as pyjwt
from fastapi import Header, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"

bearer_scheme = HTTPBearer(auto_error=False)

# Module-level JWKS cache — refreshable unlike lru_cache
_jwks_cache: dict | None = None


def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache
    if _jwks_cache is not None and not force_refresh:
        return _jwks_cache
    if not settings.supabase_url:
        return {"keys": []}
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        print(f"DEBUG JWKS fetched: {len(_jwks_cache.get('keys', []))} keys")
        for k in _jwks_cache.get("keys", []):
            print(f"  key: kid={k.get('kid')} kty={k.get('kty')} alg={k.get('alg')}")
        return _jwks_cache
    except Exception as e:
        print(f"WARNING: Could not fetch JWKS: {e}")
        return {"keys": []}


def _try_verify_with_jwks(token: str, kid: str) -> dict | None:
    """Try to verify token using JWKS keys. Returns payload or None."""
    for force in [False, True]:  # try cached first, then force refresh
        jwks = _get_jwks(force_refresh=force)
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
                print(f"DEBUG: verified with JWKS key kid={key.get('kid')} kty={kty}")
                return payload

            except pyjwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Token expired")
            except pyjwt.InvalidAlgorithmError as e:
                print(f"DEBUG: alg mismatch for kid={key.get('kid')}: {e}")
                continue
            except pyjwt.InvalidTokenError as e:
                print(f"DEBUG: invalid token for kid={key.get('kid')}: {e}")
                continue
            except Exception as e:
                print(f"DEBUG: unexpected error for kid={key.get('kid')}: {e}")
                continue

    return None


def _decode_supabase_jwt(token: str) -> dict:
    # Inspect header
    try:
        header = pyjwt.get_unverified_header(token)
        kid = header.get("kid", "")
        alg = header.get("alg", "")
        print(f"DEBUG token: kid={kid} alg={alg}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Malformed token: {e}")

    # Debug: show unverified metadata
    try:
        unverified = pyjwt.decode(token, options={"verify_signature": False})
        print(f"DEBUG user_metadata: {unverified.get('user_metadata')}")
    except Exception:
        pass

    # --- Attempt 1 & 2: JWKS (with cache refresh on retry) ---
    payload = _try_verify_with_jwks(token, kid)
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
            print("DEBUG: verified with legacy HS256 secret")
            return payload
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except pyjwt.InvalidTokenError as e:
            print(f"DEBUG HS256 failed: {e}")

    raise HTTPException(status_code=401, detail="Could not verify token with any available key")


async def get_org_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    x_org_id: str = Header(default=None),
) -> str:
    if credentials and credentials.credentials:
        payload = _decode_supabase_jwt(credentials.credentials)
        user_metadata = payload.get("user_metadata") or {}
        app_metadata  = payload.get("app_metadata") or {}
        org_id = user_metadata.get("org_id") or app_metadata.get("org_id")
        if not org_id:
            raise HTTPException(status_code=403, detail="User has no organisation. Complete onboarding first.")
        return org_id

    if x_org_id:
        return x_org_id

    return DEFAULT_ORG_ID


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not credentials or not credentials.credentials:
        return {"sub": "dev-user", "email": "dev@local"}
    return _decode_supabase_jwt(credentials.credentials)