# UI/UX Design System & Wireframe Specifications
## Project: Tata 1mg People Desk

---

### 1. Brand Identity & Design System

The visual design is aligned with **Tata 1mg’s official brand aesthetic**: clean, approachable, trustworthy, and modern health-tech/enterprise software.

#### 1.1 Color Palette

| Token Name | Hex Code | Purpose & Usage |
| :--- | :--- | :--- |
| **Brand Primary (1mg Coral)** | `#FF6F61` | Primary CTA buttons, key highlights, priority indicators |
| **Brand Primary Dark** | `#E25244` | Hover states, active pressed states |
| **Brand Secondary (Navy Teal)** | `#10847E` | Secondary buttons, verified status badges, health-tech accents |
| **Background (Slate Light)** | `#F8F9FA` | Main app background, clean canvas |
| **Card Surface** | `#FFFFFF` | Container cards, modals, popovers |
| **Text Primary** | `#212529` | Headings, primary body text (High contrast) |
| **Text Secondary / Muted** | `#6C757D` | Timestamps, metadata, labels |
| **Border / Divider** | `#E9ECEF` | Subtle borders, table separators |
| **Success Green** | `#28A745` | Resolved tickets, positive CSAT, on-time SLA |
| **Warning Amber** | `#FFC107` | SLA warning (breaching in $< 2$ hours) |
| **Danger / Critical Red** | `#DC3545` | SLA breached, P0 Critical tickets |

#### 1.2 Typography
- **Primary Font**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, sans-serif.
- **Scale**:
  - `Display / H1`: 32px / 40px (Bold, Page titles)
  - `H2`: 24px / 32px (Semi-Bold, Section headers)
  - `H3`: 18px / 24px (Semi-Bold, Card titles)
  - `Body Regular`: 14px / 20px (Standard UI & ticket thread)
  - `Caption / Micro`: 12px / 16px (Badges, timestamps, SLAs)

---

### 2. User Interfaces & Screen Layouts

#### 2.1 Employee Portal (Home & Query Center)
Designed with a **"Search-First, Solve-Fast"** philosophy.

```
+-----------------------------------------------------------------------------------+
|  [Tata 1mg Logo]  People Desk             [Knowledge Base]  [My Tickets (2)] [Avatar] |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|                   👋 Namaste, Rahul Sharma (Emp ID: 1MG-8492)                    |
|                        How can People Desk help you today?                        |
|                                                                                   |
|      +---------------------------------------------------------------------+      |
|      | 🔍 Ask anything (e.g. "How to claim medical bills?", "Form 16") ... | [Ask]|
|      +---------------------------------------------------------------------+      |
|                                                                                   |
|   [ 🏥 Health Insurance ]   [ 💰 Payroll & PF ]   [ 💻 IT Assets ]   [ 📦 Logistics ] |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  📌 Active Queries & Tickets                     💡 Recommended Articles         |
|  +---------------------------------------------+ +------------------------------+ |
|  | #TKT-1082: Laptop Battery Replacement       | | • Tata 1mg Medical Policy 2026| |
|  | Status: [IN PROGRESS]  SLA: 4h remaining     | | • Maternity & Paternity SOP  | |
|  | Agent: Amit Verma (IT)                      | | • How to claim LTA           | |
|  +---------------------------------------------+ +------------------------------+ |
|  | #TKT-1065: October Fuel Reimbursement       |                                  |
|  | Status: [WAITING ON YOU]                     |                                  |
|  +---------------------------------------------+                                  |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

#### 2.2 Agent Workbench (Split-Pane Tri-View)
Designed for high efficiency, minimizing context switching for HR and IT support agents.

```
+---------------------------------------------------------------------------------------+
| Queue: [All (24)] [Unassigned (6)] [P0/P1 Urgent (3)] [My Queue (8)]    [Search: Q...] |
+-----------------------+---------------------------------------+-----------------------+
| TICKET LIST (LEFT)    | ACTIVE TICKET CONVERSATION (CENTER)   | CONTEXT PANE (RIGHT)  |
|                       |                                       |                       |
| #1082 [P1] [IT]       | #TKT-1082: Laptop Battery Replacement | 👤 Employee Details   |
| Rahul Sharma          | Priority: [P1 High]  SLA: 3h 42m left | Name: Rahul Sharma    |
| Battery bulging...    | Assignee: [Amit Verma ▾]             | Emp ID: 1MG-8492      |
| 12 mins ago           |---------------------------------------| Dept: Diagnostics Tech|
|                       | [Rahul @ 10:15 AM]:                   | City: Gurgaon HQ      |
| #1085 [P2] [Payroll]  | "My MacBook battery is swollen and    | Manager: Neha Kapoor  |
| Priya Nair            | trackpad is lifting up."              | Asset: MBP 14 (A2442) |
| Tax deduction query   | [Attached: photo.jpg]                 |-----------------------|
| 45 mins ago           |---------------------------------------| 🤖 AI Copilot Suggest |
|                       | [Amit (IT) @ 10:25 AM]:               | "Schedule hardware    |
| #1080 [P3] [HR]       | "Hi Rahul, please stop charging it    | swap at Gurgaon HQ IT |
| Vikram Singh          | immediately. Visit IT Desk Bay 4."   | Desk Bay 4. Stock has |
| Uniform size exchange |---------------------------------------| 5 replacement units." |
| 2 hours ago           | [Type reply... or Insert Canned Reply]| [Insert Suggestion]   |
+-----------------------+---------------------------------------+-----------------------+
```

#### 2.3 Mobile View (Field Staff / Warehouse / Phlebotomists)
- Bottom Navigation: **[Home]**, **[Ask AI]**, **[My Tickets]**, **[Profile]**.
- Large tap targets ($\ge 48\text{px}$) for warehouse gloves or fast mobile usage.
- One-tap attachment upload directly from camera.

---

### 3. Accessibility & Usability Principles
1. **Contrast Ratio**: Meets WCAG 2.1 AA standard ($> 4.5:1$ for normal text, $> 3:1$ for large headings).
2. **Keyboard Navigation**: Full keyboard accessibility (`Tab`, `Esc`, `Cmd+K` for global quick search).
3. **Screen Readers**: ARIA attributes on all custom interactive dialogs and ticket status pills.

