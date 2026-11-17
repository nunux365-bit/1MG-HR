"""
Unified Case Routing, Thread Linking, HRMS Lookup & Auto-Case Assignment Service.
Shared across IMAP mailbox sync, API email ingest, and manual email conversion.
"""
import html as html_lib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from backend.app.config import ADMIN_EMAIL
from backend.app.database import execute_query
from backend.app.services.classifier_service import classify_inbound_email_ai

logger = logging.getLogger("backend.case_routing_service")

TICKET_BRACKET_PATTERN = re.compile(
    r"(?:\[\s*(1MG)-?(\d{5,})\s*\]|(?:case|ticket)\s*(?:number|no\.?|id|#)?\s*[:#-]?\s*(1MG)-?(\d{5,})\b)",
    re.IGNORECASE,
)
CASE_STRIP_PATTERN = re.compile(
    r"(?:\[\s*1MG-?\d{5,}\s*\]|(?:case|ticket)\s*(?:number|no\.?|id|#)?\s*[:#-]?\s*1MG-?\d{5,}\b)",
    re.IGNORECASE,
)
EMP_CODE_PATTERN = re.compile(
    r"\b(?:CON1MG-?\d+|1MG[A-Z]{0,4}-?\d+|EMP[A-Z]{0,3}-?\d+|NUNUX-?\d+)\b",
    re.IGNORECASE,
)
LABELED_EMP_CODE_PATTERN = re.compile(
    r"(?:Employee\s*(?:ID|Code|No\.?)|Emp\s*(?:ID|Code))\*?\s*[:\-]+\*?\s*([A-Z0-9][A-Z0-9\-]{3,19})",
    re.IGNORECASE,
)


def generate_case_number() -> str:
    """
    Collision-free atomic sequence generator.
    Produces 1MG00001 -> 1MG99999 (5 digits) and expands to 6 digits (1MG100000+) automatically.
    """
    query = """
        UPDATE case_sequences
        SET last_number = last_number + 1, updated_at = NOW()
        WHERE prefix = '1MG'
        RETURNING last_number;
    """
    row = execute_query(query, fetch_one=True, commit=True)
    if not row or row.get("last_number") is None:
        execute_query(
            "INSERT INTO case_sequences (prefix, last_number, updated_at) VALUES ('1MG', 1, NOW()) ON CONFLICT (prefix) DO NOTHING;",
            commit=True,
        )
        seq = 1
    else:
        seq = int(row["last_number"])

    if seq <= 99999:
        return f"1MG{seq:05d}"
    return f"1MG{seq}"


def extract_case_number_tag(subject: str, body: str = "") -> Optional[str]:
    """Extracts an explicit ticket number tag like [1MG00001] or Case #1MG00001 from subject/body."""
    for text in (subject or "", body or ""):
        m = TICKET_BRACKET_PATTERN.search(text)
        if m:
            digits = m.group(2) or m.group(4)
            if digits:
                return f"1MG{digits}"
    return None


def is_automated_newsletter_or_noise(
    sender_name: str,
    sender_email: str,
    subject: str,
    body: str,
    auto_submitted_header: str = "",
) -> bool:
    """
    Identifies automated newsletters, promotional vendor blasts, mailer bounces,
    out-of-office auto-replies, and non-inquiry broadcasts.
    """
    s_email = (sender_email or "").strip().lower()
    subj_lower = (subject or "").strip().lower()
    combined = f"{subject or ''} {body or ''}".lower()

    # 0. Explicit RFC Auto-Submitted header or bounce/auto-responder subjects
    if auto_submitted_header and auto_submitted_header.strip().lower() not in ("", "no"):
        return True

    auto_reply_subject_markers = (
        "automatic reply:", "auto-reply:", "autoreply:", "out of office",
        "ooo:", "delivery status notification", "undeliverable:",
        "mail delivery failed", "returned mail:", "failure notice",
    )
    if any(subj_lower.startswith(m) or m in subj_lower for m in auto_reply_subject_markers):
        return True

    # 1. Known Vendor, Bounce & Marketing Domains
    noise_domains = (
        "adobe.com", "cerebralvalley.ai", "artha.link", "render.com", "neon.tech",
        "oreilly.com", "geeksforgeeks.org", "coderabbit.ai", "google.com",
        "github.com", "linkedin.com", "twitter.com", "x.com", "facebook.com",
        "instagram.com", "medium.com", "substack.com", "mailchimp.com",
        "sendgrid.net", "intercom-mail.com", "hubspot.com", "salesforce.com",
        "canva.com", "figma.com", "notion.so", "slack.com", "atlassian.net",
        "zoom.us", "spotify.com", "netflix.com", "swiggy.in", "zomato.com",
    )
    for dom in noise_domains:
        if s_email.endswith(f"@{dom}") or f".{dom}" in s_email or f"@{dom}" in s_email:
            return True

    # 2. Automated / Robot / Bounce Sender Prefixes
    noise_sender_patterns = (
        "noreply", "no-reply", "do-not-reply", "donotreply", "newsletter",
        "marketing", "promotions", "mailer-daemon", "mailer", "postmaster@",
        "digest", "updates", "offers", "billing", "payments-noreply",
        "notifications", "support@coderabbit", "security-alert",
        "hello@", "team@", "info@", "news@", "editor@", "changelog",
    )
    if any(pat in s_email for pat in noise_sender_patterns):
        return True

    # 3. Known Marketing / Newsletter / Engagement Blast Signatures
    marketing_triggers = (
        "view web version", "this is a marketing email",
        "click on the following link to unsubscribe", "click here to unsubscribe",
        "unsubscribe from this list", "manage your email preferences",
        "manage preferences", "to unsubscribe", "privacy policy | unsubscribe",
        "terms of service | privacy policy", "save on creative cloud",
        "creative cloud", "introducing gemini", "save up to",
        "diwali offers and greetings", "week of october", "week of november",
        "weekly digest", "monthly newsletter", "special offers",
        "save on pro", "save on plan", "product update", "changelog", "release notes",
        "word puzzle", "edgexcellence",
    )
    if any(trig in combined for trig in marketing_triggers):
        return True

    return False


def detect_employee_code(text: str) -> Optional[str]:
    """Detects Tata 1mg Employee ID tokens like EMP1024, 1MG10234, 1MG-10234, 1MGHC4931, CON1MG3202 without mistaking ticket tags."""
    if not text:
        return None
    cleaned = CASE_STRIP_PATTERN.sub(" ", text)
    labeled = LABELED_EMP_CODE_PATTERN.search(cleaned)
    if labeled:
        candidate = labeled.group(1).strip().upper()
        if any(ch.isdigit() for ch in candidate):
            return candidate
    for m in EMP_CODE_PATTERN.finditer(cleaned):
        return m.group(0).upper()
    return None


def lookup_hrms_employee(
    detected_code: Optional[str] = None,
    sender_email: Optional[str] = None,
    detected_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Looks up active employee record from Neon `employees` table, prioritizing Emp ID > Email > Name."""
    conditions = []
    params = []
    priority_cases = []
    priority_params = []

    if detected_code:
        clean_code = detected_code.strip().upper()
        cond = "REPLACE(UPPER(employee_id), '-', '') = REPLACE(%s, '-', '')"
        conditions.append(cond)
        params.append(clean_code)
        priority_cases.append(f"WHEN {cond} THEN 1")
        priority_params.append(clean_code)
    if sender_email and "@" in sender_email:
        clean_email = sender_email.strip()
        cond = "LOWER(email) = LOWER(%s)"
        conditions.append(cond)
        params.append(clean_email)
        priority_cases.append(f"WHEN {cond} THEN 2")
        priority_params.append(clean_email)
    if detected_name and detected_name.lower() not in ("employee", "tata 1mg employee", "colleague"):
        clean_name = detected_name.strip()
        cond = "LOWER(name) = LOWER(%s)"
        conditions.append(cond)
        params.append(clean_name)
        priority_cases.append(f"WHEN {cond} THEN 3")
        priority_params.append(clean_name)

    if not conditions:
        return None

    try:
        emp_query = f"""
            SELECT id, employee_id, name, email, department, designation, manager_name, location
            FROM employees
            WHERE {' OR '.join(conditions)}
            ORDER BY CASE {' '.join(priority_cases)} ELSE 4 END ASC, id ASC
            LIMIT 1;
        """
        emp_record = execute_query(emp_query, tuple(params + priority_params), fetch_one=True)
        if emp_record:
            return {
                "id": emp_record.get("id"),
                "employee_id": emp_record.get("employee_id"),
                "name": emp_record.get("name"),
                "email": emp_record.get("email"),
                "department": emp_record.get("department") or "Operations",
                "designation": emp_record.get("designation") or "Associate",
                "manager_name": emp_record.get("manager_name") or "People Operations Lead",
                "location": emp_record.get("location") or "Gurugram DC Hub",
                "is_verified": True,
            }
    except Exception as e:
        logger.warning(f"Error looking up employee in HRMS: {e}")

    return None


def find_department_assignee(dept_id: Optional[int]) -> Optional[Dict[str, Any]]:
    """
    Finds the dedicated non-Admin Department Head for automatic triage ownership.
    Returns None if no dedicated non-Admin Head exists so the case stays cleanly Unassigned in that desk's pool.
    """
    if not dept_id:
        return None
    return execute_query(
        """
        SELECT u.id, u.name, u.email
        FROM users u
        LEFT JOIN user_departments ud ON ud.user_id = u.id
        WHERE u.status = 'ACTIVE'
          AND u.is_dept_head = TRUE
          AND UPPER(COALESCE(u.role, 'HR_AGENT')) != 'ADMIN'
          AND (u.department_id = %s OR ud.department_id = %s)
        ORDER BY u.id ASC
        LIMIT 1;
        """,
        (dept_id, dept_id),
        fetch_one=True,
    )


def _extract_sender_name(body: str, sender_name: str, sender_email: str = "") -> str:
    # Use horizontal whitespace [ \t]+ so regex never bleeds across newlines into "Employee ID:"
    struct_name_match = re.search(
        r"\*?(?:Employee\s*(?:/\s*Client)?|Employee\s*Name)\*?\s*:\*?\s*([A-Za-z]+(?:[ \t]+[A-Za-z]+){0,3})",
        body or "",
        re.IGNORECASE,
    )
    signoff_name_match = re.search(
        r"(?:Regards|Warm regards|Best regards|Sincere regards|Thanks|Sincerely|Best|Thank you)[,!.]?[ \t]*\r?\n[ \t]*([A-Za-z]+(?:[ \t]+[A-Za-z]+){0,3})",
        body or "",
        re.IGNORECASE,
    )
    salutation_match = re.search(
        r"(?:Hello|Dear|Hi)[ \t]+([A-Za-z]+(?:[ \t]+[A-Za-z]+){1,3})[ \t,]",
        body or "",
        re.IGNORECASE,
    )

    def _clean_candidate(val: str) -> str:
        cleaned = re.sub(r"\b(?:Employee\s*ID|Emp\s*ID|Employee|ID|Code|Date|Status|Details)\b.*$", "", val or "", flags=re.IGNORECASE).strip(" :-,*")
        return cleaned

    if struct_name_match:
        cand = _clean_candidate(struct_name_match.group(1))
        if cand:
            return cand
    if signoff_name_match:
        cand = _clean_candidate(signoff_name_match.group(1))
        if cand and cand.lower() not in ("team", "hr", "team hr", "tata 1mg", "people desk"):
            return cand
    if salutation_match and (
        not sender_name
        or any(
            k in sender_name.lower()
            for k in ("operations", "flow", "portal", "system", "desk", "support", "admin", "hr", "notification")
        )
    ):
        cand = _clean_candidate(salutation_match.group(1))
        if cand and not any(k in cand.lower() for k in ("hr team", "sir", "madam", "maam", "team")):
            return cand

    clean_sender = (sender_name or "").strip()
    if clean_sender and clean_sender.lower() != "employee" and not any(
        k in clean_sender.lower()
        for k in ("gitguardian", "lottiefiles", "security", "noreply", "alert", "system", "newsletter", "flow operations", "hr flow")
    ):
        return clean_sender

    # Friendly label for known BGV screening partners when display name is missing/"Employee"
    se = (sender_email or "").lower()
    bgv_vendors = (
        ("authbridge", "AuthBridge BGV"),
        ("fadv.com", "First Advantage (FADV)"),
        ("hireright", "HireRight BGV"),
        ("cfirst.io", "cFirst BGV"),
        ("dcoderesearch", "Dcode Research BGV"),
        ("xstreamsecure", "XstreamSecure BGV"),
        ("crystalscreening", "Crystal Screening BGV"),
        ("securitas", "Securitas BGV"),
        ("itraceu", "iTraceU BGV"),
        ("kryacheck", "KryaCheck BGV"),
        ("arcattest", "ArcAttest BGV"),
    )
    for dom, label in bgv_vendors:
        if dom in se:
            return label

    return "Employee"


def extract_mail_what_whom_why(
    subject: str,
    body: str,
    sender_name: str,
    sender_email: str,
    detected_name: str,
    detected_code: Optional[str],
    matched_employee: Optional[Dict[str, Any]],
    intent_label: str,
    dept_name: str,
    target_sla: str,
    is_noise: bool = False,
) -> Dict[str, str]:
    """
    Distills an inbound email into three clear operational signals:
    - what: What request, event, or issue the mail is about.
    - whom: Who the mail concerns and who sent/owns it.
    - why:  Why it was sent (root cause, trigger, or urgency).
    """
    clean_subj = re.sub(r"^(?:re|fwd?)\s*:\s*", "", (subject or "").strip(), flags=re.IGNORECASE).strip()

    raw_text = html_lib.unescape(body or "")
    raw_text = raw_text.replace("\u00a0", " ").replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
    raw_text = re.sub(r"\[image:\s*[^\]]+\]", " ", raw_text, flags=re.IGNORECASE)
    raw_text = re.sub(r"<https?://[^>]+>|https?://\S+", " ", raw_text)

    # Strip quoted block only if top body has substantial text
    quote_match = re.search(
        r"(?:\n){2,}\s*(?:>{1,4}(?:\s|$)|On\s+[\s\S]{10,160}?\bwrote:|---+ Original Message ---+)",
        raw_text,
        flags=re.IGNORECASE,
    )
    if quote_match and quote_match.start() > 110:
        raw_text = raw_text[: quote_match.start()]
    else:
        raw_text = re.sub(r"^\s*>+\s?", "", raw_text, flags=re.MULTILINE)

    # Normalize markdown bullets/bold BEFORE collapsing newlines so key-value fields never bleed together
    norm_lines = re.sub(r"(?:^|\n)\s*-\s*\n+\s*", "\n", raw_text)
    norm_lines = re.sub(r"\*{1,2}([^*\n]+)\*{1,2}", r"\1", norm_lines)
    norm_lines = re.sub(r"[ \t]+", " ", norm_lines)

    body_emp_name_m = re.search(
        r"Employee\s*Name\s*:\s*([A-Za-z]+(?:[ \t]+[A-Za-z]+){0,3})(?=\s*(?:\r?\n|$|Employee\s*(?:ID|Code)|Emp\s*ID))",
        norm_lines,
        re.IGNORECASE,
    )
    body_emp_code_m = re.search(
        r"Employee\s*(?:ID|Code)\s*[:\-]+\s*([A-Z0-9][A-Z0-9\-]{3,19})",
        norm_lines,
        re.IGNORECASE,
    )

    flat_text = re.sub(r"\s+", " ", norm_lines).strip()

    # Remove common salutations and sign-offs from leading/trailing text WITHOUT crossing into body sentences
    body_clean = re.sub(
        r"^(?:Dear|Hello|Hi|Hey)\s+(?:Sir\s*/\s*Ma['’]?am|Sir\s*/\s*Madam|HR\s*Team|People\s*Desk(?:\s*Team)?|Team|HR|All|Sir|Madam|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:[,!.:;]+\s*|\r?\n+)",
        "",
        norm_lines.strip(),
        flags=re.IGNORECASE,
    ).strip()
    body_clean = re.sub(
        r"\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[\s\S]{5,180}?\bwrote:[\s\S]*$",
        "",
        body_clean,
        flags=re.IGNORECASE,
    ).strip()
    body_clean = re.sub(
        r"(?:Warm|Best|Sincere|Kind)?\s*(?:Regards|Thanks\s*(?:&|and)\s*Regards),?\s*(?:Team\s*HR|Tata\s*1mg.*)?$",
        "",
        body_clean,
        flags=re.IGNORECASE,
    ).strip()
    body_clean = re.sub(r"\s+", " ", body_clean).strip()

    sentences = [
        re.sub(r"\s*\bEmployee\s*(?:ID|Code|Details|Name)\b\s*[:\-]+.*$", "", s, flags=re.IGNORECASE).strip(" .-\t")
        for s in re.split(r"(?<=[.!?])\s+|\s*\n+\s*", body_clean)
        if len(s.strip()) > 12
    ]
    sentences = [s for s in sentences if len(s) > 10]

    # --- 1. WHOM ---
    subject_person = None
    m_verif = re.search(
        r"(?:employment|background)?\s*verification\s+of\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})",
        flat_text,
        re.IGNORECASE,
    )
    if not m_verif:
        m_verif = re.search(
            r"Verification_([A-Za-z]+(?:\s+[A-Za-z]+){0,3})_",
            clean_subj,
            re.IGNORECASE,
        )
    if m_verif:
        cand = re.sub(r"\b(?:who|we|is|was|employed)\b.*$", "", m_verif.group(1), flags=re.IGNORECASE).strip(" _,-")
        if len(cand) >= 3:
            subject_person = cand

    cleaned_body_emp_name = (
        re.sub(r"\b(?:Employee\s*ID|Emp\s*ID|Employee|ID|Code|Details)\b.*$", "", body_emp_name_m.group(1), flags=re.IGNORECASE).strip(" :-,*")
        if body_emp_name_m
        else None
    )

    primary_person = (
        subject_person
        or (cleaned_body_emp_name if cleaned_body_emp_name else None)
        or (detected_name if detected_name and not str(detected_name).startswith("Vendor:") else None)
        or sender_name
        or "Employee"
    )
    primary_code = (body_emp_code_m.group(1).strip().upper() if body_emp_code_m else None) or detected_code
    emp_dept = (matched_employee or {}).get("department")
    emp_desig = (matched_employee or {}).get("designation")

    if is_noise:
        whom = f"Automated alert to People Desk (from {sender_name or sender_email or 'External System'})"
    elif subject_person and sender_name and subject_person.lower() not in sender_name.lower():
        code_part = f" ({primary_code})" if primary_code else ""
        whom = f"{subject_person}{code_part} · Requested by {sender_name}"
    else:
        meta_bits = []
        if primary_code:
            meta_bits.append(primary_code)
        if emp_desig and emp_desig not in ("External Inbound", "Automated Inbound / Vendor"):
            meta_bits.append(emp_desig)
        elif sender_email and "@" in sender_email:
            meta_bits.append(sender_email)
        if emp_dept and emp_dept != dept_name and "External" not in emp_dept:
            meta_bits.append(emp_dept)
        whom = f"{primary_person} ({' · '.join(meta_bits)})" if meta_bits else primary_person

    # --- 2. WHAT ---
    generic_intent = (intent_label or "").strip().lower() in ("general inquiry", "people desk support inquiry", "")
    if is_noise:
        what = f"Automated notification: {clean_subj or 'System / marketing alert'} (no HR action required)"
    elif subject_person or "background" in (intent_label or "").lower() or "bgv" in (intent_label or "").lower():
        what = f"Employment & background verification request for {subject_person or primary_person} ({dept_name})"
    elif clean_subj and generic_intent:
        what = clean_subj
    elif clean_subj and intent_label:
        what = intent_label if intent_label.lower() in clean_subj.lower() else f"{intent_label} — {clean_subj}"
    else:
        request_sentence = None
        for s in sentences:
            sl = s.lower()
            if any(k in sl for k in ("writing to", "request", "issue", "problem", "waiting", "salary", "attendance", "absent", "punch", "leave", "mediclaim", "payslip", "form 16", "reimburse", "address", "help")):
                request_sentence = s
                break
        if request_sentence:
            snippet = request_sentence[:125].rstrip(" ,;:") + ("..." if len(request_sentence) > 125 else "")
            what = f"{intent_label}: {snippet}" if intent_label and intent_label.lower() not in snippet.lower() else snippet
        else:
            what = intent_label or "HR support inquiry"

    # --- 3. WHY ---
    if is_noise:
        why = sentences[0][:140] if sentences else "Automated account/vendor alert; filtered out of active HR queue."
    else:
        why_triggers = (
            "because", "due to", "incorrectly", "marked as absent", "absent", "not received",
            "only received", "waiting", "pending", "discrepancy", "failure", "couldn't",
            "enclosing", "validate", "questionnaire", "correction", "issue", "problem",
            "celebrating", "offer", "prevent", "urgent",
        )
        scored = []
        for idx, s in enumerate(sentences):
            sl = s.lower()
            score = sum(2 if tok in sl else 0 for tok in why_triggers)
            if 20 <= len(s) <= 220:
                score += 1
            if score > 0:
                scored.append((score, -idx, s))
        if scored:
            scored.sort(reverse=True)
            best_why = scored[0][2]
            why = best_why[:145].rstrip(" ,;:") + ("..." if len(best_why) > 145 else "")
        elif sentences:
            s0 = sentences[0]
            why = s0[:145].rstrip(" ,;:") + ("..." if len(s0) > 145 else "")
        else:
            why = f"Routed to {dept_name} for specialist review ({target_sla})."

    return {
        "what": what,
        "whom": whom,
        "why": why,
    }


def build_email_ai_insights(email_row: dict) -> dict:
    """
    Unified AI entity + department + intent extraction for incoming correspondence.
    Used across IMAP ingestion, API ingestion, Inbox stream display, and auto-case creation.
    """
    body = email_row.get("body") or ""
    subject = email_row.get("subject") or ""
    sender_name = email_row.get("sender_name") or ""
    sender_email = email_row.get("sender_email") or ""
    text_content = f"{subject}\n{body}"

    if is_automated_newsletter_or_noise(sender_name, sender_email, subject, body):
        vendor_label = sender_name if (sender_name and sender_name != "Employee") else "External Vendor / Newsletter"
        return {
            "detected_name": f"Vendor: {vendor_label}",
            "detected_code": None,
            "category": "SYSTEM_ALERT",
            "department_id": 11,
            "dept_code": "DEPT-PEOPLEDESK",
            "team_name": "People Desk",
            "intent_code": "SYS01",
            "intent_label": "Automated Marketing / Vendor Newsletter (Noise)",
            "target_sla": "No SLA (Noise / Non-Actionable)",
            "sla_hours": 0,
            "default_priority": "LOW",
            "is_urgent": False,
            "language": "Corporate English",
            "confidence": 99.8,
            "confidence_ratio": 0.998,
            "requires_review": 0,
            "routing_source": "NOISE_FILTER",
            "is_noise": True,
            "is_actionable": 0,
            "matched_employee": {
                "id": None,
                "employee_id": None,
                "name": vendor_label,
                "email": sender_email,
                "department": "External Inbound (Non-Employee)",
                "designation": "Automated Inbound / Vendor",
                "manager_name": "—",
                "location": "External",
                "is_verified": False,
                "is_noise": True,
            },
            "what_whom_why": extract_mail_what_whom_why(
                subject=subject,
                body=body,
                sender_name=vendor_label,
                sender_email=sender_email,
                detected_name=vendor_label,
                detected_code=None,
                matched_employee=None,
                intent_label="Automated Marketing / Vendor Newsletter (Noise)",
                dept_name="People Desk",
                target_sla="No SLA",
                is_noise=True,
            ),
            "drafts": {
                "empathetic": "This email has been identified as an automated marketing newsletter or system notification. No employee response is required.",
                "concise": "Automated external mailer. No action required.",
                "verify_docs": "Automated external mailer. No action required.",
            },
        }

    detected_code = detect_employee_code(text_content)
    detected_name = _extract_sender_name(body, sender_name, sender_email)
    matched_employee = lookup_hrms_employee(detected_code, sender_email, detected_name)

    if matched_employee:
        if not detected_code:
            detected_code = matched_employee.get("employee_id")
        if not detected_name or detected_name == "Employee":
            detected_name = matched_employee.get("name") or "Employee"

    is_domain_verified = (sender_email or "").strip().lower().endswith("@1mg.com")
    requires_emp_id = not is_domain_verified and not detected_code and not (matched_employee and matched_employee.get("is_verified"))
    emp_id_status = "AWAITING_EMP_ID" if requires_emp_id else ("VERIFIED_1MG" if is_domain_verified else "VERIFIED_EXT_CODE")

    # Classify via unified Stage 1 + Stage 2 ML Pipeline.
    # Only honor stored_category as explicit_category if a live department with that category exists;
    # otherwise route dynamically to the active configured desk (e.g. People Desk).
    from backend.app.services.classifier_service import _fetch_departments, resolve_category_code
    live_depts = _fetch_departments()
    live_categories = {resolve_category_code(d) for d in live_depts}

    stored_category = (email_row.get("category") or "").upper()
    explicit_cat = (
        stored_category
        if stored_category in live_categories and stored_category not in ("", "UNKNOWN", "SYSTEM_ALERT", "NEWSLETTER", "SPAM", "INQUIRY")
        else None
    )
    cls_res = classify_inbound_email_ai(
        subject=subject,
        body=body,
        explicit_category=explicit_cat,
        departments=live_depts,
    )

    cat = cls_res.get("category_code") or "PEOPLEDESK"
    intent_code = cls_res.get("intent_code") or "PD06"
    intent_label = cls_res.get("intent_label") or "People Desk Support Inquiry"
    target_sla = cls_res.get("target_sla") or "24h Target SLA"
    sla_hours = int(cls_res.get("sla_hours") or 24)
    is_urgent = bool(cls_res.get("is_urgent"))
    confidence = float(cls_res.get("confidence") or 85.0)
    confidence_ratio = float(cls_res.get("confidence_ratio") or round(confidence / 100.0, 4))
    dept_name = cls_res.get("team_name") or "People Desk"

    if not matched_employee:
        matched_employee = {
            "id": None,
            "employee_id": detected_code or None,
            "name": detected_name or "Employee",
            "email": sender_email,
            "department": dept_name,
            "designation": "Tata 1mg Staff" if is_domain_verified else "External Inbound",
            "manager_name": "People Operations",
            "location": "—",
            "is_verified": is_domain_verified or bool(detected_code),
            "requires_emp_id": requires_emp_id,
        }

    emp_label = detected_code or "Pending Verification"
    drafts = {
        "empathetic": (
            f"Dear {detected_name},\n\n"
            f"Thank you for contacting Tata 1mg People Desk regarding: \"{subject}\". "
            f"Your request has been routed to our {dept_name} team (Employee ID: {emp_label}).\n\n"
            f"Our specialist is reviewing your request ({intent_label}) and will share an update within {target_sla}.\n\n"
            f"Warm regards,\n{dept_name}\nTata 1mg People Desk"
        ),
        "concise": (
            f"Hi {detected_name},\n\n"
            f"Your inquiry regarding \"{subject}\" has been logged under {dept_name} ({intent_code}) for Employee ID {emp_label}.\n"
            f"Target turnaround: {target_sla}.\n\n"
            f"Best regards,\nTata 1mg {dept_name}"
        ),
        "verify_docs": (
            f"Dear {detected_name},\n\n"
            f"We have initiated review for \"{subject}\" with our {dept_name} team. To expedite processing, "
            f"please reply with any supporting screenshots, dates, or manager approval details if applicable.\n\n"
            f"Employee ID: {emp_label}\nLocation: {matched_employee.get('location', '—')}\n\n"
            f"Regards,\nTata 1mg {dept_name}"
        ),
    }

    return {
        "detected_name": detected_name,
        "detected_code": detected_code,
        "category": cat,
        "department_id": cls_res.get("department_id"),
        "dept_code": cls_res.get("dept_code"),
        "team_name": dept_name,
        "intent_code": intent_code,
        "intent_label": intent_label,
        "target_sla": target_sla,
        "sla_hours": sla_hours,
        "default_priority": cls_res.get("default_priority", "MEDIUM"),
        "is_urgent": is_urgent,
        "language": cls_res.get("language", "Corporate English"),
        "confidence": confidence,
        "confidence_ratio": confidence_ratio,
        "requires_review": cls_res.get("requires_review", 0),
        "routing_source": cls_res.get("routing_source", "STAGE1_KEYWORDS"),
        "is_noise": False,
        "is_actionable": 1,
        "is_domain_verified": is_domain_verified,
        "requires_emp_id": requires_emp_id,
        "emp_id_status": emp_id_status,
        "matched_employee": matched_employee,
        "what_whom_why": extract_mail_what_whom_why(
            subject=subject,
            body=body,
            sender_name=sender_name,
            sender_email=sender_email,
            detected_name=detected_name,
            detected_code=detected_code,
            matched_employee=matched_employee,
            intent_label=intent_label,
            dept_name=dept_name,
            target_sla=target_sla,
            is_noise=bool(email_row.get("is_noise")) or str(email_row.get("actionable_reason") or "").startswith("NOISE"),
        ),
        "drafts": drafts,
    }


def _resolve_email_employee_fields(email_row: dict, ai_insights: dict) -> Dict[str, Any]:
    """Resolves verified HRMS employee fields cleanly using matched_employee + email_id."""
    emp_db_id = email_row.get("employee_id")
    matched_emp = ai_insights.get("matched_employee") or {}
    if not emp_db_id and isinstance(matched_emp, dict):
        emp_db_id = matched_emp.get("id")

    emp_record = None
    if emp_db_id:
        emp_record = execute_query(
            "SELECT id, employee_id, name, email, department, designation, manager_name, location FROM employees WHERE id = %s LIMIT 1;",
            (emp_db_id,),
            fetch_one=True,
        )

    detected_code = ai_insights.get("detected_code")
    emp_email = email_row.get("sender_email") or "employee@1mg.com"
    is_domain_verified = emp_email.strip().lower().endswith("@1mg.com")

    if emp_record:
        emp_name = emp_record.get("name") or ai_insights.get("detected_name") or email_row.get("sender_name") or "Tata 1mg Employee"
        emp_code = emp_record.get("employee_id") or detected_code
        hr_email = emp_record.get("email") or ""
        company_email = hr_email if hr_email.lower().endswith("@1mg.com") else (emp_email if is_domain_verified else None)
        personal_email = emp_email if not is_domain_verified else None
        manager = emp_record.get("manager_name") or "People Operations Lead"
        is_verified = True
    else:
        emp_name = ai_insights.get("detected_name") or email_row.get("sender_name") or "Tata 1mg Employee"
        emp_code = detected_code
        company_email = emp_email if is_domain_verified else None
        personal_email = emp_email if not is_domain_verified else None
        manager = matched_emp.get("manager_name") if isinstance(matched_emp, dict) else None
        is_verified = bool(is_domain_verified or detected_code)

    return {
        "employee_id": emp_db_id,
        "employee_code": emp_code,
        "employee_name": emp_name,
        "employee_email": emp_email,
        "company_email": company_email,
        "personal_email": personal_email,
        "manager": manager,
        "is_verified": is_verified,
        "requires_emp_id": not is_verified,
    }


def attach_reply_to_existing_case(
    reply_email_id: int,
    reply_row: dict,
    parent_row: dict,
    ai_insights: dict,
    actor_email: str = "system@1mg.com",
    actor_name: str = "People Desk AI Router",
) -> Dict[str, Any]:
    """
    Attaches a follow-up email reply to the existing Case without creating a duplicate Case Number.
    If the parent root email was somehow unconverted yet, creates its case first, then links the reply.
    """
    parent_id = parent_row.get("id")
    case_id = parent_row.get("case_id")
    case_number = parent_row.get("case_number")
    parent_dept_id = parent_row.get("department_id")

    # If parent exists without a case yet (e.g., historical or held thread), create case on root first
    if not case_id and parent_id:
        root_row = execute_query("SELECT * FROM emails WHERE id = %s;", (parent_id,), fetch_one=True) or parent_row
        root_ai = build_email_ai_insights(root_row)
        created_res = create_case_from_email_record(
            email_id=parent_id,
            email_row=root_row,
            ai_insights=root_ai,
            override_dept_id=root_row.get("department_id") or root_ai.get("department_id"),
            actor_email=actor_email,
            actor_name=actor_name,
            send_confirmation=False,
            action_name="AUTO_CASE_CREATED",
        )
        if created_res.get("success") and created_res.get("case"):
            case_id = created_res["case"]["id"]
            case_number = created_res["case"]["case_number"]
            parent_dept_id = created_res["case"].get("department_id") or parent_dept_id

    if not case_id:
        return {"success": False, "created": False, "linked": False, "message": "Parent thread has no case_id."}

    case_record = execute_query("SELECT * FROM cases WHERE id = %s;", (case_id,), fetch_one=True)
    if not case_record:
        return {"success": False, "created": False, "linked": False, "message": f"Case {case_id} not found."}

    case_number = case_record["case_number"]
    case_dept_id = case_record.get("department_id") or parent_dept_id

    # Link child reply row in emails table
    execute_query(
        """
        UPDATE emails
        SET case_id = %s,
            case_number = %s,
            department_id = COALESCE(%s, department_id),
            is_converted = 1,
            updated_at = NOW()
        WHERE id = %s;
        """,
        (case_id, case_number, case_dept_id, reply_email_id),
        commit=True,
    )

    # Check if reply supplied a newly verified Employee ID / HRMS match
    detected_code = ai_insights.get("detected_code")
    matched_emp = ai_insights.get("matched_employee") or {}
    emp_db_id = matched_emp.get("id") if isinstance(matched_emp, dict) else None
    emp_code = (matched_emp.get("employee_id") if isinstance(matched_emp, dict) else None) or detected_code

    update_fields = ["updated_at = NOW()"]
    update_params = []

    sender_label = reply_row.get("sender_name") or case_record.get("employee_name") or "Employee"
    reply_snippet = (reply_row.get("body") or "").strip()
    if reply_snippet:
        curr_desc = case_record.get("description") or ""
        header_line = "\n\n--- Thread History & Employee Replies ---"
        entry = f"\n\n[{sender_label}]:\n{reply_snippet}"
        new_desc = curr_desc + (entry if header_line in curr_desc else header_line + entry)
        update_fields.append("description = %s")
        update_params.append(new_desc)

    if emp_db_id and not case_record.get("employee_id"):
        update_fields.append("employee_id = %s")
        update_params.append(emp_db_id)
    if emp_code and not case_record.get("employee_code"):
        update_fields.append("employee_code = %s")
        update_params.append(emp_code)
    if emp_db_id or emp_code:
        update_fields.append("is_profile_verified = TRUE")
        if parent_id:
            execute_query(
                """
                UPDATE emails
                SET actionable_reason = 'VERIFIED_BY_REPLY',
                    employee_id = COALESCE(%s, employee_id),
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (emp_db_id, parent_id),
                commit=True,
            )

    old_status = (case_record.get("status") or "OPEN").upper()
    if old_status in ("WAITING_ON_EMPLOYEE", "RESOLVED"):
        update_fields.append("status = 'OPEN'")

    update_params.append(case_id)
    execute_query(
        f"UPDATE cases SET {', '.join(update_fields)} WHERE id = %s;",
        tuple(update_params),
        commit=True,
    )

    # Audit log entry
    audit_payload = json.dumps({
        "message": f"Employee reply attached to existing Case {case_number} (Email #{reply_email_id}).",
        "reply_email_id": reply_email_id,
        "employee_code": emp_code,
        "status_before": old_status,
        "status_after": "OPEN" if old_status in ("WAITING_ON_EMPLOYEE", "RESOLVED") else old_status,
    })
    execute_query(
        """
        INSERT INTO audit_logs (case_id, case_number, actor_email, actor_name, action, details, created_at)
        VALUES (%s, %s, %s, %s, 'EMPLOYEE_REPLY_RECEIVED', %s::jsonb, NOW());
        """,
        (case_id, case_number, reply_row.get("sender_email") or actor_email, sender_label, audit_payload),
        commit=True,
    )

    return {
        "success": True,
        "created": False,
        "linked": True,
        "case": case_record,
        "case_id": case_id,
        "case_number": case_number,
        "department_id": case_dept_id,
        "message": f"Reply attached to existing Case {case_number}",
    }


def create_case_from_email_record(
    email_id: int,
    email_row: Optional[dict] = None,
    ai_insights: Optional[dict] = None,
    override_dept_id: Optional[int] = None,
    override_priority: Optional[str] = None,
    override_assigned_user: Optional[str] = None,
    actor_email: Optional[str] = None,
    actor_name: Optional[str] = None,
    send_confirmation: bool = True,
    action_name: str = "AUTO_CASE_CREATED",
) -> Dict[str, Any]:
    """
    Idempotently creates (or links to existing thread) a tracked Case (1MGXXXXX)
    for an actionable inbound email and routes it into the AI-detected department.
    """
    latest_email = execute_query("SELECT * FROM emails WHERE id = %s;", (email_id,), fetch_one=True) or email_row
    if not latest_email:
        return {"success": False, "created": False, "message": f"Email #{email_id} not found."}

    if ai_insights is None:
        ai_insights = build_email_ai_insights(latest_email)

    # Idempotency guard: already converted
    if latest_email.get("is_converted") and latest_email.get("case_id"):
        existing_case = execute_query("SELECT * FROM cases WHERE id = %s;", (latest_email["case_id"],), fetch_one=True)
        return {
            "success": True,
            "created": False,
            "case": existing_case,
            "case_id": latest_email["case_id"],
            "case_number": latest_email.get("case_number"),
            "department_id": existing_case.get("department_id") if existing_case else latest_email.get("department_id"),
            "message": f"Already converted to Case {latest_email.get('case_number')}",
        }

    # Check if this email has a parent or references an existing [1MGXXXXX] case tag
    if latest_email.get("parent_id"):
        parent_row = execute_query(
            "SELECT * FROM emails WHERE id = %s;",
            (latest_email["parent_id"],),
            fetch_one=True,
        )
        if parent_row:
            return attach_reply_to_existing_case(
                reply_email_id=email_id,
                reply_row=latest_email,
                parent_row=parent_row,
                ai_insights=ai_insights,
                actor_email=actor_email or ADMIN_EMAIL,
                actor_name=actor_name or "People Desk AI Router",
            )

    subject = latest_email.get("subject") or "Employee Inbound Inquiry"
    body = latest_email.get("body") or ""
    tag_case_num = extract_case_number_tag(subject, "")
    if tag_case_num:
        existing_tagged_case = execute_query(
            "SELECT * FROM cases WHERE UPPER(case_number) = UPPER(%s) LIMIT 1;",
            (tag_case_num,),
            fetch_one=True,
        )
        if existing_tagged_case:
            return attach_reply_to_existing_case(
                reply_email_id=email_id,
                reply_row=latest_email,
                parent_row={
                    "id": None,
                    "case_id": existing_tagged_case["id"],
                    "case_number": existing_tagged_case["case_number"],
                    "department_id": existing_tagged_case.get("department_id"),
                },
                ai_insights=ai_insights,
                actor_email=actor_email or ADMIN_EMAIL,
                actor_name=actor_name or "People Desk AI Router",
            )

    # Resolve target department cleanly
    dept_id = override_dept_id or ai_insights.get("department_id") or latest_email.get("department_id")
    dept_info = None
    if dept_id:
        dept_info = execute_query(
            "SELECT id, dept_code, team_name, category_code, sla_hours, default_priority, dept_gmail FROM hr_departments WHERE id = %s;",
            (dept_id,),
            fetch_one=True,
        )
    if not dept_info:
        dept_info = execute_query(
            "SELECT id, dept_code, team_name, category_code, sla_hours, default_priority, dept_gmail FROM hr_departments ORDER BY (dept_code = 'DEPT-PEOPLEDESK') DESC, id ASC LIMIT 1;",
            fetch_one=True,
        ) or {}
    dept_id = dept_info.get("id") or 11
    dept_name = dept_info.get("team_name") or ai_insights.get("team_name") or "People Desk"
    dept_sla = int(ai_insights.get("sla_hours") or dept_info.get("sla_hours") or 24)
    effective_sla_hours = 4 if (ai_insights.get("is_urgent") and dept_sla > 4) else dept_sla

    priority = (
        override_priority
        or ("HIGH" if ai_insights.get("is_urgent") else None)
        or ai_insights.get("default_priority")
        or dept_info.get("default_priority")
        or "MEDIUM"
    ).upper()

    # Resolve Employee Identity & Verification State (Option A Instant Tracking)
    emp_fields = _resolve_email_employee_fields(latest_email, ai_insights)
    requires_emp_id = emp_fields["requires_emp_id"]
    initial_status = "WAITING_ON_EMPLOYEE" if requires_emp_id else "OPEN"

    # Resolve Specialist Assignment (non-Admin Dept Head or Unassigned Pool)
    assigned_user: Optional[str] = None
    assigned_email: Optional[str] = None
    assigned_user_id: Optional[int] = None

    explicit_spec = (latest_email.get("assigned_user_name") or override_assigned_user or "").strip()
    if latest_email.get("assigned_user_id") or (explicit_spec and explicit_spec.lower() not in ("unassigned", "central triage")):
        spec_row = None
        if latest_email.get("assigned_user_id"):
            spec_row = execute_query(
                "SELECT id, name, email FROM users WHERE id = %s LIMIT 1;",
                (latest_email["assigned_user_id"],),
                fetch_one=True,
            )
        if not spec_row and explicit_spec:
            spec_row = execute_query(
                "SELECT id, name, email FROM users WHERE LOWER(name) = LOWER(%s) LIMIT 1;",
                (explicit_spec,),
                fetch_one=True,
            )
        if spec_row:
            assigned_user_id = spec_row.get("id")
            assigned_user = spec_row.get("name")
            assigned_email = spec_row.get("email")
        else:
            assigned_user = explicit_spec
            assigned_email = latest_email.get("assigned_user_email")
    else:
        head = find_department_assignee(dept_id)
        if head:
            assigned_user_id = head.get("id")
            assigned_user = head.get("name")
            assigned_email = head.get("email")

    # Gather any pre-existing thread replies
    child_replies = execute_query(
        "SELECT id, body, sender_name, received_at FROM emails WHERE parent_id = %s ORDER BY received_at ASC, id ASC;",
        (email_id,),
        fetch_all=True,
    ) or []
    combined_body = body
    if child_replies:
        combined_body += "\n\n--- Thread History & Employee Replies ---"
        for cr in child_replies:
            combined_body += f"\n\n[{cr.get('sender_name', 'Employee')}]:\n{cr.get('body', '')}"

    # Allocate collision-free Case Number
    case_num = generate_case_number()
    due_at = datetime.now(timezone.utc) + timedelta(hours=effective_sla_hours)

    new_case = execute_query(
        """
        INSERT INTO cases (
            case_number, title, description,
            employee_name, employee_email, employee_id, employee_code,
            company_email, personal_email, manager, is_profile_verified,
            category, department_id, assigned_team, assigned_user, assigned_user_email, assigned_user_id,
            priority, status, sla_hours, due_at, created_at, updated_at
        ) VALUES (
            %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, NOW(), NOW()
        )
        RETURNING id, case_number, title, employee_name, employee_email, department_id, assigned_team, assigned_user, priority, status, due_at;
        """,
        (
            case_num,
            subject[:255],
            combined_body,
            emp_fields["employee_name"],
            emp_fields["employee_email"],
            emp_fields["employee_id"],
            emp_fields["employee_code"],
            emp_fields["company_email"],
            emp_fields["personal_email"],
            emp_fields["manager"],
            emp_fields["is_verified"],
            ai_insights.get("category") or dept_info.get("category_code") or "PEOPLEDESK",
            dept_id,
            dept_name,
            assigned_user,
            assigned_email,
            assigned_user_id,
            priority,
            initial_status,
            effective_sla_hours,
            due_at,
        ),
        fetch_one=True,
        commit=True,
    )

    if not new_case:
        return {"success": False, "created": False, "message": "Failed to insert auto-created case."}

    case_id = new_case["id"]
    reason_update = "AWAITING_EMP_ID" if requires_emp_id else latest_email.get("actionable_reason")

    execute_query(
        """
        UPDATE emails
        SET is_converted = 1,
            case_id = %s,
            case_number = %s,
            department_id = %s,
            employee_id = COALESCE(%s, employee_id),
            category = %s,
            category_confidence = COALESCE(category_confidence, %s),
            intent = COALESCE(intent, %s),
            intent_score = COALESCE(intent_score, %s),
            actionable_reason = COALESCE(%s, actionable_reason),
            updated_at = NOW()
        WHERE id = %s OR parent_id = %s;
        """,
        (
            case_id,
            case_num,
            dept_id,
            emp_fields["employee_id"],
            ai_insights.get("category") or dept_info.get("category_code") or "PEOPLEDESK",
            ai_insights.get("confidence_ratio"),
            ai_insights.get("intent_code"),
            ai_insights.get("confidence"),
            reason_update,
            email_id,
            email_id,
        ),
        commit=True,
    )

    audit_data = json.dumps({
        "message": f"Email #{email_id} ({subject[:60]}) auto-assigned Case {case_num} -> {dept_name} ({ai_insights.get('routing_source', 'AI')})",
        "email_id": email_id,
        "case_number": case_num,
        "department_id": dept_id,
        "department": dept_name,
        "category": ai_insights.get("category"),
        "intent_code": ai_insights.get("intent_code"),
        "confidence": ai_insights.get("confidence"),
        "routing_source": ai_insights.get("routing_source"),
        "employee_code": emp_fields["employee_code"],
        "requires_emp_id": requires_emp_id,
        "assigned_user": assigned_user or "Unassigned",
    })
    execute_query(
        """
        INSERT INTO audit_logs (case_id, case_number, actor_email, actor_name, action, details, created_at)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW());
        """,
        (
            case_id,
            case_num,
            actor_email or ADMIN_EMAIL,
            actor_name or "People Desk AI Router",
            action_name,
            audit_data,
        ),
        commit=True,
    )

    email_dispatch_result = None
    if send_confirmation and emp_fields["employee_email"] and "@" in emp_fields["employee_email"]:
        try:
            from backend.app.services.email_service import send_case_confirmation_email

            email_dispatch_result = send_case_confirmation_email(
                recipient_email=emp_fields["employee_email"],
                employee_name=emp_fields["employee_name"],
                case_number=case_num,
                case_subject=subject,
                department_name=dept_name,
                target_sla=ai_insights.get("target_sla", f"{effective_sla_hours}h SLA"),
                priority=priority,
                assigned_specialist=assigned_user or f"{dept_name} Queue",
                requires_emp_id=requires_emp_id,
                case_status=initial_status,
            )
        except Exception as notify_err:
            logger.warning(f"Failed to send auto-case email for {case_num}: {notify_err}")
            email_dispatch_result = {"sent": False, "error": str(notify_err)}

    return {
        "success": True,
        "created": True,
        "case": new_case,
        "case_id": case_id,
        "case_number": case_num,
        "department_id": dept_id,
        "department_name": dept_name,
        "status": initial_status,
        "requires_emp_id": requires_emp_id,
        "email_dispatch": email_dispatch_result,
        "message": f"Auto-assigned Case {case_num} to {dept_name}",
    }
