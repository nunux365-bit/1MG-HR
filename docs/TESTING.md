# Testing Strategy & Quality Assurance Matrix
## Project: Tata 1mg People Desk

---

### 1. Testing Philosophy & Test Pyramid

To guarantee enterprise reliability, security, and accurate SLA management, Tata 1mg People Desk adheres to a multi-tiered testing strategy:

```
          / \
         / E2E \          (Playwright: Critical User Journeys)
        /-------\
       / Integration \    (API routes, Database queries, Auth checks)
      /---------------\
     /   Unit Tests    \  (SLA calculations, Priority triage, Utility functions)
    /-------------------\
```

---

### 2. Unit Testing (Vitest / Jest)

Focuses on pure deterministic functions, business logic, and SLA calculation utilities.

#### Key Test Suites:
- **`sla-calculator.test.ts`**:
  - Calculates correct deadline across business hours vs 24x7 shifts.
  - Correctly accounts for official Indian National / Festival holidays.
  - Correctly adjusts due dates when priority transitions from P2 to P1.
- **`priority-classifier.test.ts`**:
  - Validates keyword matching and AI sentiment scoring for high-severity issues (e.g. "injury", "blood sample spoiled", "salary withheld").
- **`rbac-guard.test.ts`**:
  - Asserts that normal employees cannot access `/agent` or `/admin` routes.
  - Verifies departmental isolation (e.g., an IT agent cannot view confidential medical reimbursement claims without HR credentials).

---

### 3. Integration Testing (API & Database)

Runs with test database instances (Neon branch or local PostgreSQL container):

- **Ticket Creation Flow**:
  1. POST `/api/v1/tickets` with valid payload.
  2. Verify record exists in `tickets` table with `status = 'OPEN'`.
  3. Verify corresponding initial row in `ticket_messages`.
  4. Verify SLA countdown job is scheduled in Redis.
- **AI Query Fallback**:
  - Mock Gemini API response with low confidence score ($< 0.7$).
  - Ensure API gracefully returns prompt to escalate to human agent.
- **Attachment Upload**:
  - Verify rejection of unauthorized file types (e.g., `.exe`, `.sh`).
  - Verify size limit enforcement ($\le 10\text{MB}$).

---

### 4. End-to-End (E2E) Testing (Playwright)

Automates real browser user journeys across desktop and mobile viewports.

#### Scenario A: Employee Self-Service & Ticket Conversion
1. Visit `/login` as `rahul.sharma@1mg.com`.
2. Type query: *"How do I claim reimbursement for annual health checkup?"*
3. Assert AI response appears within 3 seconds with GMC policy citation.
4. Click *"Talk to Agent"*.
5. Assert Ticket Creation modal appears with category pre-selected as `HR / Benefits`.
6. Submit ticket and assert redirect to `#TKT-XXXXXX` tracking page with live countdown.

#### Scenario B: Agent Queue Triage & Ticket Resolution
1. Login as `amit.verma@1mg.com` (IT Agent).
2. Visit `/agent/queue`.
3. Select newly raised hardware ticket.
4. Add internal note: *"Checking warehouse inventory for replacement unit."*
5. Send public reply: *"Replacement approved. Please collect from Bay 4."*
6. Mark status as `RESOLVED`.
7. Assert ticket is removed from active queue and audit log is recorded.

---

### 5. Performance & Load Testing (k6)

Simulates sudden traffic spikes (e.g., during yearly appraisal letters or open enrollment periods):
- **Target**: 500 concurrent users creating queries and checking ticket statuses.
- **Performance Budget**:
  - P95 response time for static assets & pages $< 300\text{ms}$.
  - P95 response time for AI queries $< 2500\text{ms}$.
  - P99 response time for ticket operations $< 400\text{ms}$.
  - Zero dropped connections or 5xx server errors under peak load.

