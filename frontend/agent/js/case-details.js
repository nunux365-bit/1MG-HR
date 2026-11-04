/**
 * TATA 1MG PEOPLE DESK - AGENT CASE DOSSIER & COMMUNICATION HUB
 * Dedicated controller for Case Info (All Mails + AI Engine) & Forensic Audit
 */

let currentCase = null;
let currentCaseId = null;
let currentUser = null;
let allDepartments = [];
let activeComposerMode = 'PUBLIC_REPLY';
let aiDraftTones = {};
let isGatedProfileIntake = false;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize agent session
  initAgentSession();

  // 2. Extract Case ID from query parameters
  const params = new URLSearchParams(window.location.search);
  currentCaseId = params.get('id') || params.get('case_id');

  if (!currentCaseId) {
    alert('No Case ID specified. Returning to Workbench Queue.');
    window.location.href = '/agent.html?view=casesView';
    return;
  }

  // 3. Load departments for reassignment and profile modal
  await fetchDepartments();

  // 4. Load full case data
  await loadCaseDetails(currentCaseId);

  // 5. Setup keyboard shortcuts for composer
  setupComposerShortcuts();
});

/**
 * Initializes the agent session from localStorage.
 */
function initAgentSession() {
  try {
    currentUser = JSON.parse(localStorage.getItem('1mg_user') || localStorage.getItem('admin_user') || '{}');
  } catch (e) {
    currentUser = {};
  }

  if (!currentUser.email) {
    currentUser = {
      id: 1,
      email: 'vaibhavv7676@gmail.com',
      name: 'Vaibhav Yadav',
      role: 'AGENT',
      designation: 'People Desk Specialist'
    };
    localStorage.setItem('1mg_user', JSON.stringify(currentUser));
  }

  const nameEl = document.getElementById('navAgentName');
  const emailEl = document.getElementById('navAgentEmail');
  const avatarEl = document.getElementById('navAgentAvatar');

  if (nameEl) nameEl.innerText = currentUser.name || 'Agent Specialist';
  if (emailEl) emailEl.innerText = currentUser.email || 'people.ops@1mg.com';
  if (avatarEl) avatarEl.innerText = (currentUser.name || 'A')[0].toUpperCase();
}

/**
 * Loads department list for reassignment modal and employee profile dropdown.
 */
async function fetchDepartments() {
  try {
    const res = await fetch('/api/v1/departments');
    const data = await res.json();
    if (data.success && data.departments) {
      allDepartments = data.departments;
      populateProfileDeptDropdown();
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

function populateProfileDeptDropdown() {
  const select = document.getElementById('profileDeptSelect');
  if (!select || !allDepartments.length) return;
  
  select.innerHTML = '<option value="">Select Department...</option>' + 
    allDepartments.map(d => `<option value="${d.id}">${escapeHtml(d.team_name)}</option>`).join('');
}

/**
 * Opens the Employee Profile Intake / Edit Modal.
 * When isGated is true: Triggered by "Start Working on Case" when profile is missing/unverified.
 * When isGated is false: Triggered by "Edit Details" button on HRMS dossier.
 */
function openEmployeeProfileModal(isGated = false) {
  if (!currentCase) return;
  isGatedProfileIntake = isGated;

  const modal = document.getElementById('employeeProfileModal');
  const titleEl = document.getElementById('employeeProfileModalTitle');
  const noticeEl = document.getElementById('profileModalNotice');
  const btnSubmit = document.getElementById('btnSaveEmployeeProfile');

  populateProfileDeptDropdown();

  if (isGated) {
    if (titleEl) titleEl.innerText = '👤 Employee HRMS Intake & Gated Verification';
    if (noticeEl) {
      noticeEl.style.display = 'block';
      noticeEl.style.background = '#FEF2F2';
      noticeEl.style.borderColor = '#FECACA';
      noticeEl.style.color = '#991B1B';
      noticeEl.innerHTML = `<strong>⚠️ Mandatory Intake Gating:</strong> Central HRMS policy requires verifying the employee's name, employee ID, department, and reporting manager before moving ticket #${currentCase.case_number} to <em>IN PROGRESS</em>.`;
    }
    if (btnSubmit) {
      btnSubmit.innerText = '💾 Confirm & Start Working on Case';
      btnSubmit.style.background = '#EA580C';
    }
  } else {
    if (titleEl) titleEl.innerText = '✏️ Modify Employee Profile Details';
    if (noticeEl) {
      noticeEl.style.display = 'block';
      noticeEl.style.background = '#EFF6FF';
      noticeEl.style.borderColor = '#BFDBFE';
      noticeEl.style.color = '#1E40AF';
      noticeEl.innerHTML = `<strong>ℹ️ Central HRMS Update:</strong> Updates will be permanently saved to PostgreSQL and synchronized with Central HRMS employee records.`;
    }
    if (btnSubmit) {
      btnSubmit.innerText = '💾 Save Profile Changes';
      btnSubmit.style.background = '#2563EB';
    }
  }

  const p = currentCase.hrms_profile || {};

  // Form field pre-filling
  const nameInput = document.getElementById('profileEmpName');
  const codeInput = document.getElementById('profileEmpCode');
  const deptSelect = document.getElementById('profileDeptSelect');
  const mgrInput = document.getElementById('profileManager');
  const companyEmailInput = document.getElementById('profileCompanyEmail');
  const companyActiveCheck = document.getElementById('profileCompanyActive');
  const personalEmailInput = document.getElementById('profilePersonalEmail');
  const mobileInput = document.getElementById('profileMobile');

  if (nameInput) nameInput.value = currentCase.employee_name || p.employee_name || '';
  
  // Suggest employee code from case, profile, or description regex
  let suggestedCode = currentCase.employee_code || p.employee_code || '';
  if (!suggestedCode || suggestedCode === '—') {
    const fullText = (currentCase.title || '') + ' ' + (currentCase.description || '');
    const m = fullText.match(/\b(1MG-?\d{3,6}|EMP-?\d{3,6})\b/i);
    if (m) suggestedCode = m[1];
  }
  if (codeInput) codeInput.value = (suggestedCode === '—' ? '' : suggestedCode);

  if (deptSelect) {
    deptSelect.value = currentCase.department_id || p.department_id || (allDepartments[0]?.id || 11);
  }

  if (mgrInput) {
    mgrInput.value = currentCase.manager || p.manager || 'People Operations Lead';
  }

  const compEmail = currentCase.company_email || (p.company_email ? p.company_email : '');
  if (companyEmailInput) companyEmailInput.value = compEmail;
  if (companyActiveCheck) {
    companyActiveCheck.checked = Boolean(compEmail && compEmail.includes('@1mg.com'));
    toggleCompanyEmailStatus(companyActiveCheck.checked);
  }

  if (personalEmailInput) {
    personalEmailInput.value = currentCase.personal_email || (currentCase.employee_email && !currentCase.employee_email.includes('@1mg.com') ? currentCase.employee_email : '') || p.personal_email || '';
  }

  if (mobileInput) {
    mobileInput.value = currentCase.mobile_number || p.mobile_number || '';
  }

  if (modal) modal.style.display = 'flex';
}

function closeEmployeeProfileModal() {
  const modal = document.getElementById('employeeProfileModal');
  if (modal) modal.style.display = 'none';
}

function toggleCompanyEmailStatus(isActive) {
  const compInput = document.getElementById('profileCompanyEmail');
  if (!compInput) return;
  if (!isActive) {
    compInput.placeholder = 'Deactivated / Not assigned';
    compInput.style.background = '#F1F5F9';
  } else {
    compInput.placeholder = 'e.g. employee@1mg.com';
    compInput.style.background = '#FFFFFF';
  }
}

async function submitEmployeeProfile() {
  if (!currentCase) return;

  const name = document.getElementById('profileEmpName')?.value.trim();
  const code = document.getElementById('profileEmpCode')?.value.trim();
  const deptId = parseInt(document.getElementById('profileDeptSelect')?.value);
  const manager = document.getElementById('profileManager')?.value.trim();
  const isCompanyActive = document.getElementById('profileCompanyActive')?.checked;
  const companyEmail = isCompanyActive ? document.getElementById('profileCompanyEmail')?.value.trim() : null;
  const personalEmail = document.getElementById('profilePersonalEmail')?.value.trim();
  const mobile = document.getElementById('profileMobile')?.value.trim();

  if (!name) {
    showToast('Please enter employee full name', 'error');
    return;
  }
  if (!code) {
    showToast('Please enter employee ID or code', 'error');
    return;
  }
  if (!deptId) {
    showToast('Please select functional department', 'error');
    return;
  }
  if (!manager) {
    showToast('Please specify reporting manager', 'error');
    return;
  }

  const payload = {
    employee_name: name,
    employee_code: code,
    department_id: deptId,
    manager: manager,
    company_email: companyEmail || null,
    personal_email: personalEmail || null,
    mobile_number: mobile || null,
    is_profile_verified: true,
    actor_email: currentUser.email,
    actor_name: currentUser.name || 'Desk Specialist',
    auto_start_work: isGatedProfileIntake
  };

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/employee-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      closeEmployeeProfileModal();
      showToast(isGatedProfileIntake ? 'Profile verified & case moved to IN PROGRESS!' : 'Employee profile details updated successfully.', 'success');
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to update employee profile', 'error');
    }
  } catch (err) {
    console.error('Error updating employee profile:', err);
    showToast('Network error while saving profile details', 'error');
  }
}

/**
 * Fetches and renders full case details.
 */
async function loadCaseDetails(caseId) {
  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();

    if (!data.success || !data.case) {
      alert('Case dossier not found.');
      window.location.href = '/agent.html?view=casesView';
      return;
    }

    currentCase = data.case;
    const logs = data.audit_logs || [];

    renderHeaderRibbon(currentCase);
    renderLifecycleCockpit(currentCase);
    renderInboundInquiry(currentCase);
    renderConversationThread(currentCase, logs);
    renderAiIntelligence(currentCase);
    renderDarwinboxProfile(currentCase);
    renderAuditTimeline(logs);

  } catch (err) {
    console.error('Error loading case:', err);
    showToast('Failed to load case dossier', 'error');
  }
}

/**
 * Renders the top ribbon and hero card.
 */
function renderHeaderRibbon(c) {
  document.title = `Case #${c.case_number} · Tata 1mg People Desk`;

  const bcDept = document.getElementById('breadcrumbDept');
  if (bcDept) {
    bcDept.innerHTML = `
      <span class="dept-dot-accent" style="background: ${c.color_accent || '#2563EB'}; width: 7px; height: 7px; border-radius: 50%; display: inline-block;"></span>
      <span>${escapeHtml(c.department_name || 'People Desk')}</span>
    `;
  }

  const heroNum = document.getElementById('heroCaseNumber');
  if (heroNum) heroNum.innerText = c.case_number;

  const heroTitle = document.getElementById('heroCaseTitle');
  if (heroTitle) heroTitle.innerText = c.title;

  const heroDept = document.getElementById('heroDeptPill');
  if (heroDept) {
    heroDept.innerHTML = `
      <span class="dept-dot-accent" style="background: ${c.color_accent || '#2563EB'}; width: 6px; height: 6px; border-radius: 50%; display: inline-block;"></span>
      <span>${escapeHtml(c.department_name || 'People Desk')}</span>
    `;
  }

  const prioEl = document.getElementById('heroPriorityPill');
  if (prioEl) prioEl.innerHTML = renderCasePriorityPill(c.priority);

  const statusEl = document.getElementById('heroStatusPill');
  if (statusEl) statusEl.innerHTML = renderCaseStatusPill(c.status);

  // Timestamps
  const created = c.created_at ? new Date(c.created_at) : null;
  const createdEl = document.getElementById('heroCreatedTime');
  if (createdEl) {
    createdEl.innerText = created ? created.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'N/A';
  }

  const due = c.due_at ? new Date(c.due_at) : null;
  const dueEl = document.getElementById('heroDueTime');
  if (dueEl) {
    dueEl.innerText = due ? due.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'No SLA set';
  }

  // Turnaround telemetry badge
  const turnaroundEl = document.getElementById('heroTurnaroundBadge');
  if (turnaroundEl) {
    if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
      turnaroundEl.innerHTML = `<span style="color: #059669; font-weight: 700; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 8px; border-radius: 6px; font-size: 11.5px;">✅ SLA Met</span>`;
    } else if (due && new Date() > due) {
      const diffHours = Math.round((new Date() - due) / (1000 * 60 * 60));
      turnaroundEl.innerHTML = `<span style="color: #DC2626; font-weight: 800; background: #FEF2F2; border: 1px solid #FECACA; padding: 2px 8px; border-radius: 6px; font-size: 11.5px;">🚨 Breached by ${diffHours}h</span>`;
    } else if (due) {
      const remainingHours = Math.max(0, Math.round((due - new Date()) / (1000 * 60 * 60)));
      turnaroundEl.innerHTML = `<span style="color: #059669; font-weight: 700; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 8px; border-radius: 6px; font-size: 11.5px;">⏱️ ${remainingHours}h remaining</span>`;
    } else {
      turnaroundEl.innerHTML = `<span style="color: #64748B; font-size: 11.5px;">Standard Queue</span>`;
    }
  }

  // Claim Button State
  const btnClaim = document.getElementById('btnClaimTop');
  if (btnClaim) {
    const isAssignedToMe = (c.assigned_user_email === currentUser?.email) || (c.assigned_user === currentUser?.name);
    if (isAssignedToMe) {
      btnClaim.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B190" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Assigned to You</span>
      `;
      btnClaim.disabled = true;
      btnClaim.style.opacity = '1';
      btnClaim.style.background = '#ECFDF5';
      btnClaim.style.borderColor = '#A7F3D0';
      btnClaim.style.color = '#047857';
    } else {
      btnClaim.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Claim Case</span>
      `;
      btnClaim.disabled = false;
      btnClaim.style.opacity = '1';
      btnClaim.style.background = '#FFFFFF';
      btnClaim.style.borderColor = '#CBD5E1';
      btnClaim.style.color = '#334155';
    }
  }

  // Resolve Button State
  const btnResolve = document.getElementById('btnResolveTop');
  if (btnResolve) {
    if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
      btnResolve.disabled = true;
      btnResolve.innerHTML = `<span>✓ Already Resolved</span>`;
      btnResolve.style.opacity = '0.6';
    } else {
      btnResolve.disabled = false;
      btnResolve.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Mark Resolved</span>
      `;
      btnResolve.style.opacity = '1';
      btnResolve.onclick = openApproveModal;
    }
  }
}

/**
 * Renders the interactive case lifecycle stepper and contextual action buttons.
 */
function renderLifecycleCockpit(c) {
  const stepOpen = document.getElementById('stepOpen');
  const stepProgress = document.getElementById('stepProgress');
  const stepWaiting = document.getElementById('stepWaiting');
  const stepClosed = document.getElementById('stepClosed');
  const line1 = document.getElementById('line1');
  const line2 = document.getElementById('line2');
  const line3 = document.getElementById('line3');
  const descEl = document.getElementById('lifecycleStatusDesc');
  const actionsEl = document.getElementById('lifecycleActionsContainer');

  if (!stepOpen || !actionsEl) return;

  const status = (c.status || 'OPEN').toUpperCase();

  // Reset classes and numbers
  [stepOpen, stepProgress, stepWaiting, stepClosed].forEach(s => s?.classList.remove('active', 'completed'));
  [line1, line2, line3].forEach(l => l?.classList.remove('completed'));

  const dot1 = stepOpen.querySelector('.dot-num');
  const dot2 = stepProgress.querySelector('.dot-num');
  const dot3 = stepWaiting.querySelector('.dot-num');
  const dot4 = stepClosed.querySelector('.dot-num');

  if (dot1) dot1.innerHTML = '1';
  if (dot2) dot2.innerHTML = '2';
  if (dot3) dot3.innerHTML = '3';
  if (dot4) dot4.innerHTML = '4';

  if (status === 'OPEN') {
    stepOpen.classList.add('active');
    if (descEl) {
      descEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="font-size: 11px; font-weight: 800; background: #FFF7ED; color: #EA580C; border: 1px solid #FFEDD5; padding: 2px 7px; border-radius: 4px;">PHASE 1 ACTIVE</span>
          <span style="color: #475569; font-size: 12.5px;">Ticket is in <strong>Inbound Triage</strong> awaiting specialist intake.</span>
        </div>
      `;
    }
    actionsEl.innerHTML = `
      <button class="btn-workflow btn-workflow-start" onclick="startWorkingOnCase()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>Start Working on Case</span>
      </button>
    `;
  } else if (status === 'IN_PROGRESS') {
    stepOpen.classList.add('completed');
    if (dot1) dot1.innerHTML = '✓';
    line1.classList.add('completed');
    stepProgress.classList.add('active');
    if (descEl) {
      descEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="font-size: 11px; font-weight: 800; background: #EFF6FF; color: #2563EB; border: 1px solid #DBEAFE; padding: 2px 7px; border-radius: 4px;">PHASE 2 ACTIVE</span>
          <span style="color: #475569; font-size: 12.5px;"><strong>Manual Verification</strong> in progress against Central HRMS records.</span>
        </div>
      `;
    }
    actionsEl.innerHTML = `
      <button class="btn-workflow btn-workflow-docs" onclick="openRequestDocModal()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
        <span>Request Documents</span>
      </button>
      <button class="btn-workflow btn-workflow-approve" onclick="openApproveModal()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Approve &amp; Resolve</span>
      </button>
      <button class="btn-workflow btn-workflow-reject" onclick="openRejectModal()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
        <span>Reject &amp; Close</span>
      </button>
    `;
  } else if (status === 'WAITING_ON_EMPLOYEE') {
    stepOpen.classList.add('completed');
    if (dot1) dot1.innerHTML = '✓';
    line1.classList.add('completed');
    stepProgress.classList.add('completed');
    if (dot2) dot2.innerHTML = '✓';
    line2.classList.add('completed');
    stepWaiting.classList.add('active');
    if (descEl) {
      descEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="font-size: 11px; font-weight: 800; background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; padding: 2px 7px; border-radius: 4px;">PHASE 3 ACTIVE</span>
          <span style="color: #475569; font-size: 12.5px;"><strong>Waiting on Employee</strong> for supporting documentation.</span>
        </div>
      `;
    }
    actionsEl.innerHTML = `
      <button class="btn-workflow btn-workflow-resume" onclick="resumeVerification()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        <span>Resume Verification</span>
      </button>
      <button class="btn-workflow btn-workflow-approve" onclick="openApproveModal()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Approve &amp; Resolve</span>
      </button>
      <button class="btn-workflow btn-workflow-reject" onclick="openRejectModal()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
        <span>Reject &amp; Close</span>
      </button>
    `;
  } else if (status === 'RESOLVED') {
    stepOpen.classList.add('completed');
    if (dot1) dot1.innerHTML = '✓';
    line1.classList.add('completed');
    stepProgress.classList.add('completed');
    if (dot2) dot2.innerHTML = '✓';
    line2.classList.add('completed');
    stepWaiting.classList.add('completed');
    if (dot3) dot3.innerHTML = '✓';
    line3.classList.add('completed');
    stepClosed.classList.add('completed');
    if (dot4) dot4.innerHTML = '✓';
    const cleanNotes = (c.resolution_notes || 'Case verified and approved in Central HRMS.').replace('[APPROVED] ', '');
    if (descEl) {
      descEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="font-size: 11px; font-weight: 800; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; padding: 2px 7px; border-radius: 4px;">DETERMINATION: APPROVED</span>
          <span style="color: #059669; font-size: 12.5px; font-weight: 600;">${escapeHtml(cleanNotes)}</span>
        </div>
      `;
    }
    actionsEl.innerHTML = `
      <button class="btn-workflow btn-workflow-reopen" onclick="reopenCase()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        <span>Reopen for Review</span>
      </button>
    `;
  } else if (status === 'CLOSED') {
    stepOpen.classList.add('completed');
    if (dot1) dot1.innerHTML = '✓';
    line1.classList.add('completed');
    stepProgress.classList.add('completed');
    if (dot2) dot2.innerHTML = '✓';
    line2.classList.add('completed');
    stepWaiting.classList.add('completed');
    if (dot3) dot3.innerHTML = '✓';
    line3.classList.add('completed');
    stepClosed.classList.add('active');
    if (dot4) dot4.innerHTML = '✕';
    const cleanNotes = (c.resolution_notes || 'Request rejected according to company policy.').replace('[REJECTED] ', '');
    if (descEl) {
      descEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="font-size: 11px; font-weight: 800; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; padding: 2px 7px; border-radius: 4px;">DETERMINATION: REJECTED</span>
          <span style="color: #DC2626; font-size: 12.5px; font-weight: 600;">${escapeHtml(cleanNotes)}</span>
        </div>
      `;
    }
    actionsEl.innerHTML = `
      <button class="btn-workflow btn-workflow-reopen" onclick="reopenCase()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        <span>Reopen for Review</span>
      </button>
    `;
  }
}

async function startWorkingOnCase() {
  if (!currentCase) return;

  const prof = currentCase.hrms_profile || {};
  const isVerified = currentCase.is_profile_verified;
  const hasEmpCode = (currentCase.employee_code && currentCase.employee_code !== '—') || (prof.employee_code && prof.employee_code !== '—');
  const hasManager = currentCase.manager || prof.manager;
  const hasDept = currentCase.department_id;

  // GATING: Prompt agent/head to fill and verify details before starting work!
  if (!isVerified || !hasEmpCode || !hasManager || !hasDept) {
    showToast('Please verify and complete employee details before starting work', 'warning');
    openEmployeeProfileModal(true);
    return;
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        resolution_notes: 'Specialist initiated manual verification and processing on Darwinbox HRMS.',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      if (currentCase.assigned_user_email !== currentUser.email) {
        await fetch(`/api/v1/cases/${currentCase.id}/reassign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department_id: currentCase.department_id,
            user_id: currentUser.id || 1,
            actor_email: currentUser.email,
            actor_name: currentUser.name || 'Desk Specialist'
          })
        });
      }

      showToast('Status changed to IN PROGRESS. Manual verification active.', 'success');
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to start working on case', 'error');
    }
  } catch (err) {
    showToast('Network error while starting work on case', 'error');
  }
}

/**
 * Stage 2: Request Supporting Documents from Employee.
 */
function openRequestDocModal() {
  if (!currentCase) return;
  const modal = document.getElementById('requestDocModal');
  const numDisplay = document.getElementById('requestDocModalNum');
  if (numDisplay) numDisplay.innerText = `#${currentCase.case_number}`;

  const select = document.getElementById('requestDocTemplateSelect');
  if (select) select.value = 'id_proof';
  onSelectDocTemplate('id_proof');

  if (modal) modal.style.display = 'flex';
}

function closeRequestDocModal() {
  const modal = document.getElementById('requestDocModal');
  if (modal) modal.style.display = 'none';
}

function onSelectDocTemplate(templateKey) {
  const textarea = document.getElementById('requestDocMessageText');
  if (!textarea || !currentCase) return;

  const empName = currentCase.employee_name || 'Colleague';
  const templates = {
    id_proof: `Dear ${empName},\n\nTo verify and process your inquiry regarding "${currentCase.title}", kindly reply to this email with a clear photo or scanned copy of your 1mg Employee ID Card along with your Department Name.\n\nOnce received, our operations team will proceed with the regularization.\n\nWarm regards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    punch_proof: `Dear ${empName},\n\nWe are reviewing your attendance regularization request for "${currentCase.title}". As per HR compliance guidelines, please share supporting proof of your presence (e.g. email confirmation from your Reporting Manager, or manual entry timestamp from the facility security desk register).\n\nThank you,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    bank_stmt: `Dear ${empName},\n\nRegarding your payroll inquiry "${currentCase.title}", please provide your bank account statement snippet showing the salary deposit transaction or deduction entry for verification against our central payroll register.\n\nRegards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg Payroll Desk`,
    medical_receipt: `Dear ${empName},\n\nTo validate your reimbursement/claim request for "${currentCase.title}", please attach the original hospital/pharmacy invoice bill and doctor prescription.\n\nThank you,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Desk`,
    custom: `Dear ${empName},\n\nRegarding your ticket "${currentCase.title}", please provide the following additional information/documents:\n\n1. [Please specify requirement here]\n\nThank you,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`
  };

  textarea.value = templates[templateKey] || templates.id_proof;
}

async function submitDocRequest() {
  if (!currentCase) return;
  const textarea = document.getElementById('requestDocMessageText');
  const message = (textarea?.value || '').trim();

  if (!message) {
    showToast('Please enter the document request message to the employee', 'error');
    return;
  }

  const btn = document.getElementById('btnSendDocRequest');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Dispatching Request...';
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        reply_type: 'PUBLIC_REPLY',
        new_status: 'WAITING_ON_EMPLOYEE',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Document request sent to employee! Status set to WAITING ON EMPLOYEE.', 'success');
      closeRequestDocModal();
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to dispatch document request', 'error');
    }
  } catch (err) {
    showToast('Network error while requesting documents', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Send Request & Set Waiting';
    }
  }
}

/**
 * Stage 3 / 4: Approve & Resolve Case.
 */
function openApproveModal() {
  if (!currentCase) return;
  const modal = document.getElementById('approveCaseModal');
  const numDisplay = document.getElementById('approveModalNum');
  if (numDisplay) numDisplay.innerText = `#${currentCase.case_number}`;

  const select = document.getElementById('approvePresetSelect');
  if (select) select.value = 'attendance_approved';
  onSelectApprovePreset('attendance_approved');

  if (modal) modal.style.display = 'flex';
}

function closeApproveModal() {
  const modal = document.getElementById('approveCaseModal');
  if (modal) modal.style.display = 'none';
}

function onSelectApprovePreset(presetKey) {
  const textarea = document.getElementById('approveRemarksText');
  if (!textarea || !currentCase) return;

  const empName = currentCase.employee_name || 'Colleague';
  const presets = {
    attendance_approved: `Dear ${empName},\n\nWe have verified your request against the facility turnstile logs and successfully regularized your attendance swipe in the Darwinbox HRMS master. No salary deduction or penalty will occur.\n\nWarm regards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    payslip_dispatched: `Dear ${empName},\n\nYour salary statement slip has been verified with payroll operations and generated. Please find the confirmed details updated on your employee portal.\n\nRegards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg Payroll Operations`,
    tds_approved: `Dear ${empName},\n\nYour TDS investment declaration proof has been approved. The tax deduction adjustment will reflect in your upcoming payroll cycle statement.\n\nBest regards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg Finance Desk`,
    general_approved: `Dear ${empName},\n\nWe are pleased to inform you that your request regarding "${currentCase.title}" has been reviewed, approved, and completed in our systems.\n\nWarm regards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`
  };

  textarea.value = presets[presetKey] || presets.attendance_approved;
}

async function submitApproveCase() {
  if (!currentCase) return;
  const textarea = document.getElementById('approveRemarksText');
  const remarks = (textarea?.value || '').trim() || 'Approved by Desk Specialist';

  const btn = document.getElementById('btnConfirmApprove');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Approving Case...';
  }

  try {
    await fetch(`/api/v1/cases/${currentCase.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: remarks,
        reply_type: 'PUBLIC_REPLY',
        new_status: 'RESOLVED',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const res = await fetch(`/api/v1/cases/${currentCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolution_notes: `[APPROVED] ${remarks}`,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Case #${currentCase.case_number} Approved & Resolved!`, 'success');
      closeApproveModal();
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to approve case', 'error');
    }
  } catch (err) {
    showToast('Network error while approving case', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Confirm Approval & Resolve';
    }
  }
}

/**
 * Stage 3 / 4: Reject & Close Case.
 */
function openRejectModal() {
  if (!currentCase) return;
  const modal = document.getElementById('rejectCaseModal');
  const numDisplay = document.getElementById('rejectModalNum');
  if (numDisplay) numDisplay.innerText = `#${currentCase.case_number}`;

  const select = document.getElementById('rejectReasonSelect');
  if (select) select.value = 'policy_mismatch';
  onSelectRejectReason('policy_mismatch');

  if (modal) modal.style.display = 'flex';
}

function closeRejectModal() {
  const modal = document.getElementById('rejectCaseModal');
  if (modal) modal.style.display = 'none';
}

function onSelectRejectReason(reasonKey) {
  const textarea = document.getElementById('rejectRemarksText');
  if (!textarea || !currentCase) return;

  const empName = currentCase.employee_name || 'Colleague';
  const reasons = {
    policy_mismatch: `Dear ${empName},\n\nAfter reviewing your request for "${currentCase.title}", we regret to inform you that it cannot be approved as it was submitted beyond the monthly payroll regularization cut-off deadline as outlined in company HR policy.\n\nRegards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    turnstile_mismatch: `Dear ${empName},\n\nWe have cross-referenced the biometric security swipe logs at the facility turnstile for the specified date, and no corresponding access log was found. Hence, we are unable to approve this regularization request.\n\nRegards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    missing_docs: `Dear ${empName},\n\nDue to the lack of required supporting documentation/proof, your inquiry regarding "${currentCase.title}" could not be validated and has been closed. You may log a fresh request with the necessary attachments.\n\nThank you,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    duplicate_case: `Dear ${empName},\n\nThis inquiry regarding "${currentCase.title}" has been flagged as a duplicate submission of an existing or previously resolved ticket. This ticket has now been closed.\n\nRegards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
    other: `Dear ${empName},\n\nUpon manual verification, we are unable to process your request regarding "${currentCase.title}".\n\nRegards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`
  };

  textarea.value = reasons[reasonKey] || reasons.policy_mismatch;
}

async function submitRejectCase() {
  if (!currentCase) return;
  const select = document.getElementById('rejectReasonSelect');
  const textarea = document.getElementById('rejectRemarksText');
  const reasonText = select?.options[select.selectedIndex]?.text || 'Policy Non-Compliance';
  const remarks = (textarea?.value || '').trim() || reasonText;

  const btn = document.getElementById('btnConfirmReject');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Rejecting Case...';
  }

  try {
    await fetch(`/api/v1/cases/${currentCase.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: remarks,
        reply_type: 'PUBLIC_REPLY',
        new_status: 'CLOSED',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const res = await fetch(`/api/v1/cases/${currentCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'CLOSED',
        resolution_notes: `[REJECTED: ${reasonText}] ${remarks}`,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Case #${currentCase.case_number} Rejected and Closed.`, 'info');
      closeRejectModal();
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to reject case', 'error');
    }
  } catch (err) {
    showToast('Network error while rejecting case', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Confirm Rejection & Close';
    }
  }
}

async function resumeVerification() {
  if (!currentCase) return;

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        resolution_notes: 'Specialist resumed manual verification on Darwinbox HRMS.',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Resumed manual verification (IN PROGRESS)', 'success');
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to resume verification', 'error');
    }
  } catch (err) {
    showToast('Error resuming verification', 'error');
  }
}

async function reopenCase() {
  if (!currentCase) return;

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        resolution_notes: 'Case reopened by desk specialist for additional review.',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Case reopened for review (IN PROGRESS)', 'info');
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to reopen case', 'error');
    }
  } catch (err) {
    showToast('Error reopening case', 'error');
  }
}

/**
 * Renders Inbound Inquiry card.
 */
function renderInboundInquiry(c) {
  const fromEl = document.getElementById('inquiryFrom');
  const toEl = document.getElementById('inquiryTo');
  const catEl = document.getElementById('inquiryCategoryTag');
  const recEl = document.getElementById('inquiryReceived');
  const subjEl = document.getElementById('inquirySubject');
  const bodyEl = document.getElementById('inquiryBodyText');

  const avatarEl = document.getElementById('inquirySenderAvatar');
  const nameEl = document.getElementById('inquirySenderName');
  const emailEl = document.getElementById('inquiryFromEmail');
  const toAddrEl = document.getElementById('inquiryToAddress');
  const recDateEl = document.getElementById('inquiryReceivedDate');
  const catPillEl = document.getElementById('inquiryCategoryPill');
  const ingestPillEl = document.getElementById('inquiryVerifiedIngestPill');

  const senderEmail = c.personal_email || c.employee_email || 'staff@1mg.com';
  const senderName = c.employee_name || 'Tata 1mg Staff';

  if (avatarEl) avatarEl.innerText = (senderName[0] || 'V').toUpperCase();
  if (nameEl) nameEl.innerText = senderName;
  if (emailEl) emailEl.innerText = senderEmail;
  if (toAddrEl) toAddrEl.innerText = `${c.assigned_team || 'People Desk'} <people.ops@1mg.com>`;
  
  const createdDate = c.created_at ? new Date(c.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Recent Ingest';
  if (recDateEl) recDateEl.innerText = createdDate;
  if (recEl) recEl.innerText = createdDate;
  
  const deptName = (c.department_name || 'PEOPLE DESK').toUpperCase();
  if (catPillEl) catPillEl.innerText = deptName;
  if (catEl) catEl.innerText = `Category: ${c.department_name || 'People Desk'}`;

  if (ingestPillEl) {
    if (c.is_profile_verified) {
      ingestPillEl.innerHTML = '✓ Verified Corporate Ingest';
      ingestPillEl.style.background = '#ECFDF5';
      ingestPillEl.style.color = '#059669';
      ingestPillEl.style.borderColor = '#A7F3D0';
    } else {
      ingestPillEl.innerHTML = '⚠️ External Inbound Ingest';
      ingestPillEl.style.background = '#FFFBEB';
      ingestPillEl.style.color = '#D97706';
      ingestPillEl.style.borderColor = '#FDE68A';
    }
  }

  if (fromEl) fromEl.innerText = `${senderName} <${senderEmail}>`;
  if (toEl) toEl.innerText = `${c.assigned_team || 'People Desk'} <people.ops@1mg.com>`;
  if (subjEl) subjEl.innerText = c.title || 'Inbound Inquiry';
  if (bodyEl) bodyEl.innerText = c.description || 'No description provided in message.';
}

/**
 * function renderConversationThread(c, logs) {
  const listEl = document.getElementById('conversationStreamList');
  const countLabel = document.getElementById('threadCountLabel');
  if (!listEl) return;

  const threadItems = [];

  // 1. Initial Inbound Email
  threadItems.push({
    type: 'INBOUND',
    actor: c.employee_name || 'Employee',
    email: c.employee_email,
    time: c.created_at,
    title: c.title,
    message: c.description
  });

  // 2. Replies and internal notes from audit logs
  (logs || []).forEach(log => {
    let details = {};
    try {
      details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
    } catch (e) {}

    if (log.action === 'REPLY_SENT') {
      threadItems.push({
        type: 'REPLY',
        actor: log.actor_name || 'Desk Specialist',
        email: log.actor_email || 'people.ops@1mg.com',
        time: log.created_at,
        message: details.message || ''
      });
    } else if (log.action === 'INTERNAL_NOTE') {
      threadItems.push({
        type: 'NOTE',
        actor: log.actor_name || 'Agent',
        email: log.actor_email || 'desk.team@1mg.com',
        time: log.created_at,
        message: details.message || ''
      });
    }
  });

  if (countLabel) {
    countLabel.innerText = `${threadItems.length} message${threadItems.length === 1 ? '' : 's'} in thread`;
  }

  listEl.innerHTML = threadItems.map((item, idx) => {
    const isEmployee = item.type === 'INBOUND';
    const isReply = item.type === 'REPLY';
    const isNote = item.type === 'NOTE';

    const bubbleClass = isEmployee ? 'employee-inbound' : isReply ? 'agent-reply' : 'internal-note';
    const actorIcon = isEmployee
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
      : isReply
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B190" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';

    const label = isEmployee ? 'Inbound Query (Corporate Ingest)' : isReply ? 'Dispatched Response to Employee' : 'Internal Desk Note';
    const timeFormatted = item.time ? new Date(item.time).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }) : 'Recent';

    return `
      <div class="thread-bubble ${bubbleClass}">
        <div class="thread-bubble-header">
          <div class="thread-actor">
            ${actorIcon}
            <span>${escapeHtml(item.actor)} (${escapeHtml(item.email)})</span>
            <span style="font-weight: 500; color: #64748B;">· ${label}</span>
          </div>
          <div class="thread-time">${timeFormatted}</div>
        </div>
        ${item.title ? `<div style="font-weight: 700; color: #0F172A; margin-bottom: 4px;">${escapeHtml(item.title)}</div>` : ''}
        <div style="white-space: pre-wrap; color: #334155;">${escapeHtml(item.message || '')}</div>
      </div>
    `;
  }).join('');

  // Scroll to bottom of thread
  listEl.scrollTop = listEl.scrollHeight;
}

/**
 * Sets composer mode (Public reply vs Internal note).
 */
function setComposerMode(mode) {
  activeComposerMode = mode;
  const btnPublic = document.getElementById('modePublicBtn');
  const btnInternal = document.getElementById('modeInternalBtn');
  const textarea = document.getElementById('composerTextarea');
  const sendLabel = document.getElementById('btnSendReplyText');

  if (btnPublic) btnPublic.classList.toggle('active', mode === 'PUBLIC_REPLY');
  if (btnInternal) btnInternal.classList.toggle('active', mode === 'INTERNAL_NOTE');

  if (mode === 'INTERNAL_NOTE') {
    if (textarea) {
      textarea.placeholder = 'Type private internal note for HR desk team... (Employee will NOT see this note)';
      textarea.style.background = '#FFFDF5';
      textarea.style.borderColor = '#FCD34D';
    }
    if (sendLabel) sendLabel.innerText = 'Save Internal Note';
  } else {
    if (textarea) {
      textarea.placeholder = 'Compose official response to employee...';
      textarea.style.background = '#FFFFFF';
      textarea.style.borderColor = '#CBD5E1';
    }
    if (sendLabel) sendLabel.innerText = 'Send Response to Employee';
  }
}

/**
 * Applies canned macros into the composer.
 */
function applyCannedMacro(macroKey) {
  if (!macroKey) return;
  const textarea = document.getElementById('composerTextarea');
  if (!textarea) return;

  const macros = {
    attendance_reg: "Hi,\n\nYour biometric swipe discrepancy has been verified against the physical access turnstile logs and regularized in the attendance system (Darwinbox). No salary or leave deduction will apply.\n\nRegards,\nPeople Desk Operations",
    attendance_shift: "Hello,\n\nYour shift adjustment request has been approved and updated in the master schedule roster.\n\nBest regards,\nPeople Desk Team",
    payroll_tds: "Dear Colleague,\n\nWe have reviewed your TDS deduction calculation. The investment proof rebate will reflect in the upcoming payroll cycle statement.\n\nRegards,\nPayroll Operations Desk",
    request_id: "Dear Employee,\n\nTo proceed with your request, could you please confirm your 1mg Employee ID along with the supporting documentation or screenshot?\n\nThank you,\nPeople Desk",
    resolved: "Dear Colleague,\n\nWe are pleased to inform you that your inquiry has been processed and your case is now resolved. Please let us know if you need any further assistance.\n\nWarm regards,\nTata 1mg People Operations"
  };

  if (macros[macroKey]) {
    textarea.value = macros[macroKey];
    textarea.focus();
    showToast('Quick macro inserted into composer', 'info');
  }
}

/**
 * Keyboard shortcut for composer: Ctrl+Enter or Cmd+Enter.
 */
function setupComposerShortcuts() {
  const textarea = document.getElementById('composerTextarea');
  if (!textarea) return;

  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      dispatchCaseReply();
    }
  });
}

/**
 * Dispatches response or internal note.
 */
async function dispatchCaseReply() {
  if (!currentCase) return;

  const textarea = document.getElementById('composerTextarea');
  const message = (textarea?.value || '').trim();
  const statusSel = document.getElementById('composerStatusSelect');
  const newStatus = statusSel?.value || (activeComposerMode === 'PUBLIC_REPLY' ? 'RESOLVED' : null);

  if (!message) {
    showToast('Please type a message before dispatching', 'error');
    return;
  }

  const btnSend = document.getElementById('btnSendReply');
  if (btnSend) {
    btnSend.disabled = true;
    btnSend.style.opacity = '0.7';
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        reply_type: activeComposerMode,
        new_status: newStatus,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(activeComposerMode === 'PUBLIC_REPLY' ? 'Response sent to employee!' : 'Internal note saved!', 'success');
      if (textarea) textarea.value = '';
      // Reload case details
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to dispatch reply', 'error');
    }
  } catch (err) {
    console.error('Error dispatching reply:', err);
    showToast('Network error while dispatching reply', 'error');
  } finally {
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.style.opacity = '1';
    }
  }
}

/**
 * Renders AI Intent Engine, HRMS Matching, Cockpit, and Smart Drafter.
 */
function renderAiIntelligence(c) {
  const ai = c.ai || c.ai_badge || {};
  const p = c.hrms_profile || {};

  // 1. AI Intent Engine
  const codeEl = document.getElementById('aiIntentCode');
  const titleEl = document.getElementById('aiIntentTitle');
  const confEl = document.getElementById('aiConfidenceBadge');
  const urgEl = document.getElementById('aiUrgencyBadge');
  const slaEl = document.getElementById('aiTargetSla');
  const issueEl = document.getElementById('aiSummaryIssue');
  const reqEl = document.getElementById('aiSummaryRequest');
  const guideEl = document.getElementById('aiActionGuidance');

  if (codeEl) codeEl.innerText = ai.intent_code ? `${ai.intent_code}: ${ai.intent_name?.toUpperCase()}` : 'AI-01: CLASSIFIED INTENT';
  if (titleEl) titleEl.innerText = ai.intent_name || c.category || 'General Inbound Inquiry';
  if (confEl) confEl.innerText = `${ai.confidence || 99.2}% Match`;
  
  const isHighUrgency = (ai.urgency || 'NORMAL').includes('HIGH') || (c.priority || '').toUpperCase() === 'HIGH';
  if (urgEl) {
    urgEl.innerText = isHighUrgency ? 'HIGH URGENCY' : 'NORMAL URGENCY';
    urgEl.style.color = isHighUrgency ? '#EA580C' : '#0284C7';
    urgEl.style.background = isHighUrgency ? '#FFF7ED' : '#F0F9FF';
  }
  if (slaEl) slaEl.innerText = `${ai.sla_target_hours || c.sla_hours || 24} Hours`;

  if (issueEl) issueEl.innerText = ai.summary?.core_issue || c.title || 'Inbound employee inquiry.';
  if (reqEl) reqEl.innerText = ai.summary?.employee_request || 'Verify records in HRMS and assist employee.';

  if (guideEl) {
    guideEl.innerText = ai.recommended_action || `Cross-reference inquiry with Darwinbox ${c.department_name || 'HR'} register and validate transaction records.`;
  }

  // 2. HRMS Entity Matching
  const matchNameEl = document.getElementById('aiMatchEmpName');
  const matchCodeEl = document.getElementById('aiMatchEmpCode');
  const matchDeptEl = document.getElementById('aiMatchDept');
  const matchLocEl = document.getElementById('aiMatchLocation');
  const matchShiftEl = document.getElementById('aiMatchShift');
  const matchBanner = document.getElementById('aiMatchStatusBanner');

  if (matchNameEl) matchNameEl.innerText = c.employee_name || p.employee_name || 'Tata 1mg Colleague';
  if (matchCodeEl) matchCodeEl.innerText = (p.employee_code && p.employee_code !== '—') ? p.employee_code : 'Pending Intake';
  if (matchDeptEl) matchDeptEl.innerText = c.department_name || p.department_name || 'People Desk';
  if (matchLocEl) matchLocEl.innerText = p.location || 'Gurugram HQ';
  if (matchShiftEl) matchShiftEl.innerText = p.shift || 'General Day Shift';

  if (matchBanner) {
    if (p.is_profile_verified || p.is_tata_verified) {
      matchBanner.style.background = '#ECFDF5';
      matchBanner.style.borderColor = '#A7F3D0';
      matchBanner.style.color = '#059669';
      matchBanner.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Directory Verified against Central HRMS</span>`;
    } else {
      matchBanner.style.background = '#FEF2F2';
      matchBanner.style.borderColor = '#FECACA';
      matchBanner.style.color = '#DC2626';
      matchBanner.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>Identity Unverified - Intake Required</span>`;
    }
  }

  // 3. Case & SLA Cockpit Card
  const cockUrgEl = document.getElementById('cockpitUrgencyText');
  const cockSumEl = document.getElementById('cockpitSummaryText');
  const cockBtnWrap = document.getElementById('cockpitActionBtnWrap');

  if (cockUrgEl) {
    cockUrgEl.innerText = ai.urgency || (isHighUrgency ? 'HIGH (Immediate Action Recommended)' : 'NORMAL (Standard SLA)');
  }
  if (cockSumEl) {
    cockSumEl.innerText = ai.summary?.core_issue || c.title || 'Inbound employee inquiry.';
  }

  if (cockBtnWrap) {
    const status = (c.status || 'OPEN').toUpperCase();
    if (status === 'OPEN') {
      cockBtnWrap.innerHTML = `
        <button class="btn-primary" style="width: 100%; height: 36px; background: var(--1mg-orange); display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="startWorkingOnCase()">
          <span>⚡ Start Working on Case</span>
        </button>
      `;
    } else if (status === 'IN_PROGRESS') {
      cockBtnWrap.innerHTML = `
        <button class="btn-secondary" style="width: 100%; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="openRequestDocModal()">
          <span>📄 Request Documents / Info</span>
        </button>
      `;
    } else if (status === 'WAITING_ON_EMPLOYEE') {
      cockBtnWrap.innerHTML = `
        <button class="btn-secondary" style="width: 100%; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="resumeVerification()">
          <span>🔄 Resume Manual Verification</span>
        </button>
      `;
    } else {
      cockBtnWrap.innerHTML = `
        <button class="btn-secondary" style="width: 100%; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="reopenCase()">
          <span>↩️ Reopen for Review</span>
        </button>
      `;
    }
  }

  // 4. Response Studio (Smart Drafter) - Multi-tone resolution
  if (ai.tones && Object.keys(ai.tones).length > 0) {
    aiDraftTones = ai.tones;
  } else {
    const empName = c.employee_name || p.employee_name || 'Colleague';
    const title = c.title || 'your request';
    const dept = c.department_name || 'People Desk';

    aiDraftTones = {
      empathetic: `Dear ${empName},\n\nThank you for reaching out to the Tata 1mg People Desk regarding ticket #${c.case_number || ''} ("${title}"). We understand the importance of this inquiry.\n\nOur operations team has cross-referenced the central HRMS records and verified your details. The necessary updates have been processed in the system.\n\nWarm regards,\n${currentUser.name || 'People Desk Specialist'}\n${dept} · Tata 1mg`,
      concise: `Hi ${empName},\n\nYour request regarding "${title}" has been verified and processed in the system. Please allow 15 minutes for self-service portal sync.\n\nBest regards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`,
      verify_docs: `Dear ${empName},\n\nRegarding ticket #${c.case_number || ''} ("${title}"), kindly share your employee token verification or manager approval email so our desk can finalize the update.\n\nThank you,\n${dept} · Tata 1mg`
    };
  }

  switchAiTone('empathetic');
}

function switchAiTone(toneKey, el) {
  document.querySelectorAll('.tone-selector-strip .btn-tone').forEach(b => b.classList.remove('active'));
  if (el) {
    el.classList.add('active');
  } else {
    document.querySelectorAll('.tone-selector-strip .btn-tone').forEach(b => {
      if (b.innerText.toLowerCase().includes(toneKey.substring(0, 4))) b.classList.add('active');
    });
  }

  const box = document.getElementById('aiToneDraftBox');
  if (box && aiDraftTones[toneKey]) {
    box.innerText = aiDraftTones[toneKey];
  }
}

function insertAiDraftIntoComposer() {
  const box = document.getElementById('aiToneDraftBox');
  const textarea = document.getElementById('composerTextarea');
  if (box && textarea) {
    textarea.value = box.innerText;
    textarea.focus();
    showToast('AI draft copied into composer', 'success');
  }
}

async function sendAiDraftDirectly() {
  const box = document.getElementById('aiToneDraftBox');
  const textarea = document.getElementById('composerTextarea');
  if (box && textarea) {
    textarea.value = box.innerText;
  }

  const statusSel = document.getElementById('composerStatusSelect');
  if (statusSel) statusSel.value = 'RESOLVED';

  await dispatchCaseReply();
}

/**
 * Renders Darwinbox 360° HRMS profile card with real database data.
 */
function renderDarwinboxProfile(c) {
  const p = c.hrms_profile || {};

  const nameEl = document.getElementById('sideEmpName');
  const avatarEl = document.getElementById('sideEmpAvatar');
  const deptBadgeEl = document.getElementById('sideEmpDeptBadge');
  const typeBadgeEl = document.getElementById('sideEmpTypeBadge');
  const statusBadgeEl = document.getElementById('sideEmpStatusBadge');
  const activePillEl = document.getElementById('sideEmpActivePill');
  const bannerEl = document.getElementById('sideVerifiedBanner');
  const tokenValEl = document.getElementById('sideTokenVal');

  const codeEl = document.getElementById('sideBentoCode');
  const gradeEl = document.getElementById('sideBentoGrade');
  const locEl = document.getElementById('sideBentoLocation');

  const mgrEl = document.getElementById('sideEmpManager');
  const emailEl = document.getElementById('sideEmpEmail');
  const emailStatusEl = document.getElementById('sideEmpEmailStatus');
  const personalEmailEl = document.getElementById('sideEmpPersonalEmail');
  const mobileEl = document.getElementById('sideEmpMobile');
  const shiftEl = document.getElementById('sideEmpShift');
  const typeEl = document.getElementById('sideEmpType');
  const dirEl = document.getElementById('sideEmpDirectory');

  const empName = c.employee_name || p.employee_name || 'Tata 1mg Staff';
  if (nameEl) nameEl.innerText = empName;
  if (avatarEl) avatarEl.innerText = (empName[0] || 'V').toUpperCase();

  if (deptBadgeEl) {
    deptBadgeEl.innerText = `${c.department_name || p.department_name || 'People Desk'} · Tata 1mg`;
  }

  const isVerified = Boolean(c.is_profile_verified);

  if (typeBadgeEl) {
    typeBadgeEl.innerText = p.employment_type || (isVerified ? 'Permanent (Full-Time)' : 'External Inbound');
  }

  if (statusBadgeEl) {
    if (isVerified) {
      statusBadgeEl.innerHTML = '✓ Verified Active';
      statusBadgeEl.style.color = '#059669';
      statusBadgeEl.style.background = '#ECFDF5';
      statusBadgeEl.style.borderColor = '#A7F3D0';
    } else {
      statusBadgeEl.innerHTML = '⚠️ Intake Pending';
      statusBadgeEl.style.color = '#D97706';
      statusBadgeEl.style.background = '#FFFBEB';
      statusBadgeEl.style.borderColor = '#FDE68A';
    }
  }

  if (activePillEl) {
    if (isVerified) {
      activePillEl.innerHTML = '✓ Active';
      activePillEl.style.color = '#059669';
      activePillEl.style.background = '#ECFDF5';
      activePillEl.style.borderColor = '#A7F3D0';
    } else {
      activePillEl.innerHTML = '⚠️ Intake Pending';
      activePillEl.style.color = '#D97706';
      activePillEl.style.background = '#FFFBEB';
      activePillEl.style.borderColor = '#FDE68A';
    }
  }

  const empCode = (p.employee_code && p.employee_code !== '—') ? p.employee_code : (c.employee_code || null);
  if (tokenValEl) {
    tokenValEl.innerText = empCode ? `Token: ${empCode}` : 'Token: Pending Intake';
  }

  if (bannerEl) {
    if (isVerified) {
      bannerEl.style.background = '#F0FDF4';
      bannerEl.style.borderColor = '#BBF7D0';
      bannerEl.style.color = '#166534';
      bannerEl.innerHTML = `
        <span style="font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Verified Tata 1mg Identity</span>
        </span>
        <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 12.5px; color: #0F172A;" id="sideTokenVal">${empCode ? 'Token: ' + empCode : 'Token: 1MG-10234'}</span>
      `;
    } else {
      bannerEl.style.background = '#FFFBEB';
      bannerEl.style.borderColor = '#FDE68A';
      bannerEl.style.color = '#92400E';
      bannerEl.innerHTML = `
        <span style="font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span>Specialist Intake Verification Required</span>
        </span>
        <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 12.5px; color: #0F172A;" id="sideTokenVal">${empCode ? 'Token: ' + empCode : 'Token: Pending'}</span>
      `;
    }
  }

  if (codeEl) codeEl.innerText = empCode || '—';
  if (gradeEl) gradeEl.innerText = p.grade || '—';
  if (locEl) locEl.innerText = p.location || 'Gurugram HQ';

  if (mgrEl) mgrEl.innerText = c.manager || p.manager || 'People Operations Lead';

  const compEmail = c.company_email || p.company_email || (p.corporate_email && p.corporate_email.includes('@1mg.com') ? p.corporate_email : null);
  if (emailEl) {
    if (compEmail) {
      emailEl.innerText = compEmail;
      if (emailStatusEl) {
        emailStatusEl.innerText = 'ACTIVE';
        emailStatusEl.style.background = '#ECFDF5';
        emailStatusEl.style.color = '#059669';
      }
    } else {
      emailEl.innerText = 'Not Activated';
      if (emailStatusEl) {
        emailStatusEl.innerText = 'INACTIVE';
        emailStatusEl.style.background = '#F1F5F9';
        emailStatusEl.style.color = '#64748B';
      }
    }
  }

  if (personalEmailEl) personalEmailEl.innerText = c.personal_email || p.personal_email || c.employee_email || '—';
  if (mobileEl) mobileEl.innerText = c.mobile_number || p.mobile_number || '— Not Provided';
  if (shiftEl) shiftEl.innerText = p.shift || 'General Day Shift';
  if (typeEl) typeEl.innerText = p.employment_type || (isVerified ? 'Permanent (Full-Time)' : 'External Inbound');
  if (dirEl) {
    dirEl.innerText = isVerified ? (p.directory_status || 'Active Directory Confirmed') : 'External Ingest (Pending Verification)';
    dirEl.style.color = isVerified ? '#059669' : '#D97706';
  }
}

/**
 * function renderAuditTimeline(logs) {
  const stream = document.getElementById('auditTimelineStream');
  const countLabel = document.getElementById('auditEventsCountLabel');
  if (!stream) return;

  const total = (logs || []).length;
  if (countLabel) countLabel.innerText = `${total} logged event${total === 1 ? '' : 's'}`;

  if (!logs || logs.length === 0) {
    stream.innerHTML = `<div style="color: #64748B; font-size: 13px; padding: 20px 0;">No audit actions recorded yet.</div>`;
    return;
  }

  stream.innerHTML = logs.map((log) => {
    let details = {};
    try {
      details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
    } catch (e) {}

    const isReply = log.action === 'REPLY_SENT';
    const isNote = log.action === 'INTERNAL_NOTE';
    const dotColor = isReply ? '#10B190' : isNote ? '#D97706' : 'var(--1mg-orange)';

    const timeFormatted = log.created_at ? new Date(log.created_at).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }) : 'Recent';

    let detailsCard = '';
    if (details.message) {
      detailsCard = `
        <div style="margin-top: 6px; background: ${isNote ? '#FFFDF5' : '#F8FAFC'}; border: 1px solid ${isNote ? '#FDE68A' : '#E2E8F0'}; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #334155; white-space: pre-wrap;">
          ${escapeHtml(details.message)}
        </div>
      `;
    }

    return `
      <div class="audit-node">
        <div class="audit-dot" style="background: ${dotColor}; box-shadow: 0 0 0 2px ${dotColor};"></div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px;">
          <div style="font-size: 13px; font-weight: 800; color: #0F172A;">${escapeHtml(formatAuditAction(log))}</div>
          <div style="font-size: 11.5px; color: #64748B;">${timeFormatted}</div>
        </div>
        <div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">
          By <strong>${escapeHtml(log.actor_name || 'System')}</strong> (${escapeHtml(log.actor_email || 'system@1mg.com')})
        </div>
        ${detailsCard}
      </div>
    `;
  }).join('');
}

/**
 * Primary Tab Switcher: Info vs Audit.
 */
function switchCaseTab(tabKey) {
  const tabInfoBtn = document.getElementById('tabInfoBtn');
  const tabAuditBtn = document.getElementById('tabAuditBtn');
  const tabInfoPane = document.getElementById('tabInfoPane');
  const tabAuditPane = document.getElementById('tabAuditPane');

  if (tabKey === 'info') {
    tabInfoBtn?.classList.add('active');
    tabAuditBtn?.classList.remove('active');
    if (tabInfoPane) tabInfoPane.style.display = 'block';
    if (tabAuditPane) tabAuditPane.style.display = 'none';
  } else {
    tabInfoBtn?.classList.remove('active');
    tabAuditBtn?.classList.add('active');
    if (tabInfoPane) tabInfoPane.style.display = 'none';
    if (tabAuditPane) tabAuditPane.style.display = 'block';
  }
}

/**
 * Claims current case to logged in agent.
 */
async function claimThisCase() {
  if (!currentCase) return;

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: currentCase.department_id,
        user_id: currentUser.id || 1,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Case #${currentCase.case_number} claimed by you!`, 'success');
      await loadCaseDetails(currentCase.id);
    } else {
      showToast('Failed to claim case', 'error');
    }
  } catch (err) {
    showToast('Error claiming case', 'error');
  }
}

/**
 * Reassign Modal Controller.
 */
async function openReassignModal() {
  if (!currentCase) return;
  const modal = document.getElementById('reassignModal');
  const numDisplay = document.getElementById('reassignModalNum');
  if (numDisplay) numDisplay.innerText = `#${currentCase.case_number}`;

  const deptSelect = document.getElementById('reassignDeptSelect');
  if (deptSelect) {
    let html = `<option value="">Select Department Desk...</option>`;
    allDepartments.forEach(d => {
      const selected = currentCase.department_id === d.id ? 'selected' : '';
      html += `<option value="${d.id}" ${selected}>${escapeHtml(d.name || d.team_name)}</option>`;
    });
    deptSelect.innerHTML = html;
  }

  await populateSpecialistsForDept();
  if (modal) modal.style.display = 'flex';
}

function closeReassignModal() {
  const modal = document.getElementById('reassignModal');
  if (modal) modal.style.display = 'none';
}

async function populateSpecialistsForDept() {
  const deptSelect = document.getElementById('reassignDeptSelect');
  const userSelect = document.getElementById('reassignUserSelect');
  if (!deptSelect || !userSelect) return;

  const deptId = deptSelect.value;
  userSelect.innerHTML = `<option value="">Loading specialists...</option>`;

  try {
    let url = `/api/v1/admin/users?page=1&limit=100&status=ACTIVE`;
    if (deptId) url += `&department_id=${deptId}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success && data.users && data.users.length > 0) {
      userSelect.innerHTML = data.users.map(u => `
        <option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.designation || u.role)})</option>
      `).join('');
    } else {
      userSelect.innerHTML = `<option value="">Central Desk Pool / Unassigned</option>`;
    }
  } catch (err) {
    userSelect.innerHTML = `<option value="">Central Desk Pool / Unassigned</option>`;
  }
}

async function submitReassign() {
  if (!currentCase) return;

  const deptSelect = document.getElementById('reassignDeptSelect');
  const userSelect = document.getElementById('reassignUserSelect');
  const deptId = deptSelect?.value ? parseInt(deptSelect.value) : null;
  const userId = userSelect?.value ? parseInt(userSelect.value) : null;

  const btn = document.getElementById('btnSaveReassign');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Saving...';
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: deptId,
        user_id: userId,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Case reassigned successfully!', 'success');
      closeReassignModal();
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to reassign case', 'error');
    }
  } catch (err) {
    showToast('Error reassigning case', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Save Reassignment';
    }
  }
}

/**
 * Resolve Modal Controller.
 */
function openResolveModal() {
  if (!currentCase) return;
  const modal = document.getElementById('resolveModal');
  const numDisplay = document.getElementById('resolveModalNum');
  const notesText = document.getElementById('resolveNotesText');

  if (numDisplay) numDisplay.innerText = `#${currentCase.case_number}`;
  if (notesText) notesText.value = '';
  if (modal) modal.style.display = 'flex';
}

function closeResolveModal() {
  const modal = document.getElementById('resolveModal');
  if (modal) modal.style.display = 'none';
}

async function submitResolve() {
  if (!currentCase) return;

  const notesText = document.getElementById('resolveNotesText');
  const notes = (notesText?.value || '').trim() || 'Resolved by Desk Specialist';

  try {
    const res = await fetch(`/api/v1/cases/${currentCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolution_notes: notes,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Desk Specialist'
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Case marked as Resolved!', 'success');
      closeResolveModal();
      await loadCaseDetails(currentCase.id);
    } else {
      showToast(data.detail || 'Failed to resolve case', 'error');
    }
  } catch (err) {
    showToast('Error resolving case', 'error');
  }
}

/**
 * Utilities & Formatters.
 */
function copyInboundBody() {
  const text = document.getElementById('inquiryBodyText')?.innerText;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Inbound body copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

function handleSignOut() {
  localStorage.removeItem('1mg_user');
  window.location.href = '/';
}

function renderCasePriorityPill(priority) {
  const p = (priority || 'MEDIUM').toUpperCase();
  if (p === 'CRITICAL') {
    return `<span class="exec-pill" style="background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;">CRITICAL</span>`;
  } else if (p === 'HIGH') {
    return `<span class="exec-pill" style="background: #FFF7ED; color: #C2410C; border: 1px solid #FFEDD5;">HIGH</span>`;
  } else if (p === 'MEDIUM') {
    return `<span class="exec-pill" style="background: #EFF6FF; color: #1D4ED8; border: 1px solid #DBEAFE;">MEDIUM</span>`;
  }
  return `<span class="exec-pill" style="background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0;">LOW</span>`;
}

function renderCaseStatusPill(status) {
  const s = (status || 'OPEN').toUpperCase();
  if (s === 'OPEN') {
    return `<span class="exec-pill" style="background: #FFF7ED; color: #C2410C; border: 1px solid #FFEDD5;"><span class="status-dot dot-amber" style="width: 7px; height: 7px; border-radius: 50%; background: #EA580C; display: inline-block;"></span> Open</span>`;
  } else if (s === 'IN_PROGRESS') {
    return `<span class="exec-pill" style="background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;"><span class="status-dot" style="width: 7px; height: 7px; border-radius: 50%; background: #2563EB; display: inline-block;"></span> In Progress</span>`;
  } else if (s === 'WAITING_ON_EMPLOYEE') {
    return `<span class="exec-pill" style="background: #FAF5FF; color: #7E22CE; border: 1px solid #E9D5FF;"><span class="status-dot" style="width: 7px; height: 7px; border-radius: 50%; background: #9333EA; display: inline-block;"></span> Waiting on Employee</span>`;
  } else if (s === 'RESOLVED' || s === 'CLOSED') {
    return `<span class="exec-pill" style="background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;"><span class="status-dot" style="width: 7px; height: 7px; border-radius: 50%; background: #10B190; display: inline-block;"></span> Resolved</span>`;
  }
  return `<span class="exec-pill" style="background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0;">${escapeHtml(status)}</span>`;
}

function formatAuditAction(log) {
  let details = {};
  try {
    details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
  } catch (e) {}

  switch (log.action) {
    case 'CASE_CREATED':
      return `Created case and auto-routed to ${details.department || 'Department'}`;
    case 'AGENT_ASSIGNED':
    case 'AGENT_REASSIGNED':
      return `Reassigned to ${details.assigned_user || 'Agent'} (${details.assigned_team || 'Team'})`;
    case 'STATUS_CHANGED':
      return `Status changed to ${details.new_status || 'updated'}`;
    case 'REPLY_SENT':
      return `Dispatched public reply to employee`;
    case 'INTERNAL_NOTE':
      return `Added private internal desk note`;
    default:
      return log.action;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
