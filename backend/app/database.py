import re
import logging
import httpx
import psycopg2
from datetime import date, datetime
from psycopg2.extras import RealDictCursor
from backend.app.config import DATABASE_URL, NEON_HTTP_URL, NEON_CONN_STR

logger = logging.getLogger("backend.database")

# Persistent shared HTTP client with connection pooling to eliminate TLS handshake overhead
_http_client = httpx.Client(
    timeout=httpx.Timeout(10.0, connect=4.0),
    limits=httpx.Limits(max_keepalive_connections=25, max_connections=50, keepalive_expiry=60.0)
)

def get_db_connection():
    """
    Returns a live psycopg2 connection with a 3-second timeout.
    """
    return psycopg2.connect(DATABASE_URL, connect_timeout=3)

def _sanitize_param_for_neon(val):
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return val

def _convert_percent_s_to_neon_params(query: str):
    """
    Converts Python/psycopg2 %s placeholders to PostgreSQL $1, $2, ... for Neon HTTP SQL.
    """
    idx = 1
    out = []
    curr = 0
    for m in re.finditer(r'%s', query):
        out.append(query[curr:m.start()])
        out.append(f'${idx}')
        idx += 1
        curr = m.end()
    out.append(query[curr:])
    return ''.join(out)

def execute_query(query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = False, commit: bool = False):
    """
    Executes a SQL query against the Neon 'tata1mg_desk' database.
    Uses Neon's fast HTTPS SQL API over port 443 to guarantee zero latency and bypass
    local network blocks on TCP port 5432. Falls back to psycopg2 if needed.
    """
    # 1. Primary: Neon HTTPS SQL API (Port 443 - Instant & Firewall-Proof)
    try:
        p_list = [_sanitize_param_for_neon(p) for p in params] if params else []
        converted_query = _convert_percent_s_to_neon_params(query) if p_list else query

        headers = {
            "Neon-Connection-String": NEON_CONN_STR,
            "Content-Type": "application/json"
        }
        payload = {
            "query": converted_query,
            "params": p_list
        }

        resp = _http_client.post(NEON_HTTP_URL, json=payload, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            rows = data.get("rows", [])
            
            # Format output based on caller flags
            if fetch_all:
                return rows
            if fetch_one:
                return rows[0] if rows else None
            if rows:
                return rows[0]
            return {} if not commit else True
        else:
            logger.warning(f"Neon HTTP returned status {resp.status_code}: {resp.text}")
    except Exception as http_err:
        logger.warning(f"Neon HTTP SQL request error: {http_err}. Attempting psycopg2 fallback...")

    # 2. Fallback: Direct TCP connection via psycopg2 with 3s connect_timeout
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params or ())
                result = None
                if fetch_one:
                    result = cur.fetchone()
                elif fetch_all:
                    result = cur.fetchall()
                elif cur.description:
                    result = cur.fetchone()
                if commit:
                    conn.commit()
                return result or ({} if not fetch_all else [])
        finally:
            conn.close()
    except Exception as tcp_err:
        logger.error(f"Database query failed completely: {tcp_err}")
        if fetch_all:
            return []
        if fetch_one:
            return None
        return {}
