/**
 * TATA 1MG PEOPLE DESK - 360° CASE DOSSIER CONTROLLER
 * Full-page administrative command, AI intelligence, Darwinbox directory, and audit logs.
 */

let currentCase = null;
let currentCaseId = null;
let aiTones = {};
let aiDefaultDraft = '';
let departmentsList = [];
let allSpecialistsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize admin session
  initAdminSession();

  // 2. Extract Case ID from query parameters
  const params = new URLSearchParams(window.location.search);
  currentCaseId = params.get('id') || params.get('case_id');

  if (!currentCaseId) {
    alert('No Case ID specified. Redirecting to Cases Command Center.');
    window.location.href = '/admin.html';
    return;
  }

  // 3. Load Departments and Specialists metadata for reassignment
  await loadMetadata();

  // 4. Fetch full case details
  await loadFullCaseDetails(currentCaseId);
});

function initAdminSession() {
  let user = JSON.parse(localStorage.getItem('1mg_user') || '{}');
  if (!user.email || !user.role || user.role.toUpperCase() !== 'ADMIN') {
    user = {
      id: 1,
      email: 'vaibhavx002@zohomail.in',
      name: 'Vaibhav Yadav',
      role: 'ADMIN',
      designation: 'System Administrator & Head of People Desk'
    };
    localStorage.setItem('1mg_user', JSON.stringify(user));
  }

  const nameEl = document.getElementById('detailsAdminName');
  const emailEl = document.getElementById('detailsAdminEmail');
  const avatarEl = document.getElementById('detailsAdminAvatar');

  if (nameEl) nameEl.innerText = user.name || 'Administrator';
  if (emailEl) emailEl.innerText = user.email || 'vaibhavx002@zohomail.in';
  if (avatarEl) avatarEl.innerText = (user.name || 'A')[0].toUpperCase();
}

function getCurrentAdminActor() {
  try {
    const user = JSON.parse(localStorage.getItem('1mg_user') || '{}');
    return {
      email: user.email || 'vaibhavx002@zohomail.in',
      name: user.name || 'Vaibhav Yadav'
    };
  } catch (e) {
    return {
      email: 'vaibhavx002@zohomail.in',
      name: 'Vaibhav Yadav'
    };
  }
}

async function loadMetadata() {
  try {
    const [deptRes, specRes] = await Promise.all([
      fetch('/api/v1/departments'),
      fetch('/api/v1/cases/specialists-capacity')
    ]);

    const deptData = await deptRes.json();
    if (deptData.success) {
      departmentsList = deptData.departments || [];
    }

    const specData = await specRes.json();
    if (specData.success) {
      allSpecialistsList = specData.specialists || [];
    }
  } catch (err) {
    console.error('Failed to load metadata:', err);
  }
}

async function loadFullCaseDetails(caseId) {
  const loader = document.getElementById('pageLoaderOverlay');
  if (loader) loader.style.display = 'flex';

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();

    if (!data.success || !data.case) {
      alert('Case dossier not found or deleted.');
      window.location.href = '/admin.html';
      return;
    }

    currentCase = data.case;
    const logs = data.audit_logs || [];

    // Populate UI
    renderCaseHeader(currentCase);
    renderBentoTelemetry(currentCase);
    renderInboundQuery(currentCase);
    renderAiActions(currentCase);
    renderAuditTimeline(logs);
    renderHrmsDirectory(currentCase);
    renderSecurityInfo(currentCase);

    if (currentCase.status === 'RESOLVED' || currentCase.status === 'CLOSED' || currentCase.resolution_notes) {
      renderResolutionSummary(currentCase);
    } else {
      const resCard = document.getElementById('resolutionSummaryCard');
      if (resCard) resCard.style.display = 'none';
    }

  } catch (err) {
    console.error('Failed to load case details:', err);
    alert('Failed to load case details.');
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

function renderCaseHeader(c) {
  document.title = `Case #${c.case_number} · Tata 1mg People Desk`;
  document.getElementById('breadcrumbCaseNum').innerText = `Case #${c.case_number}`;
  document.getElementById('heroCaseNumber').innerText = `Case #${c.case_number}`;

  document.getElementById('heroStatusPill').innerHTML = renderCaseStatusPill(c.status);
  document.getElementById('heroPriorityPill').innerHTML = renderCasePriorityPill(c.priority);

  const deptEl = document.getElementById('heroDeptPill');
  if (deptEl) {
    deptEl.innerHTML = `
      <span class="dept-dot-accent" style="background: ${c.color_accent || '#FF6F61'};"></span>
      <span>${escapeHtml(c.department_name || 'Central People Desk')}</span>
    `;
  }

  document.getElementById('heroCaseTitle').innerText = c.title;

  const createdDate = c.created_at ? new Date(c.created_at) : null;
  document.getElementById('heroCreatedTime').innerText = createdDate ? createdDate.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : 'N/A';

  const dueDate = c.due_at ? new Date(c.due_at) : null;
  document.getElementById('heroDueTime').innerText = dueDate ? dueDate.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : 'No SLA set';

  // Turnaround telemetry badge
  const turnaroundEl = document.getElementById('heroTurnaroundBadge');
  if (turnaroundEl) {
    if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
      turnaroundEl.innerHTML = `<span style="color: #059669; font-weight: 700;">✅ Resolution Met</span>`;
    } else if (dueDate && new Date() > dueDate) {
      const diffHours = Math.round((new Date() - dueDate) / (1000 * 60 * 60));
      turnaroundEl.innerHTML = `<span style="color: #DC2626; font-weight: 800; background: #FEF2F2; padding: 2px 7px; border-radius: 4px;">🚨 Breached by ${diffHours}h</span>`;
    } else if (dueDate) {
      const remainingHours = Math.max(0, Math.round((dueDate - new Date()) / (1000 * 60 * 60)));
      turnaroundEl.innerHTML = `<span style="color: #059669; font-weight: 700;">⏱️ ${remainingHours}h remaining to target</span>`;
    } else {
      turnaroundEl.innerText = 'Standard Queue';
    }
  }

  // Hero Resolve Button state
  const btnResolve = document.getElementById('btnHeroResolve');
  if (btnResolve) {
    if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
      btnResolve.disabled = true;
      btnResolve.innerHTML = `<span>✓ Already Resolved</span>`;
      btnResolve.style.opacity = '0.6';
      btnResolve.style.cursor = 'default';
    } else {
      btnResolve.disabled = false;
      btnResolve.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Mark Resolved</span>
      `;
      btnResolve.style.opacity = '1';
      btnResolve.style.cursor = 'pointer';
    }
  }
}

function renderBentoTelemetry(c) {
  // Tile 1: SLA Countdown
  const cdEl = document.getElementById('tileSlaCountdown');
  const exactEl = document.getElementById('tileSlaExactDate');
  const barEl = document.getElementById('tileSlaProgressBar');
  const policyEl = document.getElementById('tileSlaPolicyText');

  if (policyEl) policyEl.innerText = `${c.sla_hours || 24}h Policy Target`;

  if (c.due_at) {
    const due = new Date(c.due_at);
    const now = new Date();
    exactEl.innerText = `Target: ${due.toLocaleDateString('en-IN', {month: 'short', day: 'numeric'})}, ${due.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'})}`;

    if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
      cdEl.innerHTML = `<span style="color: #059669;">Resolved</span>`;
      barEl.style.width = '100%';
      barEl.style.background = '#10B190';
    } else if (now > due) {
      const hoursOver = Math.round((now - due) / (1000 * 60 * 60));
      cdEl.innerHTML = `<span style="color: #DC2626;">🚨 Overdue (${hoursOver}h)</span>`;
      barEl.style.width = '100%';
      barEl.style.background = '#DC2626';
    } else {
      const diffMs = due - now;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      cdEl.innerHTML = `<span style="color: #D97706;">⚠️ ${hours}h ${mins}m left</span>`;

      const created = c.created_at ? new Date(c.created_at) : new Date(due - (24 * 3600 * 1000));
      const totalDuration = due - created;
      const elapsed = now - created;
      const pct = Math.min(100, Math.max(10, Math.round((elapsed / totalDuration) * 100)));
      barEl.style.width = `${pct}%`;
      barEl.style.background = pct > 80 ? '#EF4444' : 'var(--1mg-orange)';
    }
  } else {
    cdEl.innerText = 'No SLA Target';
    exactEl.innerText = 'Standard queue';
    barEl.style.width = '0%';
  }

  // Tile 2: Employee Profile
  document.getElementById('tileEmpName').innerText = c.employee_name || 'Tata 1mg Staff';
  document.getElementById('tileEmpEmail').innerText = c.employee_email;
  const deptText = c.hrms_profile?.department || c.category || 'Central Staff';
  document.getElementById('tileEmpDept').innerText = `Dept: ${deptText}`;
  document.getElementById('tileEmpManager').innerText = `Manager: ${c.hrms_profile?.manager || 'People Desk Lead'}`;

  // Tile 3: AI Intelligence
  const aiObj = c.ai || c.ai_badge || {};
  document.getElementById('tileAiCode').innerText = aiObj.intent_code || 'AI01';
  document.getElementById('tileAiConfidence').innerText = `${aiObj.confidence || 99}% Match`;
  document.getElementById('tileAiIntentTitle').innerText = aiObj.intent_name || c.category || 'Automated Intent';
  document.getElementById('tileAiUrgency').innerText = `Urgency: ${(aiObj.urgency || 'NORMAL').split(' ')[0]}`;

  // Tile 4: Specialist
  document.getElementById('tileSpecialistName').innerText = c.assigned_user || 'Unassigned';
  document.getElementById('tileSpecialistEmail').innerText = c.assigned_user_email || 'Desk Queue';
  document.getElementById('tileSpecialistCapacity').innerText = c.assigned_user ? 'Assigned Case Specialist' : 'Unassigned Queue';
}

function renderInboundQuery(c) {
  document.getElementById('metaFrom').innerText = `${c.employee_name} <${c.employee_email}>`;
  document.getElementById('metaReceived').innerText = c.created_at ? new Date(c.created_at).toLocaleString() : 'N/A';
  document.getElementById('queryDescriptionText').innerText = c.description || 'No description provided in message.';
  document.getElementById('queryCategoryTag').innerText = `Category: ${c.category || c.department_name || 'General'}`;
}

function renderAiActions(c) {
  const ai = c.ai || {};
  const recEl = document.getElementById('aiRecommendedActionText');
  if (recEl) {
    recEl.innerText = ai.recommended_action || 'Review inquiry details and cross-reference biometric logs or payroll statements on Darwinbox HRMS.';
  }

  aiTones = ai.tones || {};
  aiDefaultDraft = ai.ai_draft_reply || '';
}

function injectTone(toneType) {
  const textarea = document.getElementById('replyMessageTextarea');
  if (!textarea) return;

  document.querySelectorAll('.btn-tone').forEach(b => b.classList.remove('active'));

  if (toneType === 'default') {
    textarea.value = aiDefaultDraft || `Dear ${currentCase.employee_name},\n\nWe have reviewed your request regarding "${currentCase.title}" and taken the required action.\n\nWarm regards,\nTata 1mg People Desk`;
  } else if (aiTones[toneType]) {
    textarea.value = aiTones[toneType];
  } else {
    // Fallbacks
    if (toneType === 'empathetic') {
      textarea.value = `Dear ${currentCase.employee_name},\n\nThank you for reaching out to us. We understand this discrepancy causes inconvenience, and we have expedited this query with the department.\n\nBest regards,\nTata 1mg People Desk`;
    } else if (toneType === 'concise') {
      textarea.value = `Hi ${currentCase.employee_name},\n\nYour request regarding "${currentCase.title}" has been verified and processed.\n\nRegards,\nTata 1mg Desk`;
    } else if (toneType === 'verify_docs') {
      textarea.value = `Dear ${currentCase.employee_name},\n\nTo complete this request, please provide the supporting screenshot/document so our team can regularize the record.\n\nRegards,\nTata 1mg Desk`;
    }
  }

  textarea.focus();
}

function applyMacro(macroKey) {
  const textarea = document.getElementById('replyMessageTextarea');
  if (!textarea) return;

  const macros = {
    punch_regularized: "Hi,\n\nYour biometric swipe discrepancy has been verified and regularized in the attendance system (Darwinbox) for the specified date. No leave or salary deduction will occur.\n\nWarm regards,\nTata 1mg Attendance Operations",
    tds_finance: "Hello,\n\nYour Form 12BB tax investment proof and rent receipts have been reviewed and forwarded to the Central Payroll team. Any excess TDS deducted will be adjusted in the upcoming payout cycle.\n\nBest regards,\nTata 1mg Payroll Desk",
    mediclaim_added: "Dear Employee,\n\nYour dependent addition request has been endorsed with Tata AIG. Your updated Group Health Insurance Mediclaim E-Card has been generated and updated on your Darwinbox portal.\n\nRegards,\nTata 1mg Benefits Team",
    bgv_verified: "Hi,\n\nThe background verification partner (AuthBridge) has confirmed receipt of your secondary address documents. Your BGV clearance report is marked as Satisfactory.\n\nWarm regards,\nTata 1mg Onboarding & BGV Desk"
  };

  if (macros[macroKey]) {
    textarea.value = macros[macroKey];
    textarea.focus();
  }
}

async function dispatchCaseReply() {
  const textarea = document.getElementById('replyMessageTextarea');
  const msg = textarea?.value.trim();
  const channelTypeRadio = document.querySelector('input[name="replyChannelType"]:checked');
  const replyType = channelTypeRadio ? channelTypeRadio.value : 'PUBLIC_REPLY';
  const statusTransition = document.getElementById('replyStatusTransitionSelect')?.value || null;
  const btn = document.getElementById('btnDispatchReply');

  if (!msg) {
    alert('Please enter a response message or note before dispatching.');
    return;
  }

  const actor = getCurrentAdminActor();
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/v1/cases/${currentCaseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        reply_type: replyType,
        new_status: statusTransition,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Response Dispatched', `${replyType === 'PUBLIC_REPLY' ? 'Email sent to employee' : 'Supervisory internal note saved'}.`, 'success');
      if (textarea) textarea.value = '';
      await loadFullCaseDetails(currentCaseId);
    } else {
      alert(data.detail || 'Failed to dispatch reply.');
    }
  } catch (err) {
    console.error('Dispatch failed:', err);
    alert('Failed to dispatch message.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderResolutionSummary(c) {
  const card = document.getElementById('resolutionSummaryCard');
  const body = document.getElementById('resolutionSummaryBody');
  if (!card || !body) return;

  card.style.display = 'block';
  body.innerHTML = `
    <div style="margin-bottom: 6px;">
      <strong>Resolved By:</strong> ${escapeHtml(c.resolved_by || 'System Administrator')}
    </div>
    <div style="margin-bottom: 6px;">
      <strong>Closure Timestamp:</strong> ${c.resolved_at ? new Date(c.resolved_at).toLocaleString() : 'N/A'}
    </div>
    <div style="margin-top: 10px; background: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 6px; padding: 12px 14px;">
      <strong>Official Resolution Notes:</strong><br>
      ${escapeHtml(c.resolution_notes || 'Case was reviewed and resolved successfully according to standard Tata 1mg People Desk policy.')}
    </div>
  `;
}

function renderAuditTimeline(logs) {
  const container = document.getElementById('caseAuditTimelineList');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `<div style="font-size: 12.5px; color: var(--text-muted); padding: 12px 0;">No audit records found.</div>`;
    return;
  }

  container.innerHTML = logs.map(l => {
    let detailsHtml = '';
    if (l.details) {
      try {
        const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
        detailsHtml = `
          <div class="timeline-details-card">
            ${Object.entries(d).map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</div>`).join('')}
          </div>
        `;
      } catch (e) {
        detailsHtml = `<div class="timeline-details-card">${escapeHtml(String(l.details))}</div>`;
      }
    }

    return `
      <div class="timeline-node">
        <div class="timeline-dot"></div>
        <div class="timeline-action-title">${escapeHtml(l.action.replace(/_/g, ' '))}</div>
        <div class="timeline-meta-text">
          By <strong>${escapeHtml(l.actor_name || l.actor_email || 'System')}</strong> · ${new Date(l.created_at).toLocaleString('en-IN', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </div>
        ${detailsHtml}
      </div>
    `;
  }).join('');
}

function renderHrmsDirectory(c) {
  const container = document.getElementById('hrmsDirectoryDetails');
  if (!container) return;

  const h = c.hrms_profile || {};
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 6px;">
      <span style="color: #64748B;">Employee Code:</span>
      <strong style="font-family: monospace; color: #0F172A;">${escapeHtml(h.employee_code || 'EMP1023')}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 6px;">
      <span style="color: #64748B;">Department:</span>
      <strong style="color: #0F172A;">${escapeHtml(h.department || c.category || 'Operations')}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 6px;">
      <span style="color: #64748B;">Designation:</span>
      <strong style="color: #0F172A;">${escapeHtml(h.designation || 'Tata 1mg Staff')}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 6px;">
      <span style="color: #64748B;">Branch / Location:</span>
      <strong style="color: #0F172A;">${escapeHtml(h.location || 'Gurugram DC Hub')}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 6px;">
      <span style="color: #64748B;">Reporting Manager:</span>
      <strong style="color: #0F172A;">${escapeHtml(h.manager || 'People Operations Desk')}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 6px;">
      <span style="color: #64748B;">Shift:</span>
      <strong style="color: #0F172A;">${escapeHtml(h.shift || 'General Day Shift')}</strong>
    </div>
    <div style="display: flex; justify-content: space-between;">
      <span style="color: #64748B;">Employment Type:</span>
      <strong style="color: #059669;">${escapeHtml(h.employment_type || 'Permanent (Full-Time)')}</strong>
    </div>
  `;
}

function renderSecurityInfo(c) {
  const idEl = document.getElementById('techCaseId');
  const deptCodeEl = document.getElementById('techDeptCode');
  if (idEl) idEl.innerText = `#${c.id} (${c.case_number})`;
  if (deptCodeEl) deptCodeEl.innerText = c.dept_code || 'DEPT-CENTRAL';
}

// -------------------------------------------------------------
// SLA OVERRIDE MODAL CONTROLLERS
// -------------------------------------------------------------
function openSlaModal() {
  const modal = document.getElementById('slaOverrideModal');
  const caseNumEl = document.getElementById('overrideModalCaseNum');
  const currentDueEl = document.getElementById('overrideModalCurrentDue');
  const reasonInput = document.getElementById('overrideReasonInput');

  if (caseNumEl && currentCase) caseNumEl.innerText = `Case #${currentCase.case_number} · ${currentCase.title}`;
  if (currentDueEl && currentCase) {
    currentDueEl.innerText = `Current Target: ${currentCase.due_at ? new Date(currentCase.due_at).toLocaleString() : 'No SLA set'}`;
  }
  if (reasonInput) reasonInput.value = '';

  if (modal) modal.style.display = 'flex';
}

function closeSlaModal() {
  const modal = document.getElementById('slaOverrideModal');
  if (modal) modal.style.display = 'none';
}

function selectSlaPreset(hours, btn) {
  const input = document.getElementById('overrideHoursInput');
  if (input) input.value = hours;
  document.querySelectorAll('.sla-ext-preset').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function submitSlaOverrideAction() {
  const hours = parseInt(document.getElementById('overrideHoursInput')?.value || '12');
  const reason = document.getElementById('overrideReasonInput')?.value.trim();
  const btn = document.getElementById('btnSubmitSlaOverride');

  if (!reason) {
    alert('Please enter a supervisory justification reason for extending the SLA.');
    return;
  }

  const actor = getCurrentAdminActor();
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/v1/cases/${currentCaseId}/override-sla`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extend_hours: hours,
        reason: reason,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('SLA Extended', data.message, 'success');
      closeSlaModal();
      await loadFullCaseDetails(currentCaseId);
    } else {
      alert(data.detail || 'Failed to override SLA.');
    }
  } catch (err) {
    console.error('SLA override failed:', err);
    alert('Failed to override SLA deadline.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// -------------------------------------------------------------
// REASSIGN MODAL CONTROLLERS
// -------------------------------------------------------------
function openReassignModal() {
  const modal = document.getElementById('reassignModal');
  const deptSelect = document.getElementById('reassignDeptSelect');
  if (!modal || !deptSelect) return;

  deptSelect.innerHTML = departmentsList.map(d => `
    <option value="${d.id}" ${currentCase && currentCase.department_id === d.id ? 'selected' : ''}>
      ${escapeHtml(d.team_name)} (${d.sla_hours || 24}h SLA)
    </option>
  `).join('');

  populateSpecialistsForDept();
  modal.style.display = 'flex';
}

function closeReassignModal() {
  const modal = document.getElementById('reassignModal');
  if (modal) modal.style.display = 'none';
}

function populateSpecialistsForDept() {
  const userSelect = document.getElementById('reassignUserSelect');
  if (!userSelect) return;

  userSelect.innerHTML = allSpecialistsList.map(s => `
    <option value="${s.id}" ${currentCase && currentCase.assigned_user === s.name ? 'selected' : ''}>
      ${escapeHtml(s.name)} — ${escapeHtml(s.capacity_label || 'Active Specialist')} (${s.department_name || 'People Desk'})
    </option>
  `).join('');
}

async function submitReassignAction() {
  const userId = document.getElementById('reassignUserSelect')?.value;
  const btn = document.getElementById('btnSubmitReassign');

  if (!userId) {
    alert('Please select a specialist.');
    return;
  }

  const actor = getCurrentAdminActor();
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/v1/cases/batch-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: [parseInt(currentCaseId)],
        user_id: parseInt(userId),
        actor_email: actor.email,
        actor_name: actor.name
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Specialist Reassigned', data.message, 'success');
      closeReassignModal();
      await loadFullCaseDetails(currentCaseId);
    } else {
      alert(data.detail || 'Failed to reassign specialist.');
    }
  } catch (err) {
    console.error('Reassign failed:', err);
    alert('Failed to reassign specialist.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// -------------------------------------------------------------
// RESOLVE MODAL CONTROLLERS
// -------------------------------------------------------------
function openResolveModal() {
  const modal = document.getElementById('resolveCaseModal');
  const input = document.getElementById('resolveNotesInput');
  if (input) input.value = 'Inquiry resolved successfully with the employee according to People Desk policy.';
  if (modal) modal.style.display = 'flex';
}

function closeResolveModal() {
  const modal = document.getElementById('resolveCaseModal');
  if (modal) modal.style.display = 'none';
}

async function submitResolveAction() {
  const notes = document.getElementById('resolveNotesInput')?.value.trim();
  const btn = document.getElementById('btnConfirmResolve');

  if (!notes) {
    alert('Please enter resolution summary notes.');
    return;
  }

  const actor = getCurrentAdminActor();
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/v1/cases/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: [parseInt(currentCaseId)],
        status: 'RESOLVED',
        resolution_notes: notes,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Case Resolved', 'Official resolution notes recorded and case closed.', 'success');
      closeResolveModal();
      await loadFullCaseDetails(currentCaseId);
    } else {
      alert(data.detail || 'Failed to resolve case.');
    }
  } catch (err) {
    console.error('Resolve failed:', err);
    alert('Failed to mark case as resolved.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// -------------------------------------------------------------
// DELETE CONTROLLER
// -------------------------------------------------------------
async function confirmDeleteCase() {
  if (!confirm(`ADMIN CONFIRMATION: Are you sure you want to permanently delete Case #${currentCase.case_number} and all its audit records?`)) {
    return;
  }

  const actor = getCurrentAdminActor();
  try {
    const res = await fetch('/api/v1/cases/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: [parseInt(currentCaseId)],
        actor_email: actor.email,
        actor_name: actor.name
      })
    });

    const data = await res.json();
    if (data.success) {
      alert(`Case #${currentCase.case_number} has been permanently deleted.`);
      window.location.href = '/admin.html';
    } else {
      alert(data.detail || 'Failed to delete case.');
    }
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Failed to delete case.');
  }
}

// -------------------------------------------------------------
// HELPER FORMATTERS
// -------------------------------------------------------------
function renderCaseStatusPill(status) {
  const map = {
    OPEN: { bg: '#FEF3C7', color: '#B45309', label: 'Open', dot: '#F59E0B' },
    IN_PROGRESS: { bg: '#EFF6FF', color: '#1D4ED8', label: 'In Progress', dot: '#3B82F6' },
    WAITING_ON_EMPLOYEE: { bg: '#F3E8FF', color: '#6D28D9', label: 'Waiting on Employee', dot: '#8B5CF6' },
    RESOLVED: { bg: '#ECFDF5', color: '#047857', label: 'Resolved', dot: '#10B190' },
    CLOSED: { bg: '#F1F5F9', color: '#475569', label: 'Closed', dot: '#64748B' }
  };
  const s = map[status] || { bg: '#F1F5F9', color: '#475569', label: status, dot: '#94A3B8' };
  return `
    <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: ${s.bg}; color: ${s.color}; font-size: 11.5px; font-weight: 800; letter-spacing: 0.2px;">
      <span style="width: 6px; height: 6px; border-radius: 50%; background: ${s.dot};"></span>
      ${s.label}
    </span>
  `;
}

function renderCasePriorityPill(priority) {
  const p = (priority || 'MEDIUM').toUpperCase();
  if (p === 'CRITICAL') {
    return `
      <span style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; font-size: 11px; font-weight: 800;">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #DC2626; animation: pulseBreached 1.5s infinite;"></span>
        CRITICAL
      </span>
    `;
  }
  if (p === 'HIGH') {
    return `<span style="padding: 3px 9px; border-radius: 999px; background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; font-size: 11px; font-weight: 800;">HIGH</span>`;
  }
  if (p === 'MEDIUM') {
    return `<span style="padding: 3px 9px; border-radius: 999px; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; font-size: 11px; font-weight: 800;">MEDIUM</span>`;
  }
  return `<span style="padding: 3px 9px; border-radius: 999px; background: #F8FAFC; color: #64748B; border: 1px solid #E2E8F0; font-size: 11px; font-weight: 800;">LOW</span>`;
}

function showToast(title, msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #FFFFFF;
    border-left: 4px solid ${type === 'success' ? '#10B190' : type === 'error' ? '#EF4444' : '#FF6F61'};
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
    border-radius: 8px;
    padding: 12px 18px;
    min-width: 280px;
    font-size: 13px;
    color: #1E293B;
    pointer-events: auto;
    animation: slideUp 0.2s ease forwards;
  `;
  toast.innerHTML = `
    <div style="font-weight: 800; font-size: 13.5px; color: #0F172A; margin-bottom: 2px;">${escapeHtml(title)}</div>
    <div style="color: #64748B; font-size: 12px;">${escapeHtml(msg)}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

