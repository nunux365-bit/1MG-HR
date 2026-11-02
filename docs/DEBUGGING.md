# Debugging, Observability & Operational Runbooks
## Project: Tata 1mg People Desk

---

### 1. Observability Stack & Telemetry

1. **Structured Logging (Pino)**:
   - All logs output strictly structured JSON with `timestamp`, `level`, `requestId`, `userId`, `empId`, and `durationMs`.
   - Sensitive fields (passwords, OTPs, financial and health records) are automatically scrubbed via logging sanitizers.
2. **Error Tracking (Sentry)**:
   - Sentry SDK captures unhandled client-side exceptions and server action failures.
   - Every error event is enriched with release tag, user role, and session metadata.
3. **APM & Tracing (OpenTelemetry)**:
   - Distributed traces track request lifecycle from Next.js server actions through to Neon PostgreSQL queries and external Gemini AI calls.

---

### 2. System Health Checks

The application exposes standard RFC-compliant health endpoints for container probes and load balancers:

- `GET /api/health` - Fast edge check returning `200 OK` if the app instance is healthy.
- `GET /api/health/deep` - Deep diagnostic check verifying:
  - PostgreSQL / Neon database connection latency.
  - Redis cache and queue responsiveness.
  - Gemini AI endpoint reachable status.
  - S3 / Blob storage bucket read/write permissions.

Example Health Output:
```json
{
  "status": "HEALTHY",
  "uptimeSeconds": 84210,
  "checks": {
    "database": { "status": "UP", "latencyMs": 14 },
    "redis": { "status": "UP", "latencyMs": 3 },
    "geminiAi": { "status": "UP", "latencyMs": 280 },
    "storage": { "status": "UP", "latencyMs": 42 }
  }
}
```

---

### 3. Operational Runbooks & Troubleshooting

#### Issue 1: Gemini AI API Rate Limiting (HTTP 429)
- **Symptom**: Employees reporting delays or error banners during AI query assistance.
- **Root Cause**: Burst of queries exceeding API quota during all-hands or policy announcement.
- **Mitigation / Fallback**:
  1. Circuit breaker trips after 3 consecutive 429 errors.
  2. The system automatically bypasses the AI summary layer and routes the employee straight to the quick-ticket creation form with standard category choices.
  3. Query text is queued for asynchronous offline vector embedding.

#### Issue 2: Neon PostgreSQL Connection Exhaustion
- **Symptom**: `FATAL: remaining connection slots are reserved for non-replication superuser connections`
- **Mitigation**:
  1. Ensure connection string uses Neon's pooled endpoint (`-pooler` domain suffix).
  2. Verify Prisma client singleton pattern in `lib/db.ts` to prevent multiple Prisma clients in Next.js hot-reload development.

#### Issue 3: SLA Escalation Job Delay
- **Symptom**: P0 or P1 tickets not triggering escalation alerts past their deadline.
- **Diagnosis**:
  ```bash
  # Check Redis BullMQ queue length
  redis-cli -u $REDIS_URL LLEN bull:sla-monitor:wait
  ```
- **Remediation**:
  1. Restart the background worker service.
  2. Trigger manual SLA re-sync via admin API: `POST /api/v1/admin/sla/resync`.

#### Issue 4: OTP Delivery Failure for Field Staff
- **Symptom**: Warehouse staff unable to receive login SMS OTP.
- **Checklist**:
  1. Check SMS Gateway status dashboard (Twilio / Gupshup / Exotel).
  2. Check whether user's phone number in `users` table matches the national standard with country code `+91`.
  3. Verify rate-limiting on user IP or phone number.

