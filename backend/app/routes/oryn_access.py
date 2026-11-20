import csv
import io
import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from backend.app.database import execute_query
from backend.app.dependencies import require_oryn_bot_or_admin, revoke_user_sessions
from backend.app.services.access_provisioning_service import (
    cleanup_test_data,
    normalize_role_and_scope,
    provision_joiner_or_user,
    resolve_departments,
    revoke_user_access,
    verify_user_access,
)
from backend.app.services.case_routing_service import find_department_assignee, generate_case_number
from backend.app.services.classifier_service import classify_inbound_email_ai

access_router = APIRouter(tags=["Oryn Bot Access & Provisioning"])
scim_router = APIRouter(tags=["Oryn SCIM 2.0 Connector"])


def _resolve_base_url(request: Request) -> str:
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto") or "https"
    if forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")
    if origin:
        return origin.rstrip("/")
    if referer:
        return "/".join(referer.split("/")[:3]).rstrip("/")
    return str(request.base_url).rstrip("/")


def _extract_email(body: Dict[str, Any]) -> str:
    for key in ("email", "userName", "user_email", "work_email"):
        val = body.get(key)
        if isinstance(val, str) and "@" in val:
            return val.strip().lower()
    emails = body.get("emails")
    if isinstance(emails, list) and emails:
        first = emails[0]
        if isinstance(first, dict) and first.get("value"):
            return str(first["value"]).strip().lower()
        if isinstance(first, str) and "@" in first:
            return first.strip().lower()
    raise HTTPException(status_code=400, detail="Valid 'email' (or 'userName') is required.")


def _extract_name(body: Dict[str, Any], email: str) -> str:
    for key in ("name", "full_name", "displayName", "employee_name"):
        val = body.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    name_obj = body.get("name")
    if isinstance(name_obj, dict):
        formatted = name_obj.get("formatted")
        if formatted:
            return str(formatted).strip()
        parts = [str(name_obj.get("givenName") or "").strip(), str(name_obj.get("familyName") or "").strip()]
        joined = " ".join([p for p in parts if p])
        if joined:
            return joined
    return email.split("@")[0].replace(".", " ").title()


def _extract_role(body: Dict[str, Any]) -> str:
    if body.get("role"):
        return str(body["role"])
    roles = body.get("roles")
    if isinstance(roles, list) and roles:
        first = roles[0]
        if isinstance(first, dict):
            return str(first.get("value") or first.get("display") or "HR_AGENT")
        return str(first)
    return "HR_AGENT"


def _to_scim_user(user: Dict[str, Any]) -> Dict[str, Any]:
    active = (user.get("status") == "ACTIVE") and (user.get("revoked_at") is None)
    role_val = "DEPT_HEAD" if (user.get("role") == "HR_AGENT" and user.get("is_dept_head")) else user.get("role", "HR_AGENT")
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "id": str(user["id"]),
        "userName": user["email"],
        "displayName": user["name"],
        "active": active,
        "title": user.get("designation") or "Support Specialist",
        "emails": [{"value": user["email"], "type": "work", "primary": True}],
        "roles": [{"value": role_val, "display": role_val}],
        "meta": {
            "resourceType": "User",
            "created": user.get("created_at"),
            "lastModified": user.get("updated_at"),
        },
    }


def _parse_csv_joiners(csv_text: str) -> List[Dict[str, Any]]:
    """Parses CSV text (with or without headers) into joiner dicts."""
    text = (csv_text or "").strip()
    if not text:
        return []
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []

    first_lower = lines[0].lower()
    has_header = "email" in first_lower and ("name" in first_lower or "," in first_lower)
    rows: List[Dict[str, Any]] = []
    if has_header:
        reader = csv.DictReader(io.StringIO(text))
        for raw in reader:
            norm = {(k or "").strip().lower().replace(" ", "_"): (v or "").strip() for k, v in raw.items()}
            email = norm.get("email") or norm.get("work_email") or norm.get("user_email") or ""
            if not email:
                continue
            rows.append({
                "name": norm.get("name") or norm.get("full_name") or email.split("@")[0].title(),
                "email": email,
                "role": norm.get("role") or "HR_AGENT",
                "department": norm.get("department") or norm.get("dept") or norm.get("department_name") or None,
                "dept_code": norm.get("dept_code") or None,
                "employee_id": norm.get("employee_id") or norm.get("emp_id") or None,
                "designation": norm.get("designation") or None,
                "manager_name": norm.get("manager") or norm.get("manager_name") or None,
                "location": norm.get("location") or None,
                "joining_date": norm.get("joining_date") or None,
            })
    else:
        reader = csv.reader(io.StringIO(text))
        for cols in reader:
            cols = [c.strip() for c in cols]
            if not cols or len(cols) < 2:
                continue
            name, email = cols[0], cols[1]
            if "@" in name and "@" not in email:
                name, email = email, name
            rows.append({
                "name": name or email.split("@")[0].title(),
                "email": email,
                "role": cols[2] if len(cols) > 2 and cols[2] else "HR_AGENT",
                "department": cols[3] if len(cols) > 3 and cols[3] else None,
                "employee_id": cols[4] if len(cols) > 4 and cols[4] else None,
            })
    return rows


def _bulk_provision_items(
    items: List[Dict[str, Any]],
    *,
    base_url: str,
    default_grant_portal: bool,
    default_send_email: bool,
    default_is_test: bool,
    default_department_id: Optional[int],
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    results = []
    succeeded = 0
    failed = 0
    for idx, item in enumerate(items):
        try:
            email = _extract_email(item)
            name = _extract_name(item, email)
            res = provision_joiner_or_user(
                name=name,
                email=email,
                role=_extract_role(item),
                is_dept_head=item.get("is_dept_head"),
                department_id=item.get("department_id") or default_department_id,
                department_ids=item.get("department_ids"),
                department_name=item.get("department") or item.get("department_name"),
                dept_code=item.get("dept_code"),
                designation=item.get("designation"),
                employee_id=item.get("employee_id") or item.get("emp_id"),
                manager_name=item.get("manager_name") or item.get("manager"),
                location=item.get("location"),
                joining_date=item.get("joining_date"),
                grant_portal_access=bool(item.get("grant_portal_access", default_grant_portal)),
                send_welcome_email_flag=bool(item.get("send_welcome_email", default_send_email)),
                temporary_password=item.get("temporary_password") or item.get("password"),
                base_url=base_url,
                source=item.get("source") or "ORYN_BULK",
                is_test=bool(item.get("is_test", default_is_test)),
                actor_email=actor.get("email", "oryn@1mg.com"),
                actor_name=actor.get("name", "Oryn Bot"),
                allow_existing_update=True,
            )
            succeeded += 1
            results.append({
                "index": idx,
                "success": True,
                "email": email,
                "name": name,
                "user_id": res["user"]["id"] if res.get("user") else None,
                "employee_db_id": res["employee"]["id"] if res.get("employee") else None,
                "role": res["user"]["role"] if res.get("user") else "EMPLOYEE_ONLY",
                "activation_link": res.get("activation_link"),
                "email_sent": res.get("email_sent", False),
            })
        except Exception as err:
            failed += 1
            results.append({
                "index": idx,
                "success": False,
                "email": item.get("email") or item.get("userName"),
                "error": str(getattr(err, "detail", err)),
            })
    return {
        "success": failed == 0,
        "total": len(items),
        "succeeded": succeeded,
        "failed": failed,
        "results": results,
    }


# ============================================================================
# 1. ORYN REST API (JSON) CONNECTOR — /api/access & /api/v1/access
# ============================================================================

@access_router.get("/api/access")
@access_router.get("/api/v1/access")
@access_router.get("/api/access/health")
@access_router.get("/api/v1/access/health")
def oryn_connector_overview(actor: dict = Depends(require_oryn_bot_or_admin)):
    depts = execute_query(
        "SELECT id, dept_code, team_name FROM hr_departments ORDER BY team_name ASC;",
        fetch_all=True,
    ) or []
    return {
        "success": True,
        "status": "CONNECTED",
        "project": "Tata 1mg People Desk",
        "project_code": "APP-1MG-01",
        "authenticated_as": actor.get("name"),
        "supported_actions": ["provision", "bulk_provision", "grant_role", "revoke", "verify", "create_case"],
        "supported_roles": ["HR_AGENT", "DEPT_HEAD", "ADMIN"],
        "departments": depts,
    }


@access_router.get("/api/access/users")
@access_router.get("/api/v1/access/users")
@access_router.get("/api/access/joiners")
@access_router.get("/api/v1/access/joiners")
def oryn_list_users_and_joiners(
    email: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    is_test: Optional[bool] = Query(None),
    joined_today: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    actor: dict = Depends(require_oryn_bot_or_admin),
):
    where_clauses = ["1=1"]
    params: List[Any] = []
    if email:
        where_clauses.append("LOWER(u.email) = %s")
        params.append(email.strip().lower())
    if status:
        where_clauses.append("UPPER(u.status) = %s")
        params.append(status.strip().upper())
    if is_test is not None:
        where_clauses.append("u.is_test = %s")
        params.append(is_test)
    if joined_today:
        where_clauses.append("u.created_at::date = CURRENT_DATE")
    if search:
        pat = f"%{search.strip().lower()}%"
        where_clauses.append("(LOWER(u.name) LIKE %s OR LOWER(u.email) LIKE %s)")
        params.extend([pat, pat])

    users = execute_query(
        f"""
        SELECT u.id, u.name, u.email, u.role, u.is_dept_head, u.department_id,
               u.designation, u.status, u.is_test, u.source, u.revoked_at, u.created_at, u.updated_at
        FROM users u
        WHERE {' AND '.join(where_clauses)}
        ORDER BY u.created_at DESC
        LIMIT 200;
        """,
        tuple(params) if params else None,
        fetch_all=True,
    ) or []

    emp_where = ["1=1"]
    emp_params: List[Any] = []
    if joined_today:
        emp_where.append("(joining_date = CURRENT_DATE OR created_at::date = CURRENT_DATE)")
    if is_test is not None:
        emp_where.append("is_test = %s")
        emp_params.append(is_test)
    if email:
        emp_where.append("LOWER(email) = %s")
        emp_params.append(email.strip().lower())

    employees = execute_query(
        f"""
        SELECT id, employee_id, name, email, department, designation, manager_name,
               location, joining_date, status, source, is_test, created_at
        FROM employees
        WHERE {' AND '.join(emp_where)}
        ORDER BY created_at DESC
        LIMIT 200;
        """,
        tuple(emp_params) if emp_params else None,
        fetch_all=True,
    ) or []

    return {
        "success": True,
        "users": users,
        "employees": employees,
        "counts": {"users": len(users), "employees": len(employees)},
    }


@access_router.get("/api/access/verify")
@access_router.get("/api/v1/access/verify")
def oryn_verify_query(
    email: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    identifier: Optional[str] = Query(None),
    actor: dict = Depends(require_oryn_bot_or_admin),
):
    target = identifier or email or user_id
    if not target:
        raise HTTPException(status_code=400, detail="Provide 'email', 'user_id', or 'identifier'.")
    result = verify_user_access(target)
    return {"success": True, **result}


@access_router.get("/api/access/users/{identifier}")
@access_router.get("/api/v1/access/users/{identifier}")
def oryn_get_single_user(identifier: str, actor: dict = Depends(require_oryn_bot_or_admin)):
    result = verify_user_access(identifier)
    if not result["exists"]:
        raise HTTPException(status_code=404, detail=f"User '{identifier}' not found.")
    return {"success": True, **result}


@access_router.post("/api/access")
@access_router.post("/api/v1/access")
@access_router.post("/api/access/provision")
@access_router.post("/api/v1/access/provision")
@access_router.post("/api/access/users")
@access_router.post("/api/v1/access/users")
@access_router.post("/api/access/joiners")
@access_router.post("/api/v1/access/joiners")
async def oryn_dispatch_or_provision(request: Request, actor: dict = Depends(require_oryn_bot_or_admin)):
    """
    Flexible REST API (JSON) endpoint for Oryn Bot.
    Handles single provisioning, bulk arrays, role grants, revocation, or verification via `action` or direct fields.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON request body.")

    if isinstance(body, list):
        return _bulk_provision_items(
            body,
            base_url=_resolve_base_url(request),
            default_grant_portal=True,
            default_send_email=False,
            default_is_test=True,
            default_department_id=None,
            actor=actor,
        )

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object or array.")

    if isinstance(body.get("users"), list) or isinstance(body.get("joiners"), list) or body.get("csv_text"):
        items = body.get("users") or body.get("joiners") or _parse_csv_joiners(body.get("csv_text", ""))
        return _bulk_provision_items(
            items,
            base_url=_resolve_base_url(request),
            default_grant_portal=bool(body.get("grant_portal_access", True)),
            default_send_email=bool(body.get("send_welcome_email", False)),
            default_is_test=bool(body.get("is_test", True)),
            default_department_id=body.get("department_id"),
            actor=actor,
        )

    action = str(body.get("action") or body.get("operation") or "provision").strip().lower()
    if action in ("revoke", "deprovision", "deactivate", "suspend"):
        target = body.get("user_id") or body.get("id") or body.get("email") or body.get("userName")
        if not target:
            raise HTTPException(status_code=400, detail="Provide 'email' or 'user_id' to revoke.")
        revoked = revoke_user_access(
            str(target),
            reason=body.get("reason") or "Revoked via Oryn Bot",
            actor_email=actor.get("email", "oryn@1mg.com"),
            actor_name=actor.get("name", "Oryn Bot"),
        )
        return {"success": True, "action": "revoke", "revoked": True, "user": revoked}

    if action in ("verify", "check", "status"):
        target = body.get("user_id") or body.get("id") or body.get("email") or body.get("userName")
        if not target:
            raise HTTPException(status_code=400, detail="Provide 'email' or 'user_id' to verify.")
        return {"success": True, "action": "verify", **verify_user_access(str(target))}

    email = _extract_email(body)
    name = _extract_name(body, email)
    res = provision_joiner_or_user(
        name=name,
        email=email,
        role=_extract_role(body),
        is_dept_head=body.get("is_dept_head"),
        department_id=body.get("department_id"),
        department_ids=body.get("department_ids"),
        department_name=body.get("department") or body.get("department_name"),
        dept_code=body.get("dept_code"),
        designation=body.get("designation") or body.get("title"),
        employee_id=body.get("employee_id") or body.get("emp_id"),
        manager_name=body.get("manager_name") or body.get("manager"),
        location=body.get("location"),
        joining_date=body.get("joining_date"),
        grant_portal_access=bool(body.get("grant_portal_access", True)),
        send_welcome_email_flag=bool(body.get("send_welcome_email", False)),
        temporary_password=body.get("temporary_password") or body.get("password"),
        base_url=_resolve_base_url(request),
        source=body.get("source") or "ORYN_BOT",
        is_test=bool(body.get("is_test", True)),
        actor_email=actor.get("email", "oryn@1mg.com"),
        actor_name=actor.get("name", "Oryn Bot"),
        allow_existing_update=True,
    )
    return {
        "success": True,
        "action": action,
        "message": f"Provisioned {name} ({email}) successfully.",
        **res,
    }


@access_router.post("/api/access/bulk")
@access_router.post("/api/v1/access/bulk")
async def oryn_bulk_provision(request: Request, actor: dict = Depends(require_oryn_bot_or_admin)):
    body = await request.json()
    if isinstance(body, list):
        items = body
        grant_portal = True
        send_email = False
        is_test = True
        default_dept_id = None
    elif isinstance(body, dict):
        items = body.get("users") or body.get("joiners") or _parse_csv_joiners(body.get("csv_text", ""))
        grant_portal = bool(body.get("grant_portal_access", True))
        send_email = bool(body.get("send_welcome_email", False))
        is_test = bool(body.get("is_test", True))
        default_dept_id = body.get("department_id")
    else:
        raise HTTPException(status_code=400, detail="Expected JSON list or object with 'users'/'joiners'/'csv_text'.")

    if not items:
        raise HTTPException(status_code=400, detail="No valid joiner records found in payload.")

    return _bulk_provision_items(
        items,
        base_url=_resolve_base_url(request),
        default_grant_portal=grant_portal,
        default_send_email=send_email,
        default_is_test=is_test,
        default_department_id=default_dept_id,
        actor=actor,
    )


@access_router.post("/api/access/grant-role")
@access_router.post("/api/v1/access/grant-role")
@access_router.patch("/api/access/users/{identifier}")
@access_router.patch("/api/v1/access/users/{identifier}")
async def oryn_grant_or_update_role(
    request: Request,
    identifier: Optional[str] = None,
    actor: dict = Depends(require_oryn_bot_or_admin),
):
    body = await request.json()
    target = identifier or body.get("user_id") or body.get("id") or body.get("email") or body.get("userName")
    if not target:
        raise HTTPException(status_code=400, detail="User identifier ('email' or 'user_id') is required.")

    if body.get("active") is False or str(body.get("status", "")).upper() == "INACTIVE":
        revoked = revoke_user_access(
            str(target),
            reason=body.get("reason") or "Revoked via role/status update",
            actor_email=actor.get("email", "oryn@1mg.com"),
            actor_name=actor.get("name", "Oryn Bot"),
        )
        return {"success": True, "revoked": True, "user": revoked}

    info = verify_user_access(str(target))
    if not info.get("user"):
        raise HTTPException(status_code=404, detail=f"User '{target}' not found.")

    user = info["user"]
    role_clean, is_head = normalize_role_and_scope(
        body.get("role") or user["role"],
        body.get("is_dept_head") if "is_dept_head" in body else user.get("is_dept_head"),
    )
    depts = resolve_departments(
        department_ids=body.get("department_ids"),
        department_id=body.get("department_id"),
        department_name=body.get("department") or body.get("department_name"),
        dept_code=body.get("dept_code"),
        require_for_agent=False,
        role=role_clean,
    )
    dept_ids = [d["id"] for d in depts] if (body.get("department_ids") or body.get("department_id") or body.get("department") or body.get("dept_code")) else user.get("department_ids", [])
    primary_dept_id = dept_ids[0] if dept_ids else user.get("department_id")

    updated = execute_query(
        """
        UPDATE users
        SET role = %s, is_dept_head = %s, department_id = %s,
            status = 'ACTIVE', revoked_at = NULL, updated_at = NOW()
        WHERE id = %s
        RETURNING id, name, email, role, is_dept_head, department_id, designation, status, is_test;
        """,
        (role_clean, is_head, primary_dept_id, user["id"]),
        fetch_one=True,
        commit=True,
    )
    if dept_ids:
        execute_query("DELETE FROM user_departments WHERE user_id = %s;", (user["id"],), commit=True)
        for did in dept_ids:
            execute_query(
                "INSERT INTO user_departments (user_id, department_id) VALUES (%s, %s) ON CONFLICT (user_id, department_id) DO NOTHING;",
                (user["id"], did),
                commit=True,
            )

    execute_query(
        """
        INSERT INTO audit_logs (actor_email, actor_name, action, details, created_at)
        VALUES (%s, %s, 'ORYN_ROLE_GRANTED', %s::jsonb, NOW());
        """,
        (
            actor.get("email", "oryn@1mg.com"),
            actor.get("name", "Oryn Bot"),
            json.dumps({"target_user_id": user["id"], "email": user["email"], "role": role_clean, "is_dept_head": is_head}),
        ),
        commit=True,
    )
    return {"success": True, "message": "Role updated successfully.", "user": updated}


@access_router.post("/api/access/revoke")
@access_router.post("/api/v1/access/revoke")
async def oryn_revoke_post(request: Request, actor: dict = Depends(require_oryn_bot_or_admin)):
    body = await request.json()
    target = body.get("user_id") or body.get("id") or body.get("email") or body.get("userName")
    if not target:
        raise HTTPException(status_code=400, detail="Provide 'email' or 'user_id' to revoke.")
    revoked = revoke_user_access(
        str(target),
        reason=body.get("reason") or "Revoked via Oryn Bot",
        actor_email=actor.get("email", "oryn@1mg.com"),
        actor_name=actor.get("name", "Oryn Bot"),
    )
    return {"success": True, "revoked": True, "message": f"Access revoked for {revoked['email']}.", "user": revoked}


@access_router.delete("/api/access/users/{identifier}")
@access_router.delete("/api/v1/access/users/{identifier}")
def oryn_revoke_delete(identifier: str, actor: dict = Depends(require_oryn_bot_or_admin)):
    revoked = revoke_user_access(
        identifier,
        reason="Revoked via DELETE /api/access/users",
        actor_email=actor.get("email", "oryn@1mg.com"),
        actor_name=actor.get("name", "Oryn Bot"),
    )
    return {"success": True, "revoked": True, "message": f"Access revoked for {revoked['email']}.", "user": revoked}


@access_router.delete("/api/access/test-data")
@access_router.delete("/api/v1/access/test-data")
@access_router.post("/api/access/cleanup-test-data")
@access_router.post("/api/v1/access/cleanup-test-data")
def oryn_cleanup_test_data(actor: dict = Depends(require_oryn_bot_or_admin)):
    summary = cleanup_test_data(
        actor_email=actor.get("email", "oryn@1mg.com"),
        actor_name=actor.get("name", "Oryn Bot"),
    )
    return {"success": True, "message": "Test data cleaned up.", **summary}


# ============================================================================
# 2. JOINER TEST CASE CREATION & TRACKING VIA ORYN BOT
# ============================================================================

class OrynCaseCreateRequest(BaseModel):
    employee_email: str
    employee_name: Optional[str] = None
    title: str
    description: str
    department_id: Optional[int] = None
    dept_code: Optional[str] = None
    priority: Optional[str] = None
    is_test: Optional[bool] = True


@access_router.post("/api/access/cases")
@access_router.post("/api/v1/access/cases")
def oryn_create_joiner_case(req: OrynCaseCreateRequest, actor: dict = Depends(require_oryn_bot_or_admin)):
    email_clean = req.employee_email.strip().lower()
    emp = execute_query(
        "SELECT id, employee_id, name, email, department, manager_name FROM employees WHERE LOWER(email) = %s LIMIT 1;",
        (email_clean,),
        fetch_one=True,
    )
    emp_name = (req.employee_name or "").strip() or (emp["name"] if emp else email_clean.split("@")[0].title())

    cls_res = classify_inbound_email_ai(req.title, req.description)
    dept = None
    if req.department_id:
        dept = execute_query("SELECT id, team_name, dept_code, sla_hours, category_code, default_priority FROM hr_departments WHERE id = %s;", (req.department_id,), fetch_one=True)
    elif req.dept_code:
        dept = execute_query("SELECT id, team_name, dept_code, sla_hours, category_code, default_priority FROM hr_departments WHERE UPPER(dept_code) = %s;", (req.dept_code.strip().upper(),), fetch_one=True)
    elif cls_res.get("department_id"):
        dept = execute_query("SELECT id, team_name, dept_code, sla_hours, category_code, default_priority FROM hr_departments WHERE id = %s;", (cls_res["department_id"],), fetch_one=True)

    if not dept:
        dept = execute_query(
            "SELECT id, team_name, dept_code, sla_hours, category_code, default_priority FROM hr_departments ORDER BY CASE WHEN dept_code = 'DEPT-PEOPLEDESK' THEN 0 ELSE 1 END, id ASC LIMIT 1;",
            fetch_one=True,
        )

    dept_id = dept["id"] if dept else None
    dept_name = dept["team_name"] if dept else "People Desk"
    category_detected = (dept.get("category_code") if dept else None) or cls_res.get("category_code") or "PEOPLEDESK"
    sla_hours = int((dept.get("sla_hours") if dept else None) or cls_res.get("sla_hours") or 24)
    due_at = datetime.utcnow() + timedelta(hours=sla_hours)

    head = find_department_assignee(dept_id)
    assigned_user = head["name"] if head else None
    assigned_email = head["email"] if head else None
    assigned_user_id = head["id"] if head else None
    case_num = generate_case_number()

    new_case = execute_query(
        """
        INSERT INTO cases (
            case_number, employee_email, employee_name, title, description,
            category, department_id, assigned_team, assigned_user, assigned_user_email, assigned_user_id,
            status, priority, sla_hours, due_at, employee_id, employee_code, manager, is_profile_verified, is_test,
            created_at, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            'OPEN', %s, %s, %s, %s, %s, %s, %s, %s,
            NOW(), NOW()
        ) RETURNING id, case_number, status, priority, created_at;
        """,
        (
            case_num,
            email_clean,
            emp_name,
            req.title.strip(),
            req.description.strip(),
            category_detected,
            dept_id,
            dept_name,
            assigned_user,
            assigned_email,
            assigned_user_id,
            req.priority or (dept.get("default_priority") if dept else None) or "MEDIUM",
            sla_hours,
            due_at,
            emp["id"] if emp else None,
            emp["employee_id"] if emp else None,
            emp["manager_name"] if emp else None,
            bool(emp),
            bool(req.is_test),
        ),
        fetch_one=True,
        commit=True,
    )

    execute_query(
        """
        INSERT INTO audit_logs (case_id, case_number, actor_email, actor_name, action, details)
        VALUES (%s, %s, %s, %s, 'ORYN_CASE_CREATED', %s::jsonb);
        """,
        (
            new_case["id"],
            case_num,
            actor.get("email", "oryn@1mg.com"),
            actor.get("name", "Oryn Bot"),
            json.dumps({"employee_email": email_clean, "department": dept_name, "is_test": bool(req.is_test)}),
        ),
        commit=True,
    )

    return {
        "success": True,
        "case": {
            "id": new_case["id"],
            "case_number": case_num,
            "status": new_case["status"],
            "department": dept_name,
            "assigned_to": assigned_user or "Unassigned",
            "is_profile_verified": bool(emp),
            "due_at": due_at.isoformat(),
        },
    }


@access_router.get("/api/access/cases/{case_number}")
@access_router.get("/api/v1/access/cases/{case_number}")
def oryn_get_case_status(case_number: str, actor: dict = Depends(require_oryn_bot_or_admin)):
    row = execute_query(
        """
        SELECT id, case_number, employee_email, employee_name, title, status, priority,
               assigned_team, assigned_user, assigned_user_email, resolution_notes,
               due_at, resolved_at, is_test, created_at, updated_at
        FROM cases
        WHERE UPPER(case_number) = %s OR id::text = %s
        LIMIT 1;
        """,
        (case_number.strip().upper(), case_number.strip()),
        fetch_one=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Case '{case_number}' not found.")
    return {"success": True, "case": row}


# ============================================================================
# 3. SCIM 2.0 CONNECTOR — /scim/v2/* & /api/v1/scim/v2/*
# ============================================================================

@scim_router.get("/scim/v2/ServiceProviderConfig")
@scim_router.get("/api/v1/scim/v2/ServiceProviderConfig")
def scim_service_provider_config():
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        "patch": {"supported": True},
        "bulk": {"supported": False, "maxOperations": 100, "maxPayloadSize": 1048576},
        "filter": {"supported": True, "maxResults": 200},
        "changePassword": {"supported": False},
        "sort": {"supported": False},
        "etag": {"supported": False},
    }


@scim_router.get("/scim/v2/Users")
@scim_router.get("/api/v1/scim/v2/Users")
def scim_list_users(
    filter: Optional[str] = Query(None),
    startIndex: int = Query(1, ge=1),
    count: int = Query(50, ge=1, le=200),
    actor: dict = Depends(require_oryn_bot_or_admin),
):
    where_sql = "1=1"
    params: List[Any] = []
    if filter:
        match = re.search(r'userName\s+eq\s+"([^"]+)"', filter, flags=re.IGNORECASE)
        if match:
            where_sql = "LOWER(email) = %s"
            params.append(match.group(1).strip().lower())

    offset = startIndex - 1
    rows = execute_query(
        f"""
        SELECT id, name, email, role, is_dept_head, designation, status, revoked_at, created_at, updated_at
        FROM users
        WHERE {where_sql}
        ORDER BY id DESC
        LIMIT %s OFFSET %s;
        """,
        tuple(params + [count, offset]),
        fetch_all=True,
    ) or []

    resources = [_to_scim_user(r) for r in rows]
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(resources),
        "startIndex": startIndex,
        "itemsPerPage": len(resources),
        "Resources": resources,
    }


@scim_router.get("/scim/v2/Users/{identifier}")
@scim_router.get("/api/v1/scim/v2/Users/{identifier}")
def scim_get_user(identifier: str, actor: dict = Depends(require_oryn_bot_or_admin)):
    info = verify_user_access(identifier)
    if not info.get("user"):
        raise HTTPException(status_code=404, detail="SCIM user not found.")
    return _to_scim_user(info["user"])


@scim_router.post("/scim/v2/Users", status_code=201)
@scim_router.post("/api/v1/scim/v2/Users", status_code=201)
async def scim_create_user(request: Request, actor: dict = Depends(require_oryn_bot_or_admin)):
    body = await request.json()
    email = _extract_email(body)
    name = _extract_name(body, email)
    active = body.get("active", True)

    res = provision_joiner_or_user(
        name=name,
        email=email,
        role=_extract_role(body),
        designation=body.get("title") or body.get("designation"),
        grant_portal_access=True,
        send_welcome_email_flag=False,
        base_url=_resolve_base_url(request),
        source="ORYN_SCIM",
        is_test=True,
        actor_email=actor.get("email", "oryn@1mg.com"),
        actor_name=actor.get("name", "Oryn SCIM"),
        allow_existing_update=True,
    )
    user = res["user"]
    if active is False:
        user = revoke_user_access(email, reason="SCIM provisioned inactive", actor_email=actor.get("email", "oryn@1mg.com"), actor_name=actor.get("name", "Oryn SCIM"))
    return _to_scim_user(user)


@scim_router.put("/scim/v2/Users/{identifier}")
@scim_router.put("/api/v1/scim/v2/Users/{identifier}")
@scim_router.patch("/scim/v2/Users/{identifier}")
@scim_router.patch("/api/v1/scim/v2/Users/{identifier}")
async def scim_update_or_patch_user(
    identifier: str,
    request: Request,
    actor: dict = Depends(require_oryn_bot_or_admin),
):
    body = await request.json()
    info = verify_user_access(identifier)
    if not info.get("user"):
        raise HTTPException(status_code=404, detail="SCIM user not found.")
    user = info["user"]

    active_val: Optional[bool] = body.get("active") if "active" in body else None
    new_name = body.get("displayName")
    new_role = None

    ops = body.get("Operations") or body.get("operations") or []
    for op in ops:
        op_type = str(op.get("op") or "").lower()
        path = str(op.get("path") or "").lower()
        val = op.get("value")
        if op_type in ("replace", "add"):
            if path == "active" or (not path and isinstance(val, dict) and "active" in val):
                active_val = bool(val["active"]) if isinstance(val, dict) else bool(val)
            if path == "displayname":
                new_name = str(val)
            if path == "roles" or (not path and isinstance(val, dict) and "roles" in val):
                rlist = val["roles"] if isinstance(val, dict) else val
                if isinstance(rlist, list) and rlist:
                    new_role = str(rlist[0].get("value") if isinstance(rlist[0], dict) else rlist[0])

    if active_val is False:
        revoked = revoke_user_access(
            identifier,
            reason="SCIM active=false revocation",
            actor_email=actor.get("email", "oryn@1mg.com"),
            actor_name=actor.get("name", "Oryn SCIM"),
        )
        return _to_scim_user(revoked)

    if new_role or new_name or active_val is True:
        role_clean, is_head = normalize_role_and_scope(new_role or user["role"], user.get("is_dept_head") if not new_role else None)
        updated = execute_query(
            """
            UPDATE users
            SET name = COALESCE(%s, name),
                role = %s,
                is_dept_head = %s,
                status = 'ACTIVE',
                revoked_at = NULL,
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, name, email, role, is_dept_head, designation, status, revoked_at, created_at, updated_at;
            """,
            (new_name, role_clean, is_head, user["id"]),
            fetch_one=True,
            commit=True,
        )
        if active_val is True:
            execute_query("UPDATE employees SET status = 'ACTIVE', updated_at = NOW() WHERE LOWER(email) = %s;", (user["email"].lower(),), commit=True)
        return _to_scim_user(updated)

    return _to_scim_user(user)


@scim_router.delete("/scim/v2/Users/{identifier}", status_code=204)
@scim_router.delete("/api/v1/scim/v2/Users/{identifier}", status_code=204)
def scim_delete_user(identifier: str, actor: dict = Depends(require_oryn_bot_or_admin)):
    revoke_user_access(
        identifier,
        reason="SCIM DELETE revocation",
        actor_email=actor.get("email", "oryn@1mg.com"),
        actor_name=actor.get("name", "Oryn SCIM"),
    )
    return None
