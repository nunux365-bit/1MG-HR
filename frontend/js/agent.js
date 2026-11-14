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

// User Profiles & Switcher Definitions (tata1mg_desk)
const KNOWN_PROFILES = {
  1: { id: 1, name: 'Vaibhav Yadav (Admin)', email: 'vaibhav.v1@1mg.com', role: 'ADMIN', is_dept_head: true, department_id: 11, department_ids: [11], department_name: 'People Desk' }
};

let currentUser = JSON.parse(localStorage.getItem('1mg_user') || '{}');
if (!currentUser.email) {
  window.location.href = '/login.html';
}

function toggleUserProfileDropdown(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const popover = document.getElementById('googleProfilePopover');
  if (!popover) return;
  const isShowing = popover.style.display === 'block';
  popover.style.display = isShowing ? 'none' : 'block';
  const trigger = document.getElementById('googleAvatarTrigger');
  if (trigger) {
    trigger.setAttribute('aria-expanded', !isShowing);
    if (!isShowing) {
      trigger.classList.add('active');
    } else {
      trigger.classList.remove('active');
    }
  }
}

function closeUserProfileDropdown() {
  const popover = document.getElementById('googleProfilePopover');
  if (popover) popover.style.display = 'none';
  const trigger = document.getElementById('googleAvatarTrigger');
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('active');
  }
}

function openChangePasswordModalFromMenu() {
  closeUserProfileDropdown();
  openChangePasswordModal();
}

function toggleAgentSwitchDropdown() {
  const menu = document.getElementById('agentSwitchMenu');
  if (menu) {
    const isShowing = menu.style.display === 'block';
    menu.style.display = isShowing ? 'none' : 'block';
    if (!isShowing) {
      // Highlight current
      document.querySelectorAll('.agent-switch-item').forEach(it => {
        const email = it.querySelector('.as-email')?.innerText || '';
        it.classList.toggle('active', email.includes(currentUser.email));
      });
    }
  }
}

// Close profile dropdown & switcher when clicking outside or pressing Escape
document.addEventListener('click', (e) => {
  const accountWrapper = document.getElementById('googleAccountWrapper');
  const popover = document.getElementById('googleProfilePopover');
  if (popover && popover.style.display === 'block') {
    if (accountWrapper && !accountWrapper.contains(e.target)) {
      closeUserProfileDropdown();
    }
  }

  const menu = document.getElementById('agentSwitchMenu');
  const userMenu = document.querySelector('.user-profile-menu');
  if (menu && menu.style.display === 'block' && userMenu && !userMenu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUserProfileDropdown();
  }
});

function switchAgentProfile(userId) {
  const prof = KNOWN_PROFILES[userId];
  if (!prof) return;
  currentUser = { ...prof };
  localStorage.setItem('1mg_user', JSON.stringify(currentUser));
  window._hasShownAssignedNotice = false;
  closeUserProfileDropdown();
  const menu = document.getElementById('agentSwitchMenu');
  if (menu) menu.style.display = 'none';
  initUserSession();
  showToast(`Switched active colleague to ${currentUser.name} (${currentUser.is_dept_head ? 'Dept Head' : 'Specialist'})`, 'info');
  loadInboxEmails();
  loadCases();
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
  initMailInspectorScrollEffects();
  initCaseComposerShortcuts();
  loadDepartments().then(() => {
    switchAgentView('inboxView');
    fetchCasesData();
  });
});

function initCaseComposerShortcuts() {
  document.addEventListener('keydown', (e) => {
    const input = document.getElementById('quickReplyInput');
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (document.activeElement === input) {
        e.preventDefault();
        sendEmbeddedReply();
      }
    }
  });
}

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
  const largeAvatarEl = document.getElementById('agentLargeAvatar');
  const deptTagEl = document.getElementById('agentDeptTag');

  const fullName = currentUser.name || 'HR Agent';
  if (nameEl) nameEl.innerText = fullName;
  if (emailEl) emailEl.innerText = currentUser.email || 'agent@1mg.com';
  
  const initials = fullName.split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase() || 'RY';
  if (avatarEl) {
    avatarEl.innerText = initials;
  }
  if (largeAvatarEl) {
    largeAvatarEl.innerText = initials;
  }

  const trigger = document.getElementById('googleAvatarTrigger');
  if (trigger) {
    trigger.title = `People Desk Account: ${fullName} (${currentUser.email || ''})`;
  }

  const isAgent = currentUser.role !== 'ADMIN';
  const myDeptName = currentUser.department_name || 'Attendance HR';

  if (deptTagEl) {
    deptTagEl.innerText = isAgent ? `${myDeptName} Desk` : 'System Administrator';
  }

  // Dept Head badge
  const headBadge = document.getElementById('deptHeadBadge');
  if (headBadge) {
    headBadge.style.display = currentUser.is_dept_head ? 'inline-flex' : 'none';
  }

  // Admin menu option inside Google dropdown
  const adminMenuItem = document.getElementById('gpAdminMenuItem');
  if (adminMenuItem) {
    adminMenuItem.style.display = currentUser.role === 'ADMIN' ? 'block' : 'none';
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

  // Initialize Mailbox Status for Dept Head & Admin
  initMailboxStatus();
}

async function initMailboxStatus() {
  const statusBtn = document.getElementById('btnMailboxStatus');
  const statusDot = document.getElementById('mailboxStatusDot');
  const statusLabel = document.getElementById('mailboxStatusLabel');

  const isHeadOrAdmin = Boolean(currentUser.is_dept_head || currentUser.role === 'ADMIN');
  if (!isHeadOrAdmin) {
    if (statusBtn) statusBtn.style.display = 'none';
    return;
  }

  if (statusBtn) statusBtn.style.display = 'inline-flex';

  try {
    const deptParam = currentUser.department_id ? `department_id=${currentUser.department_id}&` : '';
    const userParam = currentUser.id ? `user_id=${currentUser.id}` : '';
    const res = await fetch(`/api/v1/inbox/mailbox-status?${deptParam}${userParam}`);
    const data = await res.json();

    if (data.success) {
      if (data.configured) {
        if (statusDot) statusDot.style.background = '#10B981';
        if (statusLabel) statusLabel.innerText = `Mailbox: ${data.account_email || 'Connected'}`;
        currentUser.mail_configured = true;
      } else {
        if (statusDot) statusDot.style.background = '#F59E0B';
        if (statusLabel) statusLabel.innerText = 'Mailbox: Setup Required';
        currentUser.mail_configured = false;
      }
      localStorage.setItem('1mg_user', JSON.stringify(currentUser));
    }
  } catch (e) {
    console.warn('Mailbox status check:', e);
  }

  // Centralized People Desk mailbox handles ingestion; no personal app password prompt is needed.
}

function openMailboxConfigModal() {
  const modal = document.getElementById('mailboxConfigModal');
  if (!modal) return;
  const centralEmailEl = document.getElementById('modalCentralMailEmail');
  if (centralEmailEl) {
    centralEmailEl.innerText = 'peopledesk@1mg.com';
  }
  modal.style.display = 'flex';
}

function closeMailboxConfigModal() {
  const modal = document.getElementById('mailboxConfigModal');
  if (modal) modal.style.display = 'none';
}

function openChangePasswordModal() {
  const modal = document.getElementById('changePasswordModal');
  if (!modal) return;
  const currInput = document.getElementById('currentPasswordInput');
  const newInput = document.getElementById('newPasswordChangeInput');
  const confInput = document.getElementById('confirmPasswordChangeInput');
  if (currInput) currInput.value = '';
  if (newInput) newInput.value = '';
  if (confInput) confInput.value = '';
  modal.style.display = 'flex';
  currInput?.focus();
}

function closeChangePasswordModal() {
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.style.display = 'none';
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const current_password = document.getElementById('currentPasswordInput')?.value.trim();
  const new_password = document.getElementById('newPasswordChangeInput')?.value.trim();
  const confirm_password = document.getElementById('confirmPasswordChangeInput')?.value.trim();
  const btn = document.getElementById('btnSubmitChangePassword');

  if (!current_password || !new_password || !confirm_password) {
    showToast('Please fill in all password fields.', 'warning');
    return;
  }
  if (new_password.length < 6) {
    showToast('New password must be at least 6 characters long.', 'warning');
    return;
  }
  if (new_password !== confirm_password) {
    showToast('New passwords do not match. Please re-enter.', 'warning');
    return;
  }

  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div><span>Updating...</span>`;
  }

  try {
    const res = await fetch('/api/v1/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentUser.email,
        current_password,
        new_password,
        confirm_password
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('🎉 Password changed successfully!', 'success');
      closeChangePasswordModal();
    } else {
      showToast(data.detail || data.message || 'Failed to update password.', 'error');
    }
  } catch (err) {
    console.error('Password change error:', err);
    showToast('Network error while updating password.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// =========================================================================
// 2. VIEW SWITCHING & SIDEBAR
// =========================================================================
const agentViewTitles = {
  inboxView: 'INBOX WORKBENCH',
  casesView: 'CASES WORKSPACE',
  replyView: 'REPLY WORKSPACE',
  actionView: 'SLA PERFORMANCE & OPERATIONS'
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
    loadSlaDashboard();
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
  const profileTab = document.getElementById('tabProfileView');
  const auditTab = document.getElementById('tabAuditView');
  const dualContent = document.getElementById('inspectorDualContent');
  const profileContent = document.getElementById('inspectorProfileContent');
  const auditContent = document.getElementById('inspectorAuditContent');

  // Reset all tabs
  inquiryTab?.classList.remove('active');
  profileTab?.classList.remove('active');
  auditTab?.classList.remove('active');

  // Hide all panels
  if (dualContent) dualContent.style.display = 'none';
  if (profileContent) profileContent.style.display = 'none';
  if (auditContent) auditContent.style.display = 'none';

  if (viewType === 'audit') {
    auditTab?.classList.add('active');
    if (auditContent) auditContent.style.display = 'block';
  } else if (viewType === 'profile') {
    profileTab?.classList.add('active');
    if (profileContent) profileContent.style.display = 'block';
  } else {
    inquiryTab?.classList.add('active');
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

function hasUniversalDeskAccess() {
  if (currentUser?.role === 'ADMIN') return true;
  const userDeptIds = (currentUser?.department_ids && currentUser.department_ids.length > 0)
    ? currentUser.department_ids.map(Number)
    : (currentUser?.department_id ? [Number(currentUser.department_id)] : []);
  if (userDeptIds.includes(11)) return true;
  return (allDepartments || []).some(d => {
    if (!userDeptIds.includes(Number(d.id))) return false;
    const scope = `${d.category_code || ''} ${d.dept_code || ''} ${d.team_name || ''}`.toUpperCase();
    return scope.includes('PEOPLEDESK') || scope.includes('ALL_HR');
  });
}

async function fetchCasesData() {
  const isAgent = currentUser.role !== 'ADMIN';
  let url = '/api/v1/cases?page=1&limit=100';

  if (isAgent) {
    if (currentUser.department_ids && currentUser.department_ids.length > 0) {
      url += `&department_ids=${currentUser.department_ids.join(',')}&include_universal=true`;
    } else if (currentUser.department_id) {
      url += `&department_id=${currentUser.department_id}&include_universal=true`;
    }
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success && data.cases) {
      let cases = data.cases;

      // Client-side department isolation only for single/specialized desks (People Desk central agents see all routed queues)
      if (isAgent && !hasUniversalDeskAccess()) {
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
  // 1. Inbox Badge: Inbound Actionable Emails
  const inboxBadge = document.getElementById('inboxBadge');
  if (inboxBadge) {
    let inboxCount = 0;
    if (window.lastInboxEmailCounts && window.lastInboxEmailCounts.actionable !== undefined) {
      inboxCount = window.lastInboxEmailCounts.actionable || window.lastInboxEmailCounts.useful || 0;
    } else if (allInboxEmails && allInboxEmails.length > 0) {
      inboxCount = allInboxEmails.filter(e => !e.is_converted && e.is_actionable === 1).length;
    }
    inboxBadge.innerText = inboxCount;
    inboxBadge.style.display = inboxCount > 0 ? 'inline-flex' : 'none';
  }

  // 2. Case Badge: Active/Open Cases
  const caseBadge = document.getElementById('caseBadge');
  if (caseBadge) {
    const activeCases = (allCases || []).filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED');
    caseBadge.innerText = activeCases.length;
    caseBadge.style.display = activeCases.length > 0 ? 'inline-flex' : 'none';
  }

  // 3. Reply Badge: In-Progress / Open Cases
  const replyBadge = document.getElementById('replyBadge');
  if (replyBadge) {
    const replyCount = (allCases || []).filter(c => c.status === 'IN_PROGRESS' || c.status === 'OPEN').length;
    replyBadge.innerText = replyCount;
    replyBadge.style.display = replyCount > 0 ? 'inline-flex' : 'none';
  }

  // 4. Action Badge: Urgent / High Priority Cases
  const actionBadge = document.getElementById('actionBadge');
  if (actionBadge) {
    const urgentCount = (allCases || []).filter(c => 
      (c.priority === 'CRITICAL' || c.priority === 'HIGH' || (c.ai_badge?.urgency || '').includes('HIGH')) &&
      c.status !== 'RESOLVED' && c.status !== 'CLOSED'
    ).length;
    actionBadge.innerText = urgentCount;
    actionBadge.style.display = urgentCount > 0 ? 'inline-flex' : 'none';
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
    // 1. Trigger backend mailbox sync (central People Desk mailbox relies on AI department detection)
    const syncBody = {};
    if (!hasUniversalDeskAccess() && currentUser.department_id) {
      syncBody.department_id = currentUser.department_id;
    }
    if (currentUser.id) syncBody.user_id = currentUser.id;

    const syncRes = await fetch('/api/v1/inbox/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncBody)
    });
    const syncData = await syncRes.json().catch(() => ({}));
    // 2. Refresh inbound emails AND cases queue silently so auto-created 1MGXXXXX tickets appear immediately
    await Promise.all([
      loadInboxEmails({ silent: true }),
      fetchCasesData()
    ]);
    if (syncData?.cases_created > 0) {
      showToast(`✨ ${syncData.cases_created} new ${syncData.cases_created === 1 ? 'case' : 'cases'} auto-created & routed by AI!`, 'success');
      if (document.getElementById('casesView')?.classList.contains('active')) {
        loadAgentCasesKPIs();
        renderAgentQueueTabs();
        renderAgentCasesTable();
      }
    }
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
  if (currentUser?.role !== 'ADMIN') {
    if (currentUser?.department_ids && currentUser?.department_ids.length > 0) {
      deptParam = `&department_ids=${currentUser.department_ids.join(',')}`;
    } else if (currentUser?.department_id) {
      deptParam = `&department_id=${currentUser.department_id}`;
    }
  }

  let mailboxParam = '';
  if (currentUser?.is_dept_head && currentUser?.dept_gmail && currentUser?.dept_gmail.includes('@')) {
    mailboxParam = `&account_email=${encodeURIComponent(currentUser.dept_gmail)}`;
  }

  const userParam = currentUser?.id ? `&user_id=${currentUser.id}&user_email=${encodeURIComponent(currentUser.email || '')}` : '';

  const searchInput = document.getElementById('inboxSearchInput');
  const searchParam = searchInput && searchInput.value ? `&search=${encodeURIComponent(searchInput.value.trim())}` : '';

  try {
    const res = await fetch(`/api/v1/inbox/emails?tab=${currentInboxTriageTab}${deptParam}${mailboxParam}${userParam}${searchParam}`);
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
        const cAssignedMe = document.getElementById('countAssignedMeBadge');

        if (cUseful) cUseful.innerText = data.counts.useful ?? 0;
        if (cActionable) cActionable.innerText = data.counts.actionable ?? 0;
        if (cUnclaimed) cUnclaimed.innerText = data.counts.unclaimed ?? 0;
        if (cNoise) cNoise.innerText = data.counts.noise ?? 0;
        if (cAssignedMe) {
          cAssignedMe.innerText = data.counts.assigned_to_me ?? 0;
        }

        window.lastInboxEmailCounts = data.counts;
        updateSidebarBadges();

        // If user has assigned cases and we just loaded, announce quietly
        if (!isSilent && data.counts.assigned_to_me > 0 && !window._hasShownAssignedNotice) {
          window._hasShownAssignedNotice = true;
          const assignedCount = data.counts.assigned_to_me;
          showToast(`👤 Notice: You have ${assignedCount} inquiry${assignedCount > 1 ? 's' : ''} assigned to you in "Assigned to Me" tab`, 'info');
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
  if (btnEl) {
    btnEl.classList.add('active');
  } else {
    const tabMap = {
      'useful': 'tabUsefulMail',
      'actionable': 'tabActionableMail',
      'unclaimed': 'tabUnclaimedMail',
      'noise': 'tabNoiseMail',
      'assigned_to_me': 'tabAssignedMe'
    };
    const tabBtn = document.getElementById(tabMap[tab] || 'tabUsefulMail');
    if (tabBtn) tabBtn.classList.add('active');
  }
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

  const appleAvatarGradients = [
    'linear-gradient(135deg, #FF6F61 0%, #FA5252 100%)',
    'linear-gradient(135deg, #0A84FF 0%, #0066CC 100%)',
    'linear-gradient(135deg, #10B190 0%, #059669 100%)',
    'linear-gradient(135deg, #BF5AF2 0%, #8944AB 100%)',
    'linear-gradient(135deg, #FF9F0A 0%, #D48000 100%)',
    'linear-gradient(135deg, #64D2FF 0%, #0091FF 100%)'
  ];

  let cardsHtml = filtered.map((e, idx) => {
    const isSelected = e.id === currentSelectedEmailId;
    const isUnread = !e.is_read;
    const ai = e.ai_insights || {};
    const color = appleAvatarGradients[Math.abs(e.id || idx) % appleAvatarGradients.length];
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

    // Converted Status or Actionable Status chip
    const isConverted = Boolean(e.is_converted && e.case_number);
    const isAwaitingEmpId = Boolean(e.actionable_reason === 'AWAITING_EMP_ID' || (ai.requires_emp_id && e.actionable_reason !== 'VERIFIED_BY_REPLY'));
    const isVerifiedByReply = Boolean(e.actionable_reason === 'VERIFIED_BY_REPLY' || (ai.detected_code && !isDomainVerified));
    let statusChip = '';
    if (isConverted) {
      statusChip = `<span class="apple-chip chip-converted" title="Converted to Case ${e.case_number}">✓ ${formatCaseNumber(e.case_number)}</span>`;
    } else if (isVerifiedByReply) {
      statusChip = `<span class="apple-chip" style="background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.3);" title="Employee ID Verified from Reply"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> ${ai.detected_code || 'Verified'}</span>`;
    } else if (isAwaitingEmpId) {
      statusChip = `<span class="apple-chip chip-warning" style="background: rgba(245, 158, 11, 0.12); color: #B45309; border: 1px solid rgba(245, 158, 11, 0.3);" title="Awaiting Employee ID"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Need Emp ID</span>`;
    } else if (e.is_actionable === 1) {
      statusChip = `<span class="apple-chip chip-actionable" title="Actionable HR Request"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Actionable</span>`;
    } else {
      statusChip = `<span class="apple-chip chip-noise" title="Noise Ingest">Noise</span>`;
    }

    const threadChip = (e.thread_count && e.thread_count > 1)
      ? `<span class="apple-chip" style="background: #EFF6FF; color: #1D4ED8; font-weight: 700; border: 1px solid #BFDBFE;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> ${e.thread_count} msgs</span>`
      : '';

    // Colleague Assignment Chip
    const isAssignedToMe = (
      (e.assigned_user_id && currentUser?.id && e.assigned_user_id === currentUser.id) ||
      (e.assigned_user_email && currentUser?.email && e.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase())
    );
    let assignmentChip = '';
    if (isAssignedToMe) {
      assignmentChip = `<span class="apple-chip chip-assigned-me" title="Assigned directly to you"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Assigned to You</span>`;
    } else if (e.assigned_user_name) {
      assignmentChip = `<span class="apple-chip chip-assigned-other" title="Assigned to ${escapeHtml(e.assigned_user_name)}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ${escapeHtml(e.assigned_user_name)}</span>`;
    } else {
      assignmentChip = `<span class="apple-chip chip-unassigned-pool" title="Unassigned in Desk Pool">⚡ Pool</span>`;
    }

    const catKey = (e.category || 'INQUIRY').toLowerCase();
    const formattedCat = formatCategoryTitle(e.category);
    const isUrgent = Boolean(ai.is_urgent || (ai.urgency || '').includes('HIGH'));
    const slaText = isUrgent ? '4h Urgent' : (ai.target_sla ? ai.target_sla.replace('Target SLA', 'SLA') : '48h SLA');
    const dateFormatted = formatAppleDate(e.received_at);

    // Apple-styled Domain Badge
    const domainBadge = isDomainVerified
      ? `<span class="apple-pill-badge verified" title="Verified 1mg Employee">1MG</span>`
      : `<span class="apple-pill-badge ext" title="External Senders">EXT</span>`;

    return `
      <div class="stream-card ${isSelected ? 'active' : ''} ${isUnread ? 'is-unread' : 'is-read'}" onclick="selectInboxEmail(${e.id})">
        <!-- Row 1: Sender Header + Time + Unread indicator -->
        <div class="apple-card-top">
          <div class="apple-sender-group">
            <div class="apple-avatar" style="background: ${color};">${initial}</div>
            <div class="apple-sender-meta">
              <span class="apple-sender-name" title="${escapeHtml(senderName)}">${escapeHtml(senderName)}</span>
              ${domainBadge}
            </div>
          </div>
          <div class="apple-card-right-meta">
            <span class="apple-card-time">${dateFormatted}</span>
            ${isUnread ? '<span class="apple-unread-dot" title="Unread email"></span>' : '<span class="apple-read-check" title="Read">✓</span>'}
          </div>
        </div>

        <!-- Row 2: Subject Line -->
        <div class="apple-card-subject" title="${escapeHtml(e.subject || '')}">
          ${escapeHtml(e.subject || 'Untitled Email')}
        </div>

        <!-- Row 3: Body Snippet -->
        <div class="apple-card-snippet">
          ${escapeHtml(cleanSnippet)}
        </div>

        <!-- Row 4: Apple Micro-Chips Meta Strip -->
        <div class="apple-card-chips">
          <span class="apple-chip chip-dept ${catKey}">${escapeHtml(formattedCat)}</span>
          <span class="apple-chip chip-sla ${isUrgent ? 'urgent' : ''}">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>${escapeHtml(slaText)}</span>
          </span>
          ${assignmentChip}
          ${threadChip}
          ${statusChip}
        </div>
      </div>
    `;
  }).join('');

  cardsHtml += `
    <div class="stream-cards-list-footer" style="padding: 12px; text-align: center; color: #94A3B8; font-size: 11px; font-weight: 500;">
      Showing ${filtered.length} ${filtered.length === 1 ? 'item' : 'items'} · Auto-synced
    </div>
  `;

  streamList.innerHTML = cardsHtml;

  if (railEl) {
    railEl.innerHTML = filtered.map((e, idx) => {
      const color = appleAvatarGradients[Math.abs(e.id || idx) % appleAvatarGradients.length];
      const initial = (e.ai_insights?.detected_name || e.sender_name || 'E').charAt(0).toUpperCase();
      const isSelected = e.id === currentSelectedEmailId;
      return `
        <div class="apple-avatar ${isSelected ? 'active' : ''}" style="background: ${color}; width: 32px; height: 32px; font-size: 12px; cursor: pointer; border: ${isSelected ? '2px solid #FF6F61' : 'none'}; box-shadow: 0 2px 6px rgba(0,0,0,0.08);" title="${escapeHtml(e.subject || '')}" onclick="selectInboxEmail(${e.id})">
          ${initial}
        </div>
      `;
    }).join('');
  }
}

function formatAppleDate(dateStr) {
  if (!dateStr) return 'Recent';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recent';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else if (isYesterday) {
      return 'Yesterday';
    } else if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return d.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
    }
  } catch (e) {
    return 'Recent';
  }
}

function formatCategoryTitle(raw) {
  if (!raw) return 'General HR';
  const clean = String(raw).toUpperCase().trim();
  const map = {
    'GENERAL_HR': 'General HR',
    'PEOPLEDESK': 'People Desk',
    'PEOPLE_DESK': 'People Desk',
    'ATTENDANCE': 'Attendance',
    'PAYROLL': 'Payroll',
    'BENEFITS': 'Benefits',
    'ONBOARDING': 'Onboarding',
    'LEAVE': 'Leave & Attendance',
    'LEAVES': 'Leave & Attendance',
    'RELATIONS': 'Employee Relations',
    'IT_ASSET': 'IT Asset',
    'SYSTEM_ALERT': 'System',
    'NEWSLETTER': 'Newsletter',
    'SPAM': 'Spam',
    'INQUIRY': 'Inquiry'
  };
  return map[clean] || clean.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
    if (email.thread_messages && email.thread_messages.length > 1) {
      bodyEl.innerHTML = formatThreadConversationHtml(email);
    } else {
      bodyEl.innerHTML = formatEmailBodyHtml(email.body, email, email.ai_insights || {});
    }
  }
}

function formatThreadConversationHtml(email) {
  const threads = email.thread_messages || [];
  if (!threads.length) {
    return formatEmailBodyHtml(email.body, email, email.ai_insights || {});
  }

  let html = `
    <div class="inbox-thread-timeline">
      <div class="inbox-thread-header">
        <div class="inbox-thread-header-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 10h.01"></path><path d="M12 10h.01"></path><path d="M16 10h.01"></path></svg>
          <span>Threaded Conversation History (${threads.length} ${threads.length === 1 ? 'message' : 'messages'})</span>
        </div>
        <div style="font-size: 11px; font-weight: 700; color: #059669; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 3px 9px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Auto-Linked to Desk</span>
        </div>
      </div>
  `;

  threads.forEach((msg, idx) => {
    if (msg.type === 'SYSTEM_BOT') {
      html += `
        <div class="thread-item-bot">
          <div class="thread-bot-avatar" title="Tata 1mg Automated Service">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <circle cx="12" cy="5" r="2"></circle>
              <path d="M12 7v4"></path>
              <line x1="8" y1="16" x2="8.01" y2="16"></line>
              <line x1="16" y1="16" x2="16.01" y2="16"></line>
            </svg>
          </div>
          <div style="flex: 1;">
            <div class="thread-bot-title-group">
              <span class="thread-bot-heading">
                <span>Tata 1mg Automated Identity Verification</span>
                <span class="thread-bot-tag">System Bot</span>
              </span>
              <span class="thread-timestamp">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                ${msg.received_at ? formatAppleDate(msg.received_at) : 'Automated Step'}
              </span>
            </div>
            <div class="thread-bot-body">
              Inquiry arrived from external email domain without employee ID. Dispatched official identity verification request asking for their official Tata 1mg Employee ID.
            </div>
          </div>
        </div>
      `;
    } else {
      const isInitial = (msg.type === 'EMPLOYEE_INITIAL' || idx === 0);
      const isReply = (msg.type === 'EMPLOYEE_REPLY');
      const senderName = msg.sender_name || email.sender_name || 'Employee';
      const initial = senderName.charAt(0).toUpperCase();
      const codeChip = msg.detected_code
        ? `<span class="thread-id-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line></svg><span>Provided ID: <strong>${escapeHtml(msg.detected_code)}</strong></span></span>`
        : '';

      const rawText = msg.body || '';
      const quoteRegex = /(?:^|\n)(?:From:\s*|On\s+.*?\s+wrote:|---+ Original Message ---+)/i;
      const match = rawText.match(quoteRegex);
      let cleanBody = rawText;
      let quotedBody = '';

      if (match && match.index > 0) {
        cleanBody = rawText.substring(0, match.index).trim();
        quotedBody = rawText.substring(match.index).trim();
      }

      let quotedHtml = '';
      if (quotedBody) {
        const quotedLines = quotedBody.split('\n').filter(l => l.trim()).length;
        quotedHtml = `
          <details class="thread-quoted-details">
            <summary class="thread-quoted-summary">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              <span>View Quoted Email Chain (${quotedLines} lines)</span>
            </summary>
            <div class="thread-quoted-content">
              ${formatEmailBodyHtml(quotedBody, email, {})}
            </div>
          </details>
        `;
      }

      html += `
        <div class="thread-item-message ${isReply ? 'reply' : 'initial'}">
          <div class="thread-message-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="thread-user-avatar ${isReply ? 'reply' : 'initial'}">${initial}</div>
              <div style="display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 700; font-size: 13px; color: #0F172A;">${escapeHtml(senderName)}</span>
                  <span class="thread-role-badge ${isReply ? 'reply' : 'initial'}">
                    ${isReply
                      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg> Employee Reply'
                      : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Original Query'}
                  </span>
                  ${codeChip}
                </div>
                <span style="font-size: 11px; color: #64748B; margin-top: 1px;">&lt;${escapeHtml(msg.sender_email || email.sender_email)}&gt;</span>
              </div>
            </div>
            <span class="thread-timestamp">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${msg.received_at ? formatAppleDate(msg.received_at) : ''}
            </span>
          </div>
          <div style="font-size: 13px; line-height: 1.6; color: #334155;">
            ${formatEmailBodyHtml(cleanBody, email, email.ai_insights || {})}
          </div>
          ${quotedHtml}
        </div>
      `;
    }
  });

  html += `</div>`;
  return html;
}

function formatEmailBodyHtml(rawBody, email = {}, ai = {}) {
  if (!rawBody) return '<p class="mail-para text-muted">No message content provided.</p>';

  // 1. Decode pre-escaped HTML entities (&amp;, &quot;, etc.)
  let text = decodeHtmlEntities(String(rawBody))
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .trim();

  // 2. Intelligent paragraph segmentation for dense unspaced email content
  if (!text.includes('\n\n')) {
    text = text.replace(/([.!?])\s+(Congratulations!|As a member you get|Free shipping|Rapid deliveries|Early access to sale|Premium support|Exclusive offers|View all Benefits|Explore Care Plan now|Care Plan discount is|With lots of care|Need help\?|Download the app|Connect with us|Purchased on|Validity \d+ months|Visit your Care Plan page)/gi, '$1\n\n$2');
    text = text.replace(/(Order now|Free shipping|Rapid deliveries|Early access to sale|Exclusive offers|Download Invoice)\s+([A-Z])/g, '$1\n\n$2');
  }

  const paragraphs = text.split(/\n\s*\n/);
  const orgCounts = {};

  return paragraphs.map(p => {
    let trimmed = p.trim();
    if (!trimmed) return '';

    let safe = escapeHtml(trimmed);

    // AI Smart Highlighting if enabled (Clean Apple typography, NO disruptive inline SVGs!)
    if (isAiHighlightsActive) {
      // 1. Employee Code matching
      safe = safe.replace(/\b(EMP\d+|1MG\d+|NUNUX\d+)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-code" title="HRMS Identifier">${match}</mark>`;
      });

      // 2. Organization / Facility Entities (Max 2 to avoid clutter)
      safe = safe.replace(/\b(Apex Solutions|Tata 1mg|Gurugram DC Hub|Gurugram Hub|GitGuardian|GitHub|LottieFiles|Amplifon|Lenskart|Clove)\b/gi, (match) => {
        const k = match.toLowerCase();
        orgCounts[k] = (orgCounts[k] || 0) + 1;
        if (orgCounts[k] <= 2) {
          return `<mark class="ai-mark ai-mark-org" title="Entity: Organization / Facility">${match}</mark>`;
        }
        return match;
      });

      // 3. Dates & Times
      safe = safe.replace(/\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:\d{2,4})?|\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-date" title="Detected Date / Time">${match}</mark>`;
      });

      // 4. Critical Operational Statuses
      safe = safe.replace(/\b(pending|absent|failure|exposed|missing|urgent|denied|discrepancy)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-status" title="Status: ${match}"><span class="mark-status-dot"></span>${match}</mark>`;
      });

      // 5. Key HR Topics / Verification processes
      safe = safe.replace(/\b(background verification|employment verification|previous employment verification|biometric punch-in system|biometric attendance punch|optical scanner failure|health card|privilege leave|punch regularization|Care Plan membership|prescription medicines)\b/gi, (match) => {
        return `<mark class="ai-mark ai-mark-topic" title="Key HR / Operational Topic">${match}</mark>`;
      });

      // 6. Action Requests
      safe = safe.replace(/(check whether the employment verification request has been shared with my previous employer|check whether .*? has been shared|regularize the attendance for that date|regularize my morning in-punch|verify and update the portal ledger|Place an order now to start saving|Download Invoice)/gi, (match) => {
        return `<mark class="ai-mark ai-mark-action" title="Core Employee Action Request">${match}</mark>`;
      });
    }

    // Replace linebreaks inside paragraph with <br>
    safe = safe.replace(/\n/g, '<br>');

    // Check if paragraph is sign-off or disclaimer
    if (trimmed.match(/^(?:Regards|Warm regards|Thanks|Sincerely|Best|Thank you|With lots of care)[\s,]/i)) {
      return `<div class="mail-signoff-block">${safe}</div>`;
    }
    if (trimmed.match(/(?:©\s*\d{4}|All rights reserved|Tower\s*-B|Presidency Building)/i)) {
      return `<div class="mail-footer-block">${safe}</div>`;
    }

    return `<p class="mail-para">${safe}</p>`;
  }).filter(Boolean).join('');
}

function initMailInspectorScrollEffects() {
  const scrollEl = document.querySelector('.mail-inspector-scroll');
  const ribbonEl = document.getElementById('inboxInspectorRibbon');
  const topPill = document.getElementById('inboxScrollToTopBtn');

  if (!scrollEl) return;

  scrollEl.addEventListener('scroll', () => {
    const st = scrollEl.scrollTop;

    // 1. Dynamic Top Ribbon Elevation Shadow
    if (ribbonEl) {
      if (st > 10) {
        ribbonEl.classList.add('ribbon-scrolled');
      } else {
        ribbonEl.classList.remove('ribbon-scrolled');
      }
    }

    // 2. Floating Back to Top Pill
    if (topPill) {
      if (st > 140) {
        topPill.classList.add('visible');
      } else {
        topPill.classList.remove('visible');
      }
    }
  }, { passive: true });
}

function scrollMailToTop() {
  const scrollEl = document.querySelector('.mail-inspector-scroll');
  if (scrollEl) {
    scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function selectInboxEmail(emailId) {
  currentSelectedEmailId = emailId;
  const email = allInboxEmails.find(e => e.id === emailId);
  if (!email) {
    renderEmptyInboxCockpit();
    return;
  }

  try {
    // Handle read tracking: if unread, mark as read immediately and notify backend
  const wasUnread = !email.is_read;
  if (wasUnread) {
    email.is_read = true;
    email.read_by_name = currentUser?.name || 'Agent';
    email.read_at = new Date().toISOString();
    fetch(`/api/v1/inbox/emails/${emailId}/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser?.id,
        user_name: currentUser?.name || 'Agent'
      })
    }).catch(err => console.warn('[ReadTracking] Error:', err));
  }

  // Toggle active content / empty state
  const emptyState = document.getElementById('inboxEmptyState');
  const activeContent = document.getElementById('inboxActiveContent');
  if (emptyState) emptyState.style.display = 'none';
  if (activeContent) activeContent.style.display = 'flex';

  // Reset reader scroll position to top
  const scrollEl = document.querySelector('.mail-inspector-scroll');
  if (scrollEl) {
    scrollEl.scrollTop = 0;
  }
  const ribbonEl = document.getElementById('inboxInspectorRibbon');
  if (ribbonEl) {
    ribbonEl.classList.remove('ribbon-scrolled');
  }
  const topPill = document.getElementById('inboxScrollToTopBtn');
  if (topPill) {
    topPill.classList.remove('visible');
  }

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
  const ribRead = document.getElementById('inboxRibbonReadStatus');
  const toggleNoiseBtn = document.getElementById('inboxToggleNoiseBtn');
  const convertBtn = document.getElementById('inboxConvertCaseBtn');

  const deptTitle = formatCategoryTitle(email.category || ai.category);

  if (ribId) ribId.innerText = `#EML-${String(email.id).padStart(3, '0')}`;
  if (ribCat) ribCat.innerText = deptTitle;
  if (ribSlaText) ribSlaText.innerText = ai.target_sla ? ai.target_sla.replace('Target SLA', 'SLA') : '48h SLA';
  if (ribDesk) ribDesk.innerText = `${deptTitle} Desk`;

  const ribAssignee = document.getElementById('inboxRibbonAssignee');
  if (ribAssignee) {
    if (email.assigned_user_name) {
      ribAssignee.style.display = 'inline-flex';
      ribAssignee.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> <span>Assigned: ${escapeHtml(email.assigned_user_name)}</span>`;
      ribAssignee.title = `Specialist: ${email.assigned_user_name} (${email.assigned_user_email || ''})`;
    } else {
      ribAssignee.style.display = 'none';
    }
  }

  // 1b. Update Colleague Assignment & Handover Banner
  const assignBanner = document.getElementById('inboxAssignmentBanner');
  const handoverName = document.getElementById('inboxHandoverName');
  const handoverYouTag = document.getElementById('inboxHandoverYouTag');
  const notesRow = document.getElementById('inboxHandoverNotesRow');
  const notesText = document.getElementById('inboxHandoverNotesText');

  const isAssignedToMe = (
    (email.assigned_user_id && currentUser?.id && email.assigned_user_id === currentUser.id) ||
    (email.assigned_user_email && currentUser?.email && email.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase())
  );

  if (assignBanner) {
    if (email.assigned_user_name || email.assigned_user_id || (email.transfer_notes && email.transfer_notes.trim())) {
      assignBanner.style.display = 'flex';
      if (handoverName) handoverName.innerText = email.assigned_user_name || 'Desk Specialist';
      if (handoverYouTag) handoverYouTag.style.display = isAssignedToMe ? 'inline-flex' : 'none';
      if (notesRow && notesText) {
        if (email.transfer_notes && email.transfer_notes.trim()) {
          notesText.innerText = email.transfer_notes.trim();
          notesRow.style.display = 'flex';
        } else {
          notesRow.style.display = 'none';
        }
      }
    } else {
      assignBanner.style.display = 'none';
    }
  }

  if (ribRead) {
    if (email.is_read) {
      const rName = email.read_by_name || currentUser?.name || 'Agent';
      const rTime = email.read_at ? new Date(email.read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
      ribRead.style.display = 'inline-flex';
      ribRead.className = 'ribbon-read-pill read';
      ribRead.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Read by ${escapeHtml(rName)} (${rTime})</span>`;
    } else {
      ribRead.style.display = 'inline-flex';
      ribRead.className = 'ribbon-read-pill unread';
      ribRead.innerHTML = `<span class="read-dot"></span> <span>Unread</span>`;
    }
  }

  if (toggleNoiseBtn) {
    if (email.is_actionable === 1) {
      toggleNoiseBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
        <span>Mark as Noise</span>
      `;
      toggleNoiseBtn.classList.remove('active-useful');
    } else {
      toggleNoiseBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Move to Useful</span>
      `;
      toggleNoiseBtn.classList.add('active-useful');
    }
  }

  if (convertBtn) {
    if (email.is_converted && email.case_number) {
      convertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Converted: ${formatCaseNumber(email.case_number)}</span>
      `;
      convertBtn.className = 'btn-ribbon-primary converted';
      convertBtn.title = `Click to inspect active case ${formatCaseNumber(email.case_number)} in Cases Workspace`;
      convertBtn.onclick = () => openConvertedCaseInWorkspace(email.case_number);
    } else {
      convertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Convert to Case</span>
      `;
      convertBtn.className = 'btn-ribbon-primary';
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

  const deptObj = (allDepartments || []).find(d => d.id === (email.department_id || currentUser?.department_id)) || {};
  const accountEmail = email.account_email || deptObj.dept_gmail || currentUser?.dept_gmail || currentUser?.email || 'peopledesk@1mg.com';

  if (subjEl) subjEl.innerText = email.subject || 'Untitled Email';
  if (headName) headName.innerText = senderName;
  if (headEmail) headEmail.innerText = senderEmail;
  if (headRecip) headRecip.innerText = `To: ${accountEmail} · ${deptTitle} Desk`;
  if (headTime) headTime.innerText = formattedTime;
  if (timeEl) timeEl.innerText = formattedTime;
  if (senderDisp) senderDisp.innerText = `${senderName} <${senderEmail}>`;
  if (recipDesk) recipDesk.innerText = `To: ${accountEmail} (${deptTitle} Desk)`;
  if (replyTargetName) replyTargetName.innerText = senderName;
  if (intentLabel) intentLabel.innerText = ai.intent_label || 'Inquiry';

  const intentTagEl = document.getElementById('inboxHeaderIntentTag');
  const metaDotEl = document.getElementById('inboxHeaderMetaDot');
  if (intentTagEl) intentTagEl.style.display = ai.intent_label ? 'inline-flex' : 'none';
  if (metaDotEl) metaDotEl.style.display = senderEmail ? 'inline' : 'none';

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
    verifiedTag.style.display = 'inline-flex';
    const isDomainVerified = senderEmail.toLowerCase().endsWith('@1mg.com') || (email.sender_name && email.sender_name.toLowerCase().includes('1mg')) || Boolean(matchedEmp && matchedEmp.is_verified);
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
    if (email.thread_messages && email.thread_messages.length > 1) {
      bodyEl.innerHTML = formatThreadConversationHtml(email);
    } else {
      bodyEl.innerHTML = formatEmailBodyHtml(email.body, email, ai);
    }
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
  const isDomainVerified = (email.sender_email || '').toLowerCase().endsWith('@1mg.com');
  const isAwaitingEmpId = Boolean((email.actionable_reason === 'AWAITING_EMP_ID' || ai.requires_emp_id) && email.actionable_reason !== 'VERIFIED_BY_REPLY');
  const isVerifiedByReply = Boolean(email.actionable_reason === 'VERIFIED_BY_REPLY' || (ai.detected_code && !isDomainVerified));

  if (copilotStatus) {
    const isVer = Boolean(matchedEmp && matchedEmp.is_verified);
    if (isAwaitingEmpId) {
      copilotStatus.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span style="color: #B45309; font-weight: 600;">⚠️ External Sender · Emp ID Verification Requested</span>
      `;
    } else if (isVerifiedByReply) {
      copilotStatus.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span style="color: #15803D; font-weight: 700;">✓ Verified via Employee Reply (${ai.detected_code || matchedEmp.employee_id})</span>
      `;
    } else {
      copilotStatus.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${isVer ? '#15803D' : '#F59E0B'}" stroke-width="2.5">${isVer ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}</svg>
        <span>${isVer ? 'Directory Verified against Central HRMS' : (ai.detected_name ? `Unverified Inbound · ${ai.detected_name}` : 'Unverified External Ingest')}</span>
      `;
    }
  }
  const copilotConvertBtn = document.getElementById('inboxCopilotConvertBtn');
  const isNoise = !email.is_actionable || email.category === 'SYSTEM_ALERT' || email.category === 'NEWSLETTER' || email.category === 'SPAM' || Boolean(ai.is_noise);

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
  } else if (isNoise) {
    if (copilotUrgencyDesc) {
      copilotUrgencyDesc.innerHTML = `<span style="color: #64748B; font-weight: 700;">Filtered as Non-Actionable:</span> Automated vendor newsletter or marketing alert. No case conversion required.`;
    }
    if (copilotConvertBtn) {
      copilotConvertBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
        <span>Marked as Noise (Non-Actionable)</span>
      `;
      copilotConvertBtn.style.background = '#64748B';
      copilotConvertBtn.style.color = '#FFFFFF';
      copilotConvertBtn.onclick = () => toggleCurrentEmailActionable();
    }
  } else {
    if (copilotUrgencyDesc) {
      if (isAwaitingEmpId) {
        copilotUrgencyDesc.innerHTML = `
          <div style="color: #92400E; font-weight: 600; margin-bottom: 4px;">⚠️ Missing Employee ID</div>
          <div style="color: #78350F; font-size: 11.5px; line-height: 1.45;">External sender not in directory. An automated request has been sent asking for their Tata 1mg Employee ID.</div>
          <button onclick="requestCurrentEmailEmpId()" style="margin-top: 8px; background: #FFFBEB; color: #B45309; border: 1px solid #FCD34D; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Re-send Emp ID Request</button>
        `;
      } else if (isVerifiedByReply) {
        copilotUrgencyDesc.innerHTML = `
          <div style="color: #15803D; font-weight: 700; margin-bottom: 4px;">✓ Employee ID Confirmed in Thread</div>
          <div style="color: #166534; font-size: 11.5px; line-height: 1.45;">Sender provided Employee ID <strong>${ai.detected_code || matchedEmp.employee_id}</strong> via reply. Ready for Case Conversion.</div>
        `;
      } else {
        copilotUrgencyDesc.innerText = `${ai.urgency || 'HIGH'}: Inbound employee request recommended to claim and register as tracked case.`;
      }
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
  } catch (err) {
    console.error('[Inbox] Error rendering selected email:', err);
  }
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
  try {
    const res = await fetch(`/api/v1/cases?search=${encodeURIComponent(caseNumber)}&include_universal=true`);
    const data = await res.json();
    if (data.success && data.cases && data.cases.length > 0) {
      const target = data.cases.find(c => String(c.case_number).toLowerCase() === String(caseNumber).toLowerCase()) || data.cases[0];
      openAgentCaseDossier(target.id);
      return;
    }
  } catch (err) {
    console.error('Error opening case in workspace:', err);
  }
  switchAgentView('casesView');
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
        department_id: email?.department_id || currentUser?.department_id || 11,
        assigned_user: email?.assigned_user_name || null,
        actor_name: currentUser?.name || 'Vaibhav Yadav',
        actor_email: currentUser?.email || 'vaibhav.v1@1mg.com'
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Successfully Created Active Case ${formatCaseNumber(data.case_number)}!`, 'success');
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
      selectInboxEmail(currentSelectedEmailId);
      setTimeout(() => {
        openConvertedCaseInWorkspace(data.case_number);
      }, 700);
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

async function requestCurrentEmailEmpId() {
  if (!currentSelectedEmailId) {
    showToast('Please select an email first', 'error');
    return;
  }

  try {
    showToast('Sending Employee ID request to sender...', 'info');
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/request-emp-id`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Employee ID verification email sent!', 'success');
      const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
      if (email) {
        email.actionable_reason = 'AWAITING_EMP_ID';
        if (email.ai_insights) email.ai_insights.requires_emp_id = true;
      }
      selectInboxEmail(currentSelectedEmailId);
      renderInboxEmailStream();
    } else {
      showToast(data.detail || 'Could not send verification request', 'error');
    }
  } catch (err) {
    console.error('Error requesting employee ID:', err);
    showToast('Failed to dispatch Employee ID request', 'error');
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
      showToast(data.message, data.case_number ? 'success' : 'info');
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
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
        actor_email: currentUser.email || 'peopledesk@1mg.com'
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

  showToast('Synchronizing People Desk mailbox via IMAP & AI Router...', 'info');
  try {
    const syncPayload = {};
    if (!hasUniversalDeskAccess() && currentUser.department_id) {
      syncPayload.department_id = currentUser.department_id;
    }
    if (currentUser.id) syncPayload.user_id = currentUser.id;

    const res = await fetch('/api/v1/inbox/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncPayload)
    });
    const data = await res.json();
    await Promise.all([loadInboxEmails(), fetchCasesData()]);
    if (document.getElementById('casesView')?.classList.contains('active')) {
      loadAgentCasesKPIs();
      renderAgentQueueTabs();
      renderAgentCasesTable();
    }
    showToast(data.message || 'Mailbox queue up to date', 'success');
  } catch (err) {
    await Promise.all([loadInboxEmails(), fetchCasesData()]);
    showToast('Mailbox refreshed', 'success');
  } finally {
    if (icon) {
      setTimeout(() => {
        icon.style.transform = 'none';
      }, 600);
    }
  }
}

function openTransferDepartmentModal() {
  if (!currentSelectedEmailId) {
    showToast('Please select an email from the queue first', 'warning');
    return;
  }
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  if (!email) return;

  const modal = document.getElementById('transferEmailModal');
  const idInput = document.getElementById('transferEmailId');
  const subjDisplay = document.getElementById('transferEmailSubjectDisplay');
  const deptSelect = document.getElementById('transferTargetDeptSelect');
  const notesInput = document.getElementById('transferRoutingNotes');

  if (idInput) idInput.value = email.id;
  if (subjDisplay) subjDisplay.innerText = `${email.subject || '(No Subject)'} (#EML-${String(email.id).padStart(3, '0')})`;
  if (notesInput) notesInput.value = '';

  if (deptSelect) {
    const currentDeptId = email.department_id || currentUser?.department_id || 11;
    let currentDeptObj = (allDepartments || []).find(d => d.id === currentDeptId);
    let otherDepts = (allDepartments || []).filter(d => d.id !== currentDeptId);

    let opts = '';
    if (currentDeptObj) {
      opts += `<optgroup label="Current Desk (Same-Department Specialist Handover)">`;
      opts += `<option value="${currentDeptObj.id}" selected>★ ${escapeHtml(currentDeptObj.team_name)} (${escapeHtml(currentDeptObj.dept_code || currentDeptObj.category_code || '')}) — Current Desk</option>`;
      opts += `</optgroup>`;
    }
    if (otherDepts.length > 0) {
      opts += `<optgroup label="Transfer to Other Department Desk">`;
      otherDepts.forEach(d => {
        opts += `<option value="${d.id}">${escapeHtml(d.team_name)} (${escapeHtml(d.dept_code || d.category_code || '')})</option>`;
      });
      opts += `</optgroup>`;
    }
    deptSelect.innerHTML = opts;
    // Immediately load specialists for the currently selected department
    handleTransferDeptChange(email);
  }

  if (modal) modal.style.display = 'flex';
}

async function handleTransferDeptChange(passedEmail = null) {
  const deptSelect = document.getElementById('transferTargetDeptSelect');
  const agentSelect = document.getElementById('transferTargetAgentSelect');
  const deptHint = document.getElementById('transferDeptHint');
  const agentLabel = document.getElementById('transferAgentLabel');
  const btn = document.getElementById('btnConfirmTransfer');
  if (!deptSelect || !agentSelect) return;

  const targetDeptId = parseInt(deptSelect.value, 10);
  if (!targetDeptId) {
    agentSelect.innerHTML = '<option value="">Select target department first...</option>';
    return;
  }

  const email = passedEmail || allInboxEmails.find(e => e.id === currentSelectedEmailId) || {};
  const currentDeptId = email.department_id || currentUser?.department_id || 11;
  const isSameDept = (targetDeptId === currentDeptId);

  const selDept = (allDepartments || []).find(d => d.id === targetDeptId);
  const deptTitle = selDept ? selDept.team_name : 'Department Desk';

  if (deptHint) {
    deptHint.innerText = isSameDept
      ? 'Inquiry remains on current desk — select any colleague or specialist below to reassign ownership.'
      : `Inquiry will be transferred directly to ${deptTitle} desk queue.`;
  }
  if (agentLabel) {
    agentLabel.innerText = isSameDept
      ? `Reassign to Colleague on ${deptTitle}`
      : `Assign to Specialist on ${deptTitle} (Optional)`;
  }
  if (btn) {
    btn.innerHTML = isSameDept
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg><span>Confirm Reassignment</span>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg><span>Confirm Transfer to Desk</span>`;
  }

  agentSelect.innerHTML = '<option value="">Loading specialists on this desk...</option>';
  try {
    const res = await fetch(`/api/v1/admin/users?department_id=${targetDeptId}&limit=50`);
    const data = await res.json();
    if (data.success && data.users && data.users.length > 0) {
      let opts = isSameDept ? '<option value="">Select colleague to assign ownership...</option>' : '<option value="">Auto-assign or leave in desk pool</option>';
      data.users.forEach(u => {
        const isCurrentAssignee = (email.assigned_user_id === u.id);
        const roleLabel = u.is_dept_head ? '⭐ Dept Head' : (u.role === 'ADMIN' ? 'Admin' : 'Specialist');
        opts += `<option value="${u.id}" data-name="${escapeHtml(u.name)}" data-email="${escapeHtml(u.email)}" ${isCurrentAssignee ? 'selected' : ''}>${escapeHtml(u.name)} (${roleLabel}) ${isCurrentAssignee ? '— Current Assignee' : ''}</option>`;
      });
      agentSelect.innerHTML = opts;
    } else {
      agentSelect.innerHTML = '<option value="">No specialists directly assigned (Will route to Desk Pool)</option>';
    }
  } catch (err) {
    console.warn('Error loading specialists for transfer:', err);
    agentSelect.innerHTML = '<option value="">Leave in department queue</option>';
  }
}

function closeTransferDepartmentModal() {
  const modal = document.getElementById('transferEmailModal');
  if (modal) modal.style.display = 'none';
  const form = document.getElementById('transferEmailForm');
  if (form) form.reset();
}

async function handleTransferDepartmentSubmit(event) {
  event.preventDefault();
  const emailId = document.getElementById('transferEmailId')?.value;
  const targetDeptId = document.getElementById('transferTargetDeptSelect')?.value;
  const targetAgentSelect = document.getElementById('transferTargetAgentSelect');
  const notes = document.getElementById('transferRoutingNotes')?.value;
  const btn = document.getElementById('btnConfirmTransfer');

  if (!emailId || !targetDeptId) {
    showToast('Please select a target department', 'warning');
    return;
  }

  let assignedUserId = null;
  let assignedUserName = null;
  let assignedUserEmail = null;
  if (targetAgentSelect && targetAgentSelect.value && !isNaN(parseInt(targetAgentSelect.value, 10))) {
    assignedUserId = parseInt(targetAgentSelect.value, 10);
    const selOpt = targetAgentSelect.options[targetAgentSelect.selectedIndex];
    assignedUserName = selOpt.getAttribute('data-name');
    assignedUserEmail = selOpt.getAttribute('data-email');
  }

  const isSameDept = parseInt(targetDeptId, 10) === (currentUser?.department_id || 11);
  const origText = btn ? btn.innerText : 'Confirm';
  if (btn) {
    btn.disabled = true;
    btn.innerText = isSameDept ? 'Reassigning...' : 'Transferring...';
  }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${emailId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_department_id: parseInt(targetDeptId, 10),
        assigned_user_id: assignedUserId,
        assigned_user_name: assignedUserName,
        assigned_user_email: assignedUserEmail,
        notes: notes,
        user_id: currentUser?.id,
        user_name: currentUser?.name || 'Department Head',
        user_email: currentUser?.email || 'vaibhav.v1@1mg.com'
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`📬 ${data.message}`, 'success');
      closeTransferDepartmentModal();
      await loadInboxEmails();
      if (currentSelectedEmailId) {
        selectInboxEmail(currentSelectedEmailId);
      }
    } else {
      showToast(data.detail || data.message || 'Failed to transfer email', 'error');
    }
  } catch (err) {
    console.error('Transfer error:', err);
    showToast('Failed to transfer email. Check network.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = origText;
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
      showToast(data.message || 'Email ingested, AI-routed, and case assigned!', 'success');
      closeIngestEmailModal();
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
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
    const ribbonClaim = document.getElementById('ribbonClaimBtn');
    const ribbonPriority = document.getElementById('ribbonPriorityBadge');
    const ribbonPriorityText = document.getElementById('ribbonPriorityText');
    const ribbonStatusSelect = document.getElementById('ribbonStatusSelect');

    if (ribbonCase) ribbonCase.innerText = formatCaseNumber(c.case_number);
    if (ribbonDept) ribbonDept.innerText = (c.department_name || 'UNKNOWN').toUpperCase();
    
    // Priority Pill
    const prio = (c.priority || 'MEDIUM').toUpperCase();
    if (ribbonPriority) {
      ribbonPriority.className = `ribbon-priority-pill priority-${prio.toLowerCase()}`;
    }
    if (ribbonPriorityText) {
      ribbonPriorityText.innerText = prio;
    }

    // Status Dropdown
    if (ribbonStatusSelect) {
      ribbonStatusSelect.value = c.status || 'OPEN';
    }

    const isUrgent = (ai.urgency || '').includes('HIGH') || c.priority === 'HIGH' || c.priority === 'CRITICAL';
    if (ribbonSla) {
      ribbonSla.className = `ribbon-sla-badge ${isUrgent ? 'urgent' : ''}`;
      ribbonSla.innerHTML = `
        <span class="sla-dot-pulse" style="background: ${isUrgent ? '#E11D48' : '#10B190'};"></span>
        <span id="ribbonSlaText" style="display: inline-flex; align-items: center; gap: 4px;">${isUrgent ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> 4h Urgent SLA' : `${ai.sla_target_hours || 24}h Standard SLA`}</span>
      `;
    }

    // Assignee / Claim button
    const isAssigned = c.assigned_user && c.assigned_user !== 'Central Triage';
    if (ribbonAgent) {
      ribbonAgent.innerText = isAssigned ? c.assigned_user : 'Unassigned';
    }
    if (ribbonClaim) {
      ribbonClaim.style.display = isAssigned ? 'none' : 'inline-flex';
    }

    // 2. INSPECTOR TITLE, BREADCRUMB & SUBTITLE
    const titleEl = document.getElementById('inspectorTitle');
    const typeEl = document.getElementById('inspectorIngestType');
    const timeEl = document.getElementById('inspectorReceivedTime');
    const crumbDept = document.getElementById('inspectorBreadcrumbDept');
    const crumbId = document.getElementById('inspectorBreadcrumbId');
    const slaTargetMeta = document.getElementById('inspectorSlaTarget');

    if (crumbDept) crumbDept.innerText = c.department_name || 'Operations';
    if (crumbId) crumbId.innerText = formatCaseNumber(c.case_number);
    if (titleEl) titleEl.innerText = c.title;
    if (typeEl) {
      typeEl.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>Corporate Ingest</span>
      `;
    }
    if (timeEl) timeEl.innerText = `Received: ${formatDate(c.created_at)}`;
    if (slaTargetMeta) {
      slaTargetMeta.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Target: ${ai.sla_target_hours || 24}h SLA</span>
      `;
    }

    // 3. COLUMN 1: LIVE HRMS EMPLOYEE VERIFIED DOSSIER CARD
    const empName = profile.extracted_name || c.employee_name || 'Tata 1mg Employee';
    const empCode = profile.employee_code || '—';
    const empLoc = profile.location || '—';
    const empShift = profile.shift || 'General Day Shift (09:30 - 18:30)';
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
    const dShift = document.getElementById('dossierShiftSchedule');
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
    if (dShift) dShift.innerText = empShift;
    if (dJoin) dJoin.innerText = profile.joining_date || 'Confirmed Active';
    if (dType) dType.innerText = profile.employment_type || 'Permanent (Full-Time)';
    if (dStatus) dStatus.innerText = profile.directory_status || 'Active Directory Confirmed';

    // Update Bento 360 Full Profile (Tab 2)
    const bMgrFull = document.getElementById('bentoManagerFull');
    const bEmpFull = document.getElementById('bentoEmployeeFull');
    const bEmpMail = document.getElementById('bentoEmployeeEmail');
    if (bMgrFull) bMgrFull.innerText = empManager;
    if (bEmpFull) bEmpFull.innerText = empName;
    if (bEmpMail) bEmpMail.innerText = empEmail;

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
    if (sDesk) sDesk.innerText = `To: peopledesk@1mg.com (Tata 1mg ${c.department_name || 'Operations'} Desk)`;
    if (sTime) sTime.innerText = formatDate(c.created_at);
    if (sSubj) sSubj.innerText = c.title;
    if (sCat) sCat.innerText = (c.category || c.department_name || 'UNKNOWN').toUpperCase();
    
    if (sBody) {
      sBody.innerHTML = escapeHtml(c.description || '').replace(/\n/g, '<br>');
    }
    if (mCode) mCode.innerText = formatCaseNumber(empCode);
    if (mDept) mDept.innerText = empDept;
    if (mShift) mShift.innerText = empShift;

    // Reset quick reply text and mode
    setComposerMode('PUBLIC_REPLY');
    const replyInput = document.getElementById('quickReplyInput');
    if (replyInput) replyInput.value = '';

    // Render Conversation Feed (Replies & Internal Notes)
    renderThreadReplies(caseRes.audit_logs || [], c);

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
    currentAuditLogs = caseRes.audit_logs || [];
    renderInspectorAuditLogs(currentAuditLogs);

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

let currentComposerMode = 'PUBLIC_REPLY';
let currentAuditLogs = [];

function setComposerMode(mode) {
  currentComposerMode = mode;
  const publicBtn = document.getElementById('composerModePublic');
  const internalBtn = document.getElementById('composerModeInternal');
  const composerBox = document.getElementById('omniComposerBox');
  const input = document.getElementById('quickReplyInput');
  const sendBtnLabel = document.getElementById('btnSendReplyLabel');

  if (mode === 'INTERNAL_NOTE') {
    publicBtn?.classList.remove('active');
    internalBtn?.classList.add('active');
    composerBox?.classList.add('internal-mode');
    if (input) input.placeholder = 'Type private internal note for HR desk team (not visible to employee)...';
    if (sendBtnLabel) sendBtnLabel.innerText = 'Save Internal Note';
  } else {
    internalBtn?.classList.remove('active');
    publicBtn?.classList.add('active');
    composerBox?.classList.remove('internal-mode');
    if (input) input.placeholder = 'Type response to employee, or switch to Internal Note for private desk notes...';
    if (sendBtnLabel) sendBtnLabel.innerText = 'Send Reply';
  }
}

function copyCaseNumberToClipboard() {
  const pill = document.getElementById('ribbonCaseNumber');
  if (pill) {
    const text = pill.innerText.trim();
    copyToClipboard(text);
    showToast(`Copied ${text} to clipboard!`, 'success');
  }
}

function insertFormatting(before, after) {
  const input = document.getElementById('quickReplyInput');
  if (!input) return;
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const val = input.value;
  const sel = val.substring(start, end) || 'text';
  input.value = val.substring(0, start) + before + sel + after + val.substring(end);
  input.focus();
  input.setSelectionRange(start + before.length, start + before.length + sel.length);
}

function clearComposerDraft() {
  const input = document.getElementById('quickReplyInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

async function handleRibbonStatusChange(newStatus) {
  if (!currentSelectedCaseId) return;
  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        resolution_notes: `Status transitioned to ${newStatus} via Workbench Ribbon`,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'HR Specialist'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Case status updated to ${newStatus}`, 'success');
      const found = allCases.find(c => c.id === currentSelectedCaseId);
      if (found) found.status = newStatus;
      renderInboxStream();
      renderCasesKPIs();
      selectInboxCase(currentSelectedCaseId);
    } else {
      showToast('Failed to update status', 'error');
    }
  } catch (err) {
    showToast('Network error while updating status', 'error');
  }
}

function renderThreadReplies(logs, currentCase) {
  const container = document.getElementById('threadRepliesContainer');
  if (!container) return;

  const relevant = (logs || []).filter(l => 
    l.action === 'REPLY_SENT' || 
    l.action === 'INTERNAL_NOTE' || 
    l.action === 'STATUS_CHANGED' || 
    l.action === 'AGENT_REASSIGNED'
  );

  if (relevant.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = relevant.map(l => {
    let details = {};
    if (typeof l.details === 'string') {
      try { details = JSON.parse(l.details); } catch(e) { details = { raw: l.details }; }
    } else {
      details = l.details || {};
    }

    if (l.action === 'REPLY_SENT') {
      const msg = details.message || '';
      return `
        <div class="thread-item thread-item-reply">
          <div class="thread-item-header">
            <div class="thread-avatar" style="background: #3B82F6;">${(l.actor_name || 'A').charAt(0).toUpperCase()}</div>
            <div class="thread-meta">
              <span class="thread-author">${escapeHtml(l.actor_name || 'Specialist')}</span>
              <span class="thread-tag-pill sent">Public Reply Dispatched</span>
              <span class="thread-time">${formatDate(l.created_at)}</span>
            </div>
          </div>
          <div class="thread-body">${escapeHtml(msg).replace(/\n/g, '<br>')}</div>
        </div>
      `;
    } else if (l.action === 'INTERNAL_NOTE') {
      const msg = details.message || '';
      return `
        <div class="thread-item thread-item-note">
          <div class="thread-item-header">
            <div class="thread-avatar" style="background: #D97706;">🔒</div>
            <div class="thread-meta">
              <span class="thread-author">${escapeHtml(l.actor_name || 'Specialist')}</span>
              <span class="thread-tag-pill note">Internal Team Note (Private)</span>
              <span class="thread-time">${formatDate(l.created_at)}</span>
            </div>
          </div>
          <div class="thread-body">${escapeHtml(msg).replace(/\n/g, '<br>')}</div>
        </div>
      `;
    } else if (l.action === 'STATUS_CHANGED') {
      return `
        <div class="thread-event-row">
          <span class="thread-event-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Status set to <strong>${escapeHtml(details.new_status || 'UPDATED')}</strong> by ${escapeHtml(l.actor_name || 'Agent')} · ${formatRelativeTime(l.created_at)}
          </span>
        </div>
      `;
    } else if (l.action === 'AGENT_REASSIGNED') {
      return `
        <div class="thread-event-row">
          <span class="thread-event-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            Assigned to <strong>${escapeHtml(details.assigned_user || 'Agent')}</strong> · ${formatRelativeTime(l.created_at)}
          </span>
        </div>
      `;
    }
    return '';
  }).join('');
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

  const isInternal = currentComposerMode === 'INTERNAL_NOTE';

  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        reply_type: currentComposerMode,
        new_status: isInternal ? null : newStatus,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'HR Specialist'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(isInternal ? 'Internal team note saved to case history!' : `Reply dispatched to employee (${newStatus})!`, 'success');
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
      showToast('Case claimed and assigned to your desk!', 'success');
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

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); padding: 18px 0; text-align: center;">No audit trail events logged yet.</div>`;
    return;
  }

  container.innerHTML = logs.map(log => {
    const actionLabel = formatAuditAction(log);
    const isStatus = log.action === 'STATUS_CHANGED';
    const isReply = log.action === 'REPLY_SENT';
    const isNote = log.action === 'INTERNAL_NOTE';
    const isAssign = log.action === 'AGENT_REASSIGNED';
    
    let badgeClass = 'badge-system';
    let iconSvg = '<circle cx="12" cy="12" r="10"></circle>';
    if (isStatus) {
      badgeClass = 'badge-status';
      iconSvg = '<polyline points="20 6 9 17 4 12"></polyline>';
    } else if (isReply) {
      badgeClass = 'badge-reply';
      iconSvg = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>';
    } else if (isNote) {
      badgeClass = 'badge-note';
      iconSvg = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
    } else if (isAssign) {
      badgeClass = 'badge-assign';
      iconSvg = '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>';
    }

    return `
      <div class="audit-timeline-item">
        <div class="audit-timeline-dot ${badgeClass}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${iconSvg}</svg>
        </div>
        <div class="audit-timeline-card">
          <div class="audit-card-top">
            <div class="audit-actor-info">
              <span class="audit-actor-name">${escapeHtml(log.actor_name || 'System')}</span>
              <span class="audit-actor-email">${escapeHtml(log.actor_email || 'automated')}</span>
            </div>
            <span class="audit-time-pill">${formatRelativeTime(log.created_at)} · ${formatDate(log.created_at)}</span>
          </div>
          <div class="audit-action-text">${escapeHtml(actionLabel)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function filterAuditLogs(filterType, btnEl) {
  document.querySelectorAll('.audit-pill-filter').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  if (!currentAuditLogs || currentAuditLogs.length === 0) return;

  if (filterType === 'STATUS') {
    const filtered = currentAuditLogs.filter(l => l.action === 'STATUS_CHANGED');
    renderInspectorAuditLogs(filtered);
  } else if (filterType === 'COMM') {
    const filtered = currentAuditLogs.filter(l => l.action === 'REPLY_SENT' || l.action === 'INTERNAL_NOTE');
    renderInspectorAuditLogs(filtered);
  } else {
    renderInspectorAuditLogs(currentAuditLogs);
  }
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
// 9. VIEW 2: CASES WORKSPACE COMMAND CENTER & 360° EXECUTIVE DOSSIER
// =========================================================================

// Case Management State Variables
let agentCasesFilter = "ALL";         // "ALL", "TOTAL", "ACTIVE", "BREACHED", "RESOLVED"
let agentQueueDeptId = "ALL";         // "ALL" or department ID string
let agentStatusFilter = "ALL";        // "ALL", "OPEN", "IN_PROGRESS", "WAITING_ON_EMPLOYEE", "RESOLVED", "CLOSED"
let agentPriorityFilter = "ALL";      // "ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"
let agentSlaRiskFilter = "ALL";       // "ALL", "BREACHED", "AT_RISK", "SAFE"
let agentSpecialistFilter = "ALL";    // "ALL" or specialist name
let agentCaseSearchQuery = "";
let activeDossierCase = null;
let activeDossierReplyMode = "PUBLIC_REPLY";
let dossierAiTones = {};
let targetReassignCaseId = null;
let targetResolveCaseId = null;

/**
 * Primary entry point when switching to or refreshing the Cases view.
 */
async function loadCases() {
  const tableView = document.getElementById("casesTableView");
  const dossierView = document.getElementById("casesDossierView");
  if (tableView) tableView.style.display = "flex";
  if (dossierView) dossierView.style.display = "none";

  renderCaseTableSkeleton();

  await fetchCasesData();
  loadAgentCasesKPIs();
  renderAgentQueueTabs();
  populateAgentSpecialistFilter();
  renderAgentCasesTable();
}

/**
 * Calculates and updates the 4-tile interactive Bento KPI strip.
 */
function loadAgentCasesKPIs() {
  const total = allCases.length;
  let active = 0;
  let breached = 0;
  let resolved = 0;

  const now = new Date();
  allCases.forEach(c => {
    const isResolved = c.status === "RESOLVED" || c.status === "CLOSED";
    if (isResolved) {
      resolved++;
    } else {
      active++;
      if (c.due_at) {
        const due = new Date(c.due_at);
        if (now > due) breached++;
      }
    }
  });

  const rate = total > 0 ? Math.round((resolved / total) * 100) : 100;

  const totalEl = document.getElementById("caseKpiTotal");
  const activeEl = document.getElementById("caseKpiActive");
  const breachedEl = document.getElementById("caseKpiBreached");
  const resolvedEl = document.getElementById("caseKpiResolved");
  const rateEl = document.getElementById("caseKpiRate");

  if (totalEl) totalEl.innerText = total;
  if (activeEl) activeEl.innerText = active;
  if (breachedEl) breachedEl.innerText = breached;
  if (resolvedEl) resolvedEl.innerText = resolved;
  if (rateEl) rateEl.innerText = `${rate}%`;
}

// Backward compatibility alias for other agent views
function renderCasesKPIs() {
  loadAgentCasesKPIs();
}

/**
 * Renders the Department Queue Tabs with live active-case counts.
 */
function renderAgentQueueTabs() {
  const container = document.getElementById("caseQueueTabsBar");
  if (!container) return;

  const badgeAll = document.getElementById("queueBadgeAll");
  if (badgeAll) badgeAll.innerText = allCases.length;

  const deptCounts = {};
  allCases.forEach(c => {
    const dId = String(c.department_id || "");
    deptCounts[dId] = (deptCounts[dId] || 0) + 1;
  });

  let html = `
    <button class="queue-tab-btn ${agentQueueDeptId === "ALL" ? "active" : ""}" onclick="selectAgentQueueTab('ALL', this)">
      <span>All Inbound Queue</span>
      <span class="queue-counter-pill" id="queueBadgeAll">${allCases.length}</span>
    </button>
  `;

  allDepartments.forEach(d => {
    const count = deptCounts[String(d.id)] || 0;
    const isActive = String(agentQueueDeptId) === String(d.id);
    html += `
      <button class="queue-tab-btn ${isActive ? "active" : ""}" onclick="selectAgentQueueTab('${d.id}', this)">
        <span class="dept-dot-accent" style="background: ${d.color_accent || "#FF6F61"};"></span>
        <span>${escapeHtml(d.name || d.team_name)}</span>
        <span class="queue-counter-pill">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

/**
 * Handles selecting a queue tab (department desk).
 */
function selectAgentQueueTab(deptId, btnEl) {
  agentQueueDeptId = deptId;
  document.querySelectorAll("#caseQueueTabsBar .queue-tab-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderAgentCasesTable();
}

/**
 * Filter cases via the interactive 4-tile Bento strip.
 */
function filterCasesByBento(filterType, el) {
  agentCasesFilter = filterType;

  document.querySelectorAll(".bento-kpi-card").forEach(card => card.classList.remove("bento-active"));
  if (el) el.classList.add("bento-active");

  renderAgentCasesTable();
}

/**
 * Filter cases via status pills (Open, In Progress, Waiting, Resolved, All).
 */
function filterAgentCasesByStatus(statusVal, btnEl) {
  agentStatusFilter = statusVal;

  document.querySelectorAll("#caseStatusPillsBar .filter-pill-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  renderAgentCasesTable();
}

/**
 * Search filter input handler (instant responsive filtering).
 */
function handleAgentCaseSearch() {
  const input = document.getElementById("caseSearchInput");
  agentCaseSearchQuery = (input?.value || "").toLowerCase().trim();
  renderAgentCasesTable();
}

function filterAgentCasesByPriority() {
  const sel = document.getElementById("casePriorityFilter");
  agentPriorityFilter = sel?.value || "ALL";
  renderAgentCasesTable();
}

function filterAgentCasesBySlaRisk() {
  const sel = document.getElementById("caseSlaRiskFilter");
  agentSlaRiskFilter = sel?.value || "ALL";
  renderAgentCasesTable();
}

function filterAgentCasesBySpecialist() {
  const sel = document.getElementById("caseSpecialistFilter");
  agentSpecialistFilter = sel?.value || "ALL";
  renderAgentCasesTable();
}

/**
 * Populates specialist dropdown from unique assigned specialists in cases.
 */
function populateAgentSpecialistFilter() {
  const select = document.getElementById("caseSpecialistFilter");
  if (!select) return;

  const currentVal = select.value;
  const specialists = new Set();
  allCases.forEach(c => {
    if (c.assigned_user && c.assigned_user !== "Central Triage" && c.assigned_user !== "Unassigned") {
      specialists.add(c.assigned_user);
    }
  });

  let html = `<option value="ALL">All Specialists</option>`;
  html += `<option value="MINE">★ Assigned to Me (${escapeHtml(currentUser.name || 'You')})</option>`;
  specialists.forEach(spec => {
    html += `<option value="${escapeHtml(spec)}">${escapeHtml(spec)}</option>`;
  });

  select.innerHTML = html;
  if (currentVal && (currentVal === "MINE" || specialists.has(currentVal))) {
    select.value = currentVal;
  }
}

/**
 * Resets all filters back to default.
 */
function resetAgentCaseFilters() {
  agentCasesFilter = "ALL";
  agentQueueDeptId = "ALL";
  agentStatusFilter = "ALL";
  agentPriorityFilter = "ALL";
  agentSlaRiskFilter = "ALL";
  agentSpecialistFilter = "ALL";
  agentCaseSearchQuery = "";

  const searchInput = document.getElementById("caseSearchInput");
  if (searchInput) searchInput.value = "";

  const prioSel = document.getElementById("casePriorityFilter");
  if (prioSel) prioSel.value = "ALL";

  const slaSel = document.getElementById("caseSlaRiskFilter");
  if (slaSel) slaSel.value = "ALL";

  const specSel = document.getElementById("caseSpecialistFilter");
  if (specSel) specSel.value = "ALL";

  document.querySelectorAll(".bento-kpi-card").forEach(c => c.classList.remove("bento-active"));
  document.querySelectorAll("#caseStatusPillsBar .filter-pill-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("onclick")?.includes("'ALL'"));
  });

  renderAgentQueueTabs();
  renderAgentCasesTable();
  showToast("All case filters reset", "info");
}

/**
 * Horizontal smooth scrolling for the wide command table card.
 */
function scrollAgentCaseTable(direction) {
  const container = document.getElementById("caseTableScrollWrapper");
  if (container) {
    container.scrollBy({ left: direction * 320, behavior: "smooth" });
  }
}

/**
 * Loading skeleton placeholder for table rows.
 */
function renderCaseTableSkeleton() {
  const tbody = document.getElementById("agentCasesTableBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="11" style="text-align: center; padding: 48px 20px;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; color: #64748B;">
          <div class="loader-spinner" style="width: 28px; height: 28px; border: 3px solid #E2E8F0; border-top-color: var(--1mg-orange); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <span style="font-size: 13px; font-weight: 600;">Fetching live cases and synchronizing SLA telemetry...</span>
        </div>
      </td>
    </tr>
  `;
}

/**
 * Renders the filtered cases into #agentCasesTableBody.
 */
function renderAgentCasesTable() {
  const tbody = document.getElementById("agentCasesTableBody");
  if (!tbody) return;

  const now = new Date();

  const filtered = allCases.filter(c => {
    // 1. Department Queue Filter
    if (agentQueueDeptId !== "ALL" && String(c.department_id) !== String(agentQueueDeptId)) {
      return false;
    }

    // 2. Bento KPI Filter
    const isResolved = c.status === "RESOLVED" || c.status === "CLOSED";
    if (agentCasesFilter === "ACTIVE" && isResolved) return false;
    if (agentCasesFilter === "RESOLVED" && !isResolved) return false;
    if (agentCasesFilter === "BREACHED") {
      if (isResolved) return false;
      if (!c.due_at || now <= new Date(c.due_at)) return false;
    }

    // 3. Status Filter
    if (agentStatusFilter !== "ALL" && c.status !== agentStatusFilter) return false;

    // 4. Priority Filter
    if (agentPriorityFilter !== "ALL" && (c.priority || "MEDIUM").toUpperCase() !== agentPriorityFilter) return false;

    // 5. SLA Risk Filter
    if (agentSlaRiskFilter !== "ALL") {
      if (!c.due_at) return false;
      const due = new Date(c.due_at);
      const diffMs = due - now;
      if (agentSlaRiskFilter === "BREACHED" && (diffMs >= 0 || isResolved)) return false;
      if (agentSlaRiskFilter === "AT_RISK" && (diffMs < 0 || diffMs > 2 * 3600 * 1000 || isResolved)) return false;
      if (agentSlaRiskFilter === "SAFE" && (diffMs <= 2 * 3600 * 1000 || isResolved)) return false;
    }

    // 6. Specialist Filter
    if (agentSpecialistFilter === "MINE") {
      const isMine = (
        (c.assigned_user && currentUser?.name && c.assigned_user.toLowerCase() === currentUser.name.toLowerCase()) ||
        (c.assigned_user_email && currentUser?.email && c.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (c.assigned_user_id && currentUser?.id && c.assigned_user_id === currentUser.id)
      );
      if (!isMine) return false;
    } else if (agentSpecialistFilter !== "ALL" && c.assigned_user !== agentSpecialistFilter) {
      return false;
    }

    // 7. Omni-Search Query
    if (agentCaseSearchQuery) {
      const q = agentCaseSearchQuery;
      const match = (c.case_number || "").toLowerCase().includes(q) ||
                    (c.title || "").toLowerCase().includes(q) ||
                    (c.description || "").toLowerCase().includes(q) ||
                    (c.employee_email || "").toLowerCase().includes(q) ||
                    (c.employee_name || "").toLowerCase().includes(q) ||
                    (c.ai_badge?.intent_name || "").toLowerCase().includes(q) ||
                    (c.department_name || "").toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  // Update counts
  const countPill = document.getElementById("caseTableCountPill");
  const countText = document.getElementById("caseTableCountText");
  if (countPill) countPill.innerText = `${filtered.length} Live`;
  if (countText) countText.innerText = `${filtered.length} Case${filtered.length === 1 ? "" : "s"} In Queue`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 60px 24px;">
          <div style="max-width: 440px; margin: 0 auto; text-align: center;">
            <div style="width: 54px; height: 54px; margin: 0 auto 14px; border-radius: 12px; background: #F1F5F9; color: #64748B; display: flex; align-items: center; justify-content: center;">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div style="font-size: 15px; font-weight: 800; color: #0F172A; margin-bottom: 5px;">No Inbound Cases Found</div>
            <p style="font-size: 12.5px; color: #64748B; line-height: 1.5; margin-bottom: 18px;">
              No employee inquiries match your active filters or omni-search query.
            </p>
            <div style="display: flex; gap: 8px; justify-content: center;">
              <button class="btn-secondary" style="height: 36px; padding: 0 14px; font-size: 12.5px;" onclick="resetAgentCaseFilters()">
                Reset Filters
              </button>
              <button class="btn-primary" style="height: 36px; width: auto; padding: 0 16px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px;" onclick="openNewCaseModal()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>+ Log Inbound Case</span>
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const isResolved = c.status === "RESOLVED" || c.status === "CLOSED";

    // AI Intent presentation card
    let aiBadgeHtml = `<span style="font-size: 11.5px; color: #64748B;">Auto-Triaged</span>`;
    if (c.ai_badge) {
      const urgencyClass = (c.ai_badge.urgency || "").toUpperCase().includes("HIGH") ? "high" : "normal";
      aiBadgeHtml = `
        <div class="ai-intent-card">
          <div class="ai-intent-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span class="ai-intent-code-badge">${escapeHtml(c.ai_badge.intent_code || "AI01")}</span>
            <span class="ai-intent-title" title="${escapeHtml(c.ai_badge.intent_name || "")}">${escapeHtml(c.ai_badge.intent_name || "General")}</span>
          </div>
          <div class="ai-intent-meta">
            <span class="ai-intent-confidence">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ${c.ai_badge.confidence || 98}% Match
            </span>
            <span class="ai-urgency-badge ${urgencyClass}">${escapeHtml((c.ai_badge.urgency || "NORMAL").split(" ")[0])}</span>
          </div>
        </div>
      `;
    }

    // HRMS profile details pill
    let hrmsInfoHtml = "";
    if (c.hrms_profile && c.hrms_profile.employee_code && c.hrms_profile.employee_code !== "—") {
      hrmsInfoHtml = `
        <div class="emp-hrms-pill">
          <span>🏷️</span>
          <span>${escapeHtml(c.hrms_profile.employee_code)}</span>
          ${c.hrms_profile.department ? `<span>· ${escapeHtml(c.hrms_profile.department)}</span>` : ""}
        </div>
      `;
    }

    // Created date
    const createdDate = c.created_at ? new Date(c.created_at) : null;
    const formattedCreated = createdDate ? `
      <div style="font-size: 12.5px; font-weight: 700; color: #1E293B;">
        ${createdDate.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
      </div>
      <div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">
        ${createdDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
      </div>
    ` : `<span style="color: var(--text-muted);">—</span>`;

    // Target deadline
    const dueDate = c.due_at ? new Date(c.due_at) : null;
    const formattedDue = dueDate ? `
      <div class="sla-target-deadline">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Target: ${dueDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}, ${dueDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    ` : "";

    return `
      <tr>
        <!-- 1. Case # & Channel -->
        <td>
          <button 
            class="case-num-chip" 
            onclick="openAgentCaseDossier(${c.id})"
            title="Inspect 360° Case Dossier"
          >
            ${escapeHtml(c.case_number)}
          </button>
          <div class="case-channel-tag">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
            <span>Corporate Email</span>
          </div>
        </td>

        <!-- 2. Query Title & Category -->
        <td class="case-query-col">
          <span class="case-dept-category-tag">
            ${escapeHtml(c.category || c.department_name || "General")}
          </span>
          <div class="case-title-text" onclick="openAgentCaseDossier(${c.id})" title="Click to inspect: ${escapeHtml(c.title)}">
            ${escapeHtml(c.title)}
          </div>
          <div class="case-snippet-text" title="${escapeHtml(c.description || "")}">
            ${escapeHtml(c.description || "")}
          </div>
        </td>

        <!-- 3. AI Intent & Confidence -->
        <td>
          ${aiBadgeHtml}
        </td>

        <!-- 4. Employee & HRMS Profile -->
        <td>
          <div class="emp-profile-wrap">
            <div class="emp-avatar-badge">
              ${(c.employee_name || "E")[0].toUpperCase()}
            </div>
            <div>
              <div class="emp-name-text">${escapeHtml(c.employee_name || "Tata 1mg Staff")}</div>
              <div class="emp-email-text">${escapeHtml(c.employee_email)}</div>
            </div>
          </div>
          ${hrmsInfoHtml}
        </td>

        <!-- 5. HR Department Desk -->
        <td>
          <div class="dept-desk-pill">
            <span class="dept-dot-accent" style="background: ${c.color_accent || "#FF6F61"};"></span>
            <span>${escapeHtml(c.department_name || "Central Desk")}</span>
          </div>
          <div class="dept-sla-policy-text">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>Standard SLA: ${c.sla_hours || 24}h</span>
          </div>
        </td>

        <!-- 6. Priority -->
        <td>
          ${renderCasePriorityPill(c.priority)}
        </td>

        <!-- 7. Assigned Specialist -->
        <td>
          <div class="specialist-wrap">
            <div class="specialist-avatar-dot" style="${((c.assigned_user && currentUser?.name && c.assigned_user.toLowerCase() === currentUser.name.toLowerCase()) || (c.assigned_user_email && currentUser?.email && c.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase())) ? 'background: #0284C7; color: #FFFFFF;' : ''}">
              ${(c.assigned_user || "U")[0].toUpperCase()}
            </div>
            <div>
              <div class="specialist-name">
                ${escapeHtml(c.assigned_user || "Unassigned")}
                ${((c.assigned_user && currentUser?.name && c.assigned_user.toLowerCase() === currentUser.name.toLowerCase()) || (c.assigned_user_email && currentUser?.email && c.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase())) ? '<span class="specialist-you-pill">You</span>' : ''}
              </div>
              <div class="specialist-email">${escapeHtml(c.assigned_user_email || "Central Pool")}</div>
            </div>
          </div>
        </td>

        <!-- 8. SLA Countdown & Exact Target -->
        <td>
          <div class="sla-timer-cell">
            <div>${calculateSlaBadge(c.due_at, c.status)}</div>
            ${formattedDue}
          </div>
        </td>

        <!-- 9. Logged Time -->
        <td>
          ${formattedCreated}
        </td>

        <!-- 10. Status -->
        <td>
          ${renderCaseStatusPill(c.status)}
        </td>

        <!-- 11. Forensic Actions -->
        <td style="text-align: right;">
          <div class="case-actions-inline" style="display: inline-flex; gap: 5px; align-items: center; justify-content: flex-end;">
            <button 
              class="btn-action" 
              onclick="openAgentCaseDossier(${c.id})" 
              title="Inspect 360° Case Dossier"
              style="padding: 5px 9px; font-size: 11.5px; font-weight: 700; background: #FFFFFF; border: 1px solid #CBD5E1; color: #1E293B; border-radius: 6px;"
            >
              Inspect
            </button>
            <button 
              class="btn-action" 
              onclick="openReassignModal(${c.id})" 
              title="Reassign to Specialist"
              style="padding: 5px 9px; font-size: 11.5px; font-weight: 700; background: #FFF7ED; border: 1px solid #FFEDD5; color: #EA580C; border-radius: 6px;"
            >
              Reassign
            </button>
            ${!isResolved ? `
              <button 
                class="btn-action" 
                onclick="openResolveModal(${c.id}, '${escapeHtml(c.case_number)}')" 
                title="Mark Resolved"
                style="padding: 5px 9px; font-size: 11.5px; font-weight: 700; background: #ECFDF5; border: 1px solid #A7F3D0; color: #059669; border-radius: 6px;"
              >
                Resolve
              </button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Backward compatibility alias for renderCasesTable
function renderCasesTable() {
  renderAgentCasesTable();
}

/**
 * Calculates human-readable SLA pill with badge color.
 */
function calculateSlaBadge(dueAtStr, status) {
  if (status === "RESOLVED" || status === "CLOSED") {
    return `
      <span class="sla-badge ok" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Met Target
      </span>
    `;
  }
  if (!dueAtStr) {
    return `<span class="sla-badge" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #F1F5F9; color: #64748B;">No SLA</span>`;
  }
  
  const due = new Date(dueAtStr);
  const now = new Date();
  const diffMs = due - now;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffMin = Math.round(diffMs / (1000 * 60));

  if (diffMs < 0) {
    const overdueHrs = Math.abs(diffHours);
    return `
      <span class="sla-badge breached" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        🚨 Overdue ${overdueHrs}h
      </span>
    `;
  } else if (diffMin <= 120) {
    return `
      <span class="sla-badge warn" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        ⚠️ ${diffMin}m left
      </span>
    `;
  } else {
    return `
      <span class="sla-badge ok" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        ⏱️ ${diffHours}h left
      </span>
    `;
  }
}

function renderCasePriorityPill(priority) {
  const p = (priority || "MEDIUM").toUpperCase();
  if (p === "CRITICAL") {
    return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;">CRITICAL</span>`;
  } else if (p === "HIGH") {
    return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #FFF7ED; color: #EA580C; border: 1px solid #FFEDD5;">HIGH</span>`;
  } else if (p === "MEDIUM") {
    return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #EFF6FF; color: #2563EB; border: 1px solid #DBEAFE;">MEDIUM</span>`;
  }
  return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0;">LOW</span>`;
}

function renderCaseStatusPill(status) {
  const s = (status || "OPEN").toUpperCase();
  if (s === "OPEN") {
    return `<span class="status-pill status-pending" style="display: inline-flex; align-items: center; gap: 5px;"><span class="status-dot dot-amber"></span> Open</span>`;
  } else if (s === "IN_PROGRESS") {
    return `<span class="status-pill" style="display: inline-flex; align-items: center; gap: 5px; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;"><span class="status-dot" style="background: #3B82F6;"></span> In Progress</span>`;
  } else if (s === "WAITING_ON_EMPLOYEE") {
    return `<span class="status-pill" style="display: inline-flex; align-items: center; gap: 5px; background: #F5F3FF; color: #6D28D9; border: 1px solid #DDD6FE;"><span class="status-dot" style="background: #8B5CF6;"></span> Waiting on Employee</span>`;
  } else if (s === "RESOLVED" || s === "CLOSED") {
    return `<span class="status-pill status-active" style="display: inline-flex; align-items: center; gap: 5px;"><span class="status-dot dot-green"></span> Resolved</span>`;
  }
  return `<span class="status-pill status-inactive">${escapeHtml(status)}</span>`;
}

/**
 * Exports currently filtered cases as a downloadable CSV.
 */
function exportCasesCsv() {
  if (!allCases || allCases.length === 0) {
    showToast("No cases available to export", "info");
    return;
  }

  const headers = ["Case Number", "Title", "Status", "Priority", "Department", "Employee Name", "Employee Email", "Assigned Specialist", "Created At", "Due At"];
  const rows = allCases.map(c => [
    `"${(c.case_number || "").replace(/"/g, '""')}"`,
    `"${(c.title || "").replace(/"/g, '""')}"`,
    c.status || "OPEN",
    c.priority || "MEDIUM",
    `"${(c.department_name || "").replace(/"/g, '""')}"`,
    `"${(c.employee_name || "").replace(/"/g, '""')}"`,
    c.employee_email || "",
    `"${(c.assigned_user || "").replace(/"/g, '""')}"`,
    c.created_at || "",
    c.due_at || ""
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `tata1mg_cases_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();

  showToast("Exported cases CSV successfully!", "success");
}

// =========================================================================
// EXECUTIVE CASE DOSSIER (ADMIN CASE-DETAILS PARITY)
// =========================================================================

/**
 * Transitions to Dedicated New Case Page (/agent/case-details.html).
 */
function openAgentCaseDossier(caseId) {
  window.location.href = `/agent/case-details.html?id=${caseId}`;
}

// Backward compatibility alias
function openCaseDossier(caseId) {
  openAgentCaseDossier(caseId);
}

/**
 * Closes the full-page dossier and returns to the table view.
 */
function closeAgentCaseDossier() {
  const tableView = document.getElementById("casesTableView");
  const dossierView = document.getElementById("casesDossierView");

  if (dossierView) dossierView.style.display = "none";
  if (tableView) tableView.style.display = "flex";

  activeDossierCase = null;
  loadCases();
}

// Backward compatibility alias
function closeCaseDossier() {
  closeAgentCaseDossier();
}

/**
 * Renders Hero card in dossier view.
 */
function renderDossierHero(c) {
  const navDept = document.getElementById("dossierNavDept");
  const navCaseNum = document.getElementById("dossierNavCaseNum");
  if (navDept) navDept.innerText = c.department_name || "People Desk";
  if (navCaseNum) navCaseNum.innerText = c.case_number;

  const seqBadge = document.getElementById("heroCaseSeqBadge");
  if (seqBadge) seqBadge.innerText = c.case_number;

  const statusBadge = document.getElementById("heroStatusBadge");
  if (statusBadge) statusBadge.innerHTML = renderCaseStatusPill(c.status);

  const priorityBadge = document.getElementById("heroPriorityBadge");
  if (priorityBadge) priorityBadge.innerHTML = renderCasePriorityPill(c.priority);

  const deptBadge = document.getElementById("heroDeptBadge");
  if (deptBadge) {
    deptBadge.innerHTML = `
      <span class="dept-dot-accent" style="background: ${c.color_accent || "#FF6F61"};"></span>
      <span>${escapeHtml(c.department_name || "Central Desk")}</span>
    `;
  }

  const titleEl = document.getElementById("heroCaseTitle");
  if (titleEl) titleEl.innerText = c.title;

  const createdDate = c.created_at ? new Date(c.created_at) : null;
  const createdEl = document.getElementById("heroCreatedTime");
  if (createdEl) {
    createdEl.innerText = createdDate ? createdDate.toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "N/A";
  }

  const dueDate = c.due_at ? new Date(c.due_at) : null;
  const dueEl = document.getElementById("heroDueTime");
  if (dueEl) {
    dueEl.innerText = dueDate ? dueDate.toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "No SLA set";
  }

  const turnaroundEl = document.getElementById("heroTurnaroundBadge");
  if (turnaroundEl) {
    if (c.status === "RESOLVED" || c.status === "CLOSED") {
      turnaroundEl.innerHTML = `<span style="color: #059669; font-weight: 700;">✅ Resolution Met</span>`;
    } else if (dueDate && new Date() > dueDate) {
      const diffHours = Math.round((new Date() - dueDate) / (1000 * 60 * 60));
      turnaroundEl.innerHTML = `<span style="color: #DC2626; font-weight: 800; background: #FEF2F2; padding: 2px 7px; border-radius: 4px;">🚨 Breached by ${diffHours}h</span>`;
    } else if (dueDate) {
      const remainingHours = Math.max(0, Math.round((dueDate - new Date()) / (1000 * 60 * 60)));
      turnaroundEl.innerHTML = `<span style="color: #059669; font-weight: 700;">⏱️ ${remainingHours}h remaining to target</span>`;
    } else {
      turnaroundEl.innerText = "Standard Queue";
    }
  }

  const btnClaim = document.getElementById("btnHeroClaim");
  if (btnClaim) {
    const isAssignedToMe = (c.assigned_user_email === currentUser.email) || (c.assigned_user === currentUser.name);
    if (isAssignedToMe) {
      btnClaim.innerHTML = `<span>✓ Assigned to You</span>`;
      btnClaim.disabled = true;
      btnClaim.style.opacity = "0.7";
    } else {
      btnClaim.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Claim Case</span>
      `;
      btnClaim.disabled = false;
      btnClaim.style.opacity = "1";
    }
  }
}

/**
 * Renders 4 Bento Telemetry Tiles in Dossier.
 */
function renderDossierBento(c) {
  // Tile 1: SLA Countdown
  const cdEl = document.getElementById("tileSlaCountdown");
  const exactEl = document.getElementById("tileSlaExactDate");
  const barEl = document.getElementById("tileSlaProgressBar");
  const policyEl = document.getElementById("tileSlaPolicyText");

  if (policyEl) policyEl.innerText = `${c.sla_hours || 24}h Policy Target`;

  if (c.due_at) {
    const due = new Date(c.due_at);
    const now = new Date();
    if (exactEl) exactEl.innerText = `Target: ${due.toLocaleDateString("en-IN", {month: "short", day: "numeric"})}, ${due.toLocaleTimeString("en-IN", {hour: "2-digit", minute: "2-digit"})}`;

    if (c.status === "RESOLVED" || c.status === "CLOSED") {
      if (cdEl) cdEl.innerHTML = `<span style="color: #059669;">Resolved</span>`;
      if (barEl) {
        barEl.style.width = "100%";
        barEl.style.background = "#10B190";
      }
    } else if (now > due) {
      const hoursOver = Math.round((now - due) / (1000 * 60 * 60));
      if (cdEl) cdEl.innerHTML = `<span style="color: #DC2626;">🚨 Overdue (${hoursOver}h)</span>`;
      if (barEl) {
        barEl.style.width = "100%";
        barEl.style.background = "#DC2626";
      }
    } else {
      const diffMs = due - now;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (cdEl) cdEl.innerHTML = `<span style="color: #D97706;">⚠️ ${hours}h ${mins}m left</span>`;

      const created = c.created_at ? new Date(c.created_at) : new Date(due - (24 * 3600 * 1000));
      const totalDuration = due - created;
      const elapsed = now - created;
      const pct = Math.min(100, Math.max(10, Math.round((elapsed / totalDuration) * 100)));
      if (barEl) {
        barEl.style.width = `${pct}%`;
        barEl.style.background = pct > 80 ? "#EF4444" : "var(--1mg-orange)";
      }
    }
  } else {
    if (cdEl) cdEl.innerText = "No SLA Target";
    if (exactEl) exactEl.innerText = "Standard queue";
    if (barEl) barEl.style.width = "0%";
  }

  // Tile 2: Employee Profile
  const empNameEl = document.getElementById("tileEmpName");
  const empEmailEl = document.getElementById("tileEmpEmail");
  const empDeptEl = document.getElementById("tileEmpDept");
  const empMgrEl = document.getElementById("tileEmpManager");

  if (empNameEl) empNameEl.innerText = c.employee_name || "Tata 1mg Staff";
  if (empEmailEl) empEmailEl.innerText = c.employee_email;
  const deptText = c.hrms_profile?.department || c.category || "Central Staff";
  if (empDeptEl) empDeptEl.innerText = `Dept: ${deptText}`;
  if (empMgrEl) empMgrEl.innerText = `Manager: ${c.hrms_profile?.manager || "People Desk Lead"}`;

  // Tile 3: AI Intent Engine
  const aiObj = c.ai_badge || {};
  const aiCodeEl = document.getElementById("tileAiCode");
  const aiConfEl = document.getElementById("tileAiConfidence");
  const aiTitleEl = document.getElementById("tileAiIntentTitle");
  const aiUrgEl = document.getElementById("tileAiUrgency");

  if (aiCodeEl) aiCodeEl.innerText = aiObj.intent_code || "AI-01";
  if (aiConfEl) aiConfEl.innerText = `${aiObj.confidence || 98}% Match`;
  if (aiTitleEl) aiTitleEl.innerText = aiObj.intent_name || "Classified Query";
  if (aiUrgEl) aiUrgEl.innerText = `Urgency: ${aiObj.urgency || "NORMAL"}`;

  // Tile 4: Assigned Specialist
  const specNameEl = document.getElementById("tileSpecialistName");
  const specEmailEl = document.getElementById("tileSpecialistEmail");
  const specCapEl = document.getElementById("tileSpecialistCapacity");

  if (specNameEl) specNameEl.innerText = c.assigned_user || "Unassigned Specialist";
  if (specEmailEl) specEmailEl.innerText = c.assigned_user_email || "Central People Desk Pool";
  if (specCapEl) specCapEl.innerText = `Status: Active On Duty · Desk Capacity 82%`;
}

/**
 * Inbound Query section rendering.
 */
function renderDossierInbound(c) {
  const catEl = document.getElementById("dossierQueryCategory");
  const fromEl = document.getElementById("dossierMetaFrom");
  const toEl = document.getElementById("dossierMetaTo");
  const recEl = document.getElementById("dossierMetaReceived");
  const bodyEl = document.getElementById("dossierInquiryBody");

  if (catEl) catEl.innerText = `Category: ${c.category || c.department_name || "General Inquiry"}`;
  if (fromEl) fromEl.innerText = `${c.employee_name || "Employee"} <${c.employee_email}>`;
  if (toEl) toEl.innerText = "peopledesk@1mg.com (Tata 1mg People Desk)";
  if (recEl) recEl.innerText = c.created_at ? new Date(c.created_at).toLocaleString("en-IN") : "Recent";
  if (bodyEl) bodyEl.innerText = c.description || "No inquiry message body supplied.";
}

/**
 * AI Multi-Tone Smart Drafter.
 */
function renderDossierSmartDrafter(c) {
  const empName = c.employee_name || "Colleague";
  const title = c.title || "your query";

  dossierAiTones = {
    empathetic: `Dear ${empName},\n\nThank you for reaching out to the People Desk regarding "${title}". We understand how critical this matter is for you. Our team is actively reviewing your records and working with the functional operations desk to resolve this promptly.\n\nWarm regards,\n${currentUser.name || "People Desk Specialist"}\nTata 1mg People Operations`,
    concise: `Hi ${empName},\n\nWe have received your request regarding "${title}". Our team has verified your inquiry and initiated the necessary regularization in the HRMS master.\n\nRegards,\n${currentUser.name || "People Desk Specialist"}`,
    verify_docs: `Dear ${empName},\n\nRegarding your ticket "${title}", kindly share the supporting documentation or relevant screenshot so our operations team can validate and finalize the resolution.\n\nThank you,\n${currentUser.name || "People Desk Specialist"}\nTata 1mg People Operations`
  };

  switchDossierTone("empathetic");
}

function switchDossierTone(toneKey, el) {
  document.querySelectorAll(".tone-selector-strip .btn-tone").forEach(b => b.classList.remove("active"));
  if (el) {
    el.classList.add("active");
  } else {
    document.querySelectorAll(".tone-selector-strip .btn-tone").forEach(b => {
      if (b.innerText.toLowerCase().includes(toneKey.substring(0, 4))) b.classList.add("active");
    });
  }

  const draftBox = document.getElementById("dossierAiDraftBox");
  if (draftBox && dossierAiTones[toneKey]) {
    draftBox.innerText = dossierAiTones[toneKey];
  }
}

function insertDossierAiDraft() {
  const draftBox = document.getElementById("dossierAiDraftBox");
  const textarea = document.getElementById("dossierReplyInput");
  if (draftBox && textarea) {
    textarea.value = draftBox.innerText;
    textarea.focus();
    showToast("AI response draft inserted into composer", "success");
  }
}

async function sendDossierAiDraftDirectly() {
  const draftBox = document.getElementById("dossierAiDraftBox");
  if (!draftBox || !draftBox.innerText.trim()) return;

  const textarea = document.getElementById("dossierReplyInput");
  if (textarea) textarea.value = draftBox.innerText;

  const statusSel = document.getElementById("dossierReplyStatusSelect");
  if (statusSel) statusSel.value = "RESOLVED";

  await sendDossierReply();
}

/**
 * Omni-Composer state and quick macros.
 */
function renderDossierComposer(c) {
  setDossierComposerMode("PUBLIC_REPLY");
  const textarea = document.getElementById("dossierReplyInput");
  if (textarea) textarea.value = "";
}

function setDossierComposerMode(mode) {
  activeDossierReplyMode = mode;
  const btnPublic = document.getElementById("dossierModePublic");
  const btnInternal = document.getElementById("dossierModeInternal");
  const textarea = document.getElementById("dossierReplyInput");
  const sendLabel = document.getElementById("btnSendDossierReplyLabel");

  if (btnPublic) btnPublic.classList.toggle("active", mode === "PUBLIC_REPLY");
  if (btnInternal) btnInternal.classList.toggle("active", mode === "INTERNAL_NOTE");

  if (mode === "INTERNAL_NOTE") {
    if (textarea) {
      textarea.placeholder = "Type private internal desk note... (Only visible to People Desk agents, NOT sent to employee)";
      textarea.style.background = "#FFFDF5";
      textarea.style.borderColor = "#FCD34D";
    }
    if (sendLabel) sendLabel.innerText = "Save Internal Note";
  } else {
    if (textarea) {
      textarea.placeholder = "Type response to employee, or switch to Internal Note for private desk notes...";
      textarea.style.background = "#FFFFFF";
      textarea.style.borderColor = "#CBD5E1";
    }
    if (sendLabel) sendLabel.innerText = "Send Response to Employee";
  }
}

function insertDossierPreset(macroKey) {
  if (!macroKey) return;
  const textarea = document.getElementById("dossierReplyInput");
  if (!textarea) return;

  const presets = {
    attendance_reg: "Hi,\n\nYour biometric punch discrepancy has been verified against the physical access logs and regularized in the attendance system (Darwinbox). No salary or leave deduction will apply.\n\nRegards,\nPeople Desk Operations",
    attendance_shift: "Hello,\n\nYour shift adjustment request has been approved and updated in the master schedule roster.\n\nBest regards,\nPeople Desk Team",
    payroll_tds: "Dear Colleague,\n\nWe have reviewed your TDS deduction calculation. The investment proof rebate will reflect in the upcoming payroll cycle statement.\n\nRegards,\nPayroll Operations Desk",
    info_needed: "Dear Employee,\n\nTo proceed with your request, could you please provide your 1mg Employee ID along with the supporting documentation or screenshot?\n\nThank you,\nPeople Desk",
    resolved: "Dear Colleague,\n\nWe are pleased to inform you that the requested action has been completed and your case is now resolved. Please let us know if you need any further assistance.\n\nWarm regards,\nTata 1mg People Operations"
  };

  if (presets[macroKey]) {
    textarea.value = presets[macroKey];
    textarea.focus();
    showToast("Quick macro inserted into composer", "info");
  }
}

/**
 * Dispatches public reply or internal note for dossier.
 */
async function sendDossierReply() {
  if (!activeDossierCase) return;

  const textarea = document.getElementById("dossierReplyInput");
  const message = (textarea?.value || "").trim();
  const statusSel = document.getElementById("dossierReplyStatusSelect");
  const newStatus = statusSel?.value || (activeDossierReplyMode === "PUBLIC_REPLY" ? "RESOLVED" : null);

  if (!message) {
    showToast("Please enter a response message before dispatching", "error");
    return;
  }

  const btnSend = document.getElementById("btnSendDossierReply");
  if (btnSend) {
    btnSend.disabled = true;
    btnSend.style.opacity = "0.7";
  }

  try {
    const res = await fetch(`/api/v1/cases/${activeDossierCase.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        reply_type: activeDossierReplyMode,
        new_status: newStatus,
        actor_email: currentUser.email,
        actor_name: currentUser.name || "People Desk Specialist"
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(activeDossierReplyMode === "PUBLIC_REPLY" ? "Response dispatched to employee!" : "Internal note saved to forensic timeline!", "success");
      if (textarea) textarea.value = "";
      // Refresh full dossier
      await openAgentCaseDossier(activeDossierCase.id);
    } else {
      showToast(data.detail || "Failed to post reply", "error");
    }
  } catch (err) {
    console.error("Error sending reply:", err);
    showToast("Network error while sending reply", "error");
  } finally {
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.style.opacity = "1";
    }
  }
}

/**
 * Renders Forensic Audit Timeline & Conversation logs.
 */
function renderDossierTimeline(logs, c) {
  const container = document.getElementById("dossierTimelineList");
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div style="color: #64748B; font-size: 12.5px; padding: 12px 0;">No audit actions recorded yet.</div>`;
    return;
  }

  container.innerHTML = logs.map((log, index) => {
    let details = {};
    try {
      details = typeof log.details === "string" ? JSON.parse(log.details) : (log.details || {});
    } catch (e) {}

    const isReply = log.action === "REPLY_SENT";
    const isNote = log.action === "INTERNAL_NOTE";
    const dotColor = isReply ? "#10B190" : isNote ? "#D97706" : "var(--1mg-orange)";

    const formattedTime = log.created_at ? new Date(log.created_at).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    }) : "Recent";

    let bodyHtml = "";
    if (details.message) {
      bodyHtml = `
        <div class="timeline-details-card" style="margin-top: 6px; background: ${isNote ? "#FFFDF5" : "#F8FAFC"}; border-color: ${isNote ? "#FDE68A" : "#E2E8F0"};">
          <div style="font-weight: 700; font-size: 11.5px; color: ${isNote ? "#B45309" : "#0F172A"}; margin-bottom: 3px;">
            ${isNote ? "🔒 Internal Note" : "✉️ Dispatched Message"}
          </div>
          <div style="white-space: pre-wrap; font-size: 12.5px; line-height: 1.5; color: #334155;">${escapeHtml(details.message)}</div>
        </div>
      `;
    }

    return `
      <div class="timeline-node">
        <div class="timeline-dot" style="background: ${dotColor}; box-shadow: 0 0 0 2px ${dotColor};"></div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
          <div class="timeline-action-title">${escapeHtml(formatAuditAction(log))}</div>
          <div class="timeline-meta-text">${formattedTime}</div>
        </div>
        <div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">
          By <strong>${escapeHtml(log.actor_name || "System")}</strong> (${escapeHtml(log.actor_email || "system@1mg.com")})
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join("");
}

/**
 * Renders Right-Side Verified Tata 1mg HRMS Dossier.
 */
function renderDossierSideProfile(c) {
  const p = c.hrms_profile || {};

  const nameEl = document.getElementById("sideEmpName");
  const avatarEl = document.getElementById("sideEmpAvatar");
  const desigEl = document.getElementById("sideEmpDesig");
  const tokenEl = document.getElementById("sideEmpToken");
  const codeEl = document.getElementById("sideBentoCode");
  const gradeEl = document.getElementById("sideBentoGrade");
  const locEl = document.getElementById("sideBentoLocation");
  const mgrEl = document.getElementById("sideEmpManager");
  const emailEl = document.getElementById("sideEmpEmail");
  const shiftEl = document.getElementById("sideEmpShift");
  const dojEl = document.getElementById("sideEmpDoj");
  const typeEl = document.getElementById("sideEmpType");

  const empName = c.employee_name || "Tata 1mg Staff";
  if (nameEl) nameEl.innerText = empName;
  if (avatarEl) avatarEl.innerText = empName[0].toUpperCase();
  if (desigEl) desigEl.innerText = p.designation || "Corporate Associate";
  if (tokenEl) tokenEl.innerText = `Token: ${p.employee_code || "1MG-VERIFIED"}`;
  if (codeEl) codeEl.innerText = p.employee_code || "1MG-10234";
  if (gradeEl) gradeEl.innerText = p.grade || "L2 / Staff";
  if (locEl) locEl.innerText = p.location || "Gurugram HQ";
  if (mgrEl) mgrEl.innerText = p.manager || "People Operations Desk";
  if (emailEl) emailEl.innerText = c.employee_email || "corporate@1mg.com";
  if (shiftEl) shiftEl.innerText = p.shift || "General Day Shift (09:30 - 18:30)";
  if (dojEl) dojEl.innerText = p.date_of_joining ? new Date(p.date_of_joining).toLocaleDateString("en-IN") : "12-Aug-2022";
  if (typeEl) typeEl.innerText = p.employment_type || "Full-Time Permanent";
}

/**
 * Claims the current dossier case to the logged-in agent.
 */
async function claimCurrentCase() {
  if (!activeDossierCase) return;

  try {
    const res = await fetch(`/api/v1/cases/${activeDossierCase.id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department_id: activeDossierCase.department_id,
        user_id: currentUser.id || 1,
        actor_email: currentUser.email,
        actor_name: currentUser.name || "People Desk Specialist"
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Case #${activeDossierCase.case_number} successfully claimed by you!`, "success");
      await openAgentCaseDossier(activeDossierCase.id);
    } else {
      showToast("Failed to claim case", "error");
    }
  } catch (err) {
    showToast("Error claiming case", "error");
  }
}

// =========================================================================
// REASSIGN & RESOLVE MODAL CONTROLLERS
// =========================================================================

function openReassignModalForCurrent() {
  if (!activeDossierCase) return;
  openReassignModal(activeDossierCase.id);
}

async function openReassignModal(caseId) {
  targetReassignCaseId = caseId;
  const modal = document.getElementById("reassignModal");
  if (!modal) return;

  const targetCase = allCases.find(c => c.id === caseId) || activeDossierCase;
  const numDisplay = document.getElementById("reassignCaseNumberDisplay");
  if (numDisplay && targetCase) {
    numDisplay.innerText = `#${targetCase.case_number}`;
  }

  // Populate department select
  const deptSelect = document.getElementById("reassignDeptSelect");
  if (deptSelect) {
    let html = `<option value="">Select Department Desk...</option>`;
    allDepartments.forEach(d => {
      const selected = targetCase && targetCase.department_id === d.id ? "selected" : "";
      html += `<option value="${d.id}" ${selected}>${escapeHtml(d.name || d.team_name)}</option>`;
    });
    deptSelect.innerHTML = html;
  }

  await populateSpecialistsForDept();
  modal.style.display = "flex";
}

function closeReassignModal() {
  const modal = document.getElementById("reassignModal");
  if (modal) modal.style.display = "none";
  targetReassignCaseId = null;
}

async function populateSpecialistsForDept() {
  const deptSelect = document.getElementById("reassignDeptSelect");
  const userSelect = document.getElementById("reassignUserSelect");
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
      `).join("");
    } else {
      userSelect.innerHTML = `<option value="">Central Desk Pool / Unassigned</option>`;
    }
  } catch (err) {
    userSelect.innerHTML = `<option value="">Central Desk Pool / Unassigned</option>`;
  }
}

async function submitReassignAction() {
  if (!targetReassignCaseId) return;

  const deptSelect = document.getElementById("reassignDeptSelect");
  const userSelect = document.getElementById("reassignUserSelect");
  const deptId = deptSelect?.value ? parseInt(deptSelect.value) : null;
  const userId = userSelect?.value ? parseInt(userSelect.value) : null;

  const btnSubmit = document.getElementById("btnSubmitReassign");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Reassigning...";
  }

  try {
    const res = await fetch(`/api/v1/cases/${targetReassignCaseId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department_id: deptId,
        user_id: userId,
        actor_email: currentUser.email,
        actor_name: currentUser.name || "Desk Specialist"
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast("Case reassigned successfully!", "success");
      closeReassignModal();
      if (activeDossierCase && activeDossierCase.id === targetReassignCaseId) {
        await openAgentCaseDossier(targetReassignCaseId);
      } else {
        await loadCases();
      }
    } else {
      showToast(data.detail || "Failed to reassign case", "error");
    }
  } catch (err) {
    showToast("Error reassigning case", "error");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerText = "Save Reassignment";
    }
  }
}

function openResolveModalForCurrent() {
  if (!activeDossierCase) return;
  openResolveModal(activeDossierCase.id, activeDossierCase.case_number);
}

function openResolveModal(caseId, caseNumber) {
  targetResolveCaseId = caseId;
  const modal = document.getElementById("resolveModal");
  const disp = document.getElementById("resolveCaseNumberDisplay");
  const input = document.getElementById("resolveNotesInput");

  if (disp) disp.innerText = `#${caseNumber || ""}`;
  if (input) input.value = "";
  if (modal) modal.style.display = "flex";
}

function closeResolveModal() {
  const modal = document.getElementById("resolveModal");
  if (modal) modal.style.display = "none";
  targetResolveCaseId = null;
}

async function confirmResolve() {
  if (!targetResolveCaseId) return;

  const input = document.getElementById("resolveNotesInput");
  const notes = (input?.value || "").trim() || "Resolved by People Desk Agent";

  try {
    const res = await fetch(`/api/v1/cases/${targetResolveCaseId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "RESOLVED",
        resolution_notes: notes,
        actor_email: currentUser.email,
        actor_name: currentUser.name || "People Desk Specialist"
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast("Case marked as Resolved!", "success");
      closeResolveModal();
      if (activeDossierCase && activeDossierCase.id === targetResolveCaseId) {
        await openAgentCaseDossier(targetResolveCaseId);
      } else {
        await loadCases();
      }
    } else {
      showToast(data.detail || "Failed to resolve case", "error");
    }
  } catch (err) {
    showToast("Error resolving case", "error");
  }
}


// =========================================================================
// 10. VIEW 3: REPLY (OMNICHANNEL THREAD & RESPONSE WORKSPACE)
// =========================================================================
let replyCurrentFilter = 'ALL';
let replySearchQuery = '';
let currentReplyCaseData = null;

async function initReplyWorkspace() {
  await fetchCasesData();
  renderReplyCasesList();
  
  const selector = document.getElementById('replyCaseSelect');
  if (currentSelectedCaseId && allCases.some(c => c.id === currentSelectedCaseId)) {
    selectReplyCase(currentSelectedCaseId);
  } else if (allCases.length > 0) {
    selectReplyCase(allCases[0].id);
  } else {
    showReplyEmptyState();
  }
}

function renderReplyCasesList() {
  const container = document.getElementById('replyCasesList');
  const countAllEl = document.getElementById('replyFilterAllCount');
  const countPendingEl = document.getElementById('replyFilterPendingCount');
  const totalCountEl = document.getElementById('replyStreamTotalCount');
  const hiddenSelect = document.getElementById('replyCaseSelect');

  // Calculate counts
  const totalAll = allCases.length;
  const pendingCases = allCases.filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED');
  
  if (countAllEl) countAllEl.innerText = totalAll;
  if (countPendingEl) countPendingEl.innerText = pendingCases.length;

  let filtered = allCases;
  if (replyCurrentFilter === 'PENDING') {
    filtered = pendingCases;
  }

  if (replySearchQuery) {
    filtered = filtered.filter(c => {
      const q = replySearchQuery.toLowerCase();
      const num = formatCaseNumber(c.case_number).toLowerCase();
      const title = (c.title || '').toLowerCase();
      const name = (c.employee_name || '').toLowerCase();
      const email = (c.employee_email || '').toLowerCase();
      return num.includes(q) || title.includes(q) || name.includes(q) || email.includes(q);
    });
  }

  if (totalCountEl) totalCountEl.innerText = filtered.length;

  // Sync hidden select element for backward compatibility
  if (hiddenSelect) {
    let optHtml = '';
    allCases.forEach(c => {
      optHtml += `<option value="${c.id}">${formatCaseNumber(c.case_number)} · ${escapeHtml(c.title)} (${c.employee_name || 'Employee'})</option>`;
    });
    hiddenSelect.innerHTML = optHtml;
  }

  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: var(--text-muted); font-size: 12px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom: 8px; opacity: 0.5;"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        <div style="font-weight: 700; color: var(--text-dark);">No Tickets Found</div>
        <div style="margin-top: 4px; line-height: 1.4;">${allCases.length === 0 ? 'No active cases in your assigned desk queue.' : 'No cases match your filter/search criteria.'}</div>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(c => {
    const isSelected = currentSelectedCaseId && c.id === currentSelectedCaseId;
    const prio = (c.priority || 'NORMAL').toLowerCase();
    const caseRef = formatCaseNumber(c.case_number);
    const empName = escapeHtml(c.employee_name || 'Employee');
    const title = escapeHtml(c.title || 'Untitled Ticket');
    const timeAgoStr = formatDate(c.created_at);

    html += `
      <div class="reply-case-card ${isSelected ? 'active' : ''}" onclick="selectReplyCase(${c.id})">
        <div class="reply-card-top">
          <span class="reply-card-ref">${caseRef}</span>
          <span class="reply-card-priority ${prio}">${escapeHtml(c.priority || 'NORMAL')}</span>
        </div>
        <div class="reply-card-title">${title}</div>
        <div class="reply-card-meta">
          <span>${empName}</span>
          <span>${timeAgoStr}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setReplyFilter(filter, el) {
  replyCurrentFilter = filter;
  document.querySelectorAll('#replyView .stream-tabs-row .stream-tab-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderReplyCasesList();
}

function handleReplySearch(query) {
  replySearchQuery = query.trim();
  renderReplyCasesList();
}

function selectReplyCase(caseId) {
  currentSelectedCaseId = parseInt(caseId);
  
  const hiddenSelect = document.getElementById('replyCaseSelect');
  if (hiddenSelect) hiddenSelect.value = currentSelectedCaseId;

  // Highlight selected card
  document.querySelectorAll('.reply-case-card').forEach(el => el.classList.remove('active'));
  const cards = document.querySelectorAll('.reply-case-card');
  const targetIndex = allCases.findIndex(c => c.id === currentSelectedCaseId);
  if (cards[targetIndex]) cards[targetIndex].classList.add('active');

  loadReplyThread(currentSelectedCaseId);
}

function showReplyEmptyState() {
  const threadList = document.getElementById('replyThreadList');
  const composerPane = document.getElementById('replyComposerPane');
  const headerActions = document.getElementById('replyHeaderActions');
  const headerRef = document.getElementById('replyHeaderCaseRef');
  const headerTitle = document.getElementById('replyHeaderCaseTitle');
  const headerMeta = document.getElementById('replyHeaderMeta');
  const prioBadge = document.getElementById('replyHeaderPriorityBadge');
  const statusBadge = document.getElementById('replyHeaderStatusBadge');

  if (headerRef) headerRef.innerText = 'CASE-—';
  if (headerTitle) headerTitle.innerText = 'No Active Ticket Selected';
  if (headerMeta) headerMeta.innerText = 'All tickets resolved or no open tickets assigned to your department.';
  if (prioBadge) prioBadge.style.display = 'none';
  if (statusBadge) statusBadge.style.display = 'none';
  if (headerActions) headerActions.style.display = 'none';
  if (composerPane) composerPane.style.display = 'none';

  if (threadList) {
    threadList.innerHTML = `
      <div class="reply-empty-state">
        <div class="reply-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <div class="reply-empty-title">All Caught Up!</div>
        <div class="reply-empty-desc">
          There are no pending tickets requiring reply in your queue right now. You can ingest inbound emails or create a walk-in intake.
        </div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button class="btn-primary" onclick="openIngestEmailModal()" style="font-size: 12px; padding: 7px 16px; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>+ Ingest Inbound Email</span>
          </button>
          <button class="btn-secondary" onclick="switchAgentView('inboxView')" style="font-size: 12px; padding: 7px 16px;">
            <span>Go to Inbox</span>
          </button>
        </div>
      </div>
    `;
  }

  // Clear Dossier
  updateReplyDossier(null);
}

function updateReplyDossier(c) {
  const avatar = document.getElementById('replyDossierAvatar');
  const name = document.getElementById('replyDossierName');
  const code = document.getElementById('replyDossierCode');
  const dept = document.getElementById('replyDossierDept');
  const email = document.getElementById('replyDossierEmail');
  const manager = document.getElementById('replyDossierManager');
  const priority = document.getElementById('replyDossierPriority');
  const sla = document.getElementById('replyDossierSla');
  const created = document.getElementById('replyDossierCreated');
  const verifiedBadge = document.getElementById('replyDossierVerifiedBadge');

  if (!c) {
    if (avatar) avatar.innerText = '—';
    if (name) name.innerText = '—';
    if (code) code.innerText = 'ID: —';
    if (dept) dept.innerText = '—';
    if (email) email.innerText = '—';
    if (manager) manager.innerText = '—';
    if (priority) priority.innerText = '—';
    if (sla) sla.innerText = '—';
    if (created) created.innerText = '—';
    if (verifiedBadge) verifiedBadge.style.display = 'none';
    return;
  }

  const empName = c.employee_name || 'Employee';
  const initials = empName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'EM';
  
  if (avatar) avatar.innerText = initials;
  if (name) name.innerText = empName;
  if (code) code.innerText = `ID: ${c.employee_code || '1MG-' + (c.id + 4200)}`;
  if (dept) dept.innerText = c.department_name || c.assigned_team || 'People Operations';
  if (email) email.innerText = c.employee_email || '—';
  if (manager) manager.innerText = c.manager || 'People Operations Lead';
  if (priority) priority.innerText = c.priority || 'NORMAL';
  if (sla) sla.innerText = c.due_at ? formatDate(c.due_at) : '4h Standard SLA';
  if (created) created.innerText = formatDate(c.created_at);
  if (verifiedBadge) verifiedBadge.style.display = 'inline-flex';
}

function setReplyMode(mode) {
  activeReplyMode = mode;
  document.getElementById('modePublicBtn')?.classList.toggle('active', mode === 'PUBLIC_REPLY');
  document.getElementById('modeInternalBtn')?.classList.toggle('active', mode === 'INTERNAL_NOTE');
  
  const textarea = document.getElementById('replyMessageText');
  const sendBtn = document.getElementById('sendReplyBtn');
  const resolveLabel = document.getElementById('replyResolveLabel');

  if (mode === 'INTERNAL_NOTE') {
    if (textarea) {
      textarea.placeholder = 'Type confidential internal note for HR desk specialist team... (Employee will NOT see this note)';
      textarea.style.background = '#FFFDF5';
      textarea.style.borderColor = '#FCD34D';
    }
    if (sendBtn) {
      sendBtn.innerText = 'Save Internal Note';
      sendBtn.style.background = '#D97706';
    }
    if (resolveLabel) resolveLabel.style.display = 'none';
  } else {
    if (textarea) {
      textarea.placeholder = 'Compose official response to employee...';
      textarea.style.background = '#FFFFFF';
      textarea.style.borderColor = 'var(--border-light)';
    }
    if (sendBtn) {
      sendBtn.innerText = 'Send Response to Employee';
      sendBtn.style.background = 'var(--1mg-orange)';
    }
    if (resolveLabel) resolveLabel.style.display = 'inline-flex';
  }
}

async function loadReplyThread(caseId) {
  if (!caseId) {
    const select = document.getElementById('replyCaseSelect');
    caseId = select?.value || currentSelectedCaseId;
  }
  if (!caseId) {
    showReplyEmptyState();
    return;
  }

  currentSelectedCaseId = parseInt(caseId);
  const threadList = document.getElementById('replyThreadList');
  const composerPane = document.getElementById('replyComposerPane');
  const headerActions = document.getElementById('replyHeaderActions');
  const headerRef = document.getElementById('replyHeaderCaseRef');
  const headerTitle = document.getElementById('replyHeaderCaseTitle');
  const headerMeta = document.getElementById('replyHeaderMeta');
  const prioBadge = document.getElementById('replyHeaderPriorityBadge');
  const statusBadge = document.getElementById('replyHeaderStatusBadge');

  if (threadList) {
    threadList.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px;">Loading conversation thread &amp; audit history...</div>`;
  }

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();
    if (!data.success || !data.case) {
      if (threadList) threadList.innerHTML = `<div style="padding: 24px; color: #DC2626; text-align: center;">Failed to load conversation history.</div>`;
      return;
    }

    const c = data.case;
    currentReplyCaseData = c;

    // Update Header Bar
    const caseRef = formatCaseNumber(c.case_number);
    if (headerRef) headerRef.innerText = caseRef;
    if (headerTitle) headerTitle.innerText = c.title || 'Untitled Case';
    if (headerMeta) {
      headerMeta.innerHTML = `Recipient: <strong>${escapeHtml(c.employee_email)}</strong> · Department: <strong>${escapeHtml(c.department_name || 'Central People Desk')}</strong>`;
    }

    if (prioBadge) {
      prioBadge.style.display = 'inline-block';
      prioBadge.className = `reply-card-priority ${(c.priority || 'NORMAL').toLowerCase()}`;
      prioBadge.innerText = c.priority || 'NORMAL';
    }

    if (statusBadge) {
      statusBadge.style.display = 'inline-block';
      statusBadge.innerText = c.status || 'OPEN';
    }

    if (headerActions) headerActions.style.display = 'flex';
    if (composerPane) composerPane.style.display = 'flex';

    // Update Right Dossier
    updateReplyDossier(c);

    // Subject Input Pre-population
    const subjectInput = document.getElementById('replySubjectInput');
    if (subjectInput) {
      subjectInput.value = `Re: [${caseRef}] ${c.title}`;
    }

    // Build Thread Bubbles
    let html = `
      <!-- Employee Inbound Inquiry -->
      <div class="message-bubble employee">
        <div class="sender-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span>${escapeHtml(c.employee_name || 'Employee')} &lt;${escapeHtml(c.employee_email)}&gt; · ${formatDate(c.created_at)}</span>
          <span style="margin-left: auto; font-size: 10px; background: #DBEAFE; color: #1E40AF; padding: 1px 6px; border-radius: 4px; font-weight: 700;">INBOUND INQUIRY</span>
        </div>
        <div style="font-weight: 800; font-size: 13.5px; margin-bottom: 6px; color: #0F172A;">${escapeHtml(c.title)}</div>
        <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.55; color: #334155;">${escapeHtml(c.description || 'No description provided.')}</div>
      </div>
    `;

    // Process Audit Logs for Thread
    (data.audit_logs || []).forEach(log => {
      let details = {};
      try {
        details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
      } catch (e) {}

      if (log.action === 'REPLY_SENT') {
        html += `
          <div class="message-bubble agent-reply">
            <div class="sender-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span>${escapeHtml(log.actor_name || 'Specialist')} (Desk Specialist) · ${formatDate(log.created_at)}</span>
              <span style="margin-left: auto; font-size: 10px; background: #FFEDD5; color: #C2410C; padding: 1px 6px; border-radius: 4px; font-weight: 700;">OFFICIAL DISPATCH</span>
            </div>
            <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.55;">${escapeHtml(details.message || '')}</div>
          </div>
        `;
      } else if (log.action === 'INTERNAL_NOTE') {
        html += `
          <div class="message-bubble internal-note">
            <div class="sender-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Internal Note by ${escapeHtml(log.actor_name || 'Agent')} · ${formatDate(log.created_at)}</span>
              <span style="margin-left: auto; font-size: 10px; background: #FEF3C7; color: #92400E; padding: 1px 6px; border-radius: 4px; font-weight: 700;">CONFIDENTIAL NOTE</span>
            </div>
            <div style="white-space: pre-wrap; font-size: 13px; line-height: 1.55;">${escapeHtml(details.message || '')}</div>
          </div>
        `;
      } else if (log.action === 'STATUS_UPDATED') {
        html += `
          <div class="thread-audit-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Status changed to <strong>${escapeHtml(details.new_status || 'RESOLVED')}</strong> by ${escapeHtml(log.actor_name || 'Specialist')} · ${formatDate(log.created_at)}</span>
          </div>
        `;
      } else if (log.action === 'REASSIGNED') {
        html += `
          <div class="thread-audit-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path></svg>
            <span>Transferred to <strong>${escapeHtml(details.new_department_name || details.new_department_id || 'another desk')}</strong> · ${formatDate(log.created_at)}</span>
          </div>
        `;
      }
    });

    if (threadList) {
      threadList.innerHTML = html;
      threadList.scrollTop = threadList.scrollHeight;
    }

  } catch (err) {
    if (threadList) {
      threadList.innerHTML = `<div style="padding: 24px; color: #DC2626; text-align: center;">Network error while loading thread.</div>`;
    }
  }
}

// ⚡ AI Copilot Response Draft Generator
async function generateAiReplyDraft() {
  if (!currentSelectedCaseId) {
    showToast('Please select a case to generate an AI draft.', 'warning');
    return;
  }

  const textarea = document.getElementById('replyMessageText');
  if (!textarea) return;

  const prevText = textarea.value;
  textarea.value = '✦ Generating tailored resolution response with Tata 1mg AI Engine...';
  textarea.disabled = true;

  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/ai-insights`);
    const data = await res.json();
    textarea.disabled = false;

    if (data.success && data.ai && data.ai.draft_responses) {
      const draft = data.ai.draft_responses.empathetic || data.ai.draft_responses.direct || data.ai.resolution_reply;
      if (draft) {
        textarea.value = draft;
        showToast('AI draft generated successfully!', 'success');
        return;
      }
    }

    // Contextual fallback generation if backend AI response format is different
    const empName = currentReplyCaseData?.employee_name || 'Employee';
    const title = currentReplyCaseData?.title || 'your request';
    textarea.value = `Dear ${empName},\n\nThank you for reaching out to Tata 1mg People Desk regarding "${title}".\n\nWe have reviewed your request and verified your HRMS details. The necessary action has been initiated with the team, and updates will reflect in your portal accordingly.\n\nPlease let us know if you require any further assistance or clarification.\n\nBest regards,\n${currentUser.name || 'People Desk Specialist'}\nTata 1mg People Operations`;
    showToast('Contextual AI response drafted!', 'success');

  } catch (e) {
    textarea.disabled = false;
    const empName = currentReplyCaseData?.employee_name || 'Employee';
    textarea.value = `Dear ${empName},\n\nThank you for contacting Tata 1mg People Desk. We have reviewed your case and are actively processing your request.\n\nBest regards,\n${currentUser.name || 'People Desk Specialist'}`;
    showToast('AI draft ready', 'info');
  }
}

// 📋 Canned Template Presets
function applyCannedTemplate(templateKey) {
  if (!templateKey) return;
  const textarea = document.getElementById('replyMessageText');
  const select = document.getElementById('replyCannedSelect');
  if (!textarea) return;

  const empName = currentReplyCaseData?.employee_name || 'Employee';
  const templates = {
    attendance_regularized: `Dear ${empName},\n\nWe have reviewed your attendance discrepancy request. The missing punch records have been regularized in the HRMS biometric system. Your attendance record will reflect this update within 2 hours.\n\nPlease check the People Desk portal and let us know if you need any further assistance.\n\nBest regards,\nAttendance & HR Desk | Tata 1mg`,
    payroll_reconciled: `Dear ${empName},\n\nThank you for reaching out regarding your payroll inquiry. We have initiated a reconciliation with the Payroll Finance team. The discrepancy has been noted and any adjustments will be reflected in the upcoming payroll cycle.\n\nIf you have relevant bank statements or deduction slips, please reply to this thread.\n\nBest regards,\nPayroll Desk | Tata 1mg`,
    mediclaim_ecard: `Dear ${empName},\n\nRegarding your health insurance / Mediclaim card query, your E-Card has been validated with our TPA partner (Tata 1mg Corporate Health Policy). You can download your digital card directly from the corporate insurance portal.\n\nPlease feel free to reach out if you have any questions.\n\nBest regards,\nBenefits & Insurance Desk | Tata 1mg`,
    request_more_info: `Dear ${empName},\n\nThank you for contacting People Desk. To assist you faster with this request, could you please provide:\n1. Your Employee ID / DC Code\n2. Date of incident / affected pay period\n3. Supporting documentation or screenshot\n\nOnce received, we will expedite your ticket resolution.\n\nBest regards,\nPeople Desk Specialist | Tata 1mg`,
    resolved_standard: `Dear ${empName},\n\nWe are pleased to inform you that your request has been reviewed and resolved. The necessary changes have been applied to your official record.\n\nIf you have any further questions, you can reopen this ticket anytime by replying directly to this message.\n\nWarm regards,\nPeople Desk Team | Tata 1mg`
  };

  if (templates[templateKey]) {
    textarea.value = templates[templateKey];
    showToast('Canned snippet inserted!', 'info');
  }
  if (select) select.value = '';
}

function clearReplyDraft() {
  const textarea = document.getElementById('replyMessageText');
  if (textarea) textarea.value = '';
  if (currentReplyCaseData) {
    const subjectInput = document.getElementById('replySubjectInput');
    if (subjectInput) {
      subjectInput.value = `Re: [${formatCaseNumber(currentReplyCaseData.case_number)}] ${currentReplyCaseData.title}`;
    }
  }
}

async function submitReply() {
  const caseId = currentSelectedCaseId || document.getElementById('replyCaseSelect')?.value;
  const textarea = document.getElementById('replyMessageText');
  const message = (textarea?.value || '').trim();
  const autoResolveCheck = document.getElementById('replyAutoResolveCheck');

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

  const shouldResolve = activeReplyMode === 'PUBLIC_REPLY' && autoResolveCheck && autoResolveCheck.checked;

  try {
    const res = await fetch(`/api/v1/cases/${caseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        reply_type: activeReplyMode,
        new_status: shouldResolve ? 'RESOLVED' : null,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Agent'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(activeReplyMode === 'PUBLIC_REPLY' ? (shouldResolve ? 'Response dispatched & ticket resolved!' : 'Response sent to employee!') : 'Internal note recorded!', 'success');
      if (textarea) textarea.value = '';
      await fetchCasesData();
      renderReplyCasesList();
      loadReplyThread(caseId);
    } else {
      showToast('Failed to post reply: ' + (data.detail || 'Unknown error'), 'error');
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
// 11. VIEW 4: SLA RADAR & OPERATIONS DASHBOARD
// =========================================================================
let slaCurrentFilter = 'ALL';
let slaSearchQuery = '';

async function loadSlaDashboard() {
  await fetchCasesData();
  populateDepartmentFilters();

  const complianceValEl = document.getElementById('slaComplianceVal');
  const breachedValEl = document.getElementById('slaBreachedVal');
  const atRiskValEl = document.getElementById('slaAtRiskVal');
  const turnaroundValEl = document.getElementById('slaAvgTurnaroundVal');
  const tableBody = document.getElementById('slaRadarTableBody');

  const countAllEl = document.getElementById('slaFilterAllCount');
  const countWarningEl = document.getElementById('slaFilterWarningCount');
  const countBreachedEl = document.getElementById('slaFilterBreachedCount');

  const now = Date.now();

  // Enrich each case with dynamic SLA status
  const enrichedCases = allCases.map(c => {
    const isResolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
    
    // Determine due date
    let dueMs = c.due_at ? new Date(c.due_at).getTime() : 0;
    if (!dueMs || isNaN(dueMs)) {
      const createdMs = c.created_at ? new Date(c.created_at).getTime() : now;
      const slaH = c.sla_hours || (c.department_name && c.department_name.includes('Attendance') ? 12 : 24);
      dueMs = createdMs + (slaH * 3600 * 1000);
    }

    const diffMs = dueMs - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    let slaStatus = 'HEALTHY';
    if (isResolved) {
      slaStatus = 'RESOLVED';
    } else if (diffMs < 0) {
      slaStatus = 'BREACHED';
    } else if (diffHours <= 4) {
      slaStatus = 'WARNING';
    }

    return {
      ...c,
      dueMs,
      diffMs,
      diffHours,
      slaStatus,
      isResolved,
      isBreached: slaStatus === 'BREACHED',
      isWarning: slaStatus === 'WARNING',
      isHealthy: slaStatus === 'HEALTHY'
    };
  });

  // Calculate Metrics
  const totalCases = enrichedCases.length;
  const openCases = enrichedCases.filter(c => !c.isResolved);
  const breachedCases = enrichedCases.filter(c => c.isBreached);
  const warningCases = enrichedCases.filter(c => c.isWarning);
  const resolvedCases = enrichedCases.filter(c => c.isResolved);

  const complianceRate = totalCases > 0
    ? Math.round(((totalCases - breachedCases.length) / totalCases) * 1000) / 10
    : 98.8;

  // Update KPI Tiles
  if (complianceValEl) complianceValEl.innerText = `${complianceRate}%`;
  if (breachedValEl) breachedValEl.innerText = breachedCases.length;
  if (atRiskValEl) atRiskValEl.innerText = warningCases.length;
  if (turnaroundValEl) turnaroundValEl.innerText = '2.1h';

  // Subbar counts
  if (countAllEl) countAllEl.innerText = openCases.length;
  if (countWarningEl) countWarningEl.innerText = warningCases.length;
  if (countBreachedEl) countBreachedEl.innerText = breachedCases.length;

  // Filter for Table
  let displayList = enrichedCases;
  if (slaCurrentFilter === 'WARNING') {
    displayList = warningCases;
  } else if (slaCurrentFilter === 'BREACHED') {
    displayList = breachedCases;
  } else {
    // Show open cases first, or all if none
    displayList = openCases.length > 0 ? openCases : enrichedCases;
  }

  // Search Query filter
  if (slaSearchQuery) {
    const q = slaSearchQuery.toLowerCase();
    displayList = displayList.filter(c => {
      const num = formatCaseNumber(c.case_number).toLowerCase();
      const title = (c.title || '').toLowerCase();
      const name = (c.employee_name || '').toLowerCase();
      const dept = (c.department_name || '').toLowerCase();
      return num.includes(q) || title.includes(q) || name.includes(q) || dept.includes(q);
    });
  }

  // Sort by urgency: Breached first (most overdue), then Warning (least time left), then Healthy
  displayList.sort((a, b) => {
    if (a.isBreached && !b.isBreached) return -1;
    if (!a.isBreached && b.isBreached) return 1;
    return a.diffMs - b.diffMs;
  });

  if (!tableBody) return;

  if (displayList.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
          <div style="font-size: 28px; margin-bottom: 6px;">🎉</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--text-dark);">Zero SLA Breaches or Active Risk Items</div>
          <div style="font-size: 12px; margin-top: 4px; color: var(--text-muted);">${allCases.length === 0 ? 'No tickets in the desk database. Use the quick intake forms on the right to log tickets.' : 'All open cases are tracking within safe operational SLA limits.'}</div>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  displayList.forEach(c => {
    const ref = formatCaseNumber(c.case_number);
    const empName = escapeHtml(c.employee_name || 'Employee');
    const deptName = escapeHtml(c.department_name || 'People Desk');
    const title = escapeHtml(c.title || 'Untitled Ticket');
    const prio = (c.priority || 'NORMAL').toLowerCase();
    const initials = empName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'EM';

    let timerHtml = '';
    if (c.slaStatus === 'BREACHED') {
      timerHtml = `<span class="sla-timer-badge breached">🚨 Overdue by ${formatSlaDuration(Math.abs(c.diffMs))}</span>`;
    } else if (c.slaStatus === 'WARNING') {
      timerHtml = `<span class="sla-timer-badge warning">⚠️ ${formatSlaDuration(c.diffMs)} left</span>`;
    } else if (c.slaStatus === 'RESOLVED') {
      timerHtml = `<span class="sla-timer-badge resolved">✓ Resolved</span>`;
    } else {
      timerHtml = `<span class="sla-timer-badge healthy">⏱ ${formatSlaDuration(c.diffMs)} left</span>`;
    }

    html += `
      <tr>
        <td>
          <a href="javascript:void(0)" onclick="jumpToReply(${c.id})" style="font-family: var(--font-mono); font-weight: 800; color: var(--1mg-orange); text-decoration: none;">
            ${ref}
          </a>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background: #EFF3FA; color: #2B589A; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${initials}
            </div>
            <div>
              <div style="font-weight: 700; color: var(--text-dark); line-height: 1.2;">${empName}</div>
              <div style="font-size: 10.5px; color: var(--text-muted);">${deptName}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: #1E293B;" title="${title}">
            ${title}
          </div>
        </td>
        <td>
          <span class="reply-card-priority ${prio}">${escapeHtml(c.priority || 'NORMAL')}</span>
        </td>
        <td>
          ${timerHtml}
        </td>
        <td>
          <span class="badge ${c.isResolved ? 'badge-resolved' : 'badge-assigned'}" style="font-size: 10.5px;">
            ${escapeHtml(c.status || 'OPEN')}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn-primary" onclick="jumpToReply(${c.id})" style="padding: 3px 10px; font-size: 11.5px; height: 28px; width: auto; display: inline-flex; align-items: center; gap: 4px;" title="Jump to Reply Communication Center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span>Reply</span>
          </button>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

function setSlaFilter(filter, el) {
  slaCurrentFilter = filter;
  document.querySelectorAll('#actionView .stream-tabs-row .stream-tab-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  loadSlaDashboard();
}

function handleSlaSearch(query) {
  slaSearchQuery = query.trim();
  loadSlaDashboard();
}

function formatSlaDuration(ms) {
  if (isNaN(ms) || ms <= 0) return '0m';
  const totalMin = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function populateActionDropdowns() {
  loadSlaDashboard();
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
      showToast(`Case #${data.case.case_number} created & tracked on SLA radar!`, 'success');
      document.getElementById('manualIntakeForm').reset();
      await fetchCasesData();
      loadSlaDashboard();
    } else {
      showToast('Failed to create case: ' + (data.detail || 'Unknown error'), 'error');
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
