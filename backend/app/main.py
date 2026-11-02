import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from backend.app.routes import auth, admin_users, cases, department_routes

app = FastAPI(
    title="Tata 1mg People Desk API",
    description="Unified Employee Query Management and Agent Helpdesk System for Tata 1mg",
    version="1.0.0"
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
