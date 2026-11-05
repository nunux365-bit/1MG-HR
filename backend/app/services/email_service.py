"""
Tata 1mg Email Dispatcher & Template Service
Generates official Tata 1mg branded HTML & Plain-Text emails with full RFC-2822 compliance,
anti-spam headers (Date, Message-ID, MIME-Version), and role-tailored content for:
- Administrators (Executive Admin Access)
- Department Heads (Department Leadership & Escalations)
- Support Agents (Inbound Case & Attendance Workbench)

Supports resilient SMTP delivery with TLS (Port 587) and automatic SSL (Port 465) fallback.
"""
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate, make_msgid
from backend.app.config import ADMIN_EMAIL

def get_smtp_config():
    """Dynamically resolves latest SMTP credentials from environment or defaults."""
    host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    try:
        port = int(os.getenv("SMTP_PORT", 587))
    except (ValueError, TypeError):
        port = 587
    user = os.getenv("SMTP_USER", "").strip()
    password = (os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD") or "").strip()
    from_header = os.getenv("SMTP_FROM", f"Tata 1mg People Desk <{user}>" if user else "Tata 1mg People Desk").strip()
    return host, port, user, password, from_header

def generate_welcome_email_content(
    agent_name: str,
    agent_email: str,
    department_name: str,
    designation: str,
    is_dept_head: bool,
    role: str,
    base_url: str,
    sender_admin_email: str
) -> tuple[str, str, str]:
    """
    Renders tailored Subject, HTML content, and Plain-Text fallback for:
    - ADMIN: Full Administrator permissions across all departments
    - DEPT_HEAD: Leadership access over specific department queue & escalations
    - HR_AGENT: Support agent access for cases and attendance inquiries
    """
    role_upper = (role or "HR_AGENT").strip().upper()
    is_admin = (role_upper == "ADMIN")
    is_head = is_dept_head or is_admin

    if is_admin:
        role_title = "Executive Administrator"
        role_badge_text = "👑 Full Administrator · All Departments"
        role_color = "#2563EB"
        role_bg = "rgba(37, 99, 235, 0.12)"
        subject = f"👑 Executive Administrator Access Granted · Tata 1mg People Desk ({agent_name})"
        scope_description = (
            "You have been granted <strong>Full Administrator Privileges</strong> on Tata 1mg People Desk. "
            "You have universal authority across all HR departments, agent assignments, SLA governance, and system security logs."
        )
        responsibilities = [
            "Universal management over all HR Departments & routing emails",
            "Staff directory administration (Add, Promote, Deactivate Agents & Admins)",
            "System SLA threshold controls and performance audit reporting",
            "Full oversight of employee case streams and centralized mailbox queues"
        ]
        portal_path = "/admin"
        btn_label = "Access Admin Console & Set Password &rarr;"
    elif is_head:
        role_title = f"Department Head · {department_name}"
        role_badge_text = f"⭐ Head of Department · {department_name}"
        role_color = "#10847E"
        role_bg = "rgba(16, 132, 126, 0.12)"
        subject = f"⭐ Department Head Access Granted · {department_name} · Tata 1mg People Desk ({agent_name})"
        scope_description = (
            f"You have been designated as <strong>Head of Department for {department_name}</strong> on Tata 1mg People Desk. "
            f"You are the escalation lead responsible for case allocations, SLA compliance, and team ticket closures."
        )
        responsibilities = [
            f"Department lead over all inbound queries routed to {department_name}",
            "Authority to re-assign cases to specialized department agents",
            "Automated breach escalation alerts when tickets exceed target SLA",
            "Supervision of the Agent Workbench and employee satisfaction scores"
        ]
        portal_path = "/agent"
        btn_label = "Activate Workbench & Set Password &rarr;"
    else:
        role_title = f"Support Agent · {department_name}"
        role_badge_text = f"🛡️ HR Support Specialist · {department_name}"
        role_color = "#FF6F61"
        role_bg = "rgba(255, 111, 97, 0.12)"
        subject = f"🛡️ Welcome to Tata 1mg People Desk · Account Activation for {agent_name}"
        scope_description = (
            f"Welcome to <strong>Tata 1mg People Desk</strong>. You have been added as an authorized team member "
            f"for the <strong>{department_name}</strong> department to handle employee inquiries, attendance issues, and workplace requests."
        )
        responsibilities = [
            f"Resolve incoming employee tickets for {department_name}",
            "Use AI-powered copilot to draft instant, accurate policy responses",
            "Collaborate with department leadership on complex case escalations",
            "Maintain SLA compliance with our 100% resolution commitment"
        ]
        portal_path = "/agent"
        btn_label = "Activate Account & Set Password &rarr;"

    clean_base = base_url.rstrip("/")
    activation_link = f"{clean_base}/?email={agent_email}"

    resp_html = "".join([f"<li style='margin-bottom: 6px;'>{r}</li>" for r in responsibilities])

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{subject}</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #F4F6F8;
      color: #212529;
      -webkit-font-smoothing: antialiased;
    }}
    .email-container {{
      max-width: 600px;
      margin: 30px auto;
      background: #FFFFFF;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      border: 1px solid #E2E8F0;
    }}
    .email-header {{
      background: #090D16;
      padding: 24px 32px;
      text-align: center;
      border-bottom: 3px solid {role_color};
    }}
    .email-header img {{
      height: 32px;
      filter: brightness(0) invert(1);
    }}
    .header-tag {{
      display: inline-block;
      margin-top: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: {role_color};
      background: {role_bg};
      padding: 3px 10px;
      border-radius: 12px;
      text-transform: uppercase;
    }}
    .email-body {{
      padding: 36px 32px;
      line-height: 1.6;
    }}
    .greeting {{
      font-size: 21px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 12px;
    }}
    .intro-text {{
      font-size: 14.5px;
      color: #475569;
      margin-bottom: 24px;
      line-height: 1.6;
    }}
    .details-card {{
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }}
    .detail-row {{
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #EDF2F7;
      font-size: 13.5px;
    }}
    .detail-row:last-child {{
      border-bottom: none;
    }}
    .detail-label {{
      color: #64748B;
      font-weight: 500;
    }}
    .detail-val {{
      color: #0F172A;
      font-weight: 600;
    }}
    .responsibilities-box {{
      background: #F8FAFC;
      border-left: 4px solid {role_color};
      padding: 14px 18px;
      border-radius: 4px;
      margin-bottom: 26px;
      font-size: 13.5px;
      color: #334155;
    }}
    .responsibilities-box ul {{
      margin: 8px 0 0 16px;
      padding: 0;
    }}
    .action-container {{
      text-align: center;
      margin: 32px 0 20px;
    }}
    .btn-activate {{
      display: inline-block;
      background: {role_color};
      color: #FFFFFF !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 34px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }}
    .security-note {{
      background: #EFF6FF;
      border-left: 4px solid #3B82F6;
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 12.5px;
      color: #1E40AF;
      margin-top: 24px;
    }}
    .email-footer {{
      background: #F8FAFC;
      padding: 20px 32px;
      border-top: 1px solid #E2E8F0;
      font-size: 11.5px;
      color: #94A3B8;
      text-align: center;
      line-height: 1.5;
    }}
  </style>
</head>
<body>

  <div class="email-container">
    
    <!-- HEADER WITH TATA 1MG LOGO -->
    <div class="email-header">
      <img src="{clean_base}/assets/logo.svg" alt="Tata 1mg">
      <br>
      <span class="header-tag">{role_badge_text}</span>
    </div>

    <!-- BODY CONTENT -->
    <div class="email-body">
      <div class="greeting">Namaste {agent_name}! 👋</div>
      
      <p class="intro-text">
        {scope_description}
      </p>

      <!-- DETAILS SUMMARY CARD -->
      <div class="details-card">
        <div class="detail-row">
          <span class="detail-label">Assigned Role</span>
          <span class="detail-val" style="color: {role_color};">
            {role_title}
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Department</span>
          <span class="detail-val">{department_name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Designation</span>
          <span class="detail-val">{designation or 'Specialist'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Registered Corporate Email</span>
          <span class="detail-val">{agent_email}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Authorized By</span>
          <span class="detail-val">{sender_admin_email}</span>
        </div>
      </div>

      <!-- KEY RESPONSIBILITIES -->
      <div class="responsibilities-box">
        <strong>Key Access & Responsibilities:</strong>
        <ul>
          {resp_html}
        </ul>
      </div>

      <!-- ONE CLICK ACTIVATION BUTTON -->
      <div class="action-container">
        <a href="{activation_link}" class="btn-activate" target="_blank" style="color: #ffffff;">
          {btn_label}
        </a>
      </div>

      <div class="security-note">
        <strong>First-Time Setup:</strong> Clicking the link above will open the secure Tata 1mg People Desk portal to set your private account password and activate your access.
      </div>
    </div>

    <!-- FOOTER -->
    <div class="email-footer">
      This is an automated administrative invitation from <strong>Tata 1mg People Desk</strong>.<br>
      Authorized by Administrator ({sender_admin_email}).<br>
      &copy; Tata 1mg Technologies Private Limited · Gurgaon, Haryana, India.
    </div>

  </div>

</body>
</html>"""

    plain_responsibilities = "\n".join([f"  - {r}" for r in responsibilities])
    plain_text = f"""Namaste {agent_name},

Welcome to Tata 1mg People Desk.

{scope_description.replace('<strong>', '').replace('</strong>', '')}

Account Details:
- Assigned Role: {role_title}
- Department: {department_name}
- Designation: {designation or 'Specialist'}
- Registered Email: {agent_email}
- Authorized By: {sender_admin_email}

Key Responsibilities:
{plain_responsibilities}

To activate your account and set your password, visit the link below:
{activation_link}

Best regards,
Tata 1mg People Desk Administration
Gurgaon, Haryana, India
"""

    return subject, html_content, plain_text

def send_welcome_email(
    agent_name: str,
    agent_email: str,
    department_name: str,
    designation: str,
    is_dept_head: bool,
    base_url: str,
    sender_admin_email: str = None,
    role: str = "HR_AGENT"
) -> dict:
    """
    Dispatches official Tata 1mg onboarding / promotion email using authenticated SMTP.
    Uses RFC 2822 standard headers (Date, Message-ID, MIME-Version, multipart/alternative with plain-text)
    to guarantee delivery into primary inboxes without spam penalties.
    Attempts Port 587 (TLS) with automatic fallback to Port 465 (SSL).
    """
    admin_sender = sender_admin_email or ADMIN_EMAIL
    host, port, user, password, from_header = get_smtp_config()

    subject, html, plain_text = generate_welcome_email_content(
        agent_name=agent_name,
        agent_email=agent_email,
        department_name=department_name,
        designation=designation,
        is_dept_head=is_dept_head,
        role=role,
        base_url=base_url,
        sender_admin_email=admin_sender
    )

    clean_base = base_url.rstrip("/")
    activation_link = f"{clean_base}/?email={agent_email}"

    # Build RFC 2822 Compliant Message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_header
    msg["To"] = agent_email
    msg["Reply-To"] = admin_sender
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="1mg.com")
    msg["MIME-Version"] = "1.0"
    msg["X-Mailer"] = "Tata 1mg People Desk Engine"

    # Attach Plain-Text FIRST, then HTML (MIME standard for alternative multipart)
    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    dispatch_error = None
    sent_method = None

    if host and password and user:
        # ATTEMPT 1: Primary Port (Port 587 STARTTLS or Port 465 SSL depending on port config)
        try:
            if port == 465:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(host, port, context=ctx, timeout=12) as server:
                    server.login(user, password)
                    server.sendmail(user, [agent_email], msg.as_string())
                sent_method = "LIVE_SMTP_SSL_465"
            else:
                with smtplib.SMTP(host, port, timeout=12) as server:
                    server.starttls()
                    server.login(user, password)
                    server.sendmail(user, [agent_email], msg.as_string())
                sent_method = "LIVE_SMTP_TLS_587"

            print(f"[EmailService Success] Live email dispatched via {sent_method} to {agent_email}")
            return {
                "sent": True,
                "method": sent_method,
                "subject": subject,
                "recipient": agent_email,
                "sender": admin_sender,
                "activation_link": activation_link,
                "html": html,
                "error": None
            }
        except Exception as e1:
            dispatch_error = f"Primary SMTP ({host}:{port}) failed: {e1}"
            print(f"[EmailService Warning] {dispatch_error}. Trying alternate protocol...")

            # ATTEMPT 2: Automatic Fallback to Port 465 SSL (or 587 TLS)
            fallback_port = 465 if port != 465 else 587
            try:
                if fallback_port == 465:
                    ctx = ssl.create_default_context()
                    with smtplib.SMTP_SSL(host, 465, context=ctx, timeout=12) as server:
                        server.login(user, password)
                        server.sendmail(user, [agent_email], msg.as_string())
                    sent_method = "LIVE_SMTP_SSL_465_FALLBACK"
                else:
                    with smtplib.SMTP(host, 587, timeout=12) as server:
                        server.starttls()
                        server.login(user, password)
                        server.sendmail(user, [agent_email], msg.as_string())
                    sent_method = "LIVE_SMTP_TLS_587_FALLBACK"

                print(f"[EmailService Success] Fallback succeeded! Live email dispatched via {sent_method} to {agent_email}")
                return {
                    "sent": True,
                    "method": sent_method,
                    "subject": subject,
                    "recipient": agent_email,
                    "sender": admin_sender,
                    "activation_link": activation_link,
                    "html": html,
                    "error": None
                }
            except Exception as e2:
                dispatch_error = f"Both primary ({port}) and fallback ({fallback_port}) failed: {e1} | {e2}"
                print(f"[EmailService Error] {dispatch_error}")
    else:
        dispatch_error = "SMTP credentials not configured."

    # Return structured failure with full preview
    return {
        "sent": False,
        "method": "PREVIEW_ONLY",
        "error": dispatch_error,
        "subject": subject,
        "recipient": agent_email,
        "sender": admin_sender,
        "activation_link": activation_link,
        "html": html
    }

def send_raw_smtp_email(
    recipient_email: str,
    subject: str,
    html_content: str,
    plain_text: str,
    custom_user: str = None,
    custom_password: str = None,
    custom_host: str = None,
    custom_port: int = None,
    from_name: str = "Tata 1mg People Desk"
) -> dict:
    """
    General-purpose resilient SMTP dispatcher. Uses provided custom credentials (e.g. Dept Head Gmail),
    falling back to system SMTP configuration.
    """
    sys_host, sys_port, sys_user, sys_password, _ = get_smtp_config()
    host = (custom_host or sys_host).strip()
    port = int(custom_port or sys_port or 587)
    user = (custom_user or sys_user).strip()
    password = (custom_password or sys_password).strip()

    from_header = f"{from_name} <{user}>"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_header
    msg["To"] = recipient_email
    msg["Reply-To"] = user
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="1mg.com")
    msg["MIME-Version"] = "1.0"
    msg["X-Mailer"] = "Tata 1mg People Desk Dispatcher"

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    if not host or not user or not password:
        return {"sent": False, "method": "SKIPPED", "error": "SMTP credentials not provided."}

    # Attempt 1: Port 587 STARTTLS (or 465 SSL)
    try:
        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=12) as server:
                server.login(user, password)
                server.sendmail(user, [recipient_email], msg.as_string())
            method = "SMTP_SSL_465"
        else:
            with smtplib.SMTP(host, port, timeout=12) as server:
                server.starttls()
                server.login(user, password)
                server.sendmail(user, [recipient_email], msg.as_string())
            method = "SMTP_TLS_587"
        print(f"[EmailService Success] Dispatched '{subject}' to {recipient_email} via {method}")
        return {"sent": True, "method": method, "recipient": recipient_email}
    except Exception as e1:
        # Fallback port
        fallback_port = 465 if port != 465 else 587
        try:
            if fallback_port == 465:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(host, 465, context=ctx, timeout=12) as server:
                    server.login(user, password)
                    server.sendmail(user, [recipient_email], msg.as_string())
                method = "SMTP_SSL_465_FALLBACK"
            else:
                with smtplib.SMTP(host, 587, timeout=12) as server:
                    server.starttls()
                    server.login(user, password)
                    server.sendmail(user, [recipient_email], msg.as_string())
                method = "SMTP_TLS_587_FALLBACK"
            print(f"[EmailService Success] Fallback dispatched '{subject}' to {recipient_email} via {method}")
            return {"sent": True, "method": method, "recipient": recipient_email}
        except Exception as e2:
            err = f"SMTP dispatch failed: {e1} | {e2}"
            print(f"[EmailService Error] {err}")
            return {"sent": False, "method": "FAILED", "error": err}

def send_employee_id_request_email(
    recipient_email: str,
    original_subject: str,
    recipient_name: str = "Colleague",
    department_name: str = "People Desk",
    custom_user: str = None,
    custom_password: str = None
) -> dict:
    """
    Sends an automated verification email to external senders asking them to reply with their Employee ID.
    """
    subject = f"Action Required: Confirm Your Tata 1mg Employee ID — Re: {original_subject[:45]}"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
    <div style="background: linear-gradient(135deg, #FF6F61 0%, #E55342 100%); padding: 22px 28px; color: #FFFFFF;">
      <h2 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.2px;">Tata 1mg People Desk</h2>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Inbound Verification & Identity Confirmation</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">Hello <strong>{recipient_name}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 18px;">
        We received your email inquiry regarding: <br>
        <span style="display: inline-block; background: #F1F5F9; padding: 6px 12px; border-radius: 6px; font-weight: 600; color: #0F172A; margin-top: 6px;">{original_subject}</span>
      </p>
      <div style="background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 14px 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; font-size: 13.5px; color: #92400E; font-weight: 600;">⚠️ Identity Verification Required</p>
        <p style="margin: 6px 0 0; font-size: 13px; color: #78350F; line-height: 1.5;">
          Because your inquiry was sent from an external address (<code>{recipient_email}</code>), our system requires your official Tata 1mg Employee ID to match your HRMS profile and process your request under our verified SLA.
        </p>
      </div>
      <p style="font-size: 14px; font-weight: 600; color: #0F172A; margin: 20px 0 8px;">How to proceed:</p>
      <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; padding: 14px 18px; border-radius: 8px;">
        <p style="margin: 0; font-size: 13.5px; color: #1E293B;">
          👉 Simply <strong>reply directly to this email</strong> and include your <strong>Official Employee ID</strong> (e.g., <code>EMP1024</code> or <code>1MG123</code>).
        </p>
      </div>
      <p style="font-size: 13px; color: #64748B; line-height: 1.5; margin: 22px 0 0;">
        Once received, our <strong>{department_name}</strong> specialist will immediately link your inquiry to your active employee record and begin work on your ticket.
      </p>
    </div>
    <div style="background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px 28px; text-align: center; font-size: 11.5px; color: #94A3B8;">
      Tata 1mg People Desk · Operations & Central HR Services
    </div>
  </div>
</body>
</html>"""

    plain = f"""Hello {recipient_name},

We received your inquiry regarding: "{original_subject}".

Because your inquiry was received from an external address ({recipient_email}), we need to verify your official Tata 1mg employee profile.

HOW TO PROCEED:
Please reply directly to this email with your Official Tata 1mg Employee ID (e.g. EMP1024 or 1MG123).

Once received, our {department_name} desk will link your records and process your request under our priority turnaround SLA.

Warm regards,
Tata 1mg People Desk"""

    return send_raw_smtp_email(
        recipient_email=recipient_email,
        subject=subject,
        html_content=html,
        plain_text=plain,
        custom_user=custom_user,
        custom_password=custom_password
    )

def send_case_confirmation_email(
    recipient_email: str,
    employee_name: str,
    case_number: str,
    case_subject: str,
    department_name: str = "People Desk",
    target_sla: str = "24h SLA",
    priority: str = "NORMAL",
    assigned_specialist: str = "Assigned HR Specialist",
    custom_user: str = None,
    custom_password: str = None
) -> dict:
    """
    Sends an official Tata 1mg Case Confirmation & Tracking ticket email to the employee.
    """
    subject = f"[{case_number}] Case Registered: {case_subject[:50]}"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
    <div style="background: linear-gradient(135deg, #10B190 0%, #059669 100%); padding: 22px 28px; color: #FFFFFF;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85;">Official Support Ticket</div>
      <h2 style="margin: 4px 0 0; font-size: 20px; font-weight: 700;">Tata 1mg Case Registered</h2>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px;">Hello <strong>{employee_name}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px;">
        Your inquiry has been officially converted into a tracked support ticket in Tata 1mg People Desk.
      </p>

      <!-- Case Summary Card -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px 20px; margin-bottom: 22px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
          <tr>
            <td style="padding: 6px 0; color: #64748B; width: 140px;">Case Number:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0F172A; font-family: monospace; font-size: 14.5px;">{case_number}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Subject:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #1E293B;">{case_subject}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Assigned Team:</td>
            <td style="padding: 6px 0; color: #1E293B; font-weight: 600;">{department_name}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Specialist:</td>
            <td style="padding: 6px 0; color: #1E293B;">{assigned_specialist}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Target SLA:</td>
            <td style="padding: 6px 0; color: #15803D; font-weight: 700;">Within {target_sla}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Status:</td>
            <td style="padding: 6px 0;"><span style="background: #DCFCE7; color: #166534; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 12px;">ACTIVE / IN-PROGRESS</span></td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13.5px; line-height: 1.6; color: #334155; margin: 0 0 16px;">
        Our team is actively reviewing your request. If any additional documents or clarifications are required, your assigned specialist will reach out directly on this thread.
      </p>
      <p style="font-size: 13px; color: #64748B; margin: 18px 0 0;">
        You can reply to this email at any time to add comments or attach supporting documents to this ticket.
      </p>
    </div>
    <div style="background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px 28px; text-align: center; font-size: 11.5px; color: #94A3B8;">
      Tata 1mg People Desk · SLA Guaranteed Corporate Support
    </div>
  </div>
</body>
</html>"""

    plain = f"""Hello {employee_name},

Your inquiry has been registered as an official case in Tata 1mg People Desk.

CASE DETAILS:
• Case Number: {case_number}
• Subject: {case_subject}
• Department: {department_name}
• Assigned Specialist: {assigned_specialist}
• Target SLA: Within {target_sla}
• Status: ACTIVE / IN-PROGRESS

Our department team is currently reviewing your ticket. You may reply directly to this email to add more information or attachments.

Best regards,
Tata 1mg People Desk"""

    return send_raw_smtp_email(
        recipient_email=recipient_email,
        subject=subject,
        html_content=html,
        plain_text=plain,
        custom_user=custom_user,
        custom_password=custom_password
    )
