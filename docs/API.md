# API Specification & Endpoints Contract
## Project: Tata 1mg People Desk

---

### 1. Standard API Conventions
- **Base URL**: `/api/v1`
- **Content Type**: `application/json`
- **Authentication**: Bearer JWT token in `Authorization: Bearer <token>` or encrypted session cookie.
- **Standard Envelope Response**:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-11-01T16:30:00Z",
    "requestId": "req_84f93b1a"
  }
}
```

---

### 2. Authentication & Session

#### `POST /api/v1/auth/otp/send`
Sends an OTP to registered Tata 1mg phone number (for field & warehouse staff).
```json
// Request
{
  "phone": "+919876543210"
}

// Response 200 OK
{
  "success": true,
  "data": { "message": "OTP sent to registered phone number", "expiresInSeconds": 300 }
}
```

#### `POST /api/v1/auth/otp/verify`
Verifies OTP and returns user session token.

---

### 3. AI Query & Self-Service Resolution

#### `POST /api/v1/ai/ask`
Submits an employee query to the Tata 1mg Knowledge Base RAG Assistant.

```json
// Request
{
  "query": "What is the corporate health insurance cover for my parents?",
  "includeEmployeeContext": true
}

// Response 200 OK
{
  "success": true,
  "data": {
    "answer": "Under the Tata 1mg Group Mediclaim Policy (GMC), employees can cover parents up to a sum insured of ₹3,00,000 with a 10% co-pay on senior citizen claims. Premium co-payment is deducted monthly via payroll.",
    "confidenceScore": 0.94,
    "citations": [
      {
        "articleId": "kb_policy_gmc_2026",
        "title": "Tata 1mg GMC Health Insurance Handbook 2026",
        "url": "/kb/articles/health-insurance-policy"
      }
    ],
    "suggestedActions": [
      { "label": "Download Policy Document", "action": "DOWNLOAD_PDF" },
      { "label": "Raise Ticket with HR Benefits", "action": "CREATE_TICKET_DRAFT" }
    ]
  }
}
```

---

### 4. Ticket Lifecycle Management

#### `POST /api/v1/tickets`
Creates a new support ticket (either directly or converted from an AI query).

```json
// Request
{
  "title": "Need urgent replacement for damaged barcode scanner at Okhla FC",
  "description": "Scanner unit #SC-44 is not pairing with the warehouse terminal.",
  "departmentCode": "LOGISTICS",
  "categorySlug": "warehouse-hardware-issue",
  "priority": "P1_HIGH",
  "attachments": [
    {
      "fileName": "scanner_error.jpg",
      "fileUrl": "https://storage.1mg.internal/uploads/scanner_error.jpg",
      "fileSizeBytes": 1048576,
      "mimeType": "image/jpeg"
    }
  ]
}

// Response 201 Created
{
  "success": true,
  "data": {
    "ticketId": "a53e4c8e-6703-4f51-b842-83a3d5e219fb",
    "ticketNumber": "TKT-2026-004521",
    "status": "OPEN",
    "priority": "P1_HIGH",
    "slaDueAt": "2026-11-02T04:30:00Z"
  }
}
```

#### `GET /api/v1/tickets`
List tickets with filtering, pagination, and role-based scoping.
- **Query Params**: `status`, `department`, `priority`, `assigneeId`, `page` (default 1), `limit` (default 20).

#### `GET /api/v1/tickets/:id`
Retrieves ticket metadata, full message thread (public replies + internal notes for agents), attachments, and SLA status.

#### `PATCH /api/v1/tickets/:id`
Updates ticket status, priority, or reassigns to another agent/department.
```json
// Request (Agent only)
{
  "status": "IN_PROGRESS",
  "assigneeId": "uuid-agent-amit-verma"
}
```

#### `POST /api/v1/tickets/:id/messages`
Appends a message to the ticket conversation.
```json
// Request
{
  "content": "A replacement scanner unit has been dispatched from Gurgaon HQ. Expected delivery by 3:00 PM.",
  "messageType": "PUBLIC_REPLY" // or "INTERNAL_NOTE"
}
```

#### `POST /api/v1/tickets/:id/feedback`
Captures employee CSAT rating and comments upon ticket resolution.
```json
// Request (Employee only)
{
  "csatRating": 5,
  "feedback": "Super fast resolution, got the replacement on time!"
}
```

---

### 5. Analytics & SLA Monitoring

#### `GET /api/v1/analytics/overview`
Returns high-level KPI cards for managers:
- Total tickets raised in period
- AI First-Contact Resolution (FCR) rate
- SLA Compliance Percentage
- Average Resolution Time (ART in hours)
- Active ticket distribution across departments

