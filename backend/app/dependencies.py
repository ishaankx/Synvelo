from fastapi import Header, HTTPException

# DEFAULT_ORG is used during development and for your demo data.
# When Supabase Auth is added (next phase), this entire function
# gets replaced with JWT decoding — every router stays the same.
DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"


async def get_org_id(x_org_id: str = Header(default=None)) -> str:
    """
    Extract org_id from request header.
    
    In production (after Supabase auth):
        - This will decode the JWT and extract org_id from claims
        - The Header dependency gets replaced with OAuth2 bearer token
        - All routers that depend on this function get auth automatically
    
    For now: pass X-Org-ID header, or fall back to default org.
    """
    if x_org_id:
        return x_org_id
    # Fall back to default org so existing frontend keeps working
    return DEFAULT_ORG_ID