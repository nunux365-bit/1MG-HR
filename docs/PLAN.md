# Project Implementation Plan & Roadmap
## Project: Tata 1mg People Desk

---

### 1. Phased Execution Roadmap

```mermaid
gantt
    title Tata 1mg People Desk Implementation Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Blueprint & Architecture
    PRD, Architecture, DB & API Specs       :done,    p1_1, 2026-11-01, 2026-11-02
    section Phase 2: Scaffolding & Data Layer
    Next.js + Tailwind + shadcn Setup       :active,  p2_1, 2026-11-02, 2026-11-04
    Neon DB Schema & Migrations             :         p2_2, 2026-11-04, 2026-11-06
    NextAuth & Google Workspace SSO         :         p2_3, 2026-11-06, 2026-11-08
    section Phase 3: Employee Experience
    Employee Portal UI & Search Bar         :         p3_1, 2026-11-08, 2026-11-12
    Ticket Creation Modal & File Uploads    :         p3_2, 2026-11-12, 2026-11-15
    Active Ticket Tracker & Chat Thread     :         p3_3, 2026-11-15, 2026-11-18
    section Phase 4: Agent Workbench & SLAs
    Agent Split-Pane Queue Interface        :         p4_1, 2026-11-18, 2026-11-22
    SLA Countdown Worker & Escalations      :         p4_2, 2026-11-22, 2026-11-25
    Internal Notes & Canned Macros          :         p4_3, 2026-11-25, 2026-11-28
    section Phase 5: AI & Knowledge Base RAG
    Gemini Policy Embeddings & RAG Engine   :         p5_1, 2026-11-28, 2026-12-03
    Instant Answer Widget & FCR Logging     :         p5_2, 2026-12-03, 2026-12-07
    section Phase 6: MCP Integration & Tools
    HRIS & IT Asset MCP Server Bridge       :         p6_1, 2026-12-07, 2026-12-11
    Autonomous Ticket Drafting via MCP      :         p6_2, 2026-12-11, 2026-12-14
    section Phase 7: QA, Security & Launch
    Playwright E2E & Load Testing           :         p7_1, 2026-12-14, 2026-12-18
    Security Audit & DPDP Compliance        :         p7_2, 2026-12-18, 2026-12-21
    Staging Rollout & Production Launch     :         p7_3, 2026-12-21, 2026-12-24
```

---

### 2. Milestone Deliverables Checklist

#### Phase 1: Planning & Specifications (Completed ✅)
- [x] Product Requirement Document (`docs/PRD.md`)
- [x] Technical Architecture & Data Flow (`docs/ARCHITECTURE.md`)
- [x] UI/UX Wireframes & Brand Guide (`docs/DESIGN.md`)
- [x] Relational Database Schema & ERD (`docs/DATABASE.md`)
- [x] REST API Contract (`docs/API.md`)
- [x] Authentication & Security Guidelines (`docs/AUTH_SECURITY.md`)
- [x] Feature Breakdown & SLA Rules (`docs/FEATURES.md`)
- [x] MCP Protocol & Enterprise Tool Specs (`docs/MCP_CONNECTION.md`)
- [x] Testing Strategy & E2E Scenarios (`docs/TESTING.md`)
- [x] Observability, Health Checks & Runbooks (`docs/DEBUGGING.md`)
- [x] Local Development & Environment Guide (`docs/SETUP.md`)
- [x] Master Roadmap & Milestones (`docs/PLAN.md`)

#### Phase 2: Application Scaffolding (Ready for Execution 🚀)
- [ ] Initialize Next.js 14+ project with TypeScript, ESLint, and Tailwind CSS.
- [ ] Install shadcn/ui components (`button`, `card`, `dialog`, `badge`, `tabs`, `avatar`, `dropdown-menu`, `input`, `textarea`).
- [ ] Set up Prisma ORM with Neon PostgreSQL connection.
- [ ] Seed initial database records (Departments, Categories, Sample Policy Articles, Admin user).

#### Phase 3: Employee Experience MVP
- [ ] Implement Employee Query Home Page with responsive brand navbar.
- [ ] Create search-first query bar with instant autocomplete.
- [ ] Build Ticket Creation dialog with auto-category suggestion and attachment upload.
- [ ] Build Employee "My Tickets" list with live status indicators and real-time thread viewer.

#### Phase 4: Agent Workbench
- [ ] Build Agent Queue view with multi-department filtering.
- [ ] Implement Tri-Pane workbench layout (Queue list, Active conversation, Context pane).
- [ ] Add internal notes (hidden from employees) and canned response macro insertion.
- [ ] Implement SLA calculation logic with warning timers.

#### Phase 5: AI & Knowledge Base RAG
- [ ] Integrate Gemini API for policy document vector embedding.
- [ ] Implement semantic search over HR, IT, and medical insurance policies.
- [ ] Build "Did this solve your query?" feedback flow for AI First Contact Resolution.

#### Phase 6: MCP Integration
- [ ] Configure local MCP bridge for HRIS leave balance lookups.
- [ ] Wire IT asset lookup tool into agent context panel.
- [ ] Enable AI agent to autonomously draft or route tickets via MCP.

#### Phase 7: Testing, Hardening & Launch
- [ ] Implement Vitest unit tests for SLA calculations.
- [ ] Run Playwright end-to-end tests for both employee and agent flows.
- [ ] Perform security review (headers, CSRF, rate-limiting, PII masking).

