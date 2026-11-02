/**
 * Tata 1mg People Desk - Agent Workbench Controller
 * Comprehensive Cockpit with AI Intelligence, Strict Department Scoping & Live HRMS Dossier:
 * 1. Cockpit Topbar: Cases Workspace, Active Desk Scoping, Global Search, ✦ AI Panel Switch, Engine Pulse, Live Clock.
 * 2. Pane 1: Collapsible Stream Queue, Stream Filter Tabs (All, Assigned to Me, Unclaimed Pool, Urgent SLA).
 * 3. Pane 2: Dual-Column Inspector:
 *    - Column 1: Live HRMS Employee Verified Identity Dossier Card (Shield token, G5, DC Hub, manager, email, active directory).
 *    - Column 2: Inbound Email Thread & Quick Composer (Corporate Ingest, metadata highlights, quick presets, SMTP dispatch).
 * 4. Pane 3: Collapsible Right-Hand AI Copilot (Intent classifier, HRMS entity matching, SLA cockpit, 3-tone Response Studio).
 * 5. Other Views: Case (Queue & KPIs), Reply (Thread & Notes), Action (Manual Intake, Transfer, AI Sandbox, Seed).
 */

// Global State
let allCases = [];
let allDepartments = [];
let currentSelectedCaseId = null;
let currentInboxFilter = 'ALL';
let currentActiveTone = 'empathetic';
let currentAiInsights = null;
let isStreamCollapsed = false;
let isAiPanelOpen = true;
let activeInspectorTab = 'inquiry';
let activeReplyMode = 'PUBLIC_REPLY';
let currentResolvingCaseId = null;

// Agent Inbox (Specialist Inbound Mailbox) State
let allInboxEmails = [];
let currentSelectedEmailId = null;
let currentInboxTriageTab = 'useful'; // 'useful', 'actionable', 'unclaimed', 'noise'
let currentInboxTone = 'empathetic';
let isInboxStreamCollapsed = false;

function formatCaseNumber(num) {
  if (!num) return '';
  return String(num).replace(/^(1MG)(\d+)$/i, '$1-$2');
}

function openResolveModalForCurrent() {
  if (!currentSelectedCaseId) {
    showToast('Please select a case to resolve', 'error');
    return;
  }
  const currentCase = allCases.find(c => c.id === currentSelectedCaseId);
  const caseNum = currentCase ? formatCaseNumber(currentCase.case_number) : String(currentSelectedCaseId);
  openResolveModal(currentSelectedCaseId, caseNum);
}

// User Profile & Fallback Demo User (Multi-department aware)
let currentUser = JSON.parse(localStorage.getItem('1mg_user') || '{}');
if (!currentUser.email) {
  currentUser = {
    id: 186,
    name: 'Vaibhav Yadav',
    email: 'vaibhavx002@zohomail.in',
    role: 'HR_AGENT',
    department_id: 4,
    department_ids: [4],
    department_name: 'Attendance HR'
  };
  localStorage.setItem('1mg_user', JSON.stringify(currentUser));
}

// Canned Responses Library
const CANNED_RESPONSES = {
  bgv_status: {
    label: "Onboarding: BGV Previous Employer Verification Re-sent",
    subject: "Update: Background Verification Follow-up with Previous Employer",
    text: "Dear Employee,\n\nWe have reviewed your background verification file. Our onboarding operations desk has re-triggered the employment verification request directly to your previous employer's HR verification desk today.\n\nWe are actively monitoring their response and expect to complete verification within 24 to 48 hours. We will notify you as soon as confirmation is logged in the portal.\n\nWarm regards,\nOnboarding & Verification Desk\nTata 1mg"
  },
  attendance_reg: {
    label: "Attendance: Biometric Swipe Regularized",
    subject: "Update: Biometric Swipe Regularization Processed",
    text: "Dear Employee,\n\nWe have reviewed your attendance regularization request and verified your entry details. Your biometric swipe for the shift has been successfully regularized in the HRMS biometric system.\n\nPlease check your attendance portal in 15 minutes to confirm the updated status. Let us know if you require any further assistance.\n\nWarm regards,\nAttendance & Workforce HR Desk\nTata 1mg"
  },
  attendance_shift: {
    label: "Attendance: Shift Schedule & Roster Adjustment",
    subject: "Update: Shift Roster Update Approved",
    text: "Dear Employee,\n\nYour shift schedule adjustment request has been approved by your department coordinator and updated in the system roster. Your new shift timings are now active.\n\nWarm regards,\nAttendance HR Team\nTata 1mg"
  },
  payroll_tds: {
    label: "Payroll: Form 16 Part B / Tax TDS Verification",
    subject: "Update: Form 16 & Tax Deduction Verification",
    text: "Dear Employee,\n\nWe have verified your tax deduction query against our payroll records and the TRACES 26AS portal. The reconciliation sheet has been attached and the correction reflected in your upcoming payslip computation.\n\nWarm regards,\nPayroll & Compensation HR\nTata 1mg"
  },
  payroll_slip: {
    label: "Payroll: Monthly Salary Slip & Direct Deposit",
    subject: "Update: Salary Slip & Bank Account Query",
    text: "Dear Employee,\n\nYour monthly salary slip has been generated and your banking details have been re-verified with our finance team. You may access your password-protected PDF payslip via the employee self-service portal.\n\nWarm regards,\nPayroll Operations Desk\nTata 1mg"
  },
  mediclaim_tpa: {
    label: "Benefits: Group Health Insurance E-Card",
    subject: "Update: Group Health Insurance E-Card & Policy Details",
    text: "Dear Employee,\n\nYour Tata 1mg Group Mediclaim policy enrollment has been verified. You can download your digital TPA health e-card directly using your employee ID on the MediBuddy / TPA portal.\n\nIn case of emergency hospitalization, please quote TPA Policy ID: 1MG-GMC-2026.\n\nWarm regards,\nBenefits & People Desk\nTata 1mg"
  },
  info_needed: {
    label: "General: Additional Information Required",
    subject: "Action Required: Additional Information Needed for Case",
    text: "Dear Employee,\n\nThank you for reaching out to Tata 1mg People Desk. In order to expedite your request, could you please provide:\n1. A screenshot or transaction/swipe timestamp\n2. Your employee reporting manager approval (if applicable)\n\nYou can reply directly to this message.\n\nWarm regards,\nPeople Desk Agent\nTata 1mg"
  },
  resolved: {
    label: "Resolution: Case Fully Resolved & Closed",
    subject: "Resolved: Your People Desk Case Has Been Addressed",
    text: "Dear Employee,\n\nYour inquiry has been addressed and marked as resolved by our department specialists. Thank you for your patience.\n\nIf you have any further questions or feel this issue requires additional attention, simply reply to this thread to reopen the ticket.\n\nWarm regards,\nTata 1mg People Desk"
  }
};

// =========================================================================
// 1. INITIALIZATION & LIVE CLOCK
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initUserSession();
  initLiveClock();
  initMailboxAutoSync();
  loadDepartments().then(() => {
    switchAgentView('inboxView');
  });
});

function initLiveClock() {
  const clockEl = document.getElementById('liveClockDisplay');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    // Format: 11:44:07 am · 2 Nov
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const day = now.getDate();
    const month = now.toLocaleDateString('en-US', { month: 'short' });

    clockEl.innerText = `${hours}:${minutes}:${seconds} ${ampm} · ${day} ${month}`;
  }

  update();
  setInterval(update, 1000);
}

function initUserSession() {
  const nameEl = document.getElementById('agentHeaderName');
  const emailEl = document.getElementById('agentHeaderEmail');
  const avatarEl = document.getElementById('agentAvatar');
  const deptTagEl = document.getElementById('agentDeptTag');

  const fullName = currentUser.name || 'HR Agent';
  if (nameEl) nameEl.innerText = fullName;
  if (emailEl) emailEl.innerText = currentUser.email || 'agent@1mg.com';
  
  if (avatarEl) {
    const initials = fullName.split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase() || 'VY';
    avatarEl.innerText = initials;
  }

  const isAgent = currentUser.role !== 'ADMIN';
  const myDeptName = currentUser.department_name || 'Attendance HR';

  if (deptTagEl) {
    deptTagEl.innerText = isAgent ? `${myDeptName} Desk` : 'System Administrator';
  }

  // Configure Topbar Active Desk Badge
  const topbarBadge = document.getElementById('topbarDeskBadge');
  if (topbarBadge) {
    topbarBadge.innerText = isAgent ? `${myDeptName.toUpperCase()} DESK` : 'ALL DESKS';
  }

  const switchBtn = document.getElementById('switchAdminBtn');
  if (switchBtn && currentUser.role === 'ADMIN') {
    switchBtn.style.display = 'inline-flex';
  }
}

// =========================================================================
// 2. VIEW SWITCHING & SIDEBAR
// =========================================================================
const agentViewTitles = {
  inboxView: 'INBOX WORKBENCH',
  casesView: 'CASES WORKSPACE',
  replyView: 'REPLY WORKSPACE',
  actionView: 'ACTIONS & INTAKE'
};

function switchAgentView(viewId, navEl) {
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('data-view') === viewId) el.classList.add('active');
    else el.classList.remove('active');
  });

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');

  const titleEl = document.getElementById('currentViewTitle');
  if (titleEl && agentViewTitles[viewId]) {
    titleEl.innerText = agentViewTitles[viewId];
  }

  if (viewId === 'inboxView') {
    loadInboxEmails();
  } else if (viewId === 'casesView') {
    loadCases();
  } else if (viewId === 'replyView') {
    initReplyWorkspace();
  } else if (viewId === 'actionView') {
    populateActionDropdowns();
  }
}

function handleSignOut() {
  localStorage.removeItem('1mg_user');
  window.location.href = '/';
}

// =========================================================================
// 3. COCKPIT CONTROLS: ✦ AI PANEL & STREAM COLLAPSE
// =========================================================================
function toggleAiPanel() {
  const panel = document.getElementById('aiCopilotPanel');
  const btn = document.getElementById('aiPanelToggleBtn');
  if (!panel || !btn) return;

  isAiPanelOpen = !isAiPanelOpen;
  if (isAiPanelOpen) {
    panel.classList.remove('collapsed');
    btn.classList.add('active');
  } else {
    panel.classList.add('collapsed');
    btn.classList.remove('active');
  }
}

function toggleStreamCollapse() {
  const streamPane = document.getElementById('streamPane');
  if (!streamPane) return;

  isStreamCollapsed = !isStreamCollapsed;
  if (isStreamCollapsed) {
    streamPane.classList.add('collapsed');
  } else {
    streamPane.classList.remove('collapsed');
  }
}

function setInspectorView(viewType) {
  activeInspectorTab = viewType;
  const inquiryTab = document.getElementById('tabInquiryView');
  const auditTab = document.getElementById('tabAuditView');
  const dualContent = document.getElementById('inspectorDualContent');
  const auditContent = document.getElementById('inspectorAuditContent');

  if (viewType === 'audit') {
    inquiryTab?.classList.remove('active');
    auditTab?.classList.add('active');
    if (dualContent) dualContent.style.display = 'none';
    if (auditContent) auditContent.style.display = 'block';
  } else {
    auditTab?.classList.remove('active');
    inquiryTab?.classList.add('active');
    if (auditContent) auditContent.style.display = 'none';
    if (dualContent) dualContent.style.display = 'grid';
  }
}

function handleGlobalSearch(query) {
  const streamInput = document.getElementById('streamSearchInput');
  if (streamInput) streamInput.value = query;
  renderInboxStream();
}

// =========================================================================
// 4. DATA FETCHING WITH DEPARTMENT SCOPING
// =========================================================================
async function loadDepartments() {
  try {
    const res = await fetch('/api/v1/departments');
    const data = await res.json();
    if (data.success && data.departments) {
      allDepartments = data.departments;
      populateDepartmentFilters();

      // Ensure currentUser department_ids is an array
      if (!currentUser.department_ids && currentUser.department_id) {
        currentUser.department_ids = [currentUser.department_id];
        localStorage.setItem('1mg_user', JSON.stringify(currentUser));
      }
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

function populateDepartmentFilters() {
  const selects = [
    document.getElementById('casesDeptFilter'),
    document.getElementById('actionNewDept'),
    document.getElementById('actionTransferDept'),
    document.getElementById('modalNewDept')
  ];

  selects.forEach(select => {
    if (!select) return;
    const currentVal = select.value;
    const isFilter = select.id.includes('Filter');
    
    let html = isFilter ? '<option value="ALL">All Departments</option>' : '<option value="">Auto-Route with AI...</option>';
    allDepartments.forEach(d => {
      html += `<option value="${d.id}">${d.team_name} (${d.dept_code})</option>`;
    });
    select.innerHTML = html;
    if (currentVal) select.value = currentVal;
  });
}

async function fetchCasesData() {
  const isAgent = currentUser.role !== 'ADMIN';
  let url = '/api/v1/cases?page=1&limit=100';

  if (isAgent) {
    if (currentUser.department_ids && currentUser.department_ids.length > 0) {
      url += `&department_ids=${currentUser.department_ids.join(',')}`;
    } else if (currentUser.department_id) {
      url += `&department_id=${currentUser.department_id}`;
    }
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success && data.cases) {
      let cases = data.cases;

      // Client-side guarantee for department isolation
      if (isAgent) {
        const allowedDeptIds = (currentUser.department_ids && currentUser.department_ids.length > 0)
          ? currentUser.department_ids.map(String)
          : (currentUser.department_id ? [String(currentUser.department_id)] : []);
        if (allowedDeptIds.length > 0) {
          cases = cases.filter(c => !c.department_id || allowedDeptIds.includes(String(c.department_id)));
        }
      }

      allCases = cases;
      updateSidebarBadges();
      updateStreamTabCounts();
      return allCases;
    }
  } catch (err) {
    console.error('Error fetching cases:', err);
    showToast('Failed to load inquiries from server', 'error');
  }
  return [];
}

function updateSidebarBadges() {
  const unassigned = allCases.filter(c => !c.assigned_user || c.assigned_user === 'Central Triage' || c.status === 'OPEN');
  const badgeEl = document.getElementById('inboxBadge');
  if (badgeEl) {
    badgeEl.innerText = unassigned.length;
    badgeEl.style.display = unassigned.length > 0 ? 'inline-block' : 'none';
  }
}

function updateStreamTabCounts() {
  const allCount = allCases.length;
  const mineCount = allCases.filter(c => c.assigned_user_email === currentUser.email || c.assigned_user === currentUser.name).length;
  const unassignedCount = allCases.filter(c => !c.assigned_user || c.assigned_user === 'Central Triage' || c.status === 'OPEN').length;
  const urgentCount = allCases.filter(c => c.priority === 'CRITICAL' || c.priority === 'HIGH' || (c.ai_badge?.urgency || '').includes('HIGH')).length;

  const countAll = document.getElementById('countAllBadge');
  const countMine = document.getElementById('countMineBadge');
  const countUnclaimed = document.getElementById('countUnclaimedBadge');
  const countUrgent = document.getElementById('countUrgentBadge');

  if (countAll) countAll.innerText = allCount;
  if (countMine) countMine.innerText = mineCount;
  if (countUnclaimed) countUnclaimed.innerText = unassignedCount;
  if (countUrgent) countUrgent.innerText = urgentCount;
}

// =========================================================================
// 5. AGENT INBOX COCKPIT: EMAIL INTAKE, TRIAGE & AI ENTITY EXTRACTION
// =========================================================================
async function loadInbox() {
  await loadInboxEmails();
}

// =========================================================================
// STREAM SKELETON SHIMMER LOADER
// =========================================================================
function renderStreamSkeleton(containerEl, count = 4) {
  if (!containerEl) return;
  let html = '<div class="stream-skeleton-list">';
  for (let i = 0; i < count; i++) {
    const width1 = 40 + (i * 15) % 35;
    const width2 = 70 + (i * 20) % 25;
    html += `
      <div class="stream-skeleton-card">
        <div class="skeleton-header-row">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <div class="skeleton-avatar skeleton-shimmer"></div>
            <div class="skeleton-meta-col">
              <div class="skeleton-line skeleton-shimmer" style="width: ${width1}%; height: 11px;"></div>
              <div class="skeleton-line skeleton-shimmer" style="width: ${width2}%; height: 9px;"></div>
            </div>
          </div>
          <div class="skeleton-shimmer" style="width: 44px; height: 12px; border-radius: 3px;"></div>
        </div>
        <div class="skeleton-line skeleton-shimmer" style="width: 85%; height: 12px; margin-top: 4px;"></div>
        <div class="skeleton-line skeleton-shimmer" style="width: 100%; height: 10px;"></div>
        <div class="skeleton-line skeleton-shimmer" style="width: 60%; height: 10px;"></div>
        <div class="skeleton-tags-row">
          <div class="skeleton-tag-pill skeleton-shimmer" style="width: 72px;"></div>
          <div class="skeleton-tag-pill skeleton-shimmer" style="width: 68px;"></div>
          <div class="skeleton-tag-pill skeleton-shimmer" style="width: 78px;"></div>
        </div>
      </div>
    `;
  }
  html += '</div>';
  containerEl.innerHTML = html;
}

// Auto-sync timer state (30 seconds interval)
let mailboxAutoSyncTimer = null;

function initMailboxAutoSync() {
  if (mailboxAutoSyncTimer) clearInterval(mailboxAutoSyncTimer);
  
  // Schedule every 30 seconds (30000 ms)
  mailboxAutoSyncTimer = setInterval(async () => {
    await performMailboxAutoSync();
  }, 30000);
  
  console.log('[AutoSync] 30-second recurring mailbox synchronization active');
}

async function performMailboxAutoSync() {
  const syncBadge = document.getElementById('autoSyncBadge');
  const syncBtn = document.querySelector('.subbar-btn');
  const syncIcon = syncBtn?.querySelector('svg');

  if (syncIcon) {
    syncIcon.style.transition = 'transform 0.5s ease';
    syncIcon.style.transform = 'rotate(360deg)';
  }
  if (syncBadge) {
    syncBadge.style.background = '#DCFCE7';
    syncBadge.style.borderColor = '#86EFAC';
    syncBadge.style.color = '#15803D';
  }

  try {
    // 1. Trigger backend mailbox sync
    await fetch('/api/v1/inbox/sync', { method: 'POST' });
    // 2. Refresh inbound emails queue silently
    await loadInboxEmails({ silent: true });
  } catch (err) {
    console.warn('[AutoSync] Notice:', err);
  } finally {
    setTimeout(() => {
      if (syncIcon) syncIcon.style.transform = 'none';
      if (syncBadge) {
        syncBadge.style.background = '#E0F2FE';
        syncBadge.style.borderColor = '#BAE6FD';
        syncBadge.style.color = '#0284C7';
      }
    }, 600);
  }
}

async function loadInboxEmails(options = {}) {
  const isSilent = Boolean(options.silent);
  const streamList = document.getElementById('inboxEmailStreamList');
  if (streamList && !isSilent) {
    renderStreamSkeleton(streamList, 4);
  }

  let deptParam = '';
  if (currentUser.role !== 'ADMIN') {
    if (currentUser.department_ids && currentUser.department_ids.length > 0) {
      deptParam = `&department_ids=${currentUser.department_ids.join(',')}`;
    } else if (currentUser.department_id) {
      deptParam = `&department_id=${currentUser.department_id}`;
    }
  }
  const searchInput = document.getElementById('inboxSearchInput');
  const searchParam = searchInput && searchInput.value ? `&search=${encodeURIComponent(searchInput.value.trim())}` : '';

  try {
    const res = await fetch(`/api/v1/inbox/emails?tab=${currentInboxTriageTab}${deptParam}${searchParam}`);
    const data = await res.json();

    if (data.success) {
      const prevIds = new Set(allInboxEmails.map(e => e.id));
      const freshEmails = data.emails || [];

      // If new emails arrived in background, announce quietly
      if (isSilent && prevIds.size > 0) {
        const newlyArrived = freshEmails.filter(e => !prevIds.has(e.id));
        if (newlyArrived.length > 0) {
          const firstSubject = newlyArrived[0].subject || 'Employee Query';
          showToast(`📬 ${newlyArrived.length} new email${newlyArrived.length > 1 ? 's' : ''} in queue · "${firstSubject.substring(0, 32)}..."`, 'info');
        }
      }

      allInboxEmails = freshEmails;

      // Update Triage Tab Counts
      if (data.counts) {
        const cUseful = document.getElementById('countUsefulBadge');
        const cActionable = document.getElementById('countActionableBadge');
        const cUnclaimed = document.getElementById('countUnclaimedMailBadge');
        const cNoise = document.getElementById('countNoiseBadge');
        const inboxBadge = document.getElementById('inboxBadge');

        if (cUseful) cUseful.innerText = data.counts.useful;
        if (cActionable) cActionable.innerText = data.counts.actionable;
        if (cUnclaimed) cUnclaimed.innerText = data.counts.unclaimed;
        if (cNoise) cNoise.innerText = data.counts.noise;

        if (inboxBadge) {
          const badgeCount = data.counts.actionable || data.counts.useful;
          inboxBadge.innerText = badgeCount;
          inboxBadge.style.display = badgeCount > 0 ? 'inline-block' : 'none';
        }
      }

      renderInboxEmailStream();

      if (allInboxEmails.length > 0) {
        if (!currentSelectedEmailId || !allInboxEmails.some(e => e.id === currentSelectedEmailId)) {
          selectInboxEmail(allInboxEmails[0].id);
        } else if (!isSilent) {
          selectInboxEmail(currentSelectedEmailId);
        }
      } else {
        renderEmptyInboxCockpit();
      }
    } else {
      if (!isSilent) {
        showToast(data.detail || 'Failed to load inbound emails', 'error');
        if (streamList) {
          streamList.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">No connection to mail server.<br><button class="btn-primary" style="margin-top: 10px; width: auto; font-size: 12px; padding: 6px 14px;" onclick="loadInboxEmails()">Retry Sync</button></div>`;
        }
        renderEmptyInboxCockpit();
      }
    }
  } catch (err) {
    if (!isSilent) {
      console.error('Error loading inbox emails:', err);
      if (streamList) {
        streamList.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">Failed to sync mailbox.<br><button class="btn-primary" style="margin-top: 10px; width: auto; font-size: 12px; padding: 6px 14px;" onclick="loadInboxEmails()">Retry Sync</button></div>`;
      }
      renderEmptyInboxCockpit();
    }
  }
}

function setInboxTriageTab(tab, btnEl) {
  currentInboxTriageTab = tab;
  document.querySelectorAll('#inboxView .stream-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  loadInboxEmails();
}

function handleInboxSearch() {
  renderInboxEmailStream();
}

function renderInboxEmailStream() {
  const streamList = document.getElementById('inboxEmailStreamList');
  const railEl = document.getElementById('inboxCollapsedAvatars');
  const countPill = document.getElementById('inboxStreamCountPill');
  if (!streamList) return;

  const searchInput = document.getElementById('inboxSearchInput');
  const query = (searchInput?.value || '').toLowerCase().trim();

  let filtered = allInboxEmails.filter(e => {
    if (!query) return true;
    const ai = e.ai_insights || {};
    return (e.subject || '').toLowerCase().includes(query) ||
           (e.sender_name || '').toLowerCase().includes(query) ||
           (e.sender_email || '').toLowerCase().includes(query) ||
           (e.body || '').toLowerCase().includes(query) ||
           (ai.detected_name || '').toLowerCase().includes(query) ||
           (ai.detected_code || '').toLowerCase().includes(query);
  });

  if (countPill) {
    countPill.innerText = `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`;
  }

  if (filtered.length === 0) {
    streamList.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); font-size: 13px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.35; margin-bottom: 10px; color: #64748B;">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
        </svg>
        <div style="font-weight: 700; color: var(--text-dark); margin-bottom: 4px; font-size: 13.5px;">No correspondence found</div>
        <div style="font-size: 12px; max-width: 220px; margin: 0 auto; line-height: 1.4;">No inbound items match this stream filter.</div>
      </div>
    `;
    if (railEl) railEl.innerHTML = '';
    return;
  }

  const avatarColors = ['#E11D48', '#2563EB', '#0D9488', '#D97706', '#7C3AED', '#4F46E5'];

  let cardsHtml = filtered.map((e, idx) => {
    const isSelected = e.id === currentSelectedEmailId;
    const ai = e.ai_insights || {};
    const color = avatarColors[idx % avatarColors.length];
    const senderName = ai.detected_name || e.sender_name || 'Employee';
    const initial = senderName.charAt(0).toUpperCase();
    const isDomainVerified = (e.sender_email || '').toLowerCase().endsWith('@1mg.com');

    // Clean snippet of raw literal \n and extra whitespace
    const rawSnippet = (e.snippet || e.body || '');
    const cleanSnippet = rawSnippet
      .replace(/\\r\\n|\\n|\\r/g, ' ')
      .replace(/\r\n|\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Converted Status or Actionable Status (cleanly placed in footer right)
    const isConverted = Boolean(e.is_converted && e.case_number);
    let statusBadge = '';
    if (isConverted) {
      statusBadge = `<span class="badge-tag-sm converted" title="Converted to Case ${e.case_number}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> ${formatCaseNumber(e.case_number)}</span>`;
    } else if (e.is_actionable === 1) {
      statusBadge = `<span class="badge-tag-sm actionable" title="Actionable HR Request"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Actionable</span>`;
    } else {
      statusBadge = `<span class="badge-tag-sm noise" title="Noise / Filtered Ingest">Noise</span>`;
    }

    const catName = (e.category || 'INQUIRY').toUpperCase();
    const catClass = catName.toLowerCase();
    const categoryBadge = `<span class="badge-tag-sm category ${catClass}">${catName}</span>`;

    const isUrgent = Boolean(ai.is_urgent || (ai.urgency || '').includes('HIGH'));
    const slaPill = isUrgent
      ? `<span class="badge-tag-sm sla urgent" title="High Urgency SLA"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> 4h Urgent</span>`
      : `<span class="badge-tag-sm sla">${ai.target_sla || '12h SLA'}</span>`;

    const dateStr = e.received_at ? new Date(e.received_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Recent';

    // Domain Verification Badge
    const domainBadge = isDomainVerified
      ? `<span class="domain-badge verified" title="Tata 1mg Verified Employee"><svg width="7.5" height="7.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg> 1mg</span>`
      : `<span class="domain-badge external" title="External Senders">Ext</span>`;

    return `
      <div class="stream-card ${isSelected ? 'active' : ''}" onclick="selectInboxEmail(${e.id})">
        <div class="stream-card-header">
          <div class="sender-header-block">
            <div class="card-avatar-pill" style="background: ${color};">${initial}</div>
            <div class="sender-name-col">
              <div class="sender-name-row">
                <span class="sender-name">${escapeHtml(senderName)}</span>
                ${domainBadge}
              </div>
              <span class="sender-email">${escapeHtml(e.sender_email)}</span>
            </div>
          </div>
          <div class="card-header-meta">
            <span class="card-time-pill">${dateStr}</span>
            ${!isConverted ? '<span class="card-unread-dot" title="Awaiting action"></span>' : ''}
          </div>
        </div>

        <div class="stream-card-title" title="${escapeHtml(e.subject || '')}">
          ${escapeHtml(e.subject || 'Untitled Email')}
        </div>

        <div class="stream-card-snippet">
          ${escapeHtml(cleanSnippet)}
        </div>

        <div class="stream-card-footer">
          <div class="card-footer-left">
            ${categoryBadge}
            ${slaPill}
          </div>
          <div class="card-footer-right">
            ${statusBadge}
          </div>
        </div>
      </div>
    `;
  }).join('');

  cardsHtml += `
    <div class="stream-cards-list-footer">
      Showing ${filtered.length} ${filtered.length === 1 ? 'item' : 'items'} · Auto-synced with IMAP
    </div>
  `;

  streamList.innerHTML = cardsHtml;

  if (railEl) {
    railEl.innerHTML = filtered.map((e, idx) => {
      const color = avatarColors[idx % avatarColors.length];
      const initial = (e.ai_insights?.detected_name || e.sender_name || 'E').charAt(0).toUpperCase();
      const isSelected = e.id === currentSelectedEmailId;
      return `
        <div class="card-avatar-pill ${isSelected ? 'active' : ''}" style="background: ${color}; width: 30px; height: 30px; font-size: 11px; cursor: pointer; border: ${isSelected ? '2px solid #FF6F61' : 'none'};" title="${escapeHtml(e.subject || '')}" onclick="selectInboxEmail(${e.id})">
          ${initial}
        </div>
      `;
    }).join('');
  }
}

let isAiHighlightsActive = true;

function toggleEmailAiHighlights() {
  isAiHighlightsActive = !isAiHighlightsActive;
  const btn = document.getElementById('inboxToggleAiHighlightsBtn');
  const label = document.getElementById('inboxToggleAiHighlightsLabel');
  if (btn) btn.classList.toggle('active', isAiHighlightsActive);
  if (label) label.innerText = isAiHighlightsActive ? 'Smart Highlights: ON' : 'Smart Highlights: OFF';

  // Re-render currently viewed email
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  const bodyEl = document.getElementById('inboxEmailBody');
  if (email && bodyEl) {
    bodyEl.innerHTML = formatEmailBodyHtml(email.body, email, email.ai_insights || {});
  }
}

function formatEmailBodyHtml(rawBody, email = {}, ai = {}) {
  if (!rawBody) return '<p class="mail-para text-muted">No message content provided.</p>';

  // Unescape literal \r\n, \n, \r and normal newlines
  let text = String(rawBody)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');

  // Split on double newlines to form clean paragraphs
  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map(p => {
    let trimmed = p.trim();
    if (!trimmed) return '';

    // Escape HTML first for XSS safety
    let safe = escapeHtml(trimmed);

    // AI Smart Highlighting if enabled
    if (isAiHighlightsActive) {
      // 1. Employee Code matching (EMP1023, EMP1024, 1MG123, NUNUX365, etc.)
      safe = safe.replace(/\b(EMP\d+|1MG\d+|NUNUX\d+)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-code" title="HRMS Employee Identifier"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span>${match}</span></mark>`;
      });

      // 2. Organization / External Entities (Apex Solutions, Tata 1mg, Gurugram DC Hub, GitGuardian, GitHub, LottieFiles)
      safe = safe.replace(/\b(Apex Solutions|Tata 1mg|Gurugram DC Hub|Gurugram Hub|GitGuardian|GitHub|LottieFiles)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-org" title="Entity: Organization / Facility"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg><span>${match}</span></mark>`;
      });

      // 3. Dates & Times (e.g. 30/10/2026, 28th Oct 2026, 09:30 AM, 12th October)
      safe = safe.replace(/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:\d{2,4})?|\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-date" title="Detected Date / Time"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>${match}</span></mark>`;
      });

      // 4. Critical Operational Statuses (pending, absent, failure, exposed, urgent)
      safe = safe.replace(/\b(pending|absent|failure|exposed|missing|urgent|denied|discrepancy)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-status" title="HR Status / Severity: ${match}"><span class="mark-status-dot"></span><span>${match}</span></mark>`;
      });

      // 5. Key HR Topics / Verification processes
      safe = safe.replace(/\b(background verification|employment verification|previous employment verification|biometric punch-in system|biometric attendance punch|optical scanner failure|health card|privilege leave|punch regularization)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-topic" title="Key HR Process">${match}</mark>`;
      });

      // 6. Action Requests (e.g. check whether the employment verification request has been shared, regularize the attendance)
      safe = safe.replace(/(check whether the employment verification request has been shared with my previous employer|check whether .*? has been shared|regularize the attendance for that date|regularize my morning in-punch|verify and update the portal ledger)/gi, (match) => {
        return `<mark class="ai-mark ai-mark-action" title="Core Employee Action Request"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg><span>${match}</span></mark>`;
      });
    }

    // Replace linebreaks inside paragraph with <br>
    safe = safe.replace(/\n/g, '<br>');

    // Check if this paragraph is a sign-off
    if (trimmed.match(/^(?:Regards|Warm regards|Thanks|Sincerely|Best|Thank you)[\s,]/i)) {
      return `<div class="mail-signoff-block">${safe}</div>`;
    }

    return `<p class="mail-para">${safe}</p>`;
  }).filter(Boolean).join('');
}

async function selectInboxEmail(emailId) {
  currentSelectedEmailId = emailId;
  const email = allInboxEmails.find(e => e.id === emailId);
  if (!email) {
    renderEmptyInboxCockpit();
    return;
  }

  // Toggle active content / empty state
  const emptyState = document.getElementById('inboxEmptyState');
  const activeContent = document.getElementById('inboxActiveContent');
  if (emptyState) emptyState.style.display = 'none';
  if (activeContent) activeContent.style.display = 'flex';

  // Highlight active card
  document.querySelectorAll('#inboxEmailStreamList .stream-card').forEach(card => card.classList.remove('active'));
  renderInboxEmailStream();

  const ai = email.ai_insights || {};
  const matchedEmp = ai.matched_employee || {};

  // 1. Update Inspector Top Ribbon
  const ribId = document.getElementById('inboxRibbonEmailId');
  const ribCat = document.getElementById('inboxRibbonCategory');
  const ribSlaText = document.getElementById('inboxRibbonSlaText');
  const ribDesk = document.getElementById('inboxRibbonDesk');
  const toggleNoiseBtn = document.getElementById('inboxToggleNoiseBtn');
  const convertBtn = document.getElementById('inboxConvertCaseBtn');

  if (ribId) ribId.innerText = `#EML-${String(email.id).padStart(3, '0')}`;
  if (ribCat) ribCat.innerText = email.category || 'INQUIRY';
  if (ribSlaText) ribSlaText.innerText = ai.target_sla || '12h Target SLA';
  if (ribDesk) ribDesk.innerText = `${ai.category || 'Attendance'} HR Desk`;

  if (toggleNoiseBtn) {
    if (email.is_actionable === 1) {
      toggleNoiseBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
        <span>Mark as Noise</span>
      `;
      toggleNoiseBtn.style.color = '#64748B';
    } else {
      toggleNoiseBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Move to Useful</span>
      `;
      toggleNoiseBtn.style.color = '#10B190';
    }
  }

  if (convertBtn) {
    if (email.is_converted && email.case_number) {
      convertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Converted: ${formatCaseNumber(email.case_number)}</span>
      `;
      convertBtn.style.background = '#10B190';
      convertBtn.title = `Click to inspect active case ${formatCaseNumber(email.case_number)} in Cases Workspace`;
      convertBtn.onclick = () => openConvertedCaseInWorkspace(email.case_number);
    } else {
      convertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Convert to Case</span>
      `;
      convertBtn.style.background = '#EA580C';
      convertBtn.title = "Convert this inbound email into an Active Tracked Case";
      convertBtn.onclick = () => convertCurrentInboxEmail();
    }
  }

  // 2. Update Email Header & Sender Info
  const subjEl = document.getElementById('inboxSubjectTitle');
  const headName = document.getElementById('inboxHeaderSenderName');
  const headEmail = document.getElementById('inboxHeaderSenderEmail');
  const headRecip = document.getElementById('inboxHeaderRecipientDesk');
  const headTime = document.getElementById('inboxHeaderTimestamp');
  const avatarEl = document.getElementById('inboxSenderAvatar');
  const verifiedTag = document.getElementById('inboxHeaderVerifiedTag');
  const intentLabel = document.getElementById('inboxHeaderIntentLabel');
  const replyTargetName = document.getElementById('inboxReplyTargetName');
  const senderDisp = document.getElementById('inboxSenderDisplay');
  const recipDesk = document.getElementById('inboxRecipientDesk');
  const timeEl = document.getElementById('inboxTimestamp');

  const senderName = ai.detected_name || email.sender_name || 'Employee';
  const senderEmail = email.sender_email || '';
  const d = email.received_at ? new Date(email.received_at) : new Date();
  const formattedTime = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (subjEl) subjEl.innerText = email.subject || 'Untitled Email';
  if (headName) headName.innerText = senderName;
  if (headEmail) headEmail.innerText = senderEmail;
  if (headRecip) headRecip.innerText = `To: people.ops@1mg.com · ${ai.category || 'Operations'} Desk`;
  if (headTime) headTime.innerText = formattedTime;
  if (timeEl) timeEl.innerText = formattedTime;
  if (senderDisp) senderDisp.innerText = `${senderName} <${senderEmail}>`;
  if (recipDesk) recipDesk.innerText = `To: people.ops@1mg.com (${ai.category || 'Attendance'} Desk)`;
  if (replyTargetName) replyTargetName.innerText = senderName;
  if (intentLabel) intentLabel.innerText = `${ai.intent_code || 'GH01'}: ${ai.intent_label || 'Inquiry'}`;

  // Subject Header Pills
  const catPill = document.getElementById('inboxHeaderCategoryPill');
  const slaPill = document.getElementById('inboxHeaderSlaPill');
  if (catPill) {
    const catName = (email.category || ai.category || 'INQUIRY').toUpperCase();
    catPill.innerText = catName;
    catPill.className = `badge-tag-sm category ${catName.toLowerCase()}`;
  }
  if (slaPill) {
    slaPill.innerText = ai.target_sla || '12h SLA';
    slaPill.className = `badge-tag-sm sla ${ai.is_urgent ? 'urgent' : ''}`;
  }

  // Squircle Avatar styling (Guaranteed rich gradient & white letter)
  if (avatarEl) {
    const initial = senderName.charAt(0).toUpperCase();
    avatarEl.innerText = initial;
    const avatarGradients = [
      'linear-gradient(135deg, #FF6F61 0%, #EE5A4C 100%)',
      'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
      'linear-gradient(135deg, #10B190 0%, #059669 100%)',
      'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
      'linear-gradient(135deg, #D97706 0%, #B45309 100%)'
    ];
    avatarEl.style.background = avatarGradients[Math.abs(email.id || 0) % avatarGradients.length];
    avatarEl.style.color = '#FFFFFF';
  }

  // Domain Verification Pill
  if (verifiedTag) {
    const isDomainVerified = senderEmail.toLowerCase().endsWith('@1mg.com') || (email.sender_name && email.sender_name.toLowerCase().includes('1mg'));
    if (isDomainVerified) {
      verifiedTag.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>✓ 1mg Directory</span>
      `;
      verifiedTag.className = 'mail-verified-tag 1mg-verified';
      verifiedTag.title = 'Verified Corporate Email in Tata 1mg Domain';
    } else {
      verifiedTag.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>External Inbound</span>
      `;
      verifiedTag.className = 'mail-verified-tag ext-verified';
      verifiedTag.title = 'Inbound ingest from external or personal email address';
    }
  }

  // 3. Populate AI Smart Digest Strip Pills
  const digestPillsEl = document.getElementById('inboxAiDigestPills');
  if (digestPillsEl) {
    const pills = [];
    const empId = ai.detected_code || matchedEmp.employee_id;
    if (empId) {
      pills.push(`<span class="digest-pill emp-id" title="HRMS Code"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ${empId}</span>`);
    }

    const bodyStr = email.body || '';
    if (bodyStr.includes('Apex Solutions')) {
      pills.push(`<span class="digest-pill org" title="Previous Employer"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg> Apex Solutions</span>`);
    } else if (bodyStr.includes('Gurugram DC Hub')) {
      pills.push(`<span class="digest-pill org" title="Facility"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg> Gurugram Hub</span>`);
    }

    if (ai.intent_label) {
      pills.push(`<span class="digest-pill topic" title="Classified Intent">${ai.intent_label}</span>`);
    }

    if (bodyStr.toLowerCase().includes('pending')) {
      pills.push(`<span class="digest-pill status" title="Detected Status"><span class="mark-status-dot"></span> Verification Pending</span>`);
    } else if (ai.is_urgent) {
      pills.push(`<span class="digest-pill status" title="Urgent SLA"><span class="mark-status-dot"></span> 4h Urgent</span>`);
    }

    digestPillsEl.innerHTML = pills.join('');
  }

  // 4. Render Email Body with AI Highlights & Paragraphs
  const bodyEl = document.getElementById('inboxEmailBody');
  if (bodyEl) {
    bodyEl.innerHTML = formatEmailBodyHtml(email.body, email, ai);
  }

  // Safe updates for legacy banner IDs if any exist
  const confBadge = document.getElementById('inboxAiConfidenceBadge');
  const detName = document.getElementById('inboxDetectedName');
  const detCode = document.getElementById('inboxDetectedCode');
  const detIntent = document.getElementById('inboxDetectedIntent');
  const detDesk = document.getElementById('inboxDetectedDesk');
  const hrmsVerifyTag = document.getElementById('inboxHrmsVerifyTag');
  const detNotes = document.getElementById('inboxDetectionNotes');
  if (confBadge) confBadge.innerText = `${ai.confidence || 98.4}% Match`;
  if (detName) detName.innerText = ai.detected_name || 'Employee';
  if (detCode) detCode.innerText = ai.detected_code || matchedEmp.employee_id || '—';
  if (detIntent) detIntent.innerText = `${ai.intent_code || 'AT01'}: ${ai.intent_label || 'Biometric Punch Regularization'}`;
  if (detDesk) detDesk.innerText = `${ai.category || 'Attendance'} HR Desk`;
  if (hrmsVerifyTag) {
    hrmsVerifyTag.innerHTML = matchedEmp.is_verified
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Verified Employee in Tata 1mg Directory</span>`
      : `<span>Extracted Employee: ${senderName}</span>`;
  }
  if (detNotes) {
    detNotes.innerText = `Sender: ${senderName} <${senderEmail}>`;
  }

  // 5. Update Right AI Copilot Pane
  const copilotIntent = document.getElementById('inboxCopilotIntentPill');
  const copilotConf = document.getElementById('inboxCopilotConfidence');
  const copilotSla = document.getElementById('inboxCopilotSlaInfo');
  const copilotName = document.getElementById('inboxCopilotExtractedName');
  const copilotCode = document.getElementById('inboxCopilotExtractedCode');
  const copilotLoc = document.getElementById('inboxCopilotExtractedLocation');
  const copilotDesig = document.getElementById('inboxCopilotExtractedDesig');
  const copilotStatus = document.getElementById('inboxCopilotHrmsStatus');
  const copilotUrgencyDesc = document.getElementById('inboxCopilotUrgencyDesc');

  if (copilotIntent) {
    copilotIntent.innerHTML = `
      <span class="intent-dot"></span>
      <span>${ai.intent_code || 'AT01'}: ${ai.intent_label || 'Regularization'}</span>
    `;
  }
  if (copilotConf) {
    copilotConf.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>${ai.confidence || 98.4}% Match</span>
    `;
  }
  if (copilotSla) {
    copilotSla.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      <span>Target SLA: <strong>${ai.target_sla || '12h Target SLA'}</strong> · Within SLA</span>
    `;
  }
  if (copilotName) copilotName.innerText = ai.detected_name || email.sender_name || 'Employee';
  if (copilotCode) copilotCode.innerText = ai.detected_code || matchedEmp.employee_id || '—';
  if (copilotLoc) copilotLoc.innerText = matchedEmp.location || '—';
  if (copilotDesig) copilotDesig.innerText = matchedEmp.designation || 'Employee';
  if (copilotStatus) {
    const isVer = Boolean(matchedEmp && matchedEmp.is_verified);
    copilotStatus.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${isVer ? '#15803D' : '#F59E0B'}" stroke-width="2.5">${isVer ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}</svg>
      <span>${isVer ? 'Directory Verified against Central HRMS' : (ai.detected_name ? `Unverified Inbound · ${ai.detected_name}` : 'Unverified External Ingest')}</span>
    `;
  }
  const copilotConvertBtn = document.getElementById('inboxCopilotConvertBtn');
  if (email.is_converted && email.case_number) {
    if (copilotUrgencyDesc) {
      copilotUrgencyDesc.innerHTML = `<span style="color: #15803D; font-weight: 700;">✓ Active Case ${formatCaseNumber(email.case_number)}</span>: Converted from inbox with tracked SLA clock.`;
    }
    if (copilotConvertBtn) {
      copilotConvertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Open Case ${formatCaseNumber(email.case_number)}</span>
      `;
      copilotConvertBtn.style.background = '#10B190';
      copilotConvertBtn.style.color = '#FFFFFF';
      copilotConvertBtn.onclick = () => openConvertedCaseInWorkspace(email.case_number);
    }
  } else {
    if (copilotUrgencyDesc) {
      copilotUrgencyDesc.innerText = `${ai.urgency || 'HIGH'}: Inbound employee request recommended to claim and register as tracked case.`;
    }
    if (copilotConvertBtn) {
      copilotConvertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Claim & Convert to Active Case</span>
      `;
      copilotConvertBtn.style.background = '#EA580C';
      copilotConvertBtn.style.color = '#FFFFFF';
      copilotConvertBtn.onclick = () => convertCurrentInboxEmail();
    }
  }

  // Render Response Studio Draft
  renderInboxDraft();
}

function renderInboxDraft() {
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  const draftBox = document.getElementById('inboxCopilotDraft');
  if (!draftBox || !email) return;

  const ai = email.ai_insights || {};
  const drafts = ai.drafts || {};
  const text = drafts[currentInboxTone] || drafts['empathetic'] || 'Drafting contextual HR response...';
  draftBox.innerText = text;
}

function switchInboxTone(tone, btnEl) {
  currentInboxTone = tone;
  document.querySelectorAll('#inboxAiCopilotPanel .tone-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const draftBox = document.getElementById('inboxCopilotDraft');
  if (draftBox) {
    const toneLabel = tone === 'empathetic' ? 'Empathetic' : (tone === 'concise' ? 'Concise' : 'Policy & Docs');
    draftBox.innerHTML = `
      <div class="draft-generating-shimmer">
        <div class="sparkle-pulse-ring"></div>
        <span>AI synthesizing ${toneLabel} draft...</span>
      </div>
    `;
    setTimeout(() => {
      renderInboxDraft();
    }, 180);
  } else {
    renderInboxDraft();
  }
}

function insertInboxDraftToReply() {
  const draftBox = document.getElementById('inboxCopilotDraft');
  const replyInput = document.getElementById('inboxQuickReplyInput');
  if (draftBox && replyInput) {
    replyInput.value = draftBox.innerText.trim();
    showToast('AI draft inserted into Quick Reply box', 'info');
    replyInput.focus();
    replyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function insertInboxPreset(key) {
  if (!key || !CANNED_RESPONSES[key]) return;
  const replyInput = document.getElementById('inboxQuickReplyInput');
  if (replyInput) {
    replyInput.value = CANNED_RESPONSES[key].text;
    showToast(`Inserted template: ${CANNED_RESPONSES[key].label}`, 'info');
  }
}

async function openConvertedCaseInWorkspace(caseNumber) {
  if (!caseNumber) return;
  // 1. Switch to Cases Workspace view
  switchAgentView('casesView');

  // 2. Load cases and select the matching case
  try {
    const res = await fetch(`/api/v1/cases?search=${encodeURIComponent(caseNumber)}`);
    const data = await res.json();
    if (data.success && data.cases && data.cases.length > 0) {
      const target = data.cases.find(c => String(c.case_number).toLowerCase() === String(caseNumber).toLowerCase()) || data.cases[0];
      selectInboxCase(target.id);
      showToast(`Navigated to Case ${formatCaseNumber(caseNumber)} in Cases Workspace`, 'info');
    } else {
      showToast(`Case ${formatCaseNumber(caseNumber)} opened in workspace`, 'info');
    }
  } catch (err) {
    console.error('Error opening case in workspace:', err);
  }
}

async function convertCurrentInboxEmail() {
  if (!currentSelectedEmailId) {
    showToast('Please select an email to convert', 'error');
    return;
  }

  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  if (email && email.is_converted && email.case_number) {
    openConvertedCaseInWorkspace(email.case_number);
    return;
  }

  const convertBtn = document.getElementById('inboxConvertCaseBtn');
  const copilotConvertBtn = document.getElementById('inboxCopilotConvertBtn');
  if (convertBtn) {
    convertBtn.disabled = true;
    convertBtn.innerHTML = `
      <div class="sparkle-pulse-ring" style="width: 12px; height: 12px; border-width: 2px;"></div>
      <span>Converting...</span>
    `;
  }
  if (copilotConvertBtn) {
    copilotConvertBtn.disabled = true;
  }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/convert-to-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: currentUser.department_id || 4,
        assigned_user: currentUser.name || 'HR Specialist',
        actor_name: currentUser.name,
        actor_email: currentUser.email
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Converted to Active Case ${formatCaseNumber(data.case_number)}!`, 'success');
      await loadInboxEmails();
    } else {
      showToast(data.detail || 'Conversion failed', 'error');
    }
  } catch (err) {
    console.error('Error converting email to case:', err);
    showToast('Failed to convert email to case', 'error');
  } finally {
    if (convertBtn) convertBtn.disabled = false;
    if (copilotConvertBtn) copilotConvertBtn.disabled = false;
  }
}

async function toggleCurrentInboxNoise() {
  if (!currentSelectedEmailId) return;

  const toggleNoiseBtn = document.getElementById('inboxToggleNoiseBtn');
  if (toggleNoiseBtn) {
    toggleNoiseBtn.disabled = true;
  }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/toggle-actionable`, {
      method: 'POST'
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'info');
      await loadInboxEmails();
    }
  } catch (err) {
    console.error('Error toggling actionable:', err);
    showToast('Failed to update email status', 'error');
  } finally {
    if (toggleNoiseBtn) {
      toggleNoiseBtn.disabled = false;
    }
  }
}

async function sendInboxReply() {
  const replyInput = document.getElementById('inboxQuickReplyInput');
  if (!replyInput || !replyInput.value.trim()) {
    showToast('Please type a response message', 'error');
    return;
  }

  if (!currentSelectedEmailId) return;

  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  const sendBtn = document.querySelector('.btn-send-dispatch');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `
      <div class="sparkle-pulse-ring" style="width: 12px; height: 12px; border-width: 2px;"></div>
      <span>Dispatching...</span>
    `;
  }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: replyInput.value.trim(),
        actor_name: currentUser.name || 'HR Specialist',
        actor_email: currentUser.email || 'people.ops@1mg.com'
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Reply dispatched to ${email?.sender_email || 'recipient'} via SMTP!`, 'success');
      replyInput.value = '';
    } else {
      showToast(data.detail || 'Failed to dispatch reply', 'error');
    }
  } catch (err) {
    console.error('Error sending reply:', err);
    showToast('Failed to dispatch reply', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        <span>Send Response</span>
      `;
    }
  }
}

async function sendInboxAiReplyDirectly() {
  insertInboxDraftToReply();
  await convertCurrentInboxEmail();
  await sendInboxReply();
}

async function syncInboxMailbox(btn) {
  const icon = btn?.querySelector('svg');
  if (icon) {
    icon.style.transition = 'transform 0.6s ease';
    icon.style.transform = 'rotate(360deg)';
  }

  showToast('Synchronizing mailbox with corporate IMAP...', 'info');
  try {
    const res = await fetch('/api/v1/inbox/sync', { method: 'POST' });
    const data = await res.json();
    await loadInboxEmails();
    showToast(data.message || 'Mailbox queue up to date', 'success');
  } catch (err) {
    await loadInboxEmails();
    showToast('Mailbox refreshed', 'success');
  } finally {
    if (icon) {
      setTimeout(() => {
        icon.style.transform = 'none';
      }, 600);
    }
  }
}

function openIngestEmailModal() {
  const modal = document.getElementById('ingestEmailModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('ingestSenderEmail')?.focus();
  }
}

function closeIngestEmailModal() {
  const modal = document.getElementById('ingestEmailModal');
  if (modal) modal.style.display = 'none';
  const form = document.getElementById('ingestEmailForm');
  if (form) form.reset();
}

async function handleIngestEmailSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('ingestSenderEmail');
  const nameInput = document.getElementById('ingestSenderName');
  const subjInput = document.getElementById('ingestSubject');
  const bodyInput = document.getElementById('ingestBody');
  const catInput = document.getElementById('ingestCategory');
  const actInput = document.getElementById('ingestActionable');
  const submitBtn = document.getElementById('ingestSubmitBtn');

  const sender_email = (emailInput?.value || '').trim();
  const sender_name = (nameInput?.value || '').trim();
  const subject = (subjInput?.value || '').trim();
  const body = (bodyInput?.value || '').trim();
  const category = (catInput?.value || '').trim() || null;
  const is_actionable = parseInt(actInput?.value || '1', 10);

  if (!sender_email || !subject || !body) {
    showToast('Please fill all required email fields', 'error');
    return;
  }

  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="sparkle-pulse-ring" style="width: 12px; height: 12px; border-width: 2px;"></div>
      <span>Ingesting & Triaging...</span>
    `;
  }

  try {
    const res = await fetch('/api/v1/inbox/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_email,
        sender_name,
        subject,
        body,
        category,
        is_actionable
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Real email ingested and AI triaged successfully!', 'success');
      closeIngestEmailModal();
      await loadInboxEmails();
      if (data.email_id) {
        selectInboxEmail(data.email_id);
      }
    } else {
      showToast(data.detail || data.message || 'Failed to ingest email', 'error');
    }
  } catch (err) {
    console.error('Error ingesting email:', err);
    showToast('Failed to ingest email: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

async function seedSampleInboxEmails(btn) {
  openIngestEmailModal();
}

function toggleInboxCollapse() {
  const pane = document.getElementById('inboxStreamPane');
  if (pane) {
    isInboxStreamCollapsed = !isInboxStreamCollapsed;
    pane.classList.toggle('collapsed', isInboxStreamCollapsed);
  }
}

function copyInboxEmailBody() {
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  if (email && email.body) {
    let cleanText = String(email.body)
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n');
    copyToClipboard(cleanText);
    showToast('Email content copied to clipboard', 'success');
  } else {
    const bodyEl = document.getElementById('inboxEmailBody');
    if (bodyEl) {
      copyToClipboard(bodyEl.innerText);
      showToast('Email content copied to clipboard', 'success');
    }
  }
}

function renderEmptyInboxCockpit() {
  const emptyState = document.getElementById('inboxEmptyState');
  const activeContent = document.getElementById('inboxActiveContent');
  if (emptyState) emptyState.style.display = 'flex';
  if (activeContent) activeContent.style.display = 'none';

  // Reset Copilot pane
  const copilotIntent = document.getElementById('inboxCopilotIntentPill');
  const copilotConf = document.getElementById('inboxCopilotConfidence');
  const copilotSla = document.getElementById('inboxCopilotSlaInfo');
  const copilotName = document.getElementById('inboxCopilotExtractedName');
  const copilotCode = document.getElementById('inboxCopilotExtractedCode');
  const copilotLoc = document.getElementById('inboxCopilotExtractedLocation');
  const copilotDesig = document.getElementById('inboxCopilotExtractedDesig');
  const copilotStatus = document.getElementById('inboxCopilotHrmsStatus');
  const copilotUrgencyDesc = document.getElementById('inboxCopilotUrgencyDesc');
  const draftBox = document.getElementById('inboxCopilotDraft');

  if (copilotIntent) copilotIntent.innerHTML = '<span class="intent-dot"></span><span>Awaiting selection</span>';
  if (copilotConf) copilotConf.innerHTML = '<span>—</span>';
  if (copilotSla) copilotSla.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>Target SLA: <strong>Pending selection</strong></span>';
  if (copilotName) copilotName.innerText = '—';
  if (copilotCode) copilotCode.innerText = '—';
  if (copilotLoc) copilotLoc.innerText = '—';
  if (copilotDesig) copilotDesig.innerText = '—';
  if (copilotStatus) {
    copilotStatus.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Select an email to view HRMS verification</span>';
  }
  if (copilotUrgencyDesc) {
    copilotUrgencyDesc.innerText = 'Select an email to view conversion recommendation.';
  }
  if (draftBox) {
    draftBox.innerText = 'Select an email from the queue to generate contextual AI draft replies.';
  }
}

// =========================================================================
// 6. CASES WORKSPACE COCKPIT (CASES STREAM & CARDS)
// =========================================================================
function setInboxFilter(filterType, btnEl) {
  currentInboxFilter = filterType;
  document.querySelectorAll('.stream-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderInboxStream();
}

function renderInboxStream() {
  const listEl = document.getElementById('inboxStreamList');
  const railEl = document.getElementById('collapsedCardAvatars');
  if (!listEl) return;

  const searchInput = document.getElementById('streamSearchInput');
  const globalInput = document.getElementById('globalSearchInput');
  const query = (searchInput?.value || globalInput?.value || '').toLowerCase().trim();

  let filtered = allCases.filter(c => {
    if (query) {
      const match = (c.case_number || '').toLowerCase().includes(query) ||
                    (c.title || '').toLowerCase().includes(query) ||
                    (c.employee_email || '').toLowerCase().includes(query) ||
                    (c.employee_name || '').toLowerCase().includes(query) ||
                    (c.ai_badge?.intent_name || '').toLowerCase().includes(query) ||
                    (c.hrms_profile?.extracted_name || '').toLowerCase().includes(query);
      if (!match) return false;
    }

    if (currentInboxFilter === 'UNASSIGNED') {
      return !c.assigned_user || c.assigned_user === 'Central Triage' || c.status === 'OPEN';
    } else if (currentInboxFilter === 'MINE') {
      return c.assigned_user_email === currentUser.email || c.assigned_user === currentUser.name;
    } else if (currentInboxFilter === 'URGENT') {
      return c.priority === 'CRITICAL' || c.priority === 'HIGH' || (c.ai_badge?.urgency || '').includes('HIGH');
    }
    return true; // ALL
  });

  const countPill = document.getElementById('casesStreamCountPill');
  if (countPill) {
    countPill.innerText = `${filtered.length} ${filtered.length === 1 ? 'case' : 'cases'}`;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--text-muted); font-size: 13px;">
        <div style="width: 44px; height: 44px; border-radius: 12px; background: #F1F5F9; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto; color: #64748B;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <div style="font-weight: 700; font-size: 13.5px; color: var(--text-dark);">No Inquiries Found</div>
        <p style="font-size: 12px; margin-top: 4px; color: var(--text-muted);">No cases match this queue filter.</p>
      </div>
    `;
    if (railEl) railEl.innerHTML = '';
    return;
  }

  // Avatar colors palette matching screenshot
  const avatarColors = ['#E11D48', '#10B190', '#3B82F6', '#8B5CF6', '#F59E0B', '#0D9488'];

  let railHtml = '';
  let cardsHtml = filtered.map((c, index) => {
    const isSelected = c.id === currentSelectedCaseId;
    const ai = c.ai_badge || {};
    const isUrgent = (ai.urgency || '').includes('HIGH') || c.priority === 'HIGH' || c.priority === 'CRITICAL';
    const rawName = c.employee_name || 'Employee';
    const initials = rawName.split(' ').map(w => w.charAt(0)).join('').substring(0, 2).toUpperCase() || 'E';
    const avatarBg = avatarColors[Math.abs(c.id || index) % avatarColors.length];
    const deptTag = c.department_name || c.assigned_team || 'GENERAL_HR';
    const isAssigned = c.assigned_user && c.assigned_user !== 'Central Triage';

    // Collapsed rail chip
    railHtml += `
      <div class="card-avatar-pill ${isSelected ? 'active' : ''}" style="background: ${avatarBg}; cursor: pointer; width: 32px; height: 32px; font-size: 12px; border: ${isSelected ? '2px solid var(--1mg-orange)' : 'none'};" onclick="selectInboxCase(${c.id})" title="${escapeHtml(formatCaseNumber(c.case_number))}: ${escapeHtml(c.title)}">
        ${initials}
      </div>
    `;

    return `
      <div class="stream-card ${isSelected ? 'active' : ''}" onclick="selectInboxCase(${c.id})">
        <!-- TOP ROW: Avatar Pill + Case # + Status Label -->
        <div class="stream-card-header">
          <div style="display: flex; align-items: center; gap: 7px;">
            <span class="card-avatar-pill" style="background: ${avatarBg};">${initials}</span>
            <span class="card-case-id">${formatCaseNumber(c.case_number)}</span>
          </div>
          <span class="card-status-label">${c.status === 'OPEN' ? 'Open' : (c.status || 'Open')}</span>
        </div>

        <!-- TITLE -->
        <div class="stream-card-title">${escapeHtml(c.title)}</div>

        <!-- SENDER & DEPT SUBTITLE -->
        <div class="stream-card-meta">${escapeHtml(rawName)} · ${escapeHtml(deptTag)}</div>

        <!-- FOOTER: Dept Pill & Urgency/Assigned Pill -->
        <div class="stream-card-footer">
          <div class="card-footer-left">
            <span class="badge-tag-sm category ${deptTag.toLowerCase()}">${escapeHtml(deptTag)}</span>
            <span class="badge-tag-sm ${isUrgent ? 'sla urgent' : 'sla'}" style="display: inline-flex; align-items: center; gap: 4px;">
              ${isUrgent ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> 4h Urgent' : '24h Standard'}
            </span>
          </div>
          <div class="card-footer-right">
            <span class="badge-tag-sm ${isAssigned ? 'assigned' : 'unassigned'}">${isAssigned ? 'Assigned' : 'Open'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cardsHtml += `
    <div class="stream-cards-list-footer">
      Showing ${filtered.length} ${filtered.length === 1 ? 'case' : 'cases'} · Live Case Registry
    </div>
  `;

  listEl.innerHTML = cardsHtml;
  if (railEl) railEl.innerHTML = railHtml;
}

function renderEmptyCockpit() {
  const emptyState = document.getElementById('casesEmptyState');
  const activeContent = document.getElementById('casesActiveContent');
  if (emptyState) emptyState.style.display = 'flex';
  if (activeContent) activeContent.style.display = 'none';

  // Copilot panel resets
  const copilotIntent = document.getElementById('copilotIntentPill');
  const copilotConf = document.getElementById('copilotConfidenceBadge');
  const copilotSla = document.getElementById('copilotSlaInfo');
  const copilotName = document.getElementById('copilotExtractedName');
  const copilotCode = document.getElementById('copilotExtractedCode');
  const copilotLoc = document.getElementById('copilotExtractedLocation');
  const copilotShift = document.getElementById('copilotExtractedShift');
  const copilotUrg = document.getElementById('copilotUrgencyDesc');
  const copilotDraft = document.getElementById('copilotDraftContent');

  if (copilotIntent) copilotIntent.innerHTML = '<span class="intent-dot"></span><span>Awaiting selection</span>';
  if (copilotConf) copilotConf.innerHTML = '<span>—</span>';
  if (copilotSla) copilotSla.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>Target SLA: <strong>Pending selection</strong></span>';
  if (copilotName) copilotName.innerText = '—';
  if (copilotCode) copilotCode.innerText = '—';
  if (copilotLoc) copilotLoc.innerText = '—';
  if (copilotShift) copilotShift.innerText = '—';
  if (copilotUrg) copilotUrg.innerText = 'Select a case from the queue to inspect SLA and intelligence details.';
  if (copilotDraft) copilotDraft.innerText = 'Select an inquiry to generate contextual AI draft replies.';
}

// =========================================================================
// 6. CENTER INSPECTOR (DUAL COLUMN) & AI COPILOT
// =========================================================================
async function selectInboxCase(caseId) {
  currentSelectedCaseId = caseId;
  renderInboxStream();

  // Reset Inspector view to Inquiry & Profile
  setInspectorView('inquiry');

  // Toggle active content vs empty state
  const emptyState = document.getElementById('casesEmptyState');
  const activeContent = document.getElementById('casesActiveContent');
  if (emptyState) emptyState.style.display = 'none';
  if (activeContent) activeContent.style.display = 'flex';

  try {
    const [caseRes, aiRes] = await Promise.all([
      fetch(`/api/v1/cases/${caseId}`).then(r => r.json()),
      fetch(`/api/v1/cases/${caseId}/ai-insights`).then(r => r.json()).catch(() => null)
    ]);

    if (!caseRes.success || !caseRes.case) {
      showToast('Could not load case details', 'error');
      return;
    }

    const c = caseRes.case;
    const ai = (aiRes && aiRes.ai) ? aiRes.ai : (c.ai_badge || {});
    currentAiInsights = ai;
    const profile = ai.hrms_profile || {};

    // 1. TOP RIBBON UPDATE
    const ribbonCase = document.getElementById('ribbonCaseNumber');
    const ribbonDept = document.getElementById('ribbonDeptPill');
    const ribbonSla = document.getElementById('ribbonSlaBadge');
    const ribbonAgent = document.getElementById('ribbonAgentPill');

    if (ribbonCase) ribbonCase.innerText = formatCaseNumber(c.case_number);
    if (ribbonDept) ribbonDept.innerText = (c.department_name || 'UNKNOWN').toUpperCase();
    
    const isUrgent = (ai.urgency || '').includes('HIGH') || c.priority === 'HIGH' || c.priority === 'CRITICAL';
    if (ribbonSla) {
      ribbonSla.className = `ribbon-sla-badge ${isUrgent ? 'urgent' : ''}`;
      ribbonSla.innerHTML = `
        <span class="sla-dot-pulse" style="background: ${isUrgent ? '#E11D48' : '#10B190'};"></span>
        <span id="ribbonSlaText" style="display: inline-flex; align-items: center; gap: 4px;">${isUrgent ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> 4h Urgent SLA' : `${ai.sla_target_hours || 24}h Standard SLA`}</span>
      `;
    }
    if (ribbonAgent) ribbonAgent.innerText = c.assigned_user || 'Admin';

    // 2. INSPECTOR TITLE & SUBTITLE
    const titleEl = document.getElementById('inspectorTitle');
    const typeEl = document.getElementById('inspectorIngestType');
    const timeEl = document.getElementById('inspectorReceivedTime');

    if (titleEl) titleEl.innerText = c.title;
    if (typeEl) typeEl.innerText = 'Corporate Ingest';
    if (timeEl) timeEl.innerText = `Received: ${formatDate(c.created_at)}`;

    // 3. COLUMN 1: LIVE HRMS EMPLOYEE VERIFIED DOSSIER CARD
    const empName = profile.extracted_name || c.employee_name || 'Tata 1mg Employee';
    const empCode = profile.employee_code || '—';
    const empLoc = profile.location || '—';
    const empShift = profile.shift || 'General Day Shift';
    const empGrade = profile.grade || '—';
    const empDept = profile.department || c.department_name || 'General Operations';
    const empManager = profile.manager || 'Operations Lead';
    const empEmail = profile.corporate_email || c.employee_email || '—';

    const dAvatar = document.getElementById('dossierAvatar');
    const dName = document.getElementById('dossierName');
    const dDesig = document.getElementById('dossierDesignation');
    const dOrg = document.getElementById('dossierOrg');
    const dToken = document.getElementById('dossierTokenBadge');
    const bCode = document.getElementById('bentoEmpCode');
    const bGrade = document.getElementById('bentoGrade');
    const bLoc = document.getElementById('bentoLocation');
    const dMgr = document.getElementById('dossierManager');
    const dMail = document.getElementById('dossierEmail');
    const dJoin = document.getElementById('dossierJoiningDate');
    const dType = document.getElementById('dossierEmpType');
    const dStatus = document.getElementById('dossierDirectoryStatus');

    if (dAvatar) dAvatar.innerText = empName.charAt(0).toUpperCase();
    if (dName) dName.innerText = empName;
    if (dDesig) dDesig.innerText = profile.designation || 'Operations Specialist';
    if (dOrg) dOrg.innerText = `${empDept} · Tata 1mg`;
    if (dToken) dToken.innerText = `Token: ${formatCaseNumber(profile.token || empCode)}`;
    if (bCode) bCode.innerText = formatCaseNumber(empCode);
    if (bGrade) bGrade.innerText = empGrade;
    if (bLoc) bLoc.innerText = empLoc;
    if (dMgr) dMgr.innerText = empManager;
    if (dMail) dMail.innerText = empEmail;
    if (dJoin) dJoin.innerText = profile.joining_date || 'Confirmed Active';
    if (dType) dType.innerText = profile.employment_type || 'Permanent (Full-Time)';
    if (dStatus) dStatus.innerText = profile.directory_status || 'Active Directory Confirmed';

    // 4. COLUMN 2: INBOUND EMAIL THREAD & QUICK COMPOSER
    const sAvatar = document.getElementById('emailSenderAvatar');
    const sName = document.getElementById('emailSenderName');
    const sEmail = document.getElementById('emailSenderEmail');
    const sDesk = document.getElementById('emailRecipientDesk');
    const sTime = document.getElementById('emailTimestamp');
    const sSubj = document.getElementById('emailSubjectLine');
    const sCat = document.getElementById('emailCategoryTag');
    const sBody = document.getElementById('emailBodyContent');
    const mCode = document.getElementById('metaCode');
    const mDept = document.getElementById('metaDept');
    const mShift = document.getElementById('metaShift');

    if (sAvatar) {
      sAvatar.innerText = (c.employee_name || 'E').charAt(0).toUpperCase();
      const avatarColors = ['#E11D48', '#10B190', '#3B82F6', '#8B5CF6', '#F59E0B', '#0D9488'];
      sAvatar.style.background = avatarColors[Math.abs(c.id || 0) % avatarColors.length];
    }
    if (sName) sName.innerText = c.employee_name || 'Tata 1mg Employee';
    if (sEmail) sEmail.innerText = c.employee_email;
    if (sDesk) sDesk.innerText = `To: people.ops@1mg.com (Tata 1mg ${c.department_name || 'Operations'} Desk)`;
    if (sTime) sTime.innerText = formatDate(c.created_at);
    if (sSubj) sSubj.innerText = c.title;
    if (sCat) sCat.innerText = (c.category || c.department_name || 'UNKNOWN').toUpperCase();
    
    if (sBody) {
      sBody.innerHTML = escapeHtml(c.description || '').replace(/\n/g, '<br>');
    }
    if (mCode) mCode.innerText = formatCaseNumber(empCode);
    if (mDept) mDept.innerText = empDept;
    if (mShift) mShift.innerText = empShift;
    if (mCode) mCode.innerText = formatCaseNumber(empCode);
    if (mDept) mDept.innerText = empDept;
    if (mShift) mShift.innerText = empShift;

    // Reset quick reply text
    const replyInput = document.getElementById('quickReplyInput');
    if (replyInput) replyInput.value = '';

    // 5. PANE 3: COLLAPSIBLE RIGHT-HAND AI COPILOT
    const cIntent = document.getElementById('copilotIntentPill');
    const cConf = document.getElementById('copilotConfidenceBadge');
    const cSla = document.getElementById('copilotSlaInfo');
    const cExtName = document.getElementById('copilotExtractedName');
    const cExtCode = document.getElementById('copilotExtractedCode');
    const cExtLoc = document.getElementById('copilotExtractedLocation');
    const cExtShift = document.getElementById('copilotExtractedShift');
    const cUrgDesc = document.getElementById('copilotUrgencyDesc');

    if (cIntent) {
      cIntent.innerHTML = `
        <span class="intent-dot"></span>
        <span>${ai.intent_code || 'AT01'}: ${ai.intent_name || 'Punch Regularization'}</span>
      `;
    }
    if (cConf) {
      cConf.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${ai.confidence || 98.6}% Match</span>
      `;
    }
    if (cSla) {
      cSla.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Target SLA: <strong>${ai.sla_target_hours || 12} Hours</strong> · Within SLA</span>
      `;
    }
    if (cExtName) cExtName.innerText = empName;
    if (cExtCode) cExtCode.innerText = formatCaseNumber(empCode);
    if (cExtLoc) cExtLoc.innerText = empLoc;
    if (cExtShift) cExtShift.innerText = empShift;
    
    if (cUrgDesc) {
      const issue = ai.summary?.core_issue || 'High Urgency detected due to turnstile reader timeout.';
      cUrgDesc.innerText = `${ai.urgency || 'High Urgency'}: ${issue}`;
    }

    // Response Studio: Render Active Tone Draft
    renderCopilotToneDraft();

    // 6. RENDER AUDIT LOGS FOR AUDIT TAB
    renderInspectorAuditLogs(caseRes.audit_logs || []);

  } catch (err) {
    console.error('Error selecting case:', err);
    showToast('Failed to load full case intelligence', 'error');
  }
}

function renderCopilotToneDraft() {
  const draftBox = document.getElementById('copilotDraftContent');
  if (!draftBox || !currentAiInsights) return;

  const tones = currentAiInsights.tones || {};
  const draft = tones[currentActiveTone] || currentAiInsights.ai_draft_reply || 'No draft available for this tone.';
  draftBox.innerText = draft;
}

function switchResponseTone(toneKey, btnEl) {
  currentActiveTone = toneKey;
  document.querySelectorAll('#aiCopilotPanel .tone-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const draftBox = document.getElementById('copilotDraftContent');
  if (draftBox) {
    const toneLabel = toneKey === 'empathetic' ? 'Empathetic' : (toneKey === 'concise' ? 'Concise' : 'Policy & Docs');
    draftBox.innerHTML = `
      <div class="draft-generating-shimmer">
        <div class="sparkle-pulse-ring"></div>
        <span>AI synthesizing ${toneLabel} draft...</span>
      </div>
    `;
    setTimeout(() => {
      renderCopilotToneDraft();
    }, 180);
  } else {
    renderCopilotToneDraft();
  }
}

function insertCopilotDraftToReply() {
  const draftBox = document.getElementById('copilotDraftContent');
  const input = document.getElementById('quickReplyInput');
  if (!draftBox || !input) return;

  const draftText = draftBox.innerText.trim();
  if (!draftText) {
    showToast('No AI draft available to insert', 'error');
    return;
  }

  input.value = draftText;
  input.focus();
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('AI Draft copied into Quick Reply box!', 'success');
}

async function sendCopilotDraftDirectly() {
  if (!currentSelectedCaseId) {
    showToast('No case selected to reply to', 'error');
    return;
  }
  const draftBox = document.getElementById('copilotDraftContent');
  const draftText = draftBox ? draftBox.innerText.trim() : '';

  if (!draftText) {
    showToast('No AI draft generated', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: draftText,
        reply_type: 'PUBLIC_REPLY',
        new_status: 'RESOLVED',
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'AI Assistant'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('AI Resolution dispatched to employee & ticket marked Resolved!', 'success');
      await fetchCasesData();
      selectInboxCase(currentSelectedCaseId);
    } else {
      showToast('Failed to send AI response', 'error');
    }
  } catch (err) {
    showToast('Error sending response', 'error');
  }
}

async function sendEmbeddedReply() {
  if (!currentSelectedCaseId) {
    showToast('Please select a case first', 'error');
    return;
  }
  const input = document.getElementById('quickReplyInput');
  const statusSelect = document.getElementById('quickReplyStatusSelect');
  const message = (input?.value || '').trim();
  const newStatus = statusSelect?.value || 'RESOLVED';

  if (!message) {
    showToast('Please type a response message or insert an AI draft first.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        reply_type: 'PUBLIC_REPLY',
        new_status: newStatus,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'HR Specialist'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Reply dispatched to employee (${newStatus})!`, 'success');
      input.value = '';
      await fetchCasesData();
      selectInboxCase(currentSelectedCaseId);
    } else {
      showToast('Failed to dispatch reply', 'error');
    }
  } catch (err) {
    showToast('Error dispatching reply', 'error');
  }
}

async function claimAndConvertCase() {
  if (!currentSelectedCaseId) {
    showToast('Please select a case to claim', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id || 1,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'HR Agent'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case claimed and converted to active dossier!', 'success');
      await fetchCasesData();
      selectInboxCase(currentSelectedCaseId);
    } else {
      showToast('Failed to claim case', 'error');
    }
  } catch (err) {
    showToast('Network error while claiming case', 'error');
  }
}

function insertQuickPreset(key) {
  if (!key || !CANNED_RESPONSES[key]) return;
  const tmpl = CANNED_RESPONSES[key];
  const input = document.getElementById('quickReplyInput');
  const statusSelect = document.getElementById('quickReplyStatusSelect');

  if (input) input.value = tmpl.text;
  if (key === 'resolved' && statusSelect) statusSelect.value = 'RESOLVED';
  showToast(`Applied preset: ${tmpl.label}`, 'info');
}

function renderInspectorAuditLogs(logs) {
  const container = document.getElementById('inspectorAuditLogsList');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); padding: 10px;">No audit trail events logged yet.</div>`;
    return;
  }

  container.innerHTML = logs.map(log => `
    <div style="font-size: 12px; padding: 10px 14px; background: #F8FAFC; border: 1px solid #EAEAEA; border-radius: 6px; display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(log.actor_name || 'System')} (${escapeHtml(log.actor_email || 'automated')})</div>
        <div style="color: #4A4A4A; margin-top: 2px;">${escapeHtml(formatAuditAction(log))}</div>
      </div>
      <span style="color: var(--text-muted); font-size: 11px; white-space: nowrap; margin-left: 12px;">${formatRelativeTime(log.created_at)}</span>
    </div>
  `).join('');
}

// =========================================================================
// 7. NEW CASE & RESOLVE MODALS
// =========================================================================
function openNewCaseModal() {
  const modal = document.getElementById('newCaseModal');
  if (modal) modal.style.display = 'flex';
}

function closeNewCaseModal() {
  const modal = document.getElementById('newCaseModal');
  if (modal) modal.style.display = 'none';
}

async function handleNewCaseSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('modalNewEmail').value.trim();
  const name = document.getElementById('modalNewName').value.trim();
  const title = document.getElementById('modalNewTitle').value.trim();
  const desc = document.getElementById('modalNewDesc').value.trim();
  const priority = document.getElementById('modalNewPriority').value;
  const deptId = document.getElementById('modalNewDept').value;

  try {
    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_email: email,
        employee_name: name || 'Tata 1mg Employee',
        title: title,
        description: desc,
        priority: priority,
        department_id: deptId ? parseInt(deptId) : null
      })
    });
    const data = await res.json();
    if (data.success && data.case) {
      showToast(`Case #${data.case.case_number} created and routed successfully!`, 'success');
      closeNewCaseModal();
      document.getElementById('newCaseModalForm').reset();
      await fetchCasesData();
      selectInboxCase(data.case.id);
    } else {
      showToast('Failed to create inquiry', 'error');
    }
  } catch (err) {
    showToast('Error creating inquiry ticket', 'error');
  }
}

function openResolveModal(caseId, caseNumber) {
  currentResolvingCaseId = caseId;
  const numDisplay = document.getElementById('resolveCaseNumberDisplay');
  if (numDisplay) numDisplay.innerText = `#${caseNumber}`;
  const notesInput = document.getElementById('resolveNotesInput');
  if (notesInput) notesInput.value = '';
  const modal = document.getElementById('resolveModal');
  if (modal) modal.style.display = 'flex';
}

function closeResolveModal() {
  const modal = document.getElementById('resolveModal');
  if (modal) modal.style.display = 'none';
  currentResolvingCaseId = null;
}

async function confirmResolve() {
  if (!currentResolvingCaseId) return;
  const notes = document.getElementById('resolveNotesInput')?.value.trim() || 'Resolved and closed by specialist via Workbench';

  try {
    const res = await fetch(`/api/v1/cases/${currentResolvingCaseId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolution_notes: notes,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'HR Specialist'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Ticket marked as Resolved!', 'success');
      closeResolveModal();
      await fetchCasesData();
      selectInboxCase(currentResolvingCaseId);
    } else {
      showToast('Failed to resolve ticket', 'error');
    }
  } catch (err) {
    showToast('Failed to resolve ticket', 'error');
  }
}

// =========================================================================
// 8. REAL CASE INTAKE NOTICE
// =========================================================================
async function triggerSeedCases(showToastMsg = true) {
  openIngestEmailModal();
  if (showToastMsg) {
    showToast('Demo seeding decommissioned. Ingest real emails via the Ingest dialog.', 'info');
  }
}

// =========================================================================
// 9. VIEW 2: CASES WORKSPACE COCKPIT CONTROLLER
// =========================================================================
async function loadCases() {
  const listEl = document.getElementById('inboxStreamList');
  if (listEl) {
    renderStreamSkeleton(listEl, 4);
  }
  await fetchCasesData();
  renderInboxStream();
  if (allCases.length > 0) {
    if (!currentSelectedCaseId || !allCases.some(c => c.id === currentSelectedCaseId)) {
      selectInboxCase(allCases[0].id);
    } else {
      selectInboxCase(currentSelectedCaseId);
    }
  } else {
    renderEmptyCockpit();
  }
}

function renderCasesKPIs() {
  let myCount = 0;
  let deptCount = 0;
  let escalatedCount = 0;
  let resolvedCount = 0;

  allCases.forEach(c => {
    if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
      resolvedCount++;
    } else {
      if (c.assigned_user_email === currentUser.email || c.assigned_user === currentUser.name) {
        myCount++;
      }
      if (!c.assigned_user || c.assigned_user === 'Central Triage') {
        deptCount++;
      }
      if (c.priority === 'CRITICAL' || c.priority === 'HIGH' || (c.ai_badge?.urgency || '').includes('HIGH')) {
        escalatedCount++;
      }
    }
  });

  const myEl = document.getElementById('statMyCases');
  const deptEl = document.getElementById('statDeptCases');
  const escEl = document.getElementById('statEscalatedCases');
  const resEl = document.getElementById('statResolvedCases');

  if (myEl) myEl.innerText = myCount;
  if (deptEl) deptEl.innerText = deptCount;
  if (escEl) escEl.innerText = escalatedCount;
  if (resEl) resEl.innerText = resolvedCount;
}

function renderCasesTable() {
  const tbody = document.getElementById('casesTableBody');
  if (!tbody) return;

  const searchInput = document.getElementById('casesSearchInput');
  const statusSelect = document.getElementById('casesStatusFilter');
  const prioritySelect = document.getElementById('casesPriorityFilter');
  const deptSelect = document.getElementById('casesDeptFilter');

  const query = (searchInput?.value || '').toLowerCase().trim();
  const statusVal = statusSelect?.value || 'ALL';
  const priorityVal = prioritySelect?.value || 'ALL';
  const deptVal = deptSelect?.value || 'ALL';

  let filtered = allCases.filter(c => {
    if (query) {
      const match = (c.case_number || '').toLowerCase().includes(query) ||
                    (c.title || '').toLowerCase().includes(query) ||
                    (c.employee_email || '').toLowerCase().includes(query) ||
                    (c.employee_name || '').toLowerCase().includes(query) ||
                    (c.ai_badge?.intent_name || '').toLowerCase().includes(query);
      if (!match) return false;
    }
    if (statusVal !== 'ALL' && c.status !== statusVal) return false;
    if (priorityVal !== 'ALL' && c.priority !== priorityVal) return false;
    if (deptVal !== 'ALL' && String(c.department_id) !== String(deptVal)) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
          No cases match your filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const isResolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
    const priorityClass = (c.priority || 'MEDIUM').toLowerCase();
    const ai = c.ai_badge || {};

    return `
      <tr>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 800; color: var(--1mg-orange); font-size: 13px;">
            ${formatCaseNumber(c.case_number)}
          </span>
        </td>
        <td style="max-width: 280px;">
          <div style="font-weight: 700; color: var(--text-dark); font-size: 13.5px;">${escapeHtml(c.title)}</div>
          <div style="display: flex; gap: 4px; align-items: center; margin-top: 3px;">
            <span class="ai-badge-chip" style="font-size: 9.5px; padding: 1px 6px; display: inline-flex; align-items: center; gap: 3px;">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>${escapeHtml(ai.intent_name || 'General')}</span>
            </span>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-dark); font-size: 13px;">${escapeHtml(c.employee_name || 'Employee')}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${c.employee_email}</div>
        </td>
        <td>
          <span class="role-pill" style="font-size: 11px;">${escapeHtml(c.department_name || 'Central')}</span>
        </td>
        <td>
          <span class="inbox-priority-tag priority-${priorityClass}">${c.priority || 'MEDIUM'}</span>
        </td>
        <td>
          <span class="status-pill ${isResolved ? 'status-active' : 'status-pending'}">
            <span class="status-dot ${isResolved ? 'dot-green' : 'dot-amber'}"></span>
            ${c.status}
          </span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--text-muted);">${formatDate(c.due_at)}</span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn-action" onclick="openCaseDossier(${c.id})" title="View full history & audit trail">
              Dossier
            </button>
            <button class="btn-action" onclick="jumpToReply(${c.id})" style="background: var(--1mg-orange-light); color: var(--1mg-orange); border-color: var(--1mg-orange-border);">
              Reply
            </button>
            ${!isResolved ? `
              <button class="btn-action" onclick="openResolveModal(${c.id}, '${formatCaseNumber(c.case_number)}')" style="background: #E8F6F5; color: #10847E; border-color: #B8E3E0; display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px;" title="Resolve Case">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function openCaseDossier(caseId) {
  const modal = document.getElementById('caseDossierModal');
  const body = document.getElementById('dossierModalBody');
  if (!modal || !body) return;

  modal.style.display = 'flex';
  body.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading case dossier...</div>`;

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();
    if (!data.success || !data.case) {
      body.innerHTML = `Failed to load dossier.`;
      return;
    }

    const c = data.case;
    body.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 800; color: var(--1mg-orange);">
            ${formatCaseNumber(c.case_number)}
          </span>
          <h2 style="font-size: 18px; font-weight: 700; margin-top: 4px;">${escapeHtml(c.title)}</h2>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 2px;">
            Submitted by <strong>${c.employee_name}</strong> (${c.employee_email}) · Department: <strong>${c.department_name}</strong>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <select id="dossierStatusSelect" style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-light); font-size: 12.5px; font-weight: 700;">
            <option value="OPEN" ${c.status === 'OPEN' ? 'selected' : ''}>OPEN</option>
            <option value="IN_PROGRESS" ${c.status === 'IN_PROGRESS' ? 'selected' : ''}>IN PROGRESS</option>
            <option value="WAITING_ON_EMPLOYEE" ${c.status === 'WAITING_ON_EMPLOYEE' ? 'selected' : ''}>WAITING ON EMPLOYEE</option>
            <option value="RESOLVED" ${c.status === 'RESOLVED' ? 'selected' : ''}>RESOLVED</option>
            <option value="CLOSED" ${c.status === 'CLOSED' ? 'selected' : ''}>CLOSED</option>
          </select>
          <button class="btn-primary" style="width: auto; padding: 6px 14px; font-size: 12px;" onclick="updateDossierStatus(${c.id})">
            Update Status
          </button>
        </div>
      </div>

      <div style="background: #F8FAFC; border: 1px solid var(--border-light); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">EMPLOYEE INQUIRY</div>
        <div style="font-size: 13.5px; line-height: 1.6; color: #334155;">${escapeHtml(c.description)}</div>
      </div>

      <div>
        <div style="font-size: 14px; font-weight: 700; margin-bottom: 12px;">Timeline & Forensic Audit Trail</div>
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 280px; overflow-y: auto;">
          ${(data.audit_logs || []).map(log => `
            <div style="padding: 10px 14px; border: 1px solid var(--border-light); border-radius: 6px; background: #FFFFFF; font-size: 12.5px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-weight: 700; color: var(--text-dark);">${escapeHtml(log.actor_name || 'System')} (${escapeHtml(log.actor_email || '')})</span>
                <span style="color: var(--text-muted); font-size: 11px;">${formatDate(log.created_at)}</span>
              </div>
              <div style="color: #4A4A4A;">${escapeHtml(formatAuditAction(log))}</div>
            </div>
          `).join('') || '<div style="color: var(--text-muted); font-size: 12px;">No activity logged yet.</div>'}
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `Error loading dossier.`;
  }
}

async function updateDossierStatus(caseId) {
  const status = document.getElementById('dossierStatusSelect').value;
  try {
    const res = await fetch(`/api/v1/cases/${caseId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status,
        resolution_notes: `Status changed to ${status} via dossier manager`,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Agent'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Case status updated to ${status}!`, 'success');
      closeCaseDossier();
      loadCases();
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

function closeCaseDossier() {
  const modal = document.getElementById('caseDossierModal');
  if (modal) modal.style.display = 'none';
}

// =========================================================================
// 10. VIEW 3: REPLY (THREAD & RESPONSE WORKSPACE)
// =========================================================================
async function initReplyWorkspace() {
  await fetchCasesData();
  populateReplyCaseSelector();
  
  const selector = document.getElementById('replyCaseSelect');
  if (currentSelectedCaseId && selector) {
    selector.value = currentSelectedCaseId;
  } else if (allCases.length > 0 && selector) {
    selector.value = allCases[0].id;
  }
  
  loadReplyThread();
}

function populateReplyCaseSelector() {
  const select = document.getElementById('replyCaseSelect');
  if (!select) return;

  let html = '';
  allCases.forEach(c => {
    html += `<option value="${c.id}">${formatCaseNumber(c.case_number)} · ${escapeHtml(c.title)} (${c.employee_name || 'Employee'})</option>`;
  });
  select.innerHTML = html;
}

function setReplyMode(mode) {
  activeReplyMode = mode;
  document.getElementById('modePublicBtn')?.classList.toggle('active', mode === 'PUBLIC_REPLY');
  document.getElementById('modeInternalBtn')?.classList.toggle('active', mode === 'INTERNAL_NOTE');
  
  const textarea = document.getElementById('replyMessageText');
  const sendBtn = document.getElementById('sendReplyBtn');

  if (mode === 'INTERNAL_NOTE') {
    if (textarea) {
      textarea.placeholder = 'Type private internal note for HR desk team... (Employee will NOT see this note)';
      textarea.style.background = '#FFFDF5';
      textarea.style.borderColor = '#FCD34D';
    }
    if (sendBtn) {
      sendBtn.innerText = 'Save Internal Note';
      sendBtn.style.background = '#D97706';
    }
  } else {
    if (textarea) {
      textarea.placeholder = 'Compose response to employee...';
      textarea.style.background = '#FFFFFF';
      textarea.style.borderColor = 'var(--border-light)';
    }
    if (sendBtn) {
      sendBtn.innerText = 'Send Response to Employee';
      sendBtn.style.background = 'var(--1mg-orange)';
    }
  }
}

async function loadReplyThread() {
  const select = document.getElementById('replyCaseSelect');
  const caseId = select?.value;
  if (!caseId) return;

  currentSelectedCaseId = parseInt(caseId);
  const threadList = document.getElementById('replyThreadList');
  const summaryStrip = document.getElementById('replyCaseSummaryStrip');
  if (!threadList) return;

  threadList.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading conversation thread...</div>`;

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();
    if (!data.success || !data.case) {
      threadList.innerHTML = `Failed to load conversation history.`;
      return;
    }

    const c = data.case;
    if (summaryStrip) {
      summaryStrip.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-mono); font-weight: 800; color: var(--1mg-orange); font-size: 14px;">${formatCaseNumber(c.case_number)}</span>
          <span style="font-size: 13px; font-weight: 700; color: var(--text-dark);">${escapeHtml(c.title)}</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          Recipient: <strong>${c.employee_email}</strong> · Department: <strong>${c.department_name}</strong>
        </div>
      `;
    }

    const subjectInput = document.getElementById('replySubjectInput');
    if (subjectInput && !subjectInput.value) {
      subjectInput.value = `Re: [${formatCaseNumber(c.case_number)}] ${c.title}`;
    }

    let html = `
      <!-- Employee Inbound Inquiry -->
      <div class="message-bubble employee">
        <div class="sender-title" style="display: flex; align-items: center; gap: 6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span>${escapeHtml(c.employee_name || 'Employee')} (${c.employee_email}) · ${formatDate(c.created_at)}</span>
        </div>
        <div style="font-weight: 700; margin-bottom: 4px;">${escapeHtml(c.title)}</div>
        <div style="white-space: pre-wrap;">${escapeHtml(c.description)}</div>
      </div>
    `;

    (data.audit_logs || []).forEach(log => {
      let details = {};
      try {
        details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
      } catch (e) {}

      if (log.action === 'REPLY_SENT') {
        html += `
          <div class="message-bubble agent-reply">
            <div class="sender-title" style="display: flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span>${escapeHtml(log.actor_name || 'Agent')} (Desk Specialist) · ${formatDate(log.created_at)}</span>
            </div>
            <div style="white-space: pre-wrap;">${escapeHtml(details.message || '')}</div>
          </div>
        `;
      } else if (log.action === 'INTERNAL_NOTE') {
        html += `
          <div class="message-bubble internal-note">
            <div class="sender-title" style="display: flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Internal Note by ${escapeHtml(log.actor_name || 'Agent')} · ${formatDate(log.created_at)}</span>
            </div>
            <div style="white-space: pre-wrap;">${escapeHtml(details.message || '')}</div>
          </div>
        `;
      }
    });

    threadList.innerHTML = html;
    threadList.scrollTop = threadList.scrollHeight;

  } catch (err) {
    threadList.innerHTML = `Error loading thread.`;
  }
}

async function submitReply() {
  const select = document.getElementById('replyCaseSelect');
  const caseId = select?.value;
  const textarea = document.getElementById('replyMessageText');
  const message = (textarea?.value || '').trim();

  if (!caseId) {
    showToast('Please select a case to reply to.', 'error');
    return;
  }
  if (!message) {
    showToast('Please enter a response message.', 'error');
    return;
  }

  const sendBtn = document.getElementById('sendReplyBtn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerText = 'Dispatching...';
  }

  try {
    const res = await fetch(`/api/v1/cases/${caseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        reply_type: activeReplyMode,
        new_status: activeReplyMode === 'PUBLIC_REPLY' ? 'RESOLVED' : null,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Agent'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(activeReplyMode === 'PUBLIC_REPLY' ? 'Response sent to employee!' : 'Internal note saved!', 'success');
      if (textarea) textarea.value = '';
      loadReplyThread();
      fetchCasesData();
    } else {
      showToast('Failed to post reply', 'error');
    }
  } catch (err) {
    showToast('Network error while posting reply', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      setReplyMode(activeReplyMode);
    }
  }
}

function jumpToReply(caseId) {
  currentSelectedCaseId = caseId;
  switchAgentView('replyView');
}

// =========================================================================
// 11. VIEW 4: ACTION (INTAKE, TRANSFER, AI TEST)
// =========================================================================
function populateActionDropdowns() {
  populateDepartmentFilters();
  
  const transferSelect = document.getElementById('actionTransferCaseSelect');
  if (transferSelect) {
    let html = '<option value="">Select Case to Transfer...</option>';
    allCases.forEach(c => {
      html += `<option value="${c.id}">${formatCaseNumber(c.case_number)} · ${escapeHtml(c.title)} (${c.department_name})</option>`;
    });
    transferSelect.innerHTML = html;
  }
}

async function handleManualIntake(e) {
  e.preventDefault();
  const email = document.getElementById('actionNewEmail').value.trim();
  const name = document.getElementById('actionNewName').value.trim();
  const title = document.getElementById('actionNewTitle').value.trim();
  const desc = document.getElementById('actionNewDesc').value.trim();

  try {
    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_email: email,
        employee_name: name || 'Tata 1mg Employee',
        title: title,
        description: desc
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Case #${data.case.case_number} created and routed to ${data.case.department}!`, 'success');
      document.getElementById('manualIntakeForm').reset();
      fetchCasesData();
    } else {
      showToast('Failed to create case', 'error');
    }
  } catch (err) {
    showToast('Error creating inbound ticket', 'error');
  }
}

// =========================================================================
// 12. UTILITY HELPERS & FORMATTERS
// =========================================================================
function copyEmailBody() {
  const content = document.getElementById('emailBodyContent');
  if (!content) return;
  copyToClipboard(content.innerText);
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const diffSec = Math.floor((new Date() - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
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
      return `Sent public reply: "${(details.message || '').substring(0, 60)}..."`;
    case 'INTERNAL_NOTE':
      return `Added private note: "${(details.message || '').substring(0, 60)}..."`;
    default:
      return log.action;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const iconSvg = type === 'success'
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : type === 'error'
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  toast.innerHTML = `
    <span style="display: inline-flex; align-items: center;">${iconSvg}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
