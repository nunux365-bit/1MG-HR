import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from backend.app.routes import auth, admin_users, cases, department_routes

logger = logging.getLogger("backend.main")


async def _background_imap_poller():
    """Periodically syncs the centralized People Desk mailbox so inbound mails get auto-cased even offline."""
    from backend.app.services.imap_service import (
        has_system_mailbox_config,
        sync_inbound_emails_from_mailbox,
    )

    try:
        interval = max(20, int(os.getenv("IMAP_POLL_INTERVAL_SECONDS", "60")))
    except (ValueError, TypeError):
        interval = 60

    await asyncio.sleep(5)
    while True:
        try:
            configured, _, _ = has_system_mailbox_config()
            if configured:
                await asyncio.to_thread(sync_inbound_emails_from_mailbox, max_fetch=15)
        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.warning(f"Background IMAP poll skipped: {err}")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    task = None
    enabled = os.getenv("ENABLE_BACKGROUND_IMAP_SYNC", "true").strip().lower() in ("1", "true", "yes")
    if enabled and os.getenv("DISABLE_BACKGROUND_TASKS", "0") != "1":
        task = asyncio.create_task(_background_imap_poller())
    try:
        yield
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Tata 1mg People Desk API",
    description="Unified Employee Query Management and Agent Helpdesk System for Tata 1mg",
    version="1.0.0",
    lifespan=lifespan,
)

# GZip compression middleware (compresses all responses >= 1000 bytes for faster loading)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(cases.router)
app.include_router(department_routes.router)

# Mount frontend directories
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")
    
    # Mount dedicated admin static subfolder
    admin_dir = os.path.join(frontend_dir, "admin")
    if os.path.exists(admin_dir):
        app.mount("/admin-static", StaticFiles(directory=admin_dir), name="admin-static")

    # Mount dedicated agent static subfolder
    agent_dir = os.path.join(frontend_dir, "agent")
    if os.path.exists(agent_dir):
        app.mount("/agent-static", StaticFiles(directory=agent_dir), name="agent-static")

@app.get("/")
def serve_index():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Tata 1mg People Desk Backend is running!"}

@app.get("/login.html")
def serve_login():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/admin")
@app.get("/admin/")
@app.get("/admin.html")
def serve_admin():
    admin_index = os.path.join(frontend_dir, "admin", "index.html")
    if os.path.exists(admin_index):
        return FileResponse(admin_index)
    return FileResponse(os.path.join(frontend_dir, "admin.html"))

@app.get("/admin/case-details")
@app.get("/admin/case-details.html")
@app.get("/case-details.html")
def serve_case_details():
    admin_case = os.path.join(frontend_dir, "admin", "case-details.html")
    if os.path.exists(admin_case):
        return FileResponse(admin_case)
    return FileResponse(os.path.join(frontend_dir, "case-details.html"))

@app.get("/agent/case-details")
@app.get("/agent/case-details.html")
def serve_agent_case_details():
    agent_case = os.path.join(frontend_dir, "agent", "case-details.html")
    if os.path.exists(agent_case):
        return FileResponse(agent_case)
    return FileResponse(os.path.join(frontend_dir, "agent.html"))

@app.get("/agent")
@app.get("/agent/")
@app.get("/agent.html")
def serve_agent():
    return FileResponse(os.path.join(frontend_dir, "agent.html"))

@app.get("/api/health")
def health_check():
    return {"status": "HEALTHY", "app": "Tata 1mg People Desk"}

if __name__ == "__main__":
    import uvicorn
    from backend.app.config import PORT, HOST
    uvicorn.run("backend.app.main:app", host=HOST, port=PORT, reload=True)
