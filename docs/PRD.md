# Product Requirement Document (PRD)
## Project: Tata 1mg People Desk (Employee Query Resolution System)

---

### 1. Executive Summary
Tata 1mg employs thousands of staff members across varied profiles:
1. **Corporate Headquarters & Tech Staff** (Gurgaon / Remote)
2. **Diagnostic Lab Technicians & Phlebotomists** (Pan-India diagnostic network)
3. **Supply Chain & Fulfillment Center Associates** (Warehouses, inventory managers, cold-chain handlers)
4. **Retail Pharmacists & Store Personnel** (Tata 1mg stores)
5. **Rider / Delivery Network**

Currently, employee inquiries (HR, Payroll, IT Support, Reimbursements, Health Insurance benefits, Shift Rotations, Uniform & Safety Gear) are handled through scattered email threads, WhatsApp messages, and verbal escalations. 

**Tata 1mg People Desk** consolidates all internal queries into a single, intelligent portal. It combines an **AI-First Self-Service Assistant** (using Tata 1mg internal policies & HR manuals) with a **Multi-Tier Ticket Resolution Workflow** backed by strict SLA monitoring and Departmental routing.

---

### 2. Problem Statement
- **High Repetition Rate**: 65%+ of employee inquiries are repetitive (e.g., PF status, Form 16 download, medical insurance claims, leave policy, IT equipment repair).
- **Lack of Visibility**: Employees have no visibility into query status, assigned agent, or estimated resolution time.
- **SLA Breaches**: Queries get lost in departmental silos without automated escalation or accountability.
- **Non-Desk Workforce Accessibility**: Warehouse workers and field phlebotomists lack easy access to corporate laptops and need seamless mobile-optimized or OTP-based access.

---

### 3. Target User Personas

| Persona | Role | Key Needs & Pain Points |
| :--- | :--- | :--- |
| **Desk Employee (Corporate / Tech)** | Software engineers, marketers, corporate HR | Quick self-serve answers, IT hardware/software requests, tax declaration assistance. |
| **Field / Operational Worker** | Warehouse staff, Phlebotomists, Riders | Mobile-first access, simple Hindi/English language UI, quick shift & payroll slip help. |
| **HR / IT Support Agent** | Departmental tier-1 and tier-2 handlers | Unified ticket queue, pre-drafted canned responses, SLA countdowns, direct employee chat. |
| **Department Head / HR Manager** | HRBP, VP People & Culture | Analytics dashboard, CSAT scores, SLA breach alarms, root-cause trend analysis. |
| **System Administrator** | IT Ops / Security Team | Role-based permissions, audit logging, MCP server integration, compliance tracking. |

---

### 4. Goals & Success Metrics (KPIs)
- **First Contact Resolution (FCR)**: Target $\ge 45\%$ queries resolved automatically by AI assistant without human ticket creation.
- **Average Resolution Time (ART)**: Reduction of median resolution time from 72 hours to $< 18$ hours for standard tickets.
- **SLA Adherence**: $\ge 95\%$ of tickets resolved within designated priority SLAs.
- **Employee CSAT**: Maintain $\ge 4.4 / 5.0$ rating on ticket closure feedback.

---

### 5. Ticket Priority & SLA Matrix

| Priority | Criteria | Target First Response | Target Resolution | Auto-Escalation |
| :--- | :--- | :--- | :--- | :--- |
| **P0 - Critical** | Workplace injury, payroll stoppage, major facility outage, security breach | $< 30$ mins | $< 4$ hours | Escalates to Department Head at 2 hrs |
| **P1 - High** | IT laptop down during sprint, medical insurance claim emergency | $< 2$ hours | $< 12$ hours | Escalates to Team Lead at 8 hrs |
| **P2 - Medium** | Expense reimbursement clarification, attendance regularisation | $< 8$ hours | $< 24$ hours | Escalates to Supervisor at 24 hrs |
| **P3 - Low** | General policy clarification, uniform request, address update | $< 16$ hours | $< 48$ hours | Escalates to Queue Manager at 48 hrs |

---

### 6. Scope of MVP vs Phase 2

#### In-Scope for MVP:
- Employee Authentication (Google Workspace SSO + Mobile OTP login).
- AI First-Touch Assistant: Instant answers via RAG on Tata 1mg HR & Company policies.
- Smart Ticket Creation: Auto-categorization (HR, IT, Payroll, Facilities, Logistics) with sentiment/priority detection.
- Employee Self-Service Dashboard (Track active/closed tickets, chat with agent, rate resolution).
- Agent Workspace: Queue management, internal notes, canned replies, ticket assignment, status updates.
- Real-time notifications (In-app + Email alerts).
- Basic Analytics Dashboard for HR Leads (Ticket volume, resolution time, department breakdown).

#### Phase 2 (Future Scope):
- WhatsApp & Slack integration bot.
- Bi-lingual voice query support (Hindi + English) for field staff.
- Automatic payroll system integration via MCP to trigger instant leaves and payslip downloads.
- Predictive staffing recommendations for HR agents based on query spikes.

