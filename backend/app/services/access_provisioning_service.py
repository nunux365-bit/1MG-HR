import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from backend.app.config import ADMIN_EMAIL
from backend.app.database import execute_query
from backend.app.dependencies import revoke_user_sessions
from backend.app.routes.auth import hash_password
from backend.app.services.email_service import send_welcome_email


def normalize_role_and_scope(raw_role: Optional[str], is_dept_head: Optional[bool] = None) -> Tuple[str, bool]:
    """Maps external role names (including Oryn/SCIM roles) to People Desk role + is_dept_head."""
    val = (raw_role or "HR_AGENT").strip().upper().replace(" ", "_").replace("-", "_")
    if val in ("ADMIN", "SUPER_ADMIN", "ADMINISTRATOR"):
        return "ADMIN", True
    if val in ("DEPT_HEAD", "DEPARTMENT_HEAD", "MANAGER", "TEAM_LEAD", "LEAD"):
        return "HR_AGENT", True
    return "HR_AGENT", bool(is_dept_head) if is_dept_head is not None else False


def resolve_departments(
    department_ids: Optional[List[int]] = None,
    department_id: Optional[int] = None,
    department_name: Optional[str] = None,
    dept_code: Optional[str] = None,
    require_for_agent: bool = False,
    role: str = "HR_AGENT",
) -> List[Dict[str, Any]]:
    """Resolves department rows by ID, code, or name, falling back to People Desk for bot convenience."""
    ids = [int(d) for d in dict.fromkeys(department_ids or ([department_id] if department_id else [])) if d]
    if ids:
        placeholders = ", ".join(["%s"] * len(ids))
        rows = execute_query(
            f"SELECT id, team_name, dept_code, dept_gmail FROM hr_departments WHERE id IN ({placeholders});",
            tuple(ids),
            fetch_all=True,
        ) or []
        if len(rows) != len(ids):
            raise HTTPException(status_code=404, detail="One or more selected departments were not found.")
        return rows

    if dept_code:
        code_clean = dept_code.strip().upper()
        if not code_clean.startswith("DEPT-"):
            code_clean_prefixed = f"DEPT-{code_clean}"
        else:
            code_clean_prefixed = code_clean
        row = execute_query(
            """
            SELECT id, team_name, dept_code, dept_gmail
            FROM hr_departments
            WHERE UPPER(dept_code) = %s OR UPPER(dept_code) = %s OR UPPER(category_code) = %s
            LIMIT 1;
            """,
            (code_clean, code_clean_prefixed, code_clean),
            fetch_one=True,
        )
        if row:
            return [row]

    if department_name:
        row = execute_query(
            """
            SELECT id, team_name, dept_code, dept_gmail
            FROM hr_departments
            WHERE LOWER(team_name) = %s OR LOWER(team_name) LIKE %s
            ORDER BY id ASC LIMIT 1;
            """,
            (department_name.strip().lower(), f"%{department_name.strip().lower()}%"),
            fetch_one=True,
        )
        if row:
            return [row]

    if role == "ADMIN":
        return []

    if require_for_agent:
        raise HTTPException(status_code=400, detail="At least one assigned department is required for HR Agents.")

    default_dept = execute_query(
        """
        SELECT id, team_name, dept_code, dept_gmail
        FROM hr_departments
        ORDER BY CASE WHEN dept_code = 'DEPT-PEOPLEDESK' THEN 0 ELSE 1 END, id ASC
        LIMIT 1;
        """,
        fetch_one=True,
    )
    return [default_dept] if default_dept else []


def upsert_employee_record(
    *,
    name: str,
    email: str,
    employee_id: Optional[str] = None,
    department: Optional[str] = None,
    designation: Optional[str] = None,
    manager_name: Optional[str] = None,
    location: Optional[str] = None,
    joining_date: Optional[str] = None,
    source: str = "ORYN_BOT",
    is_test: bool = True,
) -> Dict[str, Any]:
    """Upserts an employee / today's joiner into the central HRMS employees table."""
    email_clean = email.strip().lower()
    emp_code = (employee_id or "").strip() or None
    join_dt = (joining_date or "").strip() or date.today().isoformat()

    existing = None
    if emp_code:
        existing = execute_query(
            "SELECT id FROM employees WHERE UPPER(employee_id) = %s OR LOWER(email) = %s LIMIT 1;",
            (emp_code.upper(), email_clean),
            fetch_one=True,
        )
    else:
        existing = execute_query(
            "SELECT id FROM employees WHERE LOWER(email) = %s LIMIT 1;",
            (email_clean,),
            fetch_one=True,
        )

    if existing:
        return execute_query(
            """
            UPDATE employees
            SET employee_id = COALESCE(%s, employee_id),
                name = %s,
                email = %s,
                department = COALESCE(%s, department),
                designation = COALESCE(%s, designation),
                manager_name = COALESCE(%s, manager_name),
                location = COALESCE(%s, location),
                joining_date = COALESCE(%s::date, joining_date),
                status = 'ACTIVE',
                source = %s,
                is_test = %s,
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, employee_id, name, email, department, designation, manager_name, location, joining_date, status, source, is_test;
            """,
            (
                emp_code,
                name.strip(),
                email_clean,
                department,
                designation,
                manager_name,
                location,
                join_dt,
                source,
                bool(is_test),
                existing["id"],
            ),
            fetch_one=True,
            commit=True,
        )

    return execute_query(
        """
        INSERT INTO employees (
            employee_id, name, email, department, designation, manager_name,
            location, joining_date, status, source, is_test, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::date, 'ACTIVE', %s, %s, NOW(), NOW())
        RETURNING id, employee_id, name, email, department, designation, manager_name, location, joining_date, status, source, is_test;
        """,
        (
            emp_code,
            name.strip(),
            email_clean,
            department or "People Desk",
            designation or "New Joiner",
            manager_name,
            location,
            join_dt,
            source,
            bool(is_test),
        ),
        fetch_one=True,
        commit=True,
    )


def _sync_user_departments(user_id: int, dept_ids: List[int]) -> None:
    execute_query("DELETE FROM user_departments WHERE user_id = %s;", (user_id,), commit=True)
    for did in dept_ids:
        execute_query(
            "INSERT INTO user_departments (user_id, department_id) VALUES (%s, %s) ON CONFLICT (user_id, department_id) DO NOTHING;",
            (user_id, did),
            commit=True,
        )


def provision_joiner_or_user(
    *,
    name: str,
    email: str,
    role: Optional[str] = "HR_AGENT",
    is_dept_head: Optional[bool] = None,
    department_id: Optional[int] = None,
    department_ids: Optional[List[int]] = None,
    department_name: Optional[str] = None,
    dept_code: Optional[str] = None,
    designation: Optional[str] = None,
    employee_id: Optional[str] = None,
    manager_name: Optional[str] = None,
    location: Optional[str] = None,
    joining_date: Optional[str] = None,
    grant_portal_access: bool = True,
    send_welcome_email_flag: bool = False,
    temporary_password: Optional[str] = None,
    base_url: str = "",
    source: str = "ORYN_BOT",
    is_test: bool = True,
    actor_email: str = "oryn@1mg.com",
    actor_name: str = "Oryn Bot",
    allow_existing_update: bool = True,
) -> Dict[str, Any]:
    """
    Unified provisioning entry point used by Oryn Bot (REST & SCIM 2.0) and Admin Bulk Import.
    1) Upserts into `employees` (HRMS active directory).
    2) If `grant_portal_access` is True, creates/reactivates `users` + `user_departments`.
    3) Writes an audit log entry and returns the activation link + live state.
    """
    email_clean = email.strip().lower()
    name_clean = (name or "").strip() or email_clean.split("@")[0].replace(".", " ").title()
    role_clean, resolved_head = normalize_role_and_scope(role, is_dept_head)

    depts = resolve_departments(
        department_ids=department_ids,
        department_id=department_id,
        department_name=department_name,
        dept_code=dept_code,
        require_for_agent=False,
        role=role_clean,
    )
    dept_ids = [d["id"] for d in depts]
    primary_dept_id = dept_ids[0] if dept_ids else None
    dept_label = "All Departments" if role_clean == "ADMIN" else (", ".join([d["team_name"] for d in depts]) or "People Desk")
    desig = (designation or "").strip() or ("Administrator" if role_clean == "ADMIN" else "Support Specialist")

    emp_row = upsert_employee_record(
        name=name_clean,
        email=email_clean,
        employee_id=employee_id,
        department=department_name or dept_label,
        designation=desig,
        manager_name=manager_name,
        location=location,
        joining_date=joining_date,
        source=source,
        is_test=is_test,
    )

    user_row = None
    created_new_user = False
    activation_link = f"{base_url.rstrip('/')}/?email={email_clean}" if base_url else f"/?email={email_clean}"
    email_result = None

    if grant_portal_access:
        existing_user = execute_query(
            "SELECT id, email, role, password_hash FROM users WHERE LOWER(email) = %s LIMIT 1;",
            (email_clean,),
            fetch_one=True,
        )
        pw_hash = hash_password(temporary_password.strip()) if (temporary_password and len(temporary_password.strip()) >= 6) else None

        if existing_user:
            if not allow_existing_update:
                raise HTTPException(
                    status_code=400,
                    detail=f"An account with email '{email_clean}' is already registered.",
                )
            if existing_user["email"].lower() == ADMIN_EMAIL.lower() and role_clean != "ADMIN":
                role_clean = "ADMIN"
                resolved_head = True

            if pw_hash:
                user_row = execute_query(
                    """
                    UPDATE users
                    SET name = %s, role = %s, is_dept_head = %s, department_id = %s,
                        designation = %s, status = 'ACTIVE', revoked_at = NULL,
                        password_hash = %s, is_test = %s, source = %s, updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, name, email, role, is_dept_head, department_id, designation, status, is_test, source, created_at;
                    """,
                    (name_clean, role_clean, resolved_head, primary_dept_id, desig, pw_hash, bool(is_test), source, existing_user["id"]),
                    fetch_one=True,
                    commit=True,
                )
            else:
                user_row = execute_query(
                    """
                    UPDATE users
                    SET name = %s, role = %s, is_dept_head = %s, department_id = %s,
                        designation = %s, status = 'ACTIVE', revoked_at = NULL,
                        is_test = %s, source = %s, updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, name, email, role, is_dept_head, department_id, designation, status, is_test, source, created_at;
                    """,
                    (name_clean, role_clean, resolved_head, primary_dept_id, desig, bool(is_test), source, existing_user["id"]),
                    fetch_one=True,
                    commit=True,
                )
        else:
            created_new_user = True
            user_row = execute_query(
                """
                INSERT INTO users (
                    name, email, role, is_dept_head, department_id, designation,
                    password_hash, status, is_test, source, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s, %s, NOW(), NOW())
                RETURNING id, name, email, role, is_dept_head, department_id, designation, status, is_test, source, created_at;
                """,
                (name_clean, email_clean, role_clean, resolved_head, primary_dept_id, desig, pw_hash, bool(is_test), source),
                fetch_one=True,
                commit=True,
            )

        _sync_user_departments(user_row["id"], dept_ids)
        user_row["department_ids"] = dept_ids
        user_row["departments"] = depts
        user_row["department_names"] = dept_label

        if send_welcome_email_flag:
            email_result = send_welcome_email(
                agent_name=name_clean,
                agent_email=email_clean,
                department_name=dept_label,
                designation=desig,
                is_dept_head=resolved_head,
                base_url=base_url or "",
                sender_admin_email=ADMIN_EMAIL,
                role=role_clean,
            )

    audit_details = json.dumps({
        "email": email_clean,
        "name": name_clean,
        "role": role_clean if grant_portal_access else "EMPLOYEE_ONLY",
        "is_dept_head": resolved_head if grant_portal_access else False,
        "department": dept_label,
        "employee_id": emp_row.get("employee_id") if emp_row else employee_id,
        "source": source,
        "is_test": bool(is_test),
        "created_new_user": created_new_user,
    })
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, %s, 'ORYN_PROVISIONED', %s::jsonb, NOW());
        """,
        (actor_email, actor_name, audit_details),
        commit=True,
    )

    return {
        "user": user_row,
        "employee": emp_row,
        "created_new_user": created_new_user,
        "activation_link": activation_link if grant_portal_access else None,
        "email_details": email_result,
        "email_sent": bool(email_result and email_result.get("sent")),
    }


def _find_user_by_identifier(identifier: str) -> Optional[Dict[str, Any]]:
    ident = str(identifier).strip()
    if ident.isdigit():
        return execute_query(
            "SELECT id, name, email, role, is_dept_head, department_id, designation, status, is_test, source, revoked_at, created_at, updated_at FROM users WHERE id = %s LIMIT 1;",
            (int(ident),),
            fetch_one=True,
        )
    return execute_query(
        "SELECT id, name, email, role, is_dept_head, department_id, designation, status, is_test, source, revoked_at, created_at, updated_at FROM users WHERE LOWER(email) = %s LIMIT 1;",
        (ident.lower(),),
        fetch_one=True,
    )


def revoke_user_access(
    identifier: str,
    *,
    reason: Optional[str] = "Revoked via Oryn Bot",
    actor_email: str = "oryn@1mg.com",
    actor_name: str = "Oryn Bot",
) -> Dict[str, Any]:
    """Revokes portal & employee access immediately and invalidates all active sessions."""
    user = _find_user_by_identifier(identifier)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{identifier}' not found.")

    if user["id"] == 1 or user["email"].lower() == ADMIN_EMAIL.lower():
        raise HTTPException(status_code=400, detail="Cannot revoke access for root System Administrator.")

    updated = execute_query(
        """
        UPDATE users
        SET status = 'INACTIVE', revoked_at = NOW(), updated_at = NOW()
        WHERE id = %s
        RETURNING id, name, email, role, is_dept_head, status, revoked_at, is_test;
        """,
        (user["id"],),
        fetch_one=True,
        commit=True,
    )
    revoke_user_sessions(user["id"])

    execute_query(
        "UPDATE employees SET status = 'INACTIVE', updated_at = NOW() WHERE LOWER(email) = %s;",
        (user["email"].lower(),),
        commit=True,
    )

    audit_details = json.dumps({
        "target_user_id": user["id"],
        "email": user["email"],
        "reason": reason,
        "revoked_at": datetime.utcnow().isoformat(),
    })
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, %s, 'ORYN_ACCESS_REVOKED', %s::jsonb, NOW());
        """,
        (actor_email, actor_name, audit_details),
        commit=True,
    )
    return updated


def verify_user_access(identifier: str) -> Dict[str, Any]:
    """Returns live access, role, department, and session status for Oryn verification checks."""
    user = _find_user_by_identifier(identifier)
    if not user:
        emp = execute_query(
            "SELECT id, employee_id, name, email, department, designation, joining_date, status, is_test FROM employees WHERE LOWER(email) = %s LIMIT 1;",
            (str(identifier).strip().lower(),),
            fetch_one=True,
        )
        return {
            "exists": bool(emp),
            "portal_access": False,
            "active": False,
            "revoked": True,
            "user": None,
            "employee": emp,
            "active_sessions": 0,
        }

    depts = execute_query(
        """
        SELECT d.id, d.team_name, d.dept_code
        FROM user_departments ud
        JOIN hr_departments d ON ud.department_id = d.id
        WHERE ud.user_id = %s
        ORDER BY d.team_name ASC;
        """,
        (user["id"],),
        fetch_all=True,
    ) or []

    sess_row = execute_query(
        """
        SELECT COUNT(*) AS cnt
        FROM user_sessions
        WHERE user_id = %s AND revoked_at IS NULL AND expires_at > NOW();
        """,
        (user["id"],),
        fetch_one=True,
    ) or {}
    emp = execute_query(
        "SELECT id, employee_id, name, email, department, designation, joining_date, status, is_test FROM employees WHERE LOWER(email) = %s LIMIT 1;",
        (user["email"].lower(),),
        fetch_one=True,
    )

    is_active = (user.get("status") == "ACTIVE") and (user.get("revoked_at") is None)
    user["departments"] = depts
    user["department_ids"] = [d["id"] for d in depts]

    return {
        "exists": True,
        "portal_access": is_active,
        "active": is_active,
        "revoked": not is_active,
        "role": user["role"],
        "is_dept_head": bool(user.get("is_dept_head")),
        "status": user.get("status"),
        "revoked_at": user.get("revoked_at"),
        "active_sessions": int(sess_row.get("cnt") or 0),
        "user": user,
        "employee": emp,
    }


def cleanup_test_data(actor_email: str = "oryn@1mg.com", actor_name: str = "Oryn Bot") -> Dict[str, int]:
    """Deletes test cases, test sessions, test portal users, and test employee rows."""
    test_users = execute_query(
        "SELECT id, email FROM users WHERE is_test = TRUE AND id <> 1 AND LOWER(email) <> %s;",
        (ADMIN_EMAIL.lower(),),
        fetch_all=True,
    ) or []
    user_ids = [u["id"] for u in test_users]

    cases_deleted = execute_query(
        "WITH del AS (DELETE FROM cases WHERE is_test = TRUE RETURNING id) SELECT COUNT(*) AS cnt FROM del;",
        fetch_one=True,
        commit=True,
    ) or {}

    users_deleted = 0
    if user_ids:
        placeholders = ", ".join(["%s"] * len(user_ids))
        execute_query(f"DELETE FROM user_sessions WHERE user_id IN ({placeholders});", tuple(user_ids), commit=True)
        execute_query(f"DELETE FROM user_departments WHERE user_id IN ({placeholders});", tuple(user_ids), commit=True)
        execute_query(
            f"UPDATE cases SET assigned_user_id = NULL, assigned_user = NULL, assigned_user_email = NULL WHERE assigned_user_id IN ({placeholders});",
            tuple(user_ids),
            commit=True,
        )
        execute_query(
            f"UPDATE emails SET assigned_user_id = NULL, assigned_user_name = NULL, assigned_user_email = NULL WHERE assigned_user_id IN ({placeholders});",
            tuple(user_ids),
            commit=True,
        )
        res_u = execute_query(
            f"WITH del AS (DELETE FROM users WHERE id IN ({placeholders}) RETURNING id) SELECT COUNT(*) AS cnt FROM del;",
            tuple(user_ids),
            fetch_one=True,
            commit=True,
        ) or {}
        users_deleted = int(res_u.get("cnt") or 0)

    emps_deleted = execute_query(
        "WITH del AS (DELETE FROM employees WHERE is_test = TRUE RETURNING id) SELECT COUNT(*) AS cnt FROM del;",
        fetch_one=True,
        commit=True,
    ) or {}

    summary = {
        "cases_deleted": int(cases_deleted.get("cnt") or 0),
        "users_deleted": users_deleted,
        "employees_deleted": int(emps_deleted.get("cnt") or 0),
    }
    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, %s, 'ORYN_TEST_DATA_CLEANED', %s::jsonb, NOW());
        """,
        (actor_email, actor_name, json.dumps(summary)),
        commit=True,
    )
    return summary
