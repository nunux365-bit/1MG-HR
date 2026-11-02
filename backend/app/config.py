import os
from dotenv import load_dotenv

load_dotenv()

from urllib.parse import urlparse

# Neon PostgreSQL connection parameters for People Desk (tata1mg_desk)
NEON_HOST = os.getenv("NEON_HOST", "ep-delicate-band-b3531bbp-pooler.c-4.ap-southeast-1.aws.neon.tech")
NEON_PORT = int(os.getenv("NEON_PORT", 5432))
NEON_DBNAME = os.getenv("NEON_DBNAME", "tata1mg_desk")
NEON_USER = os.getenv("NEON_USER", "neondb_owner")
NEON_PASSWORD = os.getenv("NEON_PASSWORD", "npg_prCYPycw8L7q")

# Clean standard connection string pointing directly to tata1mg_desk
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{NEON_USER}:{NEON_PASSWORD}@{NEON_HOST}/{NEON_DBNAME}?sslmode=require"
)

# If DATABASE_URL is explicitly set (e.g. Render / Cloud environment), parse components dynamically
if os.getenv("DATABASE_URL"):
    try:
        parsed_db = urlparse(os.getenv("DATABASE_URL"))
        if parsed_db.hostname:
            NEON_HOST = parsed_db.hostname
            if parsed_db.port:
                NEON_PORT = parsed_db.port
            if parsed_db.username:
                NEON_USER = parsed_db.username
            if parsed_db.password:
                NEON_PASSWORD = parsed_db.password
            if parsed_db.path and parsed_db.path.lstrip("/"):
                NEON_DBNAME = parsed_db.path.lstrip("/")
    except Exception:
        pass

# Fast Neon HTTP SQL endpoint over HTTPS port 443 (resilient to ISP port 5432 blocks)
NEON_HTTP_HOST = NEON_HOST.replace("-pooler", "")
NEON_HTTP_URL = f"https://{NEON_HTTP_HOST}/sql"
NEON_CONN_STR = f"postgresql://{NEON_USER}:{NEON_PASSWORD}@{NEON_HTTP_HOST}/{NEON_DBNAME}?sslmode=require"

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "vaibhavx002@zohomail.in")
ADMIN_APP_PASSWORD = os.getenv("ADMIN_APP_PASSWORD", "")
PORT = int(os.getenv("PORT", 9000))
HOST = os.getenv("HOST", "0.0.0.0")
