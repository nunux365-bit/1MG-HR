# Local Development & Environment Setup Guide
## Project: Tata 1mg People Desk

---

### 1. Prerequisites
Ensure you have the following installed on your workstation:
- **Python**: `3.10.x` or higher
- **Web Browser**: Chrome, Edge, or Firefox for HTML/CSS/JS frontend
- **Virtual Environment**: `venv` or `virtualenv`
- **Git**: Latest version

---

### 2. Environment Variables Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

---

### 3. Step-by-Step Installation

#### 1. Activate Python Virtual Environment
```bash
source venv/bin/activate
```

#### 2. Install Python Dependencies
```bash
pip install -r backend/requirements.txt
```

#### 3. Initialize & Migrate the Database
Run the automated database initialization script to create tables, sequences, and seed default departments:
```bash
python backend/app/db_init.py
```

#### 4. Start the Backend API Server (FastAPI)
```bash
python run.py
# or
python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 9000
```
Interactive Swagger API documentation will be available at: [http://localhost:9000/docs](http://localhost:9000/docs)

#### 5. Launch the Application
The frontend is built with responsive HTML5, CSS3, and ES6 JavaScript and is served directly by the FastAPI server:
- **Employee Sign-In**: [http://localhost:9000/](http://localhost:9000/) or [http://localhost:9000/login.html](http://localhost:9000/login.html)
- **Agent Workbench & AI Cockpit**: [http://localhost:9000/agent.html](http://localhost:9000/agent.html)
- **Executive Admin Console**: [http://localhost:9000/admin.html](http://localhost:9000/admin.html)

---

### 4. Key Management Commands & Workflows

| Task | Command | Purpose |
| :--- | :--- | :--- |
| **Start Server** | `python run.py` | Runs FastAPI server on configured `PORT` (default: 9000) with hot-reload |
| **Database Migration** | `python backend/app/db_init.py` | Idempotently creates tables, sequences, safe columns, and default departments |
| **API Health Check** | `curl http://localhost:9000/api/health` | Verifies server and database responsiveness |
| **API Swagger Docs** | Open `/docs` in browser | Interactive API testing playground with live schemas |
| **Train AI Model** | Via Admin Console or `POST /api/v1/departments/{id}/train` | Trains scikit-learn LinearSVC models and hot-reloads memory weights |
