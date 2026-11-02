from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, EmailStr
from backend.app.database import execute_query
from backend.app.services.email_service import send_welcome_email
from backend.app.config import ADMIN_EMAIL

router = APIRouter(prefix="/api/v1/admin", tags=["Admin User Management"])

# Pydantic Request Models
class CreateUserRequest(BaseModel):
    name: str
    email: EmailStr
    department_id: int
    designation: Optional[str] = "Support Specialist"
    is_dept_head: Optional[bool] = False
    send_welcome_email: Optional[bool] = True

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    department_id: Optional[int] = None
    designation: Optional[str] = None
    is_dept_head: Optional[bool] = None
    status: Optional[str] = None

@router.get("/departments")
def list_departments(search: Optional[str] = None):
    """
    Returns list of departments dynamically from Neon DB.
    Handles scale for 100s to 1000s of departments.
    """
    query = """
        SELECT d.id, d.dept_code, d.team_name, d.category_code, d.dept_gmail, d.sla_hours, d.default_priority,
               d.color_accent, d.ai_model_status, d.model_accuracy,
               COUNT(u.id) as agent_count
        FROM hr_departments d
        LEFT JOIN users u ON u.department_id = d.id AND u.status = 'ACTIVE'
    """
    params = []
    if search:
        query += " WHERE LOWER(d.team_name) LIKE %s OR LOWER(d.dept_code) LIKE %s"
        pattern = f"%{search.strip().lower()}%"
        params.extend([pattern, pattern])
        
    query += " GROUP BY d.id ORDER BY d.team_name ASC;"
    
    depts = execute_query(query, tuple(params) if params else None, fetch_all=True)
    return {"success": True, "departments": depts or []}

class DepartmentCreateRequest(BaseModel):
    team_name: str
    dept_code: str
    dept_gmail: EmailStr
    sla_hours: Optional[int] = 24
    default_priority: Optional[str] = "MEDIUM"
    description: Optional[str] = None

@router.post("/departments")
def create_department(req: DepartmentCreateRequest):
    """Dynamically creates a new department with routing email and SLA."""
    code = req.dept_code.strip().upper()
    if not code.startswith("DEPT-"):
        code = f"DEPT-{code}"
        
    existing = execute_query("SELECT id FROM hr_departments WHERE dept_code = %s;", (code,), fetch_all=False)
    if existing:
        raise HTTPException(status_code=400, detail=f"Department with code '{code}' already exists.")
        
    insert_sql = """
        INSERT INTO hr_departments (dept_code, team_name, dept_gmail, sla_hours, default_priority, description)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, dept_code, team_name, dept_gmail, sla_hours, default_priority;
    """
    new_dept = execute_query(
        insert_sql,
        (code, req.team_name.strip(), str(req.dept_gmail).strip().lower(), req.sla_hours or 24, req.default_priority or "MEDIUM", req.description),
        fetch_all=False
    )
    return {"success": True, "message": f"Department '{req.team_name}' created successfully", "department": new_dept}

@router.delete("/departments/{dept_id}")
def delete_department(dept_id: int):
    """Deletes a department if no active cases or users are assigned."""
    users_count = execute_query("SELECT COUNT(*) FROM users WHERE department_id = %s;", (dept_id,), fetch_all=False).get("count", 0)
    if users_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department: {users_count} user(s) are currently assigned to it.")
        
    cases_count = execute_query("SELECT COUNT(*) FROM cases WHERE department_id = %s;", (dept_id,), fetch_all=False).get("count", 0)
    if cases_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department: {cases_count} case(s) are associated with it.")
        
    execute_query("DELETE FROM hr_departments WHERE id = %s;", (dept_id,))
    return {"success": True, "message": "Department removed successfully"}

@router.get("/users")
def get_users(
    search: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    role: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100)
):
    """
    Dynamic User & Agent Directory.
    Supports real-time search, department filtering, role filtering, and pagination.
    """
    offset = (page - 1) * limit
    
    # Base query for users
    where_clauses = ["1=1"]
    params = []
    
    if search:
        s = f"%{search.strip().lower()}%"
        where_clauses.append("(LOWER(u.name) LIKE %s OR LOWER(u.email) LIKE %s OR LOWER(u.designation) LIKE %s)")
        params.extend([s, s, s])
        
    if department_id:
        where_clauses.append("u.department_id = %s")
        params.append(department_id)
        
    if role and role != "ALL":
        if role == "DEPT_HEAD":
            where_clauses.append("u.is_dept_head = TRUE")
        else:
            where_clauses.append("u.role = %s")
            params.append(role)
            
    if status and status != "ALL":
        if status == "PENDING_SETUP":
            where_clauses.append("u.password_hash IS NULL AND u.status = 'ACTIVE'")
        else:
            where_clauses.append("u.status = %s")
            params.append(status)
            
    where_sql = " AND ".join(where_clauses)
    
    # Count total
    count_query = f"SELECT COUNT(*) as total FROM users u WHERE {where_sql};"
    total_res = execute_query(count_query, tuple(params), fetch_one=True)
    try:
        total_count = int(total_res["total"]) if total_res and total_res.get("total") is not None else 0
    except (ValueError, TypeError):
        total_count = 0
    
    # Fetch paginated rows with department join
    users_query = f"""
        SELECT u.id, u.name, u.email, u.role, u.is_dept_head, u.department_id,
               u.designation, u.status, u.created_at,
               (u.password_hash IS NOT NULL) as has_password,
               d.team_name as department_name, d.dept_code, d.dept_gmail
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE {where_sql}
        ORDER BY u.is_dept_head DESC, u.created_at DESC
        LIMIT %s OFFSET %s;
    """
    params.extend([limit, offset])
    users = execute_query(users_query, tuple(params), fetch_all=True)
    
    # Quick statistics across all users
    stats_query = """
        SELECT 
            COUNT(*) as total_users,
            COUNT(*) FILTER (WHERE role = 'HR_AGENT') as total_agents,
            COUNT(*) FILTER (WHERE is_dept_head = TRUE) as total_dept_heads,
            COUNT(*) FILTER (WHERE password_hash IS NULL AND role = 'HR_AGENT' AND status = 'ACTIVE') as pending_setup
        FROM users;
    """
    stats_raw = execute_query(stats_query, fetch_one=True) or {}
    stats = {}
    for k in ["total_users", "total_agents", "total_dept_heads", "pending_setup"]:
        try:
            stats[k] = int(stats_raw.get(k, 0)) if stats_raw.get(k) is not None else 0
        except (ValueError, TypeError):
            stats[k] = 0
    
    return {
        "success": True,
        "users": users or [],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "totalPages": (total_count + limit - 1) // limit if total_count > 0 else 1
        },
        "stats": stats
    }

@router.post("/users")
def create_agent(payload: CreateUserRequest, request: Request):
    """
    Add New Agent / Support Staff member:
    - Inserts into Neon database with password_hash = NULL (forces first-time password setup)
    - Dynamically generates the activation link using the current active website host
    - Generates & dispatches the official Tata 1mg Welcome Email
    - Records in audit trail
    """
    email_clean = payload.email.strip().lower()
    
    # 1. Check if user already exists
    existing = execute_query(
        "SELECT id FROM users WHERE LOWER(email) = %s;",
        (email_clean,),
        fetch_one=True
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"An account with email '{email_clean}' is already registered."
        )
        
    # 2. Verify Department exists
    dept = execute_query(
        "SELECT id, team_name, dept_code FROM hr_departments WHERE id = %s;",
        (payload.department_id,),
        fetch_one=True
    )
    if not dept:
        raise HTTPException(status_code=404, detail="Selected department not found.")
        
    # 3. Insert new agent
    new_user = execute_query(
        """
        INSERT INTO users (name, email, role, is_dept_head, department_id, designation, status, created_at, updated_at)
        VALUES (%s, %s, 'HR_AGENT', %s, %s, %s, 'ACTIVE', NOW(), NOW())
        RETURNING id, name, email, role, is_dept_head, department_id, designation, status, created_at;
        """,
        (
            payload.name.strip(),
            email_clean,
            payload.is_dept_head or False,
            payload.department_id,
            payload.designation.strip() or "Support Specialist"
        ),
        fetch_one=True,
        commit=True
    )
    
    # 4. Resolve Dynamic Base URL from current request (adapts to localhost, cloud domain, etc.)
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    if origin:
        base_url = origin
    elif referer:
        base_url = "/".join(referer.split("/")[:3])
    else:
        base_url = str(request.base_url).rstrip("/")
        
    # 5. Send Tata 1mg Welcome Email with dynamic activation link
    email_result = None
    if payload.send_welcome_email:
        email_result = send_welcome_email(
            agent_name=payload.name.strip(),
            agent_email=email_clean,
            department_name=dept["team_name"],
            designation=payload.designation.strip(),
            is_dept_head=payload.is_dept_head or False,
            base_url=base_url,
            sender_admin_email=ADMIN_EMAIL
        )
        
    # 6. Record Audit Log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'AGENT_CREATED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"agent_name": "{payload.name.strip()}", "agent_email": "{email_clean}", "department": "{dept["team_name"]}", "is_dept_head": {str(bool(payload.is_dept_head)).lower()}}}'
        ),
        commit=True
    )
    
    return {
        "success": True,
        "message": f"Agent {payload.name.strip()} created successfully and welcome invite sent!",
        "user": new_user,
        "email_details": email_result
    }

@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UpdateUserRequest):
    """
    Update Agent details (Department, Designation, Dept Head flag, Status)
    """
    user = execute_query("SELECT id, name, email, is_dept_head FROM users WHERE id = %s;", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    updates = []
    params = []
    
    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name.strip())
    if payload.department_id is not None:
        updates.append("department_id = %s")
        params.append(payload.department_id)
    if payload.designation is not None:
        updates.append("designation = %s")
        params.append(payload.designation.strip())
    if payload.is_dept_head is not None:
        updates.append("is_dept_head = %s")
        params.append(payload.is_dept_head)
    if payload.status is not None:
        updates.append("status = %s")
        params.append(payload.status)
        
    if not updates:
        return {"success": True, "message": "No changes specified."}
        
    updates.append("updated_at = NOW()")
    params.append(user_id)
    
    sql = f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, name, email, role, is_dept_head, department_id, designation, status;"
    updated = execute_query(sql, tuple(params), fetch_one=True, commit=True)
    
    # Audit log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'USER_UPDATED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"target_user_id": {user_id}, "email": "{user["email"]}", "is_dept_head": {str(bool(updated["is_dept_head"])).lower()}}}'
        ),
        commit=True
    )
    
    return {"success": True, "message": "User updated successfully.", "user": updated}

@router.post("/users/{user_id}/toggle-role-scope")
def toggle_role_scope(user_id: int):
    """
    1-Click Role Scope Toggle:
    Switches between:
    - '⭐ DEPT HEAD' (is_dept_head = TRUE)
    - 'AGENT' (is_dept_head = FALSE)
    """
    user = execute_query("SELECT id, name, email, is_dept_head, role FROM users WHERE id = %s;", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    new_scope = not bool(user["is_dept_head"])
    
    execute_query(
        "UPDATE users SET is_dept_head = %s, updated_at = NOW() WHERE id = %s;",
        (new_scope, user_id),
        commit=True
    )
    
    scope_title = "Department Head" if new_scope else "Support Agent"
    
    # Record in Audit Log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'ROLE_SCOPE_CHANGED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"target_user_id": {user_id}, "email": "{user["email"]}", "new_role_scope": "{scope_title}"}}'
        ),
        commit=True
    )
    
    return {
        "success": True,
        "message": f"Role scope for {user['name']} updated to {scope_title}.",
        "is_dept_head": new_scope
    }

@router.delete("/users/{user_id}")
def remove_user(user_id: int):
    """
    Removes a user / staff member from the system.
    Protects primary Admin accounts from accidental deletion.
    """
    user = execute_query("SELECT id, name, email, role FROM users WHERE id = %s;", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    if user["role"] == "ADMIN" or user["email"].lower() == ADMIN_EMAIL.lower():
        raise HTTPException(status_code=400, detail="Cannot remove primary System Administrator account.")
        
    # Remove user
    execute_query("DELETE FROM users WHERE id = %s;", (user_id,), commit=True)
    
    # Audit log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'USER_REMOVED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"removed_user_id": {user_id}, "name": "{user["name"]}", "email": "{user["email"]}"}}'
        ),
        commit=True
    )
    
    return {
        "success": True,
        "message": f"Staff member '{user['name']}' has been removed successfully."
    }

@router.post("/users/{user_id}/resend-invite")
def resend_invite(user_id: int, request: Request):
    """
    Resends official Tata 1mg Welcome Email with fresh dynamic activation link.
    """
    user = execute_query(
        """
        SELECT u.id, u.name, u.email, u.is_dept_head, u.designation, d.team_name as department_name
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE u.id = %s;
        """,
        (user_id,),
        fetch_one=True
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    # Resolve dynamic host
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    base_url = origin or ("/".join(referer.split("/")[:3]) if referer else str(request.base_url).rstrip("/"))
    
    email_res = send_welcome_email(
        agent_name=user["name"],
        agent_email=user["email"],
        department_name=user.get("department_name") or "People Desk",
        designation=user["designation"],
        is_dept_head=bool(user["is_dept_head"]),
        base_url=base_url,
        sender_admin_email=ADMIN_EMAIL
    )
    
    return {
        "success": True,
        "message": f"Welcome invite re-sent to {user['email']}",
        "email_details": email_res
    }
