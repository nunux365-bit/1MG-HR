# Authentication, Authorization & Security Architecture
## Project: Tata 1mg People Desk

---

### 1. Enterprise Authentication Strategy

Tata 1mg has a hybrid workforce comprising white-collar corporate workers and blue-collar field/warehouse operators. The authentication layer accommodates both seamlessly:

1. **Corporate / Tech Employees**: 
   - Google Workspace Single Sign-On (SSO) enforced with `@1mg.com` or `@tata1mg.com` domain restriction.
   - SAML 2.0 / OpenID Connect (OIDC) through NextAuth.js.
2. **Field Staff / Phlebotomists / Fulfillment Center Operators**:
   - Phone Number + OTP verification linked with Employee ID in Tata 1mg HR database.
   - Time-based OTP (TOTP) valid for 5 minutes with maximum 3 retry attempts.

---

### 2. Role-Based Access Control (RBAC) Matrix

| Permission / Action | `EMPLOYEE` / `FIELD_STAFF` | `AGENT` (Support) | `DEPT_LEAD` (Manager) | `SUPER_ADMIN` |
| :--- | :---: | :---: | :---: | :---: |
| **Ask AI Query & Browse KB** | ✅ | ✅ | ✅ | ✅ |
| **Create & View Own Tickets** | ✅ | ✅ | ✅ | ✅ |
| **View Department Ticket Queue** | ❌ | ✅ (Own Dept) | ✅ (Own Dept) | ✅ (All Depts) |
| **Assign / Reassign Tickets** | ❌ | ✅ | ✅ | ✅ |
| **Post Internal Notes** | ❌ | ✅ | ✅ | ✅ |
| **Override SLA / Escalate** | ❌ | ❌ | ✅ | ✅ |
| **Publish Knowledge Base Articles** | ❌ | ❌ | ✅ | ✅ |
| **View Analytics & CSAT Metrics** | ❌ | ❌ | ✅ | ✅ |
| **Manage Users & Role Assignments** | ❌ | ❌ | ❌ | ✅ |
| **View Audit Logs** | ❌ | ❌ | ❌ | ✅ |

---

### 3. Data Protection & Compliance (DPDP Act 2023)

As a health-tech leader in India, Tata 1mg is compliant with the **Digital Personal Data Protection (DPDP) Act 2023** and industry standards:

1. **PII Redaction & Masking**:
   - Sensitive fields (Aadhaar numbers, PAN, bank account details, medical diagnoses in reimbursement slips) are automatically masked in the UI for non-HR authorized agents.
2. **Encryption Standards**:
   - **In Transit**: TLS 1.3 enforced on all endpoints; HSTS header with 1-year max-age.
   - **At Rest**: AES-256 database-level encryption (Neon / AWS KMS).
3. **Audit Trails**:
   - Every read, update, export, and deletion of sensitive ticket data is written to immutable `audit_logs` with actor ID, timestamp, and client IP.
4. **Data Retention & Right to Erasure**:
   - Closed tickets are archived after 365 days; personal identifiers are anonymized upon employee exit request per compliance guidelines.

---

### 4. Application Security Headers & Safeguards

```typescript
// Recommended Next.js Security Headers Configuration
export const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY' // Prevent Clickjacking
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.neon.tech https://generativelanguage.googleapis.com;"
  }
];
```

