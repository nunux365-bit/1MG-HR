import hashlib
import secrets
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from backend.app.database import execute_query
from backend.app.config import ADMIN_EMAIL, ADMIN_APP_PASSWORD

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash or ":" not in stored_hash:
        return False
    salt, hashed = stored_hash.split(":", 1)
    test_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return secrets.compare_digest(hashed, test_hash)

# Request Models
class CheckEmailRequest(BaseModel):
    email: EmailStr

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str
    confirm_password: str

def _get_user_department_info(user_id: int, default_dept_id: Optional[int], default_dept_name: Optional[str], is_admin: bool):
    dept_rows = execute_query(
        """
        SELECT ud.department_id, d.team_name, d.dept_code, d.sla_hours, d.color_accent
        FROM user_departments ud
        JOIN hr_departments d ON ud.department_id = d.id
        WHERE ud.user_id = %s
        ORDER BY d.team_name ASC;
        """,
        (user_id,),
        fetch_all=True
    ) or []
    
    if not dept_rows and default_dept_id:
        dept_rows = [{
            "department_id": default_dept_id,
            "team_name": default_dept_name or "General HR",
            "dept_code": "",
            "sla_hours": 24,
            "color_accent": "#007791"
        }]
        
    dept_ids = [r["department_id"] for r in dept_rows]
    dept_names = ", ".join([r["team_name"] for r in dept_rows]) if dept_rows else (default_dept_name or ("All Departments" if is_admin else "General HR"))
    
    return {
        "departments": dept_rows,
        "department_ids": dept_ids,
        "department_name": "All Departments" if is_admin else dept_names,
        "department_names": "All Departments" if is_admin else dept_names
    }

@router.post("/check-email")
def check_email(payload: CheckEmailRequest):
    """
    Step 1 of Login Flow:
    Detects if the user exists, their role (ADMIN or HR_AGENT),
    and whether an agent has set a password or needs initial setup.
    """
    email_clean = payload.email.strip().lower()
    
    # Query database for user
    user = execute_query(
        """
        SELECT u.id, u.email, u.name, u.role, u.password_hash, u.is_dept_head, 
               u.department_id, u.designation, u.status, d.team_name as department_name
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE LOWER(u.email) = %s AND u.status = 'ACTIVE';
        """,
        (email_clean,),
        fetch_one=True
    )
    
    # If not in DB, but matches configured ADMIN_EMAIL, auto-register or return as ADMIN
    if not user and email_clean == ADMIN_EMAIL.lower():
        user = execute_query(
            """
            INSERT INTO users (email, name, role, is_dept_head, designation, status)
            VALUES (%s, 'Administrator', 'ADMIN', TRUE, 'System Administrator', 'ACTIVE')
            ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
            RETURNING id, email, name, role, password_hash, is_dept_head, designation, status;
            """,
            (email_clean,),
            fetch_one=True,
            commit=True
        )
    
    if not user:
        return {
            "success": False,
            "exists": False,
            "message": "Email not recognized in People Desk. Please contact your administrator."
        }
    
    is_admin = (user["role"] == "ADMIN")
    has_password = bool(user["password_hash"])
    dept_info = _get_user_department_info(user["id"], user.get("department_id"), user.get("department_name"), is_admin)
    
    return {
        "success": True,
        "exists": True,
        "role": user["role"],
        "name": user["name"],
        "email": user["email"],
        "has_password": has_password,
        "is_dept_head": bool(user["is_dept_head"]),
        "department_id": user.get("department_id"),
        "department_ids": dept_info["department_ids"],
        "departments": dept_info["departments"],
        "department_name": dept_info["department_name"],
        "designation": user["designation"] or ("Administrator" if is_admin else "HR Agent"),
        "step": "ADMIN_PASSWORD" if is_admin else ("ENTER_PASSWORD" if has_password else "SET_NEW_PASSWORD")
    }

@router.post("/login")
def login(payload: LoginRequest):
    """
    Step 2 of Login Flow:
    Validates Admin App Password or Agent Password.
    """
    email_clean = payload.email.strip().lower()
    password = payload.password.strip()
    
    user = execute_query(
        """
        SELECT u.id, u.email, u.name, u.role, u.password_hash, u.is_dept_head,
               u.department_id, u.designation, u.status, d.team_name as department_name
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE LOWER(u.email) = %s AND u.status = 'ACTIVE';
        """,
        (email_clean,),
        fetch_one=True
    )
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials or account is inactive.")
    
    is_admin = (user["role"] == "ADMIN")
    
    # Admin Login verification
    if is_admin:
        # If admin already has a password_hash in DB, verify against it
        if user["password_hash"]:
            if not verify_password(password, user["password_hash"]):
                # Also allow ADMIN_APP_PASSWORD from .env as fallback if configured
                if ADMIN_APP_PASSWORD and password == ADMIN_APP_PASSWORD:
                    pass
                else:
                    raise HTTPException(status_code=401, detail="Invalid Admin App Password.")
        else:
            # First time admin sets their app password
            new_hash = hash_password(password)
            execute_query(
                "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s;",
                (new_hash, user["id"]),
                commit=True
            )
    else:
        # Agent Login verification
        if not user["password_hash"]:
            raise HTTPException(
                status_code=400, 
                detail="Account password not set yet. Please complete the password creation step."
            )
        
        if not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")
    
    # Generate simple session token
    session_token = secrets.token_urlsafe(32)
    dept_info = _get_user_department_info(user["id"], user.get("department_id"), user.get("department_name"), is_admin)
    
    return {
        "success": True,
        "token": session_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "is_dept_head": bool(user["is_dept_head"]),
            "department_id": user["department_id"],
            "department_ids": dept_info["department_ids"],
            "departments": dept_info["departments"],
            "department_name": dept_info["department_name"],
            "designation": user["designation"]
        },
        "redirect_url": "/admin.html" if is_admin else "/agent.html"
    }

@router.post("/set-password")
def set_password(payload: SetPasswordRequest):
    """
    Onboarding step for newly added Agents to create their password.
    """
    email_clean = payload.email.strip().lower()
    new_pw = payload.new_password.strip()
    confirm_pw = payload.confirm_password.strip()
    
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    
    if new_pw != confirm_pw:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    
    user = execute_query(
        """
        SELECT u.id, u.email, u.name, u.role, u.is_dept_head, u.department_id, 
               u.designation, d.team_name as department_name 
        FROM users u 
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE LOWER(email) = %s AND status = 'ACTIVE';
        """,
        (email_clean,),
        fetch_one=True
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")
    
    # Hash and save password
    hashed = hash_password(new_pw)
    execute_query(
        "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s;",
        (hashed, user["id"]),
        commit=True
    )
    
    session_token = secrets.token_urlsafe(32)
    is_admin = (user["role"] == "ADMIN")
    dept_info = _get_user_department_info(user["id"], user.get("department_id"), user.get("department_name"), is_admin)
    
    return {
        "success": True,
        "message": "Password successfully created!",
        "token": session_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "is_dept_head": bool(user["is_dept_head"]),
            "department_id": user["department_id"],
            "department_ids": dept_info["department_ids"],
            "departments": dept_info["departments"],
            "department_name": dept_info["department_name"],
            "designation": user["designation"]
        },
        "redirect_url": "/admin.html" if user["role"] == "ADMIN" else "/agent.html"
    }

