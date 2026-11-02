from typing import Optional, List
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
    department_id: Optional[int] = None
    department_ids: Optional[List[int]] = None
    designation: Optional[str] = "Support Specialist"
    is_dept_head: Optional[bool] = False
    send_welcome_email: Optional[bool] = True
    role: Optional[str] = "HR_AGENT"

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    department_id: Optional[int] = None
    department_ids: Optional[List[int]] = None
    designation: Optional[str] = None
    is_dept_head: Optional[bool] = None
    status: Optional[str] = None
    role: Optional[str] = None

@router.get("/departments")
def list_departments(search: Optional[str] = None):
    """
    Returns list of departments dynamically from Neon DB.
    Handles scale for 100s to 1000s of departments.
    """
    query = """
        SELECT d.id, d.dept_code, d.team_name, d.category_code, d.dept_gmail, d.sla_hours, d.default_priority,
               d.color_accent, d.ai_model_status, d.model_accuracy,
               COUNT(DISTINCT u.id) as agent_count
        FROM hr_departments d
        LEFT JOIN user_departments ud ON ud.department_id = d.id
        LEFT JOIN users u ON (u.id = ud.user_id OR u.department_id = d.id) AND u.status = 'ACTIVE'
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
    assigned_count = execute_query(
        """
        SELECT COUNT(DISTINCT user_id) as count 
        FROM (
            SELECT id as user_id FROM users WHERE department_id = %s
            UNION
            SELECT user_id FROM user_departments WHERE department_id = %s
        ) t;
        """,
        (dept_id, dept_id),
        fetch_one=True
    ).get("count", 0)
    if assigned_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department: {assigned_count} user(s) are currently assigned to it.")
        
    cases_count = execute_query("SELECT COUNT(*) FROM cases WHERE department_id = %s;", (dept_id,), fetch_all=False).get("count", 0)
    if cases_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department: {cases_count} case(s) are associated with it.")
        
    execute_query("DELETE FROM user_departments WHERE department_id = %s;", (dept_id,), commit=True)
    execute_query("DELETE FROM hr_departments WHERE id = %s;", (dept_id,), commit=True)
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
    Supports real-time search, multi-department filtering, role filtering, and pagination.
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
        where_clauses.append("(u.department_id = %s OR EXISTS (SELECT 1 FROM user_departments ud WHERE ud.user_id = u.id AND ud.department_id = %s))")
        params.extend([department_id, department_id])
        
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
    
    # Fetch paginated rows with primary department join
    users_query = f"""
        SELECT u.id, u.name, u.email, u.role, u.is_dept_head, u.department_id,
               u.designation, u.status, u.created_at,
               (u.password_hash IS NOT NULL) as has_password,
               d.team_name as primary_department_name, d.dept_code as primary_dept_code, d.dept_gmail as primary_dept_gmail
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE {where_sql}
        ORDER BY u.is_dept_head DESC, u.created_at DESC
        LIMIT %s OFFSET %s;
    """
    params.extend([limit, offset])
    users = execute_query(users_query, tuple(params), fetch_all=True) or []
    
    # Enrich with multi-department assignments from user_departments
    if users:
        user_ids = [u["id"] for u in users]
        placeholders = ", ".join(["%s"] * len(user_ids))
        dept_rows = execute_query(
            f"""
            SELECT ud.user_id, d.id as department_id, d.team_name, d.dept_code, d.dept_gmail
            FROM user_departments ud
            JOIN hr_departments d ON ud.department_id = d.id
            WHERE ud.user_id IN ({placeholders})
            ORDER BY d.team_name ASC;
            """,
            tuple(user_ids),
            fetch_all=True
        ) or []
        
        user_dept_map = {}
        for r in dept_rows:
            uid = r["user_id"]
            if uid not in user_dept_map:
                user_dept_map[uid] = []
            user_dept_map[uid].append({
                "id": r["department_id"],
                "team_name": r["team_name"],
                "dept_code": r["dept_code"],
                "dept_gmail": r["dept_gmail"]
            })
            
        for u in users:
            uid = u["id"]
            assigned = user_dept_map.get(uid, [])
            if not assigned and u.get("department_id") and u.get("primary_department_name"):
                assigned = [{
                    "id": u["department_id"],
                    "team_name": u["primary_department_name"],
                    "dept_code": u.get("primary_dept_code"),
                    "dept_gmail": u.get("primary_dept_gmail")
                }]
            u["departments"] = assigned
            u["department_ids"] = [d["id"] for d in assigned]
            if u["role"] == "ADMIN":
                u["department_name"] = "All Departments"
                u["department_names"] = "All Departments"
            elif assigned:
                u["department_names"] = ", ".join([d["team_name"] for d in assigned])
                u["department_name"] = u["department_names"]
            else:
                u["department_names"] = "Unassigned"
                u["department_name"] = "Unassigned"
    
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
        "users": users,
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
    Add New Agent / Support Staff member or Administrator:
    - Inserts into Neon database with password_hash = NULL (forces first-time password setup)
    - Dynamically generates the activation link using the current active website host
    - Generates & dispatches the official Tata 1mg Welcome Email
    - Records in audit trail
    """
    email_clean = payload.email.strip().lower()
    role_clean = (payload.role or "HR_AGENT").strip().upper()
    if role_clean not in ["ADMIN", "HR_AGENT"]:
        role_clean = "HR_AGENT"
    
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
        
    dept_name = "All Departments"
    dept_ids = payload.department_ids or ([payload.department_id] if payload.department_id else [])
    dept_ids = [int(did) for did in dict.fromkeys(dept_ids) if did]

    valid_depts = []
    # 2. Verify Departments if specified or required for HR_AGENT
    if dept_ids:
        placeholders = ", ".join(["%s"] * len(dept_ids))
        valid_depts = execute_query(
            f"SELECT id, team_name, dept_code, dept_gmail FROM hr_departments WHERE id IN ({placeholders});",
            tuple(dept_ids),
            fetch_all=True
        ) or []
        if len(valid_depts) != len(dept_ids):
            raise HTTPException(status_code=404, detail="One or more selected departments were not found.")
        dept_name = ", ".join([d["team_name"] for d in valid_depts])
    elif role_clean == "HR_AGENT":
        raise HTTPException(status_code=400, detail="At least one assigned department is required for HR Agents.")

    primary_dept_id = dept_ids[0] if dept_ids else None

    # Designation defaults
    default_desig = "Administrator" if role_clean == "ADMIN" else "Support Specialist"
    desig = (payload.designation or "").strip() or default_desig
    is_dept_head = payload.is_dept_head if role_clean != "ADMIN" else True

    # 3. Insert new user
    new_user = execute_query(
        """
        INSERT INTO users (name, email, role, is_dept_head, department_id, designation, status, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, 'ACTIVE', NOW(), NOW())
        RETURNING id, name, email, role, is_dept_head, department_id, designation, status, created_at;
        """,
        (
            payload.name.strip(),
            email_clean,
            role_clean,
            is_dept_head,
            primary_dept_id,
            desig
        ),
        fetch_one=True,
        commit=True
    )
    
    # Insert multiple department mappings into user_departments
    for did in dept_ids:
        execute_query(
            "INSERT INTO user_departments (user_id, department_id) VALUES (%s, %s) ON CONFLICT (user_id, department_id) DO NOTHING;",
            (new_user["id"], did),
            commit=True
        )
    new_user["department_ids"] = dept_ids
    new_user["departments"] = valid_depts
    new_user["department_names"] = dept_name
    
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
            department_name=dept_name,
            designation=desig,
            is_dept_head=is_dept_head,
            base_url=base_url,
            sender_admin_email=ADMIN_EMAIL,
            role=role_clean
        )
        
    # 6. Record Audit Log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'USER_CREATED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"user_name": "{payload.name.strip()}", "user_email": "{email_clean}", "role": "{role_clean}", "department": "{dept_name}", "is_dept_head": {str(bool(is_dept_head)).lower()}}}'
        ),
        commit=True
    )
    
    role_label = "Administrator" if role_clean == "ADMIN" else ("Department Head" if is_dept_head else "Agent")
    email_sent = bool(email_result and email_result.get("sent"))
    if email_sent:
        msg = f"✓ {role_label} {payload.name.strip()} created successfully and invitation email dispatched to {email_clean}!"
    else:
        err_msg = email_result.get("error") if email_result else "Email dispatch disabled"
        msg = f"{role_label} {payload.name.strip()} created. (Email status: {err_msg})"

    return {
        "success": True,
        "message": msg,
        "user": new_user,
        "email_details": email_result,
        "email_sent": email_sent
    }

@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UpdateUserRequest):
    """
    Update User details (Name, Role, Department, Designation, Dept Head flag, Status)
    """
    user = execute_query("SELECT id, name, email, is_dept_head, role FROM users WHERE id = %s;", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    updates = []
    params = []
    
    if payload.name is not None:
        updates.append("name = %s")
        params.append(payload.name.strip())
    if payload.role is not None:
        role_clean = payload.role.strip().upper()
        if role_clean in ["ADMIN", "HR_AGENT"]:
            if role_clean != "ADMIN" and user["email"].lower() == ADMIN_EMAIL.lower():
                raise HTTPException(status_code=400, detail="Cannot revoke Administrator role from the root System Administrator.")
            updates.append("role = %s")
            params.append(role_clean)
    if payload.department_ids is not None:
        dept_ids = [int(did) for did in dict.fromkeys(payload.department_ids) if did]
        primary_dept_id = dept_ids[0] if dept_ids else None
        updates.append("department_id = %s")
        params.append(primary_dept_id)
        
        # Sync user_departments
        execute_query("DELETE FROM user_departments WHERE user_id = %s;", (user_id,), commit=True)
        for did in dept_ids:
            execute_query(
                "INSERT INTO user_departments (user_id, department_id) VALUES (%s, %s) ON CONFLICT (user_id, department_id) DO NOTHING;",
                (user_id, did),
                commit=True
            )
    elif payload.department_id is not None:
        primary_dept_id = payload.department_id if payload.department_id != 0 else None
        updates.append("department_id = %s")
        params.append(primary_dept_id)
        execute_query("DELETE FROM user_departments WHERE user_id = %s;", (user_id,), commit=True)
        if primary_dept_id:
            execute_query(
                "INSERT INTO user_departments (user_id, department_id) VALUES (%s, %s) ON CONFLICT (user_id, department_id) DO NOTHING;",
                (user_id, primary_dept_id),
                commit=True
            )
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
    
    # Enrich updated object with assigned departments from user_departments
    assigned_depts = execute_query(
        """
        SELECT d.id, d.team_name, d.dept_code, d.dept_gmail
        FROM user_departments ud
        JOIN hr_departments d ON ud.department_id = d.id
        WHERE ud.user_id = %s
        ORDER BY d.team_name ASC;
        """,
        (user_id,),
        fetch_all=True
    ) or []
    updated["departments"] = assigned_depts
    updated["department_ids"] = [d["id"] for d in assigned_depts]
    updated["department_names"] = ", ".join([d["team_name"] for d in assigned_depts]) if assigned_depts else (updated.get("department_name") or "Unassigned")
    updated["department_name"] = updated["department_names"]
    
    # Audit log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'USER_UPDATED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"target_user_id": {user_id}, "email": "{user["email"]}", "role": "{updated.get("role")}", "is_dept_head": {str(bool(updated.get("is_dept_head"))).lower()}}}'
        ),
        commit=True
    )
    
    return {"success": True, "message": "User updated successfully.", "user": updated}

@router.post("/users/{user_id}/toggle-admin")
def toggle_admin_role(user_id: int, request: Request):
    """
    1-Click Promote/Demote Administrator:
    - Promotes an HR Agent to ADMIN (universal console & management permissions) and dispatches Admin Welcome Email.
    - Demotes an Admin to HR Agent.
    - Prevents demoting the primary system administrator (ADMIN_EMAIL).
    """
    user = execute_query(
        """
        SELECT u.id, u.name, u.email, u.role, u.is_dept_head, u.designation, d.team_name as department_name
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE u.id = %s;
        """,
        (user_id,),
        fetch_one=True
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    current_role = user.get("role") or "HR_AGENT"
    is_becoming_admin = (current_role != "ADMIN")

    if not is_becoming_admin:
        if user["email"].lower() == ADMIN_EMAIL.lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot revoke Administrator role from the root System Administrator."
            )
        new_role = "HR_AGENT"
        new_desig = user.get("designation") or "Support Specialist"
        msg = f"{user['name']} has been reverted to HR Agent."
        email_res = None
    else:
        new_role = "ADMIN"
        new_desig = "Administrator" if not user.get("designation") or user.get("designation") == "Support Specialist" else user.get("designation")
        msg = f"👑 {user['name']} has been promoted to Full Administrator!"
        
        # Dispatch Administrator Privilege Email
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        base_url = origin or ("/".join(referer.split("/")[:3]) if referer else str(request.base_url).rstrip("/"))
        email_res = send_welcome_email(
            agent_name=user["name"],
            agent_email=user["email"],
            department_name="All Departments",
            designation=new_desig,
            is_dept_head=True,
            base_url=base_url,
            sender_admin_email=ADMIN_EMAIL,
            role="ADMIN"
        )

    execute_query(
        "UPDATE users SET role = %s, designation = %s, updated_at = NOW() WHERE id = %s;",
        (new_role, new_desig, user_id),
        commit=True
    )

    # Record in Audit Log
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, 'Administrator', 'ROLE_CHANGED', %s::jsonb, NOW());
        """,
        (
            ADMIN_EMAIL,
            f'{{"target_user_id": {user_id}, "email": "{user["email"]}", "old_role": "{current_role}", "new_role": "{new_role}"}}'
        ),
        commit=True
    )

    return {
        "success": True,
        "message": msg,
        "new_role": new_role,
        "is_admin": new_role == "ADMIN",
        "email_details": email_res
    }

@router.post("/users/{user_id}/toggle-role-scope")
def toggle_role_scope(user_id: int, request: Request):
    """
    1-Click Role Scope Toggle:
    Switches between:
    - '⭐ DEPT HEAD' (is_dept_head = TRUE) and dispatches Department Head Welcome Email
    - 'AGENT' (is_dept_head = FALSE)
    """
    user = execute_query(
        """
        SELECT u.id, u.name, u.email, u.is_dept_head, u.role, u.designation, d.team_name as department_name
        FROM users u
        LEFT JOIN hr_departments d ON u.department_id = d.id
        WHERE u.id = %s;
        """,
        (user_id,),
        fetch_one=True
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    new_scope = not bool(user["is_dept_head"])
    
    execute_query(
        "UPDATE users SET is_dept_head = %s, updated_at = NOW() WHERE id = %s;",
        (new_scope, user_id),
        commit=True
    )
    
    scope_title = "Department Head" if new_scope else "Support Agent"
    email_res = None

    if new_scope:
        # Dispatch Department Head Appointment Email
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        base_url = origin or ("/".join(referer.split("/")[:3]) if referer else str(request.base_url).rstrip("/"))
        email_res = send_welcome_email(
            agent_name=user["name"],
            agent_email=user["email"],
            department_name=user.get("department_name") or "Assigned Department",
            designation=user.get("designation") or "Department Head",
            is_dept_head=True,
            base_url=base_url,
            sender_admin_email=ADMIN_EMAIL,
            role=user.get("role") or "HR_AGENT"
        )
    
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
        "is_dept_head": new_scope,
        "email_details": email_res
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
        SELECT u.id, u.name, u.email, u.role, u.is_dept_head, u.designation, d.team_name as department_name
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
        department_name=user.get("department_name") or ("All Departments" if user.get("role") == "ADMIN" else "People Desk"),
        designation=user["designation"],
        is_dept_head=bool(user["is_dept_head"]),
        base_url=base_url,
        sender_admin_email=ADMIN_EMAIL,
        role=user.get("role") or "HR_AGENT"
    )
    
    email_sent = bool(email_res and email_res.get("sent"))
    return {
        "success": True,
        "message": f"Welcome invite re-sent to {user['email']}" if email_sent else f"Invite generated for {user['email']}. Notice: {email_res.get('error', 'SMTP issue')}",
        "email_details": email_res,
        "email_sent": email_sent
    }
