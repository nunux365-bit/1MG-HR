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
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger("backend.imap_service")

PLACEHOLDER_PASSWORDS = {"", "your_16_digit_app_password", "your_16_digit_google_app_password"}

def is_placeholder_password(password: Optional[str]) -> bool:
    return (password or "").strip().lower() in PLACEHOLDER_PASSWORDS

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
    Fetches stored IMAP credentials for a department or user from DB,
    falling back to system environment variables.
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
            
    if user_id:
        u = execute_query(
            "SELECT email, mail_app_password, department_id FROM users WHERE id = %s;",
            (user_id,),
            fetch_one=True
        )
        if u and u.get("mail_app_password"):
            user = (u.get("email") or "").strip()
            password = (u.get("mail_app_password") or "").strip()
            host = detect_imap_host(user)
            return host, 993, user, password
            
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
    Strips Re:, Fwd:, and system-generated dispatch prefixes to isolate root thread subject.
    """
    if not subject:
        return "(No Subject)"
    clean = subject.strip()
    while True:
        prev = clean
        clean = re.sub(r"^(Re|Fwd|RE|FWD)\s*:\s*", "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r"^Action Required:\s*Confirm Your Tata 1mg Employee ID\s*[—–-]\s*", "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r"^\[.*?\]\s*", "", clean).strip()
        if clean == prev:
            break
    return clean

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
    filters duplicates against the database, runs AI classification, and ingests them into the `emails` table.
    Supports department-scoped mailbox credentials or custom credentials.
    """
    from backend.app.database import execute_query
    from backend.app.routes.cases import extract_ai_email_entities
    
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
            "error": "Missing IMAP credentials. Please configure Department App Password in People Desk.",
            "message": "Mailbox synchronization aborted: no credentials found."
        }
        
    logger.info(f"Connecting to IMAP {host}:{port} as {user}...")
    mail = None
    new_synced = 0
    synced_items = []
    
    try:
        context = ssl.create_default_context()
        # 12-second timeout to avoid worker thread locks
        mail = imaplib.IMAP4_SSL(host, port, ssl_context=context)
        mail.sock.settimeout(12.0)
        
        status, login_res = mail.login(user, password)
        if status != "OK":
            return {
                "success": False,
                "synced_count": 0,
                "error": f"IMAP authentication failed: {login_res}",
                "message": "Failed to login to mailbox with provided App Password."
            }
            
        mail.select("INBOX")
        
        # Search for UNSEEN first
        status, search_data = mail.search(None, "UNSEEN")
        msg_ids = search_data[0].split() if status == "OK" and search_data[0] else []
        
        # If no unread messages, fetch the most recent messages (up to 5) to ensure nothing was missed
        if not msg_ids:
            status, all_data = mail.search(None, "ALL")
            if status == "OK" and all_data[0]:
                all_ids = all_data[0].split()
                # Take the latest 5
                msg_ids = all_ids[-min(5, len(all_ids)):]
                
        # Limit to max_fetch latest messages
        target_ids = msg_ids[-max_fetch:]
        logger.info(f"Found {len(target_ids)} candidate messages in mailbox for {user}.")
        
        for mid in reversed(target_ids):
            try:
                fetch_status, data = mail.fetch(mid, "(RFC822)")
                if fetch_status != "OK" or not data or not data[0]:
                    continue
                    
                raw_email = data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                # Extract headers
                raw_from = msg.get("From", "")
                raw_subject = msg.get("Subject", "")
                raw_date = msg.get("Date", "")
                message_id = msg.get("Message-ID", "")
                in_reply_to = msg.get("In-Reply-To", "")
                references = msg.get("References", "")
                
                real_name, sender_email = parseaddr(raw_from)
                sender_name = decode_mime_string(real_name) or real_name or "Employee"
                subject = decode_mime_string(raw_subject) or "(No Subject)"
                body = extract_message_body(msg)
                
                # Parse received_at datetime
                received_dt = datetime.now(timezone.utc)
                if raw_date:
                    try:
                        received_dt = parsedate_to_datetime(raw_date)
                    except Exception:
                        pass
                received_str = received_dt.strftime("%Y-%m-%d %H:%M:%S%z")
                
                if not sender_email or "@" not in sender_email:
                    continue
                    
                # Skip outbound emails sent by the desk itself to prevent echo loops
                if sender_email.strip().lower() == user.strip().lower():
                    continue
                    
                # Check for existing email in database by subject, sender, and approximate time
                existing = execute_query(
                    """
                    SELECT id FROM emails 
                    WHERE LOWER(sender_email) = LOWER(%s) 
                      AND LOWER(subject) = LOWER(%s)
                      AND (received_at >= %s::timestamptz - INTERVAL '2 days' OR created_at >= NOW() - INTERVAL '3 days')
                    LIMIT 1;
                    """,
                    (sender_email, subject, received_str),
                    fetch_all=False
                )
                if existing:
                    # Already ingested previously
                    continue
                    
                # Run AI extraction & intent routing
                temp_row = {
                    "sender_name": sender_name,
                    "sender_email": sender_email,
                    "subject": subject,
                    "body": body,
                    "category": None
                }
                ai_insights = extract_ai_email_entities(temp_row)
                resolved_category = ai_insights.get("category") or "INQUIRY"

                # Check for thread / parent correspondence
                norm_subj = normalize_subject_title(subject)
                parent = None
                if in_reply_to:
                    parent = execute_query(
                        "SELECT id, thread_id, subject, actionable_reason, employee_id, case_id, case_number, is_converted, department_id FROM emails WHERE provider_message_id = %s LIMIT 1;",
                        (in_reply_to.strip(),),
                        fetch_all=False
                    )

                if not parent and norm_subj:
                    parent = execute_query(
                        """
                        SELECT id, thread_id, subject, actionable_reason, employee_id, case_id, case_number, is_converted, department_id
                        FROM emails
                        WHERE LOWER(sender_email) = LOWER(%s)
                          AND parent_id IS NULL
                          AND (
                            LOWER(subject) LIKE LOWER(%s)
                            OR LOWER(%s) LIKE CONCAT('%%', LOWER(subject), '%%')
                            OR actionable_reason = 'AWAITING_EMP_ID'
                          )
                        ORDER BY id DESC
                        LIMIT 1;
                        """,
                        (sender_email, f"%{norm_subj}%", norm_subj),
                        fetch_all=False
                    )

                parent_id = None
                thread_id = None

                if parent:
                    parent_id = parent.get("id")
                    thread_id = parent.get("thread_id") or f"TH-{parent_id}"
                    if not parent.get("thread_id"):
                        execute_query("UPDATE emails SET thread_id = %s WHERE id = %s;", (thread_id, parent_id))
                    
                    # Auto-update parent with detected employee ID if received in reply
                    detected_code = ai_insights.get("detected_code")
                    if detected_code:
                        emp_match = execute_query(
                            "SELECT id FROM employees WHERE UPPER(employee_id) = UPPER(%s) LIMIT 1;",
                            (detected_code.strip(),),
                            fetch_all=False
                        )
                        matched_id = emp_match.get("id") if emp_match else None
                        execute_query(
                            """
                            UPDATE emails 
                            SET actionable_reason = 'VERIFIED_BY_REPLY',
                                employee_id = COALESCE(%s, employee_id),
                                updated_at = NOW()
                            WHERE id = %s;
                            """,
                            (matched_id, parent_id)
                        )
                        if parent.get("case_id") and matched_id:
                            execute_query("UPDATE cases SET employee_id = %s, updated_at = NOW() WHERE id = %s;", (matched_id, parent.get("case_id")))
                
                # Retain mailbox department scope if provided, otherwise resolve via category
                if department_id:
                    dept_id = department_id
                elif parent and parent.get("department_id"):
                    dept_id = parent.get("department_id")
                else:
                    dept_match = execute_query(
                        "SELECT id FROM hr_departments WHERE category_code = %s OR dept_code = %s LIMIT 1;",
                        (resolved_category, f"DEPT-{resolved_category}"),
                        fetch_all=False
                    )
                    if dept_match and resolved_category in ("PAYROLL", "ATTENDANCE", "BENEFITS", "LEAVE", "ONBOARDING"):
                        dept_id = dept_match.get("id")
                    else:
                        dept_id = 11
                    
                # Actionable check
                is_actionable = 0 if (resolved_category in ("SYSTEM_ALERT", "NEWSLETTER", "SPAM", "MARKETING") or ai_insights.get("is_actionable") == 0) else 1
                
                # Employee match
                matched_emp = ai_insights.get("employee_profile") or {}
                emp_db_id = matched_emp.get("id")
                if parent and not emp_db_id and parent.get("employee_id"):
                    emp_db_id = parent.get("employee_id")
                
                # Insert into emails table
                insert_query = """
                    INSERT INTO emails (
                        provider, provider_message_id, thread_id, parent_id,
                        account_email, sender_name, sender_email, subject, body,
                        received_at, category, department_id, employee_id, is_actionable, is_converted,
                        classification_status, processing_status, created_at, updated_at
                    ) VALUES (
                        'IMAP', %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s::timestamptz, %s, %s, %s, %s, 0,
                        'CLASSIFIED', 'COMPLETED', NOW(), NOW()
                    )
                    RETURNING id, sender_name, sender_email, subject, category, department_id;
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
                        dept_id,
                        emp_db_id,
                        is_actionable
                    ),
                    fetch_all=False
                )
                
                if inserted:
                    new_synced += 1
                    synced_items.append({
                        "id": inserted.get("id"),
                        "subject": subject,
                        "sender": sender_email,
                        "category": resolved_category
                    })

                    # Automated Emp ID Request for external senders lacking Employee ID (only if initial email, not reply)
                    if is_actionable == 1 and not parent_id:
                        is_internal = sender_email.strip().lower().endswith("@1mg.com")
                        detected_code = ai_insights.get("detected_code")
                        is_noise = ai_insights.get("is_noise") or resolved_category in ("SYSTEM_ALERT", "NEWSLETTER", "SPAM")

                        if not is_internal and not detected_code and not is_noise:
                            try:
                                from backend.app.services.email_service import send_employee_id_request_email
                                dept_row = execute_query("SELECT team_name FROM hr_departments WHERE id = %s;", (dept_id,), fetch_one=True) or {}
                                dept_name = dept_row.get("team_name") or "People Desk"
                                
                                send_employee_id_request_email(
                                    recipient_email=sender_email,
                                    original_subject=subject,
                                    recipient_name=ai_insights.get("detected_name") or sender_name or "Colleague",
                                    department_name=dept_name
                                )
                                execute_query(
                                    "UPDATE emails SET actionable_reason = 'AWAITING_EMP_ID' WHERE id = %s;",
                                    (inserted.get("id"),)
                                )
                                logger.info(f"Dispatched automated Emp ID verification request to {sender_email}")
                            except Exception as emp_id_err:
                                logger.warning(f"Failed to send automated Emp ID request for email {inserted.get('id')}: {emp_id_err}")
                    
            except Exception as msg_err:
                logger.error(f"Error parsing message ID {mid}: {msg_err}")
                continue
                
        mail.close()
        mail.logout()
        
        # Update last sync timestamp on department and/or user
        if department_id:
            execute_query(
                "UPDATE hr_departments SET mail_sync_status = 'CONNECTED', mail_last_synced_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (department_id,),
                commit=True
            )
        if user_id:
            execute_query(
                "UPDATE users SET mail_configured = TRUE, mail_last_synced_at = NOW(), updated_at = NOW() WHERE id = %s;",
                (user_id,),
                commit=True
            )
        
        return {
            "success": True,
            "synced_count": new_synced,
            "items": synced_items,
            "message": f"Synchronized {new_synced} new incoming {'email' if new_synced == 1 else 'emails'} from {user}."
        }
        
    except Exception as e:
        logger.error(f"IMAP Sync failed: {e}")
        return {
            "success": False,
            "synced_count": 0,
            "error": str(e),
            "message": f"Mailbox sync error: {e}"
        }
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

