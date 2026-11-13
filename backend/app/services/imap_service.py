"""
Tata 1mg IMAP Mailbox Ingestion Service
Connects via secure IMAP (SSL Port 993) to the configured corporate mailbox (Gmail / Google Workspace / Zoho),
fetches incoming unread employee queries, parses RFC-2822 multipart messages,
runs them through the 3-stage AI extraction & routing engine, and stores them in PostgreSQL.
"""
import os
import re
import ssl
import logging
import imaplib
import email
import email.message
import threading
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger("backend.imap_service")
_imap_sync_lock = threading.Lock()

IST_TZ = timezone(timedelta(hours=5, minutes=30))
DEFAULT_IMAP_SYNC_START_DATE = "2026-11-12"
_IMAP_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

PLACEHOLDER_PASSWORDS = {"", "your_16_digit_app_password", "your_16_digit_google_app_password"}

def is_placeholder_password(password: Optional[str]) -> bool:
    return (password or "").strip().lower() in PLACEHOLDER_PASSWORDS


def get_imap_sync_start_datetime() -> Optional[datetime]:
    """
    Returns the timezone-aware start cutoff timestamp for inbound IMAP sync.
    Reads IMAP_SYNC_START_DATE (default '2026-11-12' -> midnight IST).
    Set IMAP_SYNC_START_DATE='OFF' (or 'ALL'/'NONE') to disable date filtering.
    """
    raw = (os.getenv("IMAP_SYNC_START_DATE") or "").strip()
    if not raw:
        raw = DEFAULT_IMAP_SYNC_START_DATE
    lower = raw.lower()
    if lower in ("off", "none", "all", "disabled", "false"):
        return None
    if lower == "today":
        now_ist = datetime.now(IST_TZ)
        return now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        if len(raw) == 10:
            return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=IST_TZ)
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=IST_TZ)
    except Exception:
        logger.warning(f"Invalid IMAP_SYNC_START_DATE='{raw}', falling back to {DEFAULT_IMAP_SYNC_START_DATE}")
        return datetime.strptime(DEFAULT_IMAP_SYNC_START_DATE, "%Y-%m-%d").replace(tzinfo=IST_TZ)


def format_imap_since_date(start_dt: datetime) -> str:
    """
    Formats an RFC-3501 IMAP SINCE date string (dd-Mon-YYYY) using 1 day prior to the IST cutoff date
    so UTC/PST mail server date boundaries never exclude valid messages right after midnight IST.
    """
    since_day = start_dt.astimezone(IST_TZ).date() - timedelta(days=1)
    return f"{since_day.day:02d}-{_IMAP_MONTHS[since_day.month - 1]}-{since_day.year}"


def _parse_imap_internaldate(meta_text: str) -> Optional[datetime]:
    match = re.search(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})", meta_text or "")
    if not match:
        return None
    day_s, mon_s, year_s, hh, mm, ss, tz_s = match.groups()
    mon_map = {m.lower(): idx + 1 for idx, m in enumerate(_IMAP_MONTHS)}
    month_num = mon_map.get(mon_s.lower())
    if not month_num:
        return None
    sign = 1 if tz_s[0] == "+" else -1
    tz_off = timezone(sign * timedelta(hours=int(tz_s[1:3]), minutes=int(tz_s[3:5])))
    return datetime(int(year_s), month_num, int(day_s), int(hh), int(mm), int(ss), tzinfo=tz_off)

def has_system_mailbox_config() -> tuple[bool, str, str]:
    """
    Checks if a real, non-placeholder system mailbox (SMTP/IMAP) is configured in environment variables.
    Returns (is_configured, email_user, imap_host).
    """
    host, _, user, password = get_imap_config()
    if user and password and not is_placeholder_password(password):
        return True, user, host
    return False, user or "", host

def detect_imap_host(email_or_host: str) -> str:
    """
    Infers IMAP hostname from email domain or host string.
    """
    clean = (email_or_host or "").strip().lower()
    if "@" in clean:
        clean = clean.split("@")[-1]
    if "zoho" in clean:
        return "imap.zoho.in" if ".in" in clean else "imap.zoho.com"
    elif "outlook" in clean or "office365" in clean or "microsoft" in clean or "live.com" in clean or "hotmail" in clean:
        return "outlook.office365.com"
    elif "yahoo" in clean:
        return "imap.mail.yahoo.com"
    return "imap.gmail.com"

def get_imap_config() -> tuple[str, int, str, str]:
    """
    Resolves IMAP host, port, username, and app password from environment variables
    with intelligent fallback to SMTP configuration.
    """
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip().lower()
    
    # Auto-detect IMAP host
    default_imap_host = "imap.gmail.com"
    if "zoho" in smtp_host:
        default_imap_host = "imap.zoho.in" if ".in" in smtp_host else "imap.zoho.com"
    elif "outlook" in smtp_host or "office365" in smtp_host:
        default_imap_host = "outlook.office365.com"
        
    imap_host = os.getenv("IMAP_HOST", default_imap_host).strip()
    try:
        imap_port = int(os.getenv("IMAP_PORT", 993))
    except (ValueError, TypeError):
        imap_port = 993
        
    imap_user = (os.getenv("IMAP_USER") or os.getenv("SMTP_USER") or "peopledesk@1mg.com").strip()
    imap_pass = (os.getenv("IMAP_PASS") or os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD") or "").strip()
    if is_placeholder_password(imap_pass):
        imap_pass = ""
    
    return imap_host, imap_port, imap_user, imap_pass

def get_imap_config_for_dept(department_id: Optional[int] = None, user_id: Optional[int] = None) -> tuple[str, int, str, str]:
    """
    Fetches stored IMAP credentials for a department from DB,
    falling back to system environment variables (centralized peopledesk@1mg.com).
    User accounts never store individual mailbox app passwords.
    """
    from backend.app.database import execute_query
    
    if department_id:
        dept = execute_query(
            "SELECT dept_gmail, dept_app_password, imap_host, imap_port FROM hr_departments WHERE id = %s;",
            (department_id,),
            fetch_one=True
        )
        if dept and dept.get("dept_app_password"):
            user = (dept.get("dept_gmail") or "").strip()
            password = (dept.get("dept_app_password") or "").strip()
            host = (dept.get("imap_host") or "").strip() or detect_imap_host(user)
            port = int(dept.get("imap_port") or 993)
            return host, port, user, password
            
    return get_imap_config()

def test_imap_connection(host: str, port: int, user: str, password: str, timeout: float = 10.0) -> tuple[bool, str]:
    """
    Tests live IMAP connection and credentials with SSL.
    Returns (True, "Success message") or (False, "Descriptive error message").
    """
    if not user or not password:
        return False, "Both Mailbox Email and App Password are required."
        
    mail = None
    try:
        context = ssl.create_default_context()
        mail = imaplib.IMAP4_SSL(host, port, ssl_context=context)
        mail.sock.settimeout(timeout)
        status, res = mail.login(user, password)
        if status == "OK":
            try:
                mail.logout()
            except Exception:
                pass
            return True, f"Successfully authenticated with {host} as {user}!"
        return False, f"IMAP authentication failed: {res}"
    except imaplib.IMAP4.error as err:
        err_msg = str(err).lower()
        if "authentication failed" in err_msg or "invalid credentials" in err_msg or "password" in err_msg or "bad" in err_msg:
            return False, "Invalid username or App Password. If using Google Workspace / Gmail, ensure 2-Step Verification is active and generate a 16-character App Password (not your personal account password)."
        return False, f"IMAP Authentication Error: {err}"
    except Exception as e:
        logger.error(f"IMAP test connection error: {e}")
        return False, f"Could not connect to {host}:{port} - {e}"
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

def decode_mime_string(val: Optional[str]) -> str:
    """Decodes MIME encoded-word strings (e.g. =?UTF-8?B?...?=) into unicode."""
    if not val:
        return ""
    try:
        decoded_chunks = decode_header(val)
        out = []
        for chunk, charset in decoded_chunks:
            if isinstance(chunk, bytes):
                encoding = charset or "utf-8"
                try:
                    out.append(chunk.decode(encoding, errors="replace"))
                except Exception:
                    out.append(chunk.decode("latin-1", errors="replace"))
            else:
                out.append(str(chunk))
        return "".join(out).strip()
    except Exception as e:
        logger.warning(f"Error decoding MIME header: {e}")
        return str(val).strip()

def extract_message_body(msg: email.message.Message) -> str:
    """Extracts clean plain-text or stripped HTML content from email message parts."""
    body_plain = ""
    body_html = ""
    
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            cdisp = str(part.get("Content-Disposition", ""))
            if "attachment" in cdisp.lower():
                continue
            
            try:
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                try:
                    text = payload.decode(charset, errors="replace")
                except Exception:
                    text = payload.decode("latin-1", errors="replace")
                    
                if ctype == "text/plain" and not body_plain:
                    body_plain = text
                elif ctype == "text/html" and not body_html:
                    body_html = text
            except Exception as e:
                logger.warning(f"Error extracting message part payload: {e}")
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                try:
                    text = payload.decode(charset, errors="replace")
                except Exception:
                    text = payload.decode("latin-1", errors="replace")
                    
                if msg.get_content_type() == "text/html":
                    body_html = text
                else:
                    body_plain = text
        except Exception as e:
            logger.warning(f"Error extracting singlepart message payload: {e}")
            
    if body_plain:
        return body_plain.strip()
    
    if body_html:
        # Strip HTML tags
        clean = re.sub(r'<style[^>]*>.*?</style>', '', body_html, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<script[^>]*>.*?</script>', '', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = re.sub(r'\s+', ' ', clean)
        return clean.strip()
        
    return "(No email body text found)"

def normalize_subject_title(subject: str) -> str:
    """
    Strips Re:, Fwd:, ticket prefixes, and system-generated verification prefixes to isolate root thread subject.
    """
    if not subject:
        return "(No Subject)"
    clean = subject.strip()
    while True:
        prev = clean
        clean = re.sub(r"^(Re|Fwd|RE|FWD)\s*:\s*", "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r"^\[.*?\]\s*", "", clean).strip()
        clean = re.sub(r"^Action Required:\s*Confirm(?:\s+Your\s+Tata\s+1mg)?\s+Employee ID\s*[—–-]\s*", "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r"^Case Registered:\s*", "", clean, flags=re.IGNORECASE).strip()
        if clean == prev:
            break
    return clean


def _should_lock_to_department(department_id: Optional[int], mailbox_user: str) -> bool:
    """
    Only locks synced emails to a single department if that department has its own
    dedicated mailbox separate from the central peopledesk@1mg.com inbox.
    """
    if not department_id:
        return False
    from backend.app.database import execute_query
    dept = execute_query(
        "SELECT id, dept_code, dept_gmail, dept_app_password FROM hr_departments WHERE id = %s;",
        (department_id,),
        fetch_one=True,
    )
    if not dept:
        return False
    if (dept.get("dept_code") or "").upper() == "DEPT-PEOPLEDESK" or int(dept["id"]) == 11:
        return False
    dept_mail = (dept.get("dept_gmail") or "").strip().lower()
    sys_user = (os.getenv("IMAP_USER") or os.getenv("SMTP_USER") or "peopledesk@1mg.com").strip().lower()
    active_user = (mailbox_user or "").strip().lower()
    has_own_pw = bool(dept.get("dept_app_password")) and not is_placeholder_password(dept.get("dept_app_password"))
    return bool(has_own_pw and dept_mail and active_user == dept_mail and active_user != sys_user)


def sync_inbound_emails_from_mailbox(
    max_fetch: int = 25,
    department_id: Optional[int] = None,
    user_id: Optional[int] = None,
    custom_host: Optional[str] = None,
    custom_port: Optional[int] = None,
    custom_user: Optional[str] = None,
    custom_password: Optional[str] = None
) -> Dict[str, Any]:
    """
    Connects to the IMAP mailbox, retrieves recent UNSEEN messages (or fallback to recent INBOX messages),
    filters duplicates & noise, classifies via unified AI router, and auto-assigns 1MGXXXXX Case Numbers.
    """
    from backend.app.database import execute_query
    from backend.app.services.case_routing_service import (
        attach_reply_to_existing_case,
        build_email_ai_insights,
        create_case_from_email_record,
        detect_employee_code,
        extract_case_number_tag,
        is_automated_newsletter_or_noise,
    )

    if custom_user and custom_password:
        user = custom_user.strip()
        password = custom_password.strip()
        host = custom_host.strip() if custom_host else detect_imap_host(user)
        port = int(custom_port or 993)
    elif department_id or user_id:
        host, port, user, password = get_imap_config_for_dept(department_id=department_id, user_id=user_id)
    else:
        host, port, user, password = get_imap_config()

    if not user or not password:
        return {
            "success": False,
            "synced_count": 0,
            "cases_created": 0,
            "replies_linked": 0,
            "error": "Missing IMAP credentials. Please configure Mailbox App Password in People Desk.",
            "message": "Mailbox synchronization aborted: no credentials found."
        }

    acquired = _imap_sync_lock.acquire(timeout=10.0)
    if not acquired:
        return {
            "success": True,
            "synced_count": 0,
            "cases_created": 0,
            "replies_linked": 0,
            "message": "Mailbox synchronization is already running."
        }

    mail = None
    try:
        lock_to_dept = _should_lock_to_department(department_id, user)
        logger.info(f"Connecting to IMAP {host}:{port} as {user} (AI Dept Routing: {not lock_to_dept})...")
        new_synced = 0
        cases_created = 0
        replies_linked = 0
        synced_items = []

        self_addresses = {
            user.strip().lower(),
            "peopledesk@1mg.com",
            (os.getenv("SMTP_USER") or "").strip().lower(),
            (os.getenv("IMAP_USER") or "").strip().lower(),
        }
        raw_from_env = (os.getenv("MAIL_FROM") or os.getenv("SMTP_FROM") or "").strip()
        if raw_from_env:
            _, parsed_from_env = parseaddr(raw_from_env)
            if parsed_from_env:
                self_addresses.add(parsed_from_env.strip().lower())
        self_addresses.discard("")

        context = ssl.create_default_context()
        mail = imaplib.IMAP4_SSL(host, port, ssl_context=context)
        mail.sock.settimeout(12.0)

        status, login_res = mail.login(user, password)
        if status != "OK":
            return {
                "success": False,
                "synced_count": 0,
                "cases_created": 0,
                "replies_linked": 0,
                "error": f"IMAP authentication failed: {login_res}",
                "message": "Failed to login to mailbox with provided App Password."
            }

        sync_start_dt = get_imap_sync_start_datetime()
        skipped_before_start = 0

        mail.select("INBOX")

        # Search for UNSEEN first (scoped by SINCE when IMAP_SYNC_START_DATE is active)
        if sync_start_dt:
            since_str = format_imap_since_date(sync_start_dt)
            status, search_data = mail.search(None, f"UNSEEN SINCE {since_str}")
            if status != "OK":
                status, search_data = mail.search(None, f"SINCE {since_str}")
            msg_ids = search_data[0].split() if status == "OK" and search_data[0] else []

            # Fallback to messages since cutoff (never bare ALL) so already-read emails from today aren't missed
            if not msg_ids:
                status, all_data = mail.search(None, f"SINCE {since_str}")
                if status == "OK" and all_data[0]:
                    all_ids = all_data[0].split()
                    msg_ids = all_ids[-min(max_fetch, len(all_ids)):]
        else:
            status, search_data = mail.search(None, "UNSEEN")
            msg_ids = search_data[0].split() if status == "OK" and search_data[0] else []

            # Fallback to latest messages to ensure nothing was missed
            if not msg_ids:
                status, all_data = mail.search(None, "ALL")
                if status == "OK" and all_data[0]:
                    all_ids = all_data[0].split()
                    msg_ids = all_ids[-min(10, len(all_ids)):]

        target_ids = msg_ids[-max_fetch:]
        logger.info(
            f"Found {len(target_ids)} candidate messages in mailbox for {user} "
            f"(sync_start_date={sync_start_dt.isoformat() if sync_start_dt else 'NONE'})."
        )

        # Process chronologically (oldest first) so root inquiries always precede replies in the same batch
        for mid in target_ids:
            try:
                # Peek first so pre-cutoff emails stay unread in Gmail if skipped
                fetch_status, data = mail.fetch(mid, "(BODY.PEEK[])")
                raw_email = None
                if fetch_status == "OK" and data:
                    for part in data:
                        if isinstance(part, tuple) and len(part) > 1 and isinstance(part[1], (bytes, bytearray)):
                            raw_email = bytes(part[1])
                            break
                if raw_email is None:
                    fetch_status, data = mail.fetch(mid, "(RFC822)")
                    if fetch_status == "OK" and data and isinstance(data[0], (tuple, list)) and len(data[0]) > 1:
                        raw_email = data[0][1]
                if not raw_email:
                    continue

                msg = email.message_from_bytes(raw_email)

                raw_from = msg.get("From", "")
                raw_subject = msg.get("Subject", "")
                raw_date = msg.get("Date", "")
                message_id = (msg.get("Message-ID") or "").strip()
                in_reply_to = (msg.get("In-Reply-To") or "").strip()
                references = (msg.get("References") or "").strip()
                auto_submitted = (msg.get("Auto-Submitted") or "").strip()

                received_dt = None
                if raw_date:
                    try:
                        parsed_dt = parsedate_to_datetime(raw_date)
                        if parsed_dt is not None:
                            received_dt = parsed_dt if parsed_dt.tzinfo is not None else parsed_dt.replace(tzinfo=timezone.utc)
                    except Exception:
                        received_dt = None
                if received_dt is None:
                    try:
                        int_status, int_data = mail.fetch(mid, "(INTERNALDATE)")
                        if int_status == "OK" and int_data and int_data[0]:
                            raw_int = int_data[0] if isinstance(int_data[0], bytes) else int_data[0][0]
                            received_dt = _parse_imap_internaldate(
                                raw_int.decode("utf-8", errors="ignore") if isinstance(raw_int, (bytes, bytearray)) else str(raw_int)
                            )
                    except Exception:
                        pass
                if received_dt is None:
                    received_dt = datetime.now(timezone.utc)

                if sync_start_dt and received_dt.astimezone(timezone.utc) < sync_start_dt.astimezone(timezone.utc):
                    skipped_before_start += 1
                    continue

                # Mark accepted post-cutoff message as Seen to match prior RFC822 fetch behavior
                try:
                    mail.store(mid, "+FLAGS", "\\Seen")
                except Exception:
                    pass

                real_name, sender_email = parseaddr(raw_from)
                sender_name = decode_mime_string(real_name) or real_name or "Employee"
                subject = decode_mime_string(raw_subject) or "(No Subject)"
                body = extract_message_body(msg)

                received_str = received_dt.strftime("%Y-%m-%d %H:%M:%S%z")

                if not sender_email or "@" not in sender_email:
                    continue

                # Skip outbound echo emails sent by People Desk itself
                if sender_email.strip().lower() in self_addresses:
                    continue

                # Check duplicate by exact Message-ID first, then sender+subject+window
                existing = None
                if message_id:
                    existing = execute_query(
                        "SELECT id FROM emails WHERE provider_message_id = %s LIMIT 1;",
                        (message_id,),
                        fetch_one=True,
                    )
                if not existing:
                    existing = execute_query(
                        """
                        SELECT id FROM emails
                        WHERE LOWER(sender_email) = LOWER(%s)
                          AND LOWER(subject) = LOWER(%s)
                          AND (received_at >= %s::timestamptz - INTERVAL '2 days' OR created_at >= NOW() - INTERVAL '3 days')
                        LIMIT 1;
                        """,
                        (sender_email, subject, received_str),
                        fetch_one=True,
                    )
                if existing:
                    continue

                # Run unified Noise Check + AI Department/Intent Classification + HRMS Lookup
                is_noise_mail = is_automated_newsletter_or_noise(
                    sender_name, sender_email, subject, body, auto_submitted_header=auto_submitted
                )
                temp_row = {
                    "sender_name": sender_name,
                    "sender_email": sender_email,
                    "subject": subject,
                    "body": body,
                    "category": "SYSTEM_ALERT" if is_noise_mail else None,
                }
                ai_insights = build_email_ai_insights(temp_row)
                resolved_category = ai_insights.get("category") or "PEOPLEDESK"
                is_actionable = 0 if (is_noise_mail or ai_insights.get("is_noise") or resolved_category in ("SYSTEM_ALERT", "NEWSLETTER", "SPAM", "MARKETING")) else 1

                # Thread / Parent Lookup (In-Reply-To -> References -> Case # Tag -> Exact Normalized Subject)
                parent = None
                if in_reply_to:
                    parent = execute_query(
                        "SELECT id, thread_id, subject, actionable_reason, employee_id, case_id, case_number, is_converted, department_id FROM emails WHERE provider_message_id = %s LIMIT 1;",
                        (in_reply_to,),
                        fetch_one=True,
                    )
                if not parent and references:
                    ref_ids = [tok.strip() for tok in references.split() if tok.strip().startswith("<")]
                    for ref_id in reversed(ref_ids):
                        parent = execute_query(
                            "SELECT id, thread_id, subject, actionable_reason, employee_id, case_id, case_number, is_converted, department_id FROM emails WHERE provider_message_id = %s LIMIT 1;",
                            (ref_id,),
                            fetch_one=True,
                        )
                        if parent:
                            break

                tagged_case = None
                tag_case_num = extract_case_number_tag(subject, "")
                if not parent and tag_case_num:
                    parent = execute_query(
                        "SELECT id, thread_id, subject, actionable_reason, employee_id, case_id, case_number, is_converted, department_id FROM emails WHERE UPPER(case_number) = UPPER(%s) AND parent_id IS NULL ORDER BY id ASC LIMIT 1;",
                        (tag_case_num,),
                        fetch_one=True,
                    )
                    if not parent:
                        tagged_case = execute_query(
                            "SELECT id, case_number, department_id FROM cases WHERE UPPER(case_number) = UPPER(%s) LIMIT 1;",
                            (tag_case_num,),
                            fetch_one=True,
                        )

                norm_subj = normalize_subject_title(subject)
                if not parent and not tagged_case and norm_subj and norm_subj != "(No Subject)":
                    candidate_parents = execute_query(
                        """
                        SELECT id, thread_id, subject, actionable_reason, employee_id, case_id, case_number, is_converted, department_id
                        FROM emails
                        WHERE LOWER(sender_email) = LOWER(%s)
                          AND parent_id IS NULL
                        ORDER BY id DESC
                        LIMIT 15;
                        """,
                        (sender_email,),
                        fetch_all=True,
                    ) or []
                    norm_lower = norm_subj.lower()
                    for cp in candidate_parents:
                        cp_norm = normalize_subject_title(cp.get("subject") or "").lower()
                        if cp_norm and (cp_norm == norm_lower or norm_lower in cp_norm or cp_norm in norm_lower):
                            parent = cp
                            break
                    # Only match recent AWAITING_EMP_ID without subject match if it is clearly an ID verification reply
                    if not parent and detect_employee_code(f"{subject} {body}"):
                        subj_l = subject.strip().lower()
                        is_explicit_id_reply = (
                            subj_l.startswith(("re:", "fwd:"))
                            or any(tok in subj_l for tok in ("emp id", "employee id", "verification", "confirm"))
                            or (len((body or "").strip()) < 160 and ai_insights.get("routing_source") != "STAGE1_KEYWORDS")
                        )
                        if is_explicit_id_reply:
                            parent = next((cp for cp in candidate_parents if cp.get("actionable_reason") == "AWAITING_EMP_ID"), None)

                parent_id = None
                thread_id = None
                if parent:
                    parent_id = parent.get("id")
                    thread_id = parent.get("thread_id") or f"TH-{parent_id}"
                    if not parent.get("thread_id"):
                        execute_query(
                            "UPDATE emails SET thread_id = %s, updated_at = NOW() WHERE id = %s;",
                            (thread_id, parent_id),
                            commit=True,
                        )

                # Resolve Department:
                # 1) Inherit thread department on replies
                # 2) Respect dedicated non-PeopleDesk department mailbox ONLY if lock_to_dept
                # 3) Otherwise use AI-detected department!
                if parent and parent.get("department_id"):
                    dept_id = parent.get("department_id")
                elif tagged_case and tagged_case.get("department_id"):
                    dept_id = tagged_case.get("department_id")
                elif lock_to_dept and department_id:
                    dept_id = department_id
                else:
                    dept_id = ai_insights.get("department_id") or 11

                # Employee Match
                matched_emp = ai_insights.get("matched_employee") or {}
                emp_db_id = matched_emp.get("id") if isinstance(matched_emp, dict) else None
                if parent and not emp_db_id and parent.get("employee_id"):
                    emp_db_id = parent.get("employee_id")

                # Insert into emails table
                insert_query = """
                    INSERT INTO emails (
                        provider, provider_message_id, thread_id, parent_id,
                        account_email, sender_name, sender_email, subject, body,
                        received_at, category, category_confidence, intent, intent_score,
                        requires_review, category_reason, department_id, employee_id,
                        is_actionable, is_converted, classification_status, processing_status,
                        created_at, updated_at
                    ) VALUES (
                        'IMAP', %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s::timestamptz, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, 0, 'CLASSIFIED', 'COMPLETED',
                        NOW(), NOW()
                    )
                    RETURNING id, sender_name, sender_email, subject, body, parent_id, category, department_id, employee_id, is_actionable, is_converted, actionable_reason;
                """
                inserted = execute_query(
                    insert_query,
                    (
                        message_id or None,
                        thread_id or None,
                        parent_id or None,
                        user,
                        sender_name,
                        sender_email,
                        subject,
                        body,
                        received_str,
                        resolved_category,
                        ai_insights.get("confidence_ratio"),
                        ai_insights.get("intent_code"),
                        ai_insights.get("confidence"),
                        ai_insights.get("requires_review", 0),
                        ai_insights.get("routing_source", "STAGE1_KEYWORDS"),
                        dept_id,
                        emp_db_id,
                        is_actionable,
                    ),
                    fetch_one=True,
                    commit=True,
                )

                if inserted:
                    new_synced += 1
                    email_id = inserted["id"]
                    case_num_assigned = None

                    if is_actionable == 1:
                        if parent:
                            reply_res = attach_reply_to_existing_case(
                                reply_email_id=email_id,
                                reply_row=inserted,
                                parent_row=parent,
                                ai_insights=ai_insights,
                            )
                            if reply_res.get("linked"):
                                replies_linked += 1
                            case_num_assigned = reply_res.get("case_number")
                        elif tagged_case:
                            reply_res = attach_reply_to_existing_case(
                                reply_email_id=email_id,
                                reply_row=inserted,
                                parent_row={
                                    "id": None,
                                    "case_id": tagged_case["id"],
                                    "case_number": tagged_case["case_number"],
                                    "department_id": tagged_case.get("department_id"),
                                },
                                ai_insights=ai_insights,
                            )
                            if reply_res.get("linked"):
                                replies_linked += 1
                            case_num_assigned = reply_res.get("case_number")
                        else:
                            case_res = create_case_from_email_record(
                                email_id=email_id,
                                email_row=inserted,
                                ai_insights=ai_insights,
                                override_dept_id=dept_id,
                                send_confirmation=True,
                                action_name="AUTO_CASE_CREATED",
                            )
                            if case_res.get("created"):
                                cases_created += 1
                            case_num_assigned = case_res.get("case_number")

                    synced_items.append({
                        "id": email_id,
                        "subject": subject,
                        "sender": sender_email,
                        "category": resolved_category,
                        "department_id": dept_id,
                        "department_name": ai_insights.get("team_name"),
                        "case_number": case_num_assigned,
                        "is_actionable": is_actionable,
                    })

            except Exception as msg_err:
                logger.error(f"Error parsing message ID {mid}: {msg_err}")
                continue

        mail.close()
        mail.logout()

        if department_id:
            execute_query(
                "UPDATE hr_departments SET mail_sync_status = 'CONNECTED', mail_last_synced_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (department_id,),
                commit=True,
            )
        if user_id:
            execute_query(
                "UPDATE users SET mail_configured = TRUE, mail_last_synced_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (user_id,),
                commit=True,
            )

        summary_parts = [f"Synchronized {new_synced} new {'email' if new_synced == 1 else 'emails'} from {user}"]
        if cases_created:
            summary_parts.append(f"{cases_created} {'case' if cases_created == 1 else 'cases'} auto-created")
        if replies_linked:
            summary_parts.append(f"{replies_linked} {'reply' if replies_linked == 1 else 'replies'} linked")

        return {
            "success": True,
            "synced_count": new_synced,
            "cases_created": cases_created,
            "replies_linked": replies_linked,
            "skipped_before_start": skipped_before_start,
            "sync_start_date": sync_start_dt.isoformat() if sync_start_dt else None,
            "items": synced_items,
            "message": " · ".join(summary_parts) + ".",
        }

    except Exception as e:
        logger.error(f"IMAP Sync failed: {e}")
        return {
            "success": False,
            "synced_count": 0,
            "cases_created": 0,
            "replies_linked": 0,
            "error": str(e),
            "message": f"Mailbox sync error: {e}",
        }
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass
        _imap_sync_lock.release()

