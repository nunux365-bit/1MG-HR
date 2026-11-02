"""
Database initialization and migration script for 'tata1mg_desk' Neon PostgreSQL database.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_prCYPycw8L7q@ep-delicate-band-b3531bbp-pooler.c-4.ap-southeast-1.aws.neon.tech/tata1mg_desk?sslmode=require"
)

INIT_SQL = """
-- 1. USERS & AGENTS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'HR_AGENT', -- 'ADMIN', 'HR_AGENT'
    password_hash VARCHAR(255),                  -- NULL if added by admin and hasn't created password yet
    is_dept_head BOOLEAN DEFAULT FALSE,
    department_id INT,
    designation VARCHAR(150),
    status VARCHAR(20) DEFAULT 'ACTIVE',          -- 'ACTIVE', 'INACTIVE'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. HR DEPARTMENTS TABLE
CREATE TABLE IF NOT EXISTS hr_departments (
    id SERIAL PRIMARY KEY,
    dept_code VARCHAR(50) UNIQUE NOT NULL,
    team_name VARCHAR(100) NOT NULL,
    dept_gmail VARCHAR(255) NOT NULL,
    sla_hours INT DEFAULT 24,
    default_priority VARCHAR(20) DEFAULT 'MEDIUM',
    description TEXT,
    category_code VARCHAR(50),
    color_accent VARCHAR(20) DEFAULT '#FF6F61',
    strong_keywords JSONB DEFAULT '[]'::jsonb,
    weak_keywords JSONB DEFAULT '[]'::jsonb,
    intents JSONB DEFAULT '[]'::jsonb,
    ai_model_status VARCHAR(20) DEFAULT 'UNTRAINED',
    model_accuracy NUMERIC(5,2) DEFAULT 0.0,
    trained_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CASE SEQUENCES TABLE (Collision-free 5-to-6 digit generator)
CREATE TABLE IF NOT EXISTS case_sequences (
    prefix VARCHAR(20) PRIMARY KEY DEFAULT '1MG',
    last_number BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CASES TABLE
CREATE TABLE IF NOT EXISTS cases (
    id SERIAL PRIMARY KEY,
    case_number VARCHAR(50) UNIQUE NOT NULL,
    employee_email VARCHAR(255) NOT NULL,
    employee_name VARCHAR(150),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100),
    department_id INT REFERENCES hr_departments(id) ON DELETE SET NULL,
    assigned_team VARCHAR(100),
    assigned_user VARCHAR(150),
    assigned_user_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'OPEN',         -- 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_EMPLOYEE', 'RESOLVED', 'CLOSED'
    priority VARCHAR(20) DEFAULT 'MEDIUM',     -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    sla_hours INT DEFAULT 24,
    due_at TIMESTAMPTZ,
    resolution_notes TEXT,
    resolved_by VARCHAR(150),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    case_id INT REFERENCES cases(id) ON DELETE CASCADE,
    case_number VARCHAR(50),
    actor_email VARCHAR(255) NOT NULL,
    actor_name VARCHAR(150) NOT NULL,
    action VARCHAR(100) NOT NULL,               -- e.g. 'CASE_CREATED', 'AGENT_ASSIGNED', 'STATUS_CHANGED'
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEED: Sequence Initialization
INSERT INTO case_sequences (prefix, last_number, updated_at)
VALUES ('1MG', 0, NOW())
ON CONFLICT (prefix) DO NOTHING;

-- SEED: Initial Departments for Tata 1mg
INSERT INTO hr_departments (dept_code, team_name, dept_gmail, sla_hours, default_priority, description)
VALUES 
    ('DEPT-ATTENDANCE', 'Attendance HR', 'vaibhavx002@zohomail.in', 24, 'HIGH', 'Handles biometric punches, shift attendance, timesheets, and regularization queries.'),
    ('DEPT-PAYROLL', 'Payroll HR', 'payroll.desk@1mg.com', 24, 'HIGH', 'Handles salary slips, tax TDS declarations, Form 16, and bank account changes.'),
    ('DEPT-PEOPLEDESK', 'Central People Desk', 'peopledesk@1mg.com', 48, 'MEDIUM', 'Central employee helpdesk and general query triage for all departments.'),
    ('DEPT-IT-ASSET', 'IT Asset & Hardware', 'it.support@1mg.com', 48, 'MEDIUM', 'Handles laptops, VPN access, hardware repairs, and peripheral requests.'),
    ('DEPT-BGV', 'Background Verification', 'bgv.verify@1mg.com', 72, 'MEDIUM', 'Handles employee background verification, document checks, and experience verification.')
ON CONFLICT (dept_code) DO NOTHING;

-- SEED: Admin User
INSERT INTO users (email, name, role, is_dept_head, designation, status)
VALUES ('vaibhavx002@zohomail.in', 'Vaibhav Yadav', 'ADMIN', TRUE, 'System Administrator & Head of People Desk', 'ACTIVE')
ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE';
"""

def init_database():
    print(f"Connecting to: {DB_URL.split('@')[-1]}")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(INIT_SQL)
    conn.commit()
    
    # Verify counts
    cur.execute("SELECT COUNT(*) FROM hr_departments;")
    depts = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM users;")
    users = cur.fetchone()[0]
    cur.execute("SELECT last_number FROM case_sequences WHERE prefix='1MG';")
    seq = cur.fetchone()[0]
    
    print(f"✓ Migration applied successfully!")
    print(f"✓ Departments seeded: {depts}")
    print(f"✓ Users in database: {users}")
    print(f"✓ Sequence generator ready: prefix='1MG', next={seq + 1}")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    init_database()

