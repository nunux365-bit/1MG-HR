import os
from dotenv import load_dotenv

load_dotenv()

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

# Fast Neon HTTP SQL endpoint over HTTPS port 443 (resilient to ISP port 5432 blocks)
NEON_HTTP_HOST = NEON_HOST.replace("-pooler", "")
NEON_HTTP_URL = f"https://{NEON_HTTP_HOST}/sql"
NEON_CONN_STR = f"postgresql://{NEON_USER}:{NEON_PASSWORD}@{NEON_HTTP_HOST}/{NEON_DBNAME}?sslmode=require"

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "vaibhavx002@zohomail.in")
ADMIN_APP_PASSWORD = os.getenv("ADMIN_APP_PASSWORD", "")
PORT = int(os.getenv("PORT", 9000))
HOST = os.getenv("HOST", "0.0.0.0")
