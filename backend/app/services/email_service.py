"""
Tata 1mg Email Dispatcher & Template Service
Generates official Tata 1mg branded HTML emails with dynamic links based on the active host/domain.
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from backend.app.config import ADMIN_EMAIL

# Load SMTP Credentials
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "vaibhav.v1@1mg.com")
SMTP_PASSWORD = os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD", "dtefkmddefzhxtfr")
SMTP_FROM = os.getenv("SMTP_FROM", f"Tata 1mg People Desk <{SMTP_USER}>")

def generate_welcome_email_html(
    agent_name: str,
    agent_email: str,
    department_name: str,
    designation: str,
    is_dept_head: bool,
    base_url: str,
    sender_admin_email: str
) -> str:
    """
    Renders official Tata 1mg branded onboarding HTML email.
    The activation link dynamically adapts to whatever domain/host the app is deployed on.
    """
    activation_link = f"{base_url.rstrip('/')}/?email={agent_email}"
    dept_role_title = f"Department Head · {department_name}" if is_dept_head else f"Support Agent · {department_name}"

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to Tata 1mg People Desk</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #F4F6F8;
      color: #212529;
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
      border-bottom: 3px solid #FF6F61;
    }}
    .email-header img {{
      height: 32px;
      filter: brightness(0) invert(1);
    }}
    .header-tag {{
      display: inline-block;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #FF6F61;
      background: rgba(255, 111, 97, 0.15);
      padding: 2px 8px;
      border-radius: 12px;
      text-transform: uppercase;
    }}
    .email-body {{
      padding: 36px 32px;
      line-height: 1.6;
    }}
    .greeting {{
      font-size: 20px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 12px;
    }}
    .intro-text {{
      font-size: 14.5px;
      color: #475569;
      margin-bottom: 24px;
    }}
    .details-card {{
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 28px;
    }}
    .detail-row {{
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
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
    .action-container {{
      text-align: center;
      margin: 32px 0 20px;
    }}
    .btn-activate {{
      display: inline-block;
      background: #FF6F61;
      color: #FFFFFF !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(255, 111, 97, 0.35);
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
      <img src="{base_url.rstrip('/')}/assets/logo.svg" alt="Tata 1mg">
      <br>
      <span class="header-tag">People Desk · Agent Access</span>
    </div>

    <!-- BODY CONTENT -->
    <div class="email-body">
      <div class="greeting">Namaste {agent_name}! 👋</div>
      
      <p class="intro-text">
        Welcome to <strong>Tata 1mg People Desk</strong>. You have been added as an authorized team member to handle employee queries, attendances, and workplace requests.
      </p>

      <!-- DETAILS SUMMARY CARD -->
      <div class="details-card">
        <div class="detail-row">
          <span class="detail-label">Designated Role</span>
          <span class="detail-val" style="color: {'#10847E' if is_dept_head else '#0F172A'};">
            {dept_role_title}
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Department</span>
          <span class="detail-val">{department_name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Designation</span>
          <span class="detail-val">{designation or 'Support Specialist'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Registered Email</span>
          <span class="detail-val">{agent_email}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Authorized By</span>
          <span class="detail-val">{sender_admin_email}</span>
        </div>
      </div>

      <!-- ONE CLICK ACTIVATION BUTTON -->
      <div class="action-container">
        <a href="{activation_link}" class="btn-activate" target="_blank" style="color: #ffffff;">
          Activate Account & Set Password &rarr;
        </a>
      </div>

      <div class="security-note">
        <strong>Security Tip:</strong> Clicking the activation button will open the People Desk portal where you can set your private password to activate your Agent Workbench.
      </div>
    </div>

    <!-- FOOTER -->
    <div class="email-footer">
      This is an automated communication from <strong>Tata 1mg People Desk</strong>.<br>
      Sent on behalf of System Administrator ({sender_admin_email}).<br>
      &copy; Tata 1mg Technologies Private Limited · Gurgaon, Haryana, India.
    </div>

  </div>

</body>
</html>"""
    return html_content

def send_welcome_email(
    agent_name: str,
    agent_email: str,
    department_name: str,
    designation: str,
    is_dept_head: bool,
    base_url: str,
    sender_admin_email: str = None
) -> dict:
    """
    Dispatches real email using authenticated SMTP server.
    """
    admin_sender = sender_admin_email or ADMIN_EMAIL
    html = generate_welcome_email_html(
        agent_name=agent_name,
        agent_email=agent_email,
        department_name=department_name,
        designation=designation,
        is_dept_head=is_dept_head,
        base_url=base_url,
        sender_admin_email=admin_sender
    )
    
    subject = f"Welcome to Tata 1mg People Desk · Account Activation for {agent_name}"
    
    # Check if SMTP credentials exist
    if SMTP_HOST and SMTP_PASSWORD and SMTP_USER:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            # Use authenticated sender in envelope, set Reply-To to Admin
            msg["From"] = f"Tata 1mg People Desk <{SMTP_USER}>"
            msg["To"] = agent_email
            msg["Reply-To"] = admin_sender
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_USER, [agent_email], msg.as_string())
            
            print(f"[EmailService Success] Live email dispatched via SMTP to {agent_email}")
            return {
                "sent": True,
                "method": "LIVE_SMTP",
                "subject": subject,
                "recipient": agent_email,
                "sender": admin_sender,
                "activation_link": f"{base_url.rstrip('/')}/?email={agent_email}",
                "html": html
            }
        except Exception as e:
            print(f"[EmailService Error] Live SMTP dispatch failed: {e}. Falling back to preview.")
    
    # Fallback preview mode
    return {
        "sent": False,
        "method": "PREVIEW_ONLY",
        "error": "SMTP server not configured or rejected authentication.",
        "subject": subject,
        "recipient": agent_email,
        "sender": admin_sender,
        "activation_link": f"{base_url.rstrip('/')}/?email={agent_email}",
        "html": html
    }
