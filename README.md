# Tata 1mg - People Desk (Employee Query Resolution Portal)

> **Enterprise Employee Experience & Query Management System for Tata 1mg**  
> Streamlining HR, IT, Payroll, Logistics & Workplace operations across Corporate, Pharmacy Warehouses, Diagnostic Labs, and Retail networks.

---

## 📌 Project Overview
**Tata 1mg People Desk** is an internal unified service desk and AI-powered query resolution platform designed to cater to the diverse workforce of Tata 1mg. From corporate tech teams in Gurgaon to warehouse associates, phlebotomists, and retail pharmacists across India, People Desk provides an intuitive, omni-channel platform to submit, track, and resolve workplace queries with strict SLA tracking and automated intelligence.

---

## 🗂️ Project Blueprint & Documentation Index

Every aspect of the platform is documented in detail within the [`docs/`](file:///home/vaibhav/Desktop/People%20Desk/docs) directory:

| Document | Purpose & Scope |
| :--- | :--- |
| **[01. PRD](file:///home/vaibhav/Desktop/People%20Desk/docs/PRD.md)** | Product Requirement Document: Goals, Personas, User Journeys, SLAs, & KPIs |
| **[02. Architecture](file:///home/vaibhav/Desktop/People%20Desk/docs/ARCHITECTURE.md)** | System topology, tech stack, modular services, data flow, & scale plan |
| **[03. Design System](file:///home/vaibhav/Desktop/People%20Desk/docs/DESIGN.md)** | Tata 1mg brand alignment, color palette, wireframes, & responsive components |
| **[04. Database](file:///home/vaibhav/Desktop/People%20Desk/docs/DATABASE.md)** | Relational Schema (PostgreSQL/Neon), ER Diagrams, Indexes, & Data Retention |
| **[05. API Specification](file:///home/vaibhav/Desktop/People%20Desk/docs/API.md)** | REST endpoints, request/response models, pagination, & webhooks |
| **[06. Auth & Security](file:///home/vaibhav/Desktop/People%20Desk/docs/AUTH_SECURITY.md)** | Enterprise SSO, RBAC matrix, DPDP Act compliance, & data masking |
| **[07. Features](file:///home/vaibhav/Desktop/People%20Desk/docs/FEATURES.md)** | Complete feature matrix: AI self-serve, ticket routing, escalation & analytics |
| **[08. MCP Connection](file:///home/vaibhav/Desktop/People%20Desk/docs/MCP_CONNECTION.md)** | Model Context Protocol integration for HRIS tools, DB queries, & agent workflows |
| **[09. Testing](file:///home/vaibhav/Desktop/People%20Desk/docs/TESTING.md)** | Unit, Integration, E2E (Playwright), Security, & Performance test matrix |
| **[10. Debugging & Ops](file:///home/vaibhav/Desktop/People%20Desk/docs/DEBUGGING.md)** | Structured telemetry, logging, Sentry monitoring, & runbooks |
| **[11. Local Setup](file:///home/vaibhav/Desktop/People%20Desk/docs/SETUP.md)** | Step-by-step developer setup, `.env.example`, Docker setup, & seeds |
| **[12. Execution Plan](file:///home/vaibhav/Desktop/People%20Desk/docs/PLAN.md)** | Sprint-wise rollout roadmap, milestones, & deliverable checklists |

---

## 🚀 Quick Tech Stack Summary
- **Frontend**: Responsive Web (HTML5, Modern CSS3 with Tata 1mg Design System, Vanilla / Modular ES6 JavaScript)
- **Backend**: Python 3.10+ (FastAPI, Uvicorn, Pydantic, HTTPX, SQLite / PostgreSQL / Neon)
- **Architecture**: Modular RESTful APIs with OpenAPI / Swagger documentation (`/docs`)
- **AI / Query Resolution Engine**: Google Gemini API + Internal Policy RAG
- **Protocols & Integrations**: Model Context Protocol (MCP) server bridge for HRMS, leave balances, and IT asset lookup
- **Authentication**: Enterprise Google Workspace SSO + Mobile OTP authentication for field & warehouse staff
