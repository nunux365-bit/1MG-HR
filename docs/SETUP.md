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

#### 3. Start the Backend API Server (FastAPI)
```bash
python run.py
# or
python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 9000
```
Interactive API documentation will be available at: [http://localhost:9000/docs](http://localhost:9000/docs)

#### 4. Launch the Frontend
The frontend is built with clean HTML5, CSS3, and JavaScript and can be served directly by FastAPI or opened with any static file server:
- Employee Portal: [http://localhost:9000/](http://localhost:9000/)
- Agent Workbench: [http://localhost:9000/agent.html](http://localhost:9000/agent.html)
- Admin & Analytics: [http://localhost:9000/admin.html](http://localhost:9000/admin.html)

---

### 4. Available NPM Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `dev` | `next dev` | Start development server with hot-reloading |
| `build` | `next build` | Create optimized production build |
| `start` | `next start` | Run production build locally |
| `lint` | `next lint` | Run ESLint static code analysis |
| `test` | `vitest` | Run unit and integration tests |
| `test:e2e` | `playwright test` | Run browser end-to-end tests |
| `db:seed` | `ts-node prisma/seed.ts` | Seed sample data into the database |
