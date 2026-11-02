import os
import uvicorn
from backend.app.config import PORT, HOST

if __name__ == "__main__":
    port = int(os.getenv("PORT", PORT))
    host = os.getenv("HOST", HOST)
    print(f"🚀 Starting Tata 1mg People Desk server on http://{host}:{port} ...")
    uvicorn.run("backend.app.main:app", host=host, port=port, reload=True)

