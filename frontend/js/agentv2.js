/**
 * Tata 1mg People Desk · Agent Workbench v2.0 Controller
 * Clean, high-speed triage, master-detail case command, communication studio, and SLA radar.
 */

// =========================================================================
// STATE
// =========================================================================
let currentUser = JSON.parse(localStorage.getItem('1mg_user') || '{}');
let allDepartments = [];
let allCases = [];
let allInboxEmails = [];

let currentViewId = 'inboxView';
let isAiPanelOpen = true;
let isInboxStreamCollapsed = false;
let isAiHighlightsActive = true;

// Inbox state
let currentInboxTriageTab = 'unread';
let currentSelectedEmailId = null;
let currentInboxTone = 'empathetic';
let lastInboxEmailCounts = {};
let mailboxAutoSyncTimer = null;

// Cases state
let agentQueueDeptId = 'ALL';
let agentCasesFilter = 'ALL';
let agentStatusFilter = 'ALL';
let agentPriorityFilter = 'ALL';
let agentSlaRiskFilter = 'ALL';
let agentSpecialistFilter = 'ALL';
let agentCaseSearchQuery = '';
let activeDossierCase = null;
let activeDossierReplyMode = 'PUBLIC_REPLY';
let dossierAiTones = {};
let targetReassignCaseId = null;
let targetResolveCaseId = null;

// Threads (Reply) state
let replyCurrentFilter = 'ALL';
let replySearchQuery = '';
let currentSelectedCaseId = null;
let currentReplyCaseData = null;
let activeReplyMode = 'PUBLIC_REPLY';

// SLA Radar state
let slaCurrentFilter = 'ALL';
let slaSearchQuery = '';

// Command Palette state
let cmdActiveIdx = 0;
let cmdCurrentItems = [];

const VIEW_TITLES = {
  inboxView: 'Inbox Triage',
  casesView: 'Cases Command',
  threadsView: 'Active Threads',
  radarView: 'SLA Radar'
};

const CANNED_RESPONSES = {
  bgv_status: {
    label: 'Onboarding: BGV Follow-up',
    text: 'Dear Employee,\n\nWe have reviewed your background verification file. Our onboarding desk has re-triggered the verification request directly to your previous employer today.\n\nWe are actively monitoring their response and will notify you within 24–48 hours.\n\nWarm regards,\nOnboarding & Verification Desk\nTata 1mg'
  },
  attendance_reg: {
    label: 'Attendance: Biometric Punch Regularized',
    text: 'Dear Employee,\n\nWe have reviewed your attendance regularization request and verified your shift details. Your biometric punch has been successfully regularized in the HRMS system.\n\nPlease check your attendance portal in 15 minutes to confirm the updated status.\n\nWarm regards,\nAttendance & Workforce HR Desk\nTata 1mg'
  },
  attendance_shift: {
    label: 'Attendance: Shift Roster Approved',
    text: 'Dear Employee,\n\nYour shift schedule adjustment request has been approved by your department coordinator and updated in the system roster.\n\nWarm regards,\nAttendance HR Team\nTata 1mg'
  },
  payroll_tds: {
    label: 'Payroll: Tax / TDS Verified',
    text: 'Dear Employee,\n\nWe have verified your tax deduction query against payroll records and TRACES 26AS. Any applicable adjustment will reflect in your upcoming payslip computation.\n\nWarm regards,\nPayroll & Compensation HR\nTata 1mg'
  },
  payroll_slip: {
    label: 'Payroll: Salary Slip & Direct Deposit',
    text: 'Dear Employee,\n\nYour monthly salary slip has been generated and your bank details have been verified with finance. You may download your PDF payslip from the employee self-service portal.\n\nWarm regards,\nPayroll Operations Desk\nTata 1mg'
  },
  mediclaim_tpa: {
    label: 'Benefits: Group Mediclaim E-Card',
    text: 'Dear Employee,\n\nYour Tata 1mg Group Mediclaim enrollment is verified. You can download your digital TPA health e-card on the MediBuddy portal using your Employee ID (Policy ID: 1MG-GMC-2026).\n\nWarm regards,\nBenefits & People Desk\nTata 1mg'
  },
  info_needed: {
    label: 'General: Additional Info Needed',
    text: 'Dear Employee,\n\nThank you for reaching out to Tata 1mg People Desk. To expedite your request, please reply with:\n1. Your Employee ID\n2. Relevant date / screenshot\n3. Reporting manager approval (if applicable)\n\nWarm regards,\nPeople Desk Specialist\nTata 1mg'
  },
  resolved: {
    label: 'Resolution: Case Resolved',
    text: 'Dear Employee,\n\nYour inquiry has been addressed and marked as resolved by our department specialists. If you need any further help, simply reply to this thread to reopen the case.\n\nWarm regards,\nTata 1mg People Desk'
  }
};

// =========================================================================
// 1. INITIALIZATION & SESSION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initUserSession();
  initLiveClock();
  initKeyboardShortcuts();
  initMailInspectorScrollEffects();
  initMailboxAutoSync();

  loadDepartments().then(() => {
    switchView('inboxView');
    fetchCasesData();
  });

  // Close profile menu on outside click
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('profileWrapper');
    const pop = document.getElementById('profilePopover');
    if (pop && wrap && !wrap.contains(e.target)) {
      pop.style.display = 'none';
      document.getElementById('profileTriggerBtn')?.setAttribute('aria-expanded', 'false');
    }
  });
});

function initUserSession() {
  const fullName = currentUser.name || 'HR Agent';
  const email = currentUser.email || 'agent@1mg.com';
  const initials = fullName.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AG';

  setText('agentHeaderName', fullName);
  setText('agentHeaderEmail', email);
  setText('agentAvatar', initials);
  setText('agentLargeAvatar', initials);

  const isAgent = currentUser.role !== 'ADMIN';
  const deptName = currentUser.department_name || 'People Desk';
  setText('agentDeptTag', isAgent ? `${deptName} Desk` : 'System Administrator');
  setText('topbarDeskBadge', isAgent ? `${deptName.toUpperCase()} DESK` : 'ALL DESKS');

  const headBadge = document.getElementById('deptHeadBadge');
  if (headBadge) headBadge.style.display = currentUser.is_dept_head ? 'inline-flex' : 'none';

  const switchAdminBtn = document.getElementById('switchAdminBtn');
  const popAdminItem = document.getElementById('popAdminItem');
  if (currentUser.role === 'ADMIN') {
    if (switchAdminBtn) switchAdminBtn.style.display = 'inline-flex';
    if (popAdminItem) popAdminItem.style.display = 'flex';
  }

  initMailboxStatus();
}

function initLiveClock() {
  const el = document.getElementById('railClockDisplay');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerText = `Live · ${timeStr}`;
  };
  tick();
  setInterval(tick, 15000);
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
      } else {
        if (statusDot) statusDot.style.background = '#F59E0B';
        if (statusLabel) statusLabel.innerText = 'Mailbox: Setup Required';
      }
    }
  } catch (err) {
    console.warn('Mailbox status check:', err);
  }
}

function toggleProfileMenu(e) {
  e?.stopPropagation();
  const pop = document.getElementById('profilePopover');
  const btn = document.getElementById('profileTriggerBtn');
  if (!pop) return;
  const isOpen = pop.style.display === 'block';
  pop.style.display = isOpen ? 'none' : 'block';
  btn?.setAttribute('aria-expanded', String(!isOpen));
}

function handleSignOut() {
  localStorage.clear();
  window.location.href = '/';
}

// =========================================================================
// 2. NAVIGATION & KEYBOARD SHORTCUTS
// =========================================================================
function switchView(viewId, navEl = null) {
  currentViewId = viewId;
  document.querySelectorAll('.v2-view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');

  document.querySelectorAll('.v2-rail-nav .v2-nav-item').forEach(btn => {
    btn.classList.toggle('active', navEl ? btn === navEl : btn.dataset.view === viewId);
  });

  setText('currentViewTitle', VIEW_TITLES[viewId] || 'Agent v2.0');

  // Copilot toggle only relevant on Inbox
  const copilotBtn = document.getElementById('aiPanelToggleBtn');
  if (copilotBtn) copilotBtn.style.display = viewId === 'inboxView' ? 'inline-flex' : 'none';

  if (viewId === 'inboxView') {
    loadInboxEmails();
  } else if (viewId === 'casesView') {
    loadCases();
  } else if (viewId === 'threadsView') {
    initReplyWorkspace();
  } else if (viewId === 'radarView') {
    loadSlaDashboard();
  }
}

function toggleAiPanel() {
  isAiPanelOpen = !isAiPanelOpen;
  document.getElementById('inboxCockpitContainer')?.classList.toggle('copilot-hidden', !isAiPanelOpen);
  document.getElementById('aiPanelToggleBtn')?.classList.toggle('active', isAiPanelOpen);
}

function toggleInboxCollapse() {
  isInboxStreamCollapsed = !isInboxStreamCollapsed;
  document.getElementById('inboxCockpitContainer')?.classList.toggle('queue-collapsed', isInboxStreamCollapsed);
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';

    // ⌘K / Ctrl+K -> Command Palette
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const modal = document.getElementById('commandPaletteModal');
      if (modal && modal.style.display === 'flex') closeCommandPalette();
      else openCommandPalette();
      return;
    }

    // ⌘\ / Ctrl+\ -> Toggle AI Copilot
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault();
      if (currentViewId === 'inboxView') toggleAiPanel();
      return;
    }

    // ⌘+Enter -> Submit active composer
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (document.activeElement?.id === 'inboxQuickReplyInput') {
        e.preventDefault();
        sendInboxReply();
      } else if (document.activeElement?.id === 'dossierReplyInput') {
        e.preventDefault();
        sendDossierReply();
      } else if (document.activeElement?.id === 'replyMessageText') {
        e.preventDefault();
        submitReply();
      }
      return;
    }

    // Escape -> close modals / palette / dossier
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeTransferDepartmentModal();
      closeMailboxConfigModal();
      closeChangePasswordModal();
      closeIngestEmailModal();
      closeNewCaseModal();
      closeResolveModal();
      closeReassignModal();
      if (activeDossierCase && currentViewId === 'casesView') closeAgentCaseDossier();
      return;
    }

    if (isTyping) return;

    // Inbox fast keyboard triage
    if (currentViewId === 'inboxView') {
      if (e.key === '[') {
        e.preventDefault();
        toggleInboxCollapse();
      } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        navigateInboxEmail(1);
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigateInboxEmail(-1);
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        if (currentSelectedEmailId) {
          e.preventDefault();
          convertCurrentInboxEmail();
        }
      }
    }
  });
}

function navigateInboxEmail(delta) {
  const list = getFilteredInboxEmails();
  if (!list.length) return;
  const idx = list.findIndex(e => e.id === currentSelectedEmailId);
  const nextIdx = idx === -1 ? 0 : Math.max(0, Math.min(list.length - 1, idx + delta));
  selectInboxEmail(list[nextIdx].id);
}

// Global Search Routing
function handleGlobalSearch(query) {
  const q = (query || '').trim();
  if (currentViewId === 'inboxView') {
    const el = document.getElementById('inboxSearchInput');
    if (el) { el.value = q; renderInboxEmailStream(); }
  } else if (currentViewId === 'casesView') {
    const el = document.getElementById('caseSearchInput');
    if (el) { el.value = q; handleAgentCaseSearch(); }
  } else if (currentViewId === 'threadsView') {
    const el = document.getElementById('replySearchInput');
    if (el) { el.value = q; handleReplySearch(q); }
  } else if (currentViewId === 'radarView') {
    const el = document.getElementById('slaSearchInput');
    if (el) { el.value = q; handleSlaSearch(q); }
  }
}

function handleGlobalSearchKeydown(e) {
  if (e.key === 'Enter') {
    const q = (e.target.value || '').trim();
    if (q) {
      openCommandPalette(q);
    }
  }
}

// =========================================================================
// 3. COMMAND PALETTE (⌘K)
// =========================================================================
function openCommandPalette(prefill = '') {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('cmdPaletteInput');
  if (!modal || !input) return;
  modal.style.display = 'flex';
  input.value = prefill;
  cmdActiveIdx = 0;
  renderCommandPaletteResults(prefill);
  setTimeout(() => input.focus(), 20);
}

function closeCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  if (modal) modal.style.display = 'none';
}

function renderCommandPaletteResults(query = '') {
  const container = document.getElementById('cmdPaletteResults');
  if (!container) return;
  const q = (query || '').trim().toLowerCase();

  const commands = [
    { type: 'NAV', title: 'Go to Inbox Triage', sub: 'Switch to inbound email queue', run: () => switchView('inboxView') },
    { type: 'NAV', title: 'Go to Cases Command', sub: 'Open master-detail case tracker', run: () => switchView('casesView') },
    { type: 'NAV', title: 'Go to Active Threads', sub: 'Open messaging communication studio', run: () => switchView('threadsView') },
    { type: 'NAV', title: 'Go to SLA Radar', sub: 'Monitor SLA breaches & walk-in intake', run: () => switchView('radarView') },
    { type: 'ACT', title: 'Sync Inbound Mailbox', sub: 'Pull latest emails via IMAP & AI router', run: () => syncInboxMailbox() },
    { type: 'ACT', title: 'Log New Employee Case', sub: 'Create & auto-route a walk-in or phone case', run: () => openNewCaseModal() },
    { type: 'ACT', title: 'Ingest Inbound Email', sub: 'Manually ingest email correspondence', run: () => openIngestEmailModal() },
    { type: 'ACT', title: 'Toggle AI Copilot Drawer', sub: 'Show or hide right-hand Copilot', run: () => { if (currentViewId !== 'inboxView') switchView('inboxView'); toggleAiPanel(); } }
  ];

  const items = [];

  commands.forEach(c => {
    if (!q || c.title.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)) {
      items.push(c);
    }
  });

  // Matching cases
  (allCases || []).filter(c => {
    if (!q) return false;
    return (c.case_number || '').toLowerCase().includes(q) ||
           (c.title || '').toLowerCase().includes(q) ||
           (c.employee_name || '').toLowerCase().includes(q) ||
           (c.employee_email || '').toLowerCase().includes(q);
  }).slice(0, 6).forEach(c => {
    items.push({
      type: 'CASE',
      title: `${formatCaseNumber(c.case_number)} · ${c.title || 'Untitled'}`,
      sub: `${c.employee_name || c.employee_email} · ${c.status}`,
      run: () => {
        switchView('casesView');
        setTimeout(() => openAgentCaseDossier(c.id), 60);
      }
    });
  });

  // Matching emails
  (allInboxEmails || []).filter(em => {
    if (!q) return false;
    return (em.subject || '').toLowerCase().includes(q) ||
           (em.sender_name || '').toLowerCase().includes(q) ||
           (em.sender_email || '').toLowerCase().includes(q);
  }).slice(0, 5).forEach(em => {
    items.push({
      type: 'MAIL',
      title: em.subject || 'Untitled Email',
      sub: `${em.sender_name || em.sender_email} · ${formatCategoryTitle(em.category)}`,
      run: () => {
        switchView('inboxView');
        setTimeout(() => selectInboxEmail(em.id), 60);
      }
    });
  });

  cmdCurrentItems = items;
  cmdActiveIdx = Math.min(cmdActiveIdx, Math.max(0, items.length - 1));

  if (!items.length) {
    container.innerHTML = `<div class="v2-loading-box">No matching commands, cases, or emails.</div>`;
    return;
  }

  container.innerHTML = items.map((item, idx) => `
    <button type="button" class="v2-cmd-item ${idx === cmdActiveIdx ? 'active' : ''}" onclick="executeCommandItem(${idx})">
      <div>
        <div class="v2-cmd-item-title">${escapeHtml(item.title)}</div>
        <div class="v2-cmd-item-sub">${escapeHtml(item.sub)}</div>
      </div>
      <span class="v2-cmd-type">${item.type}</span>
    </button>
  `).join('');
}

function executeCommandItem(idx) {
  const item = cmdCurrentItems[idx];
  closeCommandPalette();
  if (item && typeof item.run === 'function') item.run();
}

function handleCmdPaletteKeydown(e) {
  if (!cmdCurrentItems.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdActiveIdx = (cmdActiveIdx + 1) % cmdCurrentItems.length;
    renderCommandPaletteResults(e.target.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdActiveIdx = (cmdActiveIdx - 1 + cmdCurrentItems.length) % cmdCurrentItems.length;
    renderCommandPaletteResults(e.target.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeCommandItem(cmdActiveIdx);
  }
}

// =========================================================================
// 4. DEPARTMENTS & CASES DATA
// =========================================================================
async function loadDepartments() {
  try {
    const res = await fetch('/api/v1/departments');
    const data = await res.json();
    if (data.success && data.departments) {
      allDepartments = data.departments;
      populateDepartmentDropdowns();
      if (!currentUser.department_ids && currentUser.department_id) {
        currentUser.department_ids = [currentUser.department_id];
        localStorage.setItem('1mg_user', JSON.stringify(currentUser));
      }
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

function populateDepartmentDropdowns() {
  const modalDept = document.getElementById('modalNewDept');
  if (modalDept) {
    let html = '<option value="">Auto-Route with AI</option>';
    allDepartments.forEach(d => {
      html += `<option value="${d.id}">${escapeHtml(d.team_name)} (${escapeHtml(d.dept_code)})</option>`;
    });
    modalDept.innerHTML = html;
  }
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
      if (isAgent && !hasUniversalDeskAccess()) {
        const allowed = (currentUser.department_ids && currentUser.department_ids.length > 0)
          ? currentUser.department_ids.map(String)
          : (currentUser.department_id ? [String(currentUser.department_id)] : []);
        if (allowed.length > 0) {
          cases = cases.filter(c => !c.department_id || allowed.includes(String(c.department_id)));
        }
      }
      allCases = cases;
      updateRailBadges();
      return allCases;
    }
  } catch (err) {
    console.error('Error fetching cases:', err);
    showToast('Failed to load cases from server', 'error');
  }
  return [];
}

function updateRailBadges() {
  const inboxCount = lastInboxEmailCounts?.unread ?? lastInboxEmailCounts?.useful ??
    allInboxEmails.filter(e => !e.is_converted && e.is_actionable === 1).length;
  setBadge('navInboxBadge', inboxCount);

  const activeCases = allCases.filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED');
  setBadge('navCasesBadge', activeCases.length);
  setBadge('navThreadsBadge', activeCases.filter(c => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length);

  const now = Date.now();
  const riskCount = activeCases.filter(c => {
    if (c.priority === 'CRITICAL' || c.priority === 'HIGH') return true;
    if (c.due_at && (new Date(c.due_at).getTime() - now) < 4 * 3600 * 1000) return true;
    return false;
  }).length;
  setBadge('navRadarBadge', riskCount);
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = count;
  el.style.display = count > 0 ? 'inline-flex' : 'none';
}

// =========================================================================
// 5. VIEW 1: INBOX TRIAGE COCKPIT
// =========================================================================
function initMailboxAutoSync() {
  if (mailboxAutoSyncTimer) clearInterval(mailboxAutoSyncTimer);
  mailboxAutoSyncTimer = setInterval(async () => {
    await performMailboxAutoSync();
  }, 30000);
}

async function performMailboxAutoSync() {
  const icon = document.querySelector('#topbarSyncBtn svg');
  icon?.classList.add('spinning');
  try {
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
    await Promise.all([loadInboxEmails({ silent: true }), fetchCasesData()]);

    setText('topbarSyncLabel', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    if (syncData?.cases_created > 0) {
      showToast(`✨ ${syncData.cases_created} new case(s) auto-created by AI`, 'success');
      if (currentViewId === 'casesView') loadCases();
    }
  } catch (err) {
    console.warn('[AutoSync] Notice:', err);
  } finally {
    setTimeout(() => icon?.classList.remove('spinning'), 600);
  }
}

async function syncInboxMailbox(btn) {
  const icon = (btn || document.getElementById('topbarSyncBtn'))?.querySelector('svg');
  icon?.classList.add('spinning');
  showToast('Syncing People Desk mailbox & AI Router...', 'info');
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
    const data = await res.json().catch(() => ({}));
    await Promise.all([loadInboxEmails(), fetchCasesData()]);
    setText('topbarSyncLabel', 'Just now');
    showToast(data.message || 'Mailbox queue up to date', 'success');
  } catch (err) {
    await Promise.all([loadInboxEmails(), fetchCasesData()]);
    showToast('Mailbox refreshed', 'success');
  } finally {
    setTimeout(() => icon?.classList.remove('spinning'), 600);
  }
}

async function loadInboxEmails(options = {}) {
  const isSilent = Boolean(options.silent);
  const streamList = document.getElementById('inboxEmailStreamList');
  if (streamList && !isSilent && !allInboxEmails.length) {
    streamList.innerHTML = `<div class="v2-loading-box">Loading inbound emails...</div>`;
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
  const searchVal = (document.getElementById('inboxSearchInput')?.value || '').trim();
  const searchParam = searchVal ? `&search=${encodeURIComponent(searchVal)}` : '';

  try {
    const res = await fetch(`/api/v1/inbox/emails?tab=${currentInboxTriageTab}${deptParam}${mailboxParam}${userParam}${searchParam}`);
    const data = await res.json();

    if (data.success) {
      allInboxEmails = data.emails || [];

      if (data.counts) {
        lastInboxEmailCounts = data.counts;
        setText('countUnreadBadge', data.counts.unread ?? data.counts.useful ?? 0);
        setText('countReadBadge', data.counts.read ?? 0);
        setText('countAssignedMeBadge', data.counts.assigned_to_me ?? 0);
        setText('countNoiseBadge', data.counts.noise ?? 0);
        updateRailBadges();
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
    } else if (!isSilent) {
      showToast(data.detail || 'Failed to load inbound emails', 'error');
      renderEmptyInboxCockpit();
    }
  } catch (err) {
    if (!isSilent) {
      console.error('Error loading inbox emails:', err);
      if (streamList) {
        streamList.innerHTML = `<div class="v2-loading-box">Failed to reach mail server.<br><button class="v2-btn-secondary sm" style="margin-top:8px;" onclick="loadInboxEmails()">Retry</button></div>`;
      }
      renderEmptyInboxCockpit();
    }
  }
}

function setInboxTriageTab(tab, btnEl) {
  currentInboxTriageTab = tab;
  document.querySelectorAll('#inboxView .v2-seg-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  loadInboxEmails();
}

function handleInboxSearch() {
  renderInboxEmailStream();
}

function getFilteredInboxEmails() {
  const q = (document.getElementById('inboxSearchInput')?.value || '').trim().toLowerCase();
  if (!q) return allInboxEmails;
  return allInboxEmails.filter(e =>
    (e.subject || '').toLowerCase().includes(q) ||
    (e.sender_name || '').toLowerCase().includes(q) ||
    (e.sender_email || '').toLowerCase().includes(q) ||
    (e.snippet || '').toLowerCase().includes(q) ||
    (e.case_number || '').toLowerCase().includes(q)
  );
}

function renderInboxEmailStream() {
  const listEl = document.getElementById('inboxEmailStreamList');
  const miniEl = document.getElementById('inboxCollapsedAvatars');
  const filtered = getFilteredInboxEmails();

  setText('inboxStreamCountPill', `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`);

  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = `<div class="v2-loading-box">No emails in this queue.</div>`;
    if (miniEl) miniEl.innerHTML = '';
    return;
  }

  const gradients = [
    'linear-gradient(135deg, #FF6F61, #EE5A4C)',
    'linear-gradient(135deg, #2563EB, #1D4ED8)',
    'linear-gradient(135deg, #10B190, #059669)',
    'linear-gradient(135deg, #7C3AED, #6D28D9)',
    'linear-gradient(135deg, #D97706, #B45309)'
  ];

  listEl.innerHTML = filtered.map(email => {
    const ai = email.ai_insights || {};
    const isActive = email.id === currentSelectedEmailId;
    const isResolvedCase = email.case_status === 'RESOLVED' || email.case_status === 'CLOSED';
    const isUnresolved = !isResolvedCase && (email.is_actionable !== 0);
    const sender = ai.detected_name || email.sender_name || 'Employee';
    const initial = sender.charAt(0).toUpperCase();
    const grad = gradients[Math.abs(email.id || 0) % gradients.length];
    const timeStr = formatRelativeTime(email.last_activity_at || email.received_at);
    const cleanSnippet = decodeHtmlEntities(email.snippet || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    const isMine = (
      (email.assigned_user_id && currentUser?.id && email.assigned_user_id === currentUser.id) ||
      (email.assigned_user_email && currentUser?.email && email.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase())
    );

    const tags = [];
    if (email.is_converted && email.case_number) {
      tags.push(`<span class="v2-mini-tag case">${escapeHtml(formatCaseNumber(email.case_number))}</span>`);
    }
    if (isResolvedCase) {
      tags.push(`<span class="v2-mini-tag resolved">✓ Resolved</span>`);
    }
    if (ai.intent_label) {
      tags.push(`<span class="v2-mini-tag intent">${escapeHtml(ai.intent_label)}</span>`);
    }
    if (ai.is_urgent && !isResolvedCase) {
      tags.push(`<span class="v2-mini-tag urgent">Urgent</span>`);
    }
    if (isMine) {
      tags.push(`<span class="v2-mini-tag you">You</span>`);
    } else if (email.assigned_user_name) {
      tags.push(`<span class="v2-mini-tag">${escapeHtml(email.assigned_user_name.split(' ')[0])}</span>`);
    }

    return `
      <div class="v2-email-card ${isActive ? 'active' : ''} ${isUnresolved ? 'unread' : 'resolved'}" onclick="selectInboxEmail(${email.id})">
        <div class="v2-ec-top">
          <div class="v2-ec-sender">
            <span class="v2-ec-avatar" style="background: ${grad}">${initial}</span>
            <span class="v2-ec-name">${escapeHtml(sender)}</span>
          </div>
          <span class="v2-ec-time">${escapeHtml(timeStr)}</span>
        </div>
        <div class="v2-ec-subject">${escapeHtml(email.subject || 'Untitled Email')}</div>
        <div class="v2-ec-snippet">${escapeHtml(cleanSnippet)}</div>
        ${tags.length ? `<div class="v2-ec-tags">${tags.join('')}</div>` : ''}
      </div>
    `;
  }).join('');

  if (miniEl) {
    miniEl.innerHTML = filtered.slice(0, 14).map(email => {
      const sender = email.ai_insights?.detected_name || email.sender_name || 'E';
      return `<button type="button" class="v2-mini-avatar-btn ${email.id === currentSelectedEmailId ? 'active' : ''}" title="${escapeHtml(email.subject || sender)}" onclick="selectInboxEmail(${email.id})">${sender.charAt(0).toUpperCase()}</button>`;
    }).join('');
  }
}

function renderEmptyInboxCockpit() {
  currentSelectedEmailId = null;
  const emptyEl = document.getElementById('inboxEmptyState');
  const activeEl = document.getElementById('inboxActiveContent');
  if (emptyEl) emptyEl.style.display = 'flex';
  if (activeEl) activeEl.style.display = 'none';
}

async function selectInboxEmail(emailId) {
  currentSelectedEmailId = emailId;
  const email = allInboxEmails.find(e => e.id === emailId);
  if (!email) {
    renderEmptyInboxCockpit();
    return;
  }

  // Mark read asynchronously
  if (!email.is_read) {
    email.is_read = true;
    email.read_by_name = currentUser?.name || 'Agent';
    email.read_at = new Date().toISOString();
    fetch(`/api/v1/inbox/emails/${emailId}/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser?.id, user_name: currentUser?.name || 'Agent' })
    }).catch(() => {});
  }

  document.getElementById('inboxEmptyState').style.display = 'none';
  document.getElementById('inboxActiveContent').style.display = 'flex';

  const scrollEl = document.getElementById('inboxMailScroll');
  if (scrollEl) scrollEl.scrollTop = 0;

  renderInboxEmailStream();

  const ai = email.ai_insights || {};
  const matchedEmp = ai.matched_employee || {};
  const resolvedCategory = (email.is_actionable === 1 && ai.category) ? ai.category : (email.category || ai.category);
  const deptTitle = formatCategoryTitle(resolvedCategory);

  // Ribbon
  setText('inboxRibbonEmailId', `#EML-${String(email.id).padStart(3, '0')}`);
  setText('inboxRibbonDesk', `${deptTitle} Desk`);
  setText('inboxRibbonSlaText', ai.target_sla ? ai.target_sla.replace('Target SLA', 'SLA') : '48h SLA');

  const ribRead = document.getElementById('inboxRibbonReadStatus');
  if (ribRead) {
    const rName = email.read_by_name || currentUser?.name || 'Agent';
    ribRead.innerText = `✓ Read by ${rName}`;
  }

  const ribAssignee = document.getElementById('inboxRibbonAssignee');
  if (ribAssignee) {
    if (email.assigned_user_name) {
      ribAssignee.style.display = 'inline-flex';
      ribAssignee.innerText = `👤 ${email.assigned_user_name}`;
    } else {
      ribAssignee.style.display = 'none';
    }
  }

  // Handover banner
  const assignBanner = document.getElementById('inboxAssignmentBanner');
  if (assignBanner) {
    if (email.assigned_user_name || (email.transfer_notes && email.transfer_notes.trim())) {
      assignBanner.style.display = 'flex';
      setText('inboxHandoverName', email.assigned_user_name || 'Desk Specialist');
      const isMine = (email.assigned_user_id && currentUser?.id === email.assigned_user_id) ||
                     (email.assigned_user_email && currentUser?.email?.toLowerCase() === email.assigned_user_email.toLowerCase());
      document.getElementById('inboxHandoverYouTag').style.display = isMine ? 'inline-flex' : 'none';
      const notesRow = document.getElementById('inboxHandoverNotesRow');
      if (email.transfer_notes && email.transfer_notes.trim()) {
        notesRow.style.display = 'block';
        setText('inboxHandoverNotesText', email.transfer_notes.trim());
      } else {
        notesRow.style.display = 'none';
      }
    } else {
      assignBanner.style.display = 'none';
    }
  }

  // Noise & Convert buttons
  const noiseBtn = document.getElementById('inboxToggleNoiseBtn');
  if (noiseBtn) {
    noiseBtn.innerText = email.is_actionable === 1 ? 'Mark Noise' : 'Move to Useful';
  }

  const convertBtn = document.getElementById('inboxConvertCaseBtn');
  if (convertBtn) {
    if (email.is_converted && email.case_number) {
      convertBtn.innerHTML = `<span>Open ${escapeHtml(formatCaseNumber(email.case_number))}</span>`;
      convertBtn.onclick = () => openConvertedCaseInWorkspace(email.case_number);
    } else {
      convertBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Convert to Case</span>`;
      convertBtn.onclick = () => convertCurrentInboxEmail();
    }
  }

  // Email Header
  const senderName = ai.detected_name || email.sender_name || 'Employee';
  const senderEmail = email.sender_email || '';
  const d = email.received_at ? new Date(email.received_at) : new Date();
  const formattedTime = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const deptObj = allDepartments.find(dep => dep.id === (email.department_id || currentUser?.department_id)) || {};
  const accountEmail = email.account_email || deptObj.dept_gmail || currentUser?.dept_gmail || 'peopledesk@1mg.com';

  setText('inboxSubjectTitle', email.subject || 'Untitled Email');
  setText('inboxHeaderSenderName', senderName);
  setText('inboxHeaderSenderEmail', senderEmail);
  setText('inboxHeaderRecipientDesk', `To: ${accountEmail} · ${deptTitle} Desk`);
  setText('inboxHeaderTimestamp', formattedTime);
  setText('inboxReplyTargetName', senderName);

  const avatarEl = document.getElementById('inboxSenderAvatar');
  if (avatarEl) avatarEl.innerText = senderName.charAt(0).toUpperCase();

  const intentTag = document.getElementById('inboxHeaderIntentTag');
  if (intentTag) {
    intentTag.style.display = (email.is_actionable === 1 && ai.intent_label) ? 'inline-flex' : 'none';
    setText('inboxHeaderIntentLabel', ai.intent_label || '');
  }

  document.getElementById('inboxHeaderMetaDot').style.display = senderEmail ? 'inline' : 'none';

  const verifiedTag = document.getElementById('inboxHeaderVerifiedTag');
  if (verifiedTag) {
    verifiedTag.style.display = 'inline-flex';
    const isCorp = senderEmail.toLowerCase().endsWith('@1mg.com');
    const isEmpVerified = Boolean(ai.detected_code || matchedEmp.is_verified);
    if (isCorp) {
      verifiedTag.className = 'v2-verified-pill';
      verifiedTag.innerText = '✓ 1mg Directory';
    } else if (isEmpVerified) {
      verifiedTag.className = 'v2-verified-pill';
      verifiedTag.innerText = '✓ Emp ID Verified';
    } else {
      verifiedTag.className = 'v2-verified-pill ext';
      verifiedTag.innerText = 'External Inbound';
    }
  }

  // Body
  const bodyEl = document.getElementById('inboxEmailBody');
  if (bodyEl) {
    if (email.thread_messages && email.thread_messages.length > 1) {
      bodyEl.innerHTML = formatThreadConversationHtml(email);
    } else {
      bodyEl.innerHTML = formatEmailBodyHtml(email.body, email, ai);
    }
  }

  // Right Copilot Pane
  const copilotIntent = document.getElementById('inboxCopilotIntentPill');
  if (copilotIntent) {
    copilotIntent.innerHTML = `<span class="v2-intent-dot"></span><span>${escapeHtml(ai.intent_code || 'AI01')}: ${escapeHtml(ai.intent_label || 'General Inquiry')}</span>`;
  }
  setText('inboxCopilotConfidence', `${ai.confidence || 98.4}% Match`);
  document.getElementById('inboxCopilotSlaInfo').innerHTML = `<span>Target SLA: <strong>${escapeHtml(ai.target_sla || '24h Target SLA')}</strong></span>`;

  // Signals
  const digestEl = document.getElementById('inboxAiDigestPills');
  if (digestEl) {
    const pills = [];
    const empId = ai.detected_code || matchedEmp.employee_id;
    if (empId) pills.push(`<span class="digest-pill">🆔 ${escapeHtml(empId)}</span>`);
    if (ai.intent_label) pills.push(`<span class="digest-pill">🏷 ${escapeHtml(ai.intent_label)}</span>`);
    if (ai.is_urgent) pills.push(`<span class="digest-pill">⚡ Urgent SLA</span>`);
    digestEl.innerHTML = pills.length ? pills.join('') : `<span class="v2-muted-sm">No extra signals extracted</span>`;
  }

  setText('inboxCopilotExtractedName', ai.detected_name || email.sender_name || 'Employee');
  setText('inboxCopilotExtractedCode', ai.detected_code || matchedEmp.employee_id || '—');
  setText('inboxCopilotExtractedLocation', matchedEmp.location || '—');
  setText('inboxCopilotExtractedDesig', matchedEmp.designation || 'Employee');

  const isAwaitingEmpId = Boolean((email.actionable_reason === 'AWAITING_EMP_ID' || ai.requires_emp_id) && email.actionable_reason !== 'VERIFIED_BY_REPLY');
  const isVerifiedByReply = Boolean(email.actionable_reason === 'VERIFIED_BY_REPLY' || (ai.detected_code && !senderEmail.toLowerCase().endsWith('@1mg.com')));
  const copilotStatus = document.getElementById('inboxCopilotHrmsStatus');
  if (copilotStatus) {
    if (isAwaitingEmpId) {
      copilotStatus.innerHTML = `<span style="color:#B45309;">⚠️ External · Emp ID Requested</span>`;
    } else if (isVerifiedByReply) {
      copilotStatus.innerHTML = `<span style="color:#065F46;">✓ Verified via Reply (${escapeHtml(ai.detected_code || matchedEmp.employee_id || '')})</span>`;
    } else if (matchedEmp.is_verified) {
      copilotStatus.innerHTML = `<span style="color:#065F46;">✓ Verified against Central HRMS</span>`;
    } else {
      copilotStatus.innerHTML = `<span style="color:#64748B;">Unverified External Ingest</span>`;
    }
  }

  // Convert CTA in Copilot
  const copilotDesc = document.getElementById('inboxCopilotUrgencyDesc');
  const copilotBtn = document.getElementById('inboxCopilotConvertBtn');
  const isNoise = !email.is_actionable || email.category === 'SYSTEM_ALERT' || email.category === 'NEWSLETTER' || email.category === 'SPAM' || Boolean(ai.is_noise);

  if (email.is_converted && email.case_number) {
    if (copilotDesc) copilotDesc.innerHTML = `<strong style="color:#065F46;">✓ Active Case ${escapeHtml(formatCaseNumber(email.case_number))}</strong>`;
    if (copilotBtn) {
      copilotBtn.style.background = '#10B190';
      copilotBtn.innerHTML = `<span>Open Case ${escapeHtml(formatCaseNumber(email.case_number))}</span>`;
      copilotBtn.onclick = () => openConvertedCaseInWorkspace(email.case_number);
    }
  } else if (isNoise) {
    if (copilotDesc) copilotDesc.innerHTML = `<span style="color:#64748B;">Filtered as non-actionable noise.</span>`;
    if (copilotBtn) {
      copilotBtn.style.background = '#64748B';
      copilotBtn.innerHTML = `<span>Move Back to Useful</span>`;
      copilotBtn.onclick = () => toggleCurrentInboxNoise();
    }
  } else {
    if (copilotDesc) {
      if (isAwaitingEmpId) {
        copilotDesc.innerHTML = `<div>⚠️ Missing Employee ID. <button type="button" class="v2-btn-ghost xs" onclick="requestCurrentEmailEmpId()">Re-send ID Request</button></div>`;
      } else {
        copilotDesc.innerText = `${ai.urgency || 'HIGH'}: Recommended to claim & track as an active HR case.`;
      }
    }
    if (copilotBtn) {
      copilotBtn.style.background = '#EA580C';
      copilotBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Claim &amp; Convert to Case</span>`;
      copilotBtn.onclick = () => convertCurrentInboxEmail();
    }
  }

  renderInboxDraft();
}

function renderInboxDraft() {
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  const box = document.getElementById('inboxCopilotDraft');
  if (!box || !email) return;
  const drafts = email.ai_insights?.drafts || {};
  box.innerText = drafts[currentInboxTone] || drafts.empathetic || 'Contextual AI draft ready after analysis.';
}

function switchInboxTone(tone, btnEl) {
  currentInboxTone = tone;
  document.querySelectorAll('#inboxAiCopilotPanel .v2-tone-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderInboxDraft();
}

function insertInboxDraftToReply() {
  const draft = document.getElementById('inboxCopilotDraft')?.innerText?.trim();
  const input = document.getElementById('inboxQuickReplyInput');
  if (draft && input) {
    input.value = draft;
    input.focus();
    showToast('AI draft inserted into reply box', 'info');
  }
}

function insertInboxPreset(key) {
  if (!key || !CANNED_RESPONSES[key]) return;
  const input = document.getElementById('inboxQuickReplyInput');
  if (input) {
    input.value = CANNED_RESPONSES[key].text;
    input.focus();
    showToast(`Template inserted: ${CANNED_RESPONSES[key].label}`, 'info');
  }
}

async function sendInboxReply() {
  const input = document.getElementById('inboxQuickReplyInput');
  const msg = (input?.value || '').trim();
  if (!msg) {
    showToast('Please write a response message first', 'warning');
    return;
  }
  if (!currentSelectedEmailId) return;

  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  const btn = document.getElementById('inboxSendReplyBtn');
  if (btn) { btn.disabled = true; btn.innerText = 'Sending...'; }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        actor_name: currentUser.name || 'HR Specialist',
        actor_email: currentUser.email || 'peopledesk@1mg.com'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Reply dispatched to ${email?.sender_email || 'employee'}!`, 'success');
      input.value = '';
      if (email) {
        const replyMsg = data.reply_message || {
          id: Date.now(),
          type: 'AGENT_REPLY',
          sender_name: currentUser.name || 'People Desk',
          sender_email: currentUser.email || 'peopledesk@1mg.com',
          subject: `Re: ${email.subject || 'Inquiry'}`,
          body: msg,
          received_at: new Date().toISOString()
        };
        if (!Array.isArray(email.thread_messages) || !email.thread_messages.length) {
          email.thread_messages = [{
            id: email.id,
            type: 'EMPLOYEE_INITIAL',
            sender_name: email.sender_name || 'Employee',
            sender_email: email.sender_email,
            subject: email.subject,
            body: email.body || '',
            received_at: email.received_at
          }];
        }
        email.thread_messages.unshift(replyMsg);
        email.last_activity_at = replyMsg.received_at || new Date().toISOString();
        const idx = allInboxEmails.findIndex(x => x.id === email.id);
        if (idx > 0) {
          allInboxEmails.splice(idx, 1);
          allInboxEmails.unshift(email);
        }
        renderInboxEmailStream();
        document.getElementById('inboxEmailBody').innerHTML = formatThreadConversationHtml(email);
        scrollMailToTop();
      }
    } else {
      showToast(data.detail || 'Failed to dispatch reply', 'error');
    }
  } catch (err) {
    showToast('Network error while sending reply', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Send Reply</span>`;
    }
  }
}

async function sendInboxAiReplyDirectly() {
  insertInboxDraftToReply();
  await convertCurrentInboxEmail();
  await sendInboxReply();
}

async function convertCurrentInboxEmail() {
  if (!currentSelectedEmailId) return;
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  if (email && email.is_converted && email.case_number) {
    openConvertedCaseInWorkspace(email.case_number);
    return;
  }

  const btn = document.getElementById('inboxConvertCaseBtn');
  if (btn) { btn.disabled = true; btn.innerText = 'Converting...'; }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/convert-to-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: email?.department_id || currentUser?.department_id || 11,
        assigned_user: email?.assigned_user_name || null,
        actor_name: currentUser?.name || 'Agent',
        actor_email: currentUser?.email || 'agent@1mg.com'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Created Case ${formatCaseNumber(data.case_number)}!`, 'success');
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
      selectInboxEmail(currentSelectedEmailId);
    } else {
      showToast(data.detail || 'Conversion failed', 'error');
    }
  } catch (err) {
    showToast('Failed to convert email to case', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function openConvertedCaseInWorkspace(caseNumber) {
  if (!caseNumber) return;
  try {
    const res = await fetch(`/api/v1/cases?search=${encodeURIComponent(caseNumber)}&include_universal=true`);
    const data = await res.json();
    if (data.success && data.cases?.length) {
      const target = data.cases.find(c => String(c.case_number).toLowerCase() === String(caseNumber).toLowerCase()) || data.cases[0];
      switchView('casesView');
      setTimeout(() => openAgentCaseDossier(target.id), 80);
      return;
    }
  } catch (err) {
    console.error(err);
  }
  switchView('casesView');
}

async function requestCurrentEmailEmpId() {
  if (!currentSelectedEmailId) return;
  showToast('Sending Employee ID verification request...', 'info');
  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/request-emp-id`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Employee ID request sent!', 'success');
      const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
      if (email) email.actionable_reason = 'AWAITING_EMP_ID';
      selectInboxEmail(currentSelectedEmailId);
    } else {
      showToast(data.detail || 'Failed to send request', 'error');
    }
  } catch (err) {
    showToast('Network error sending request', 'error');
  }
}

async function toggleCurrentInboxNoise() {
  if (!currentSelectedEmailId) return;
  try {
    const res = await fetch(`/api/v1/inbox/emails/${currentSelectedEmailId}/toggle-actionable`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Updated email classification', 'info');
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
    }
  } catch (err) {
    showToast('Failed to update email status', 'error');
  }
}

function toggleEmailAiHighlights() {
  isAiHighlightsActive = !isAiHighlightsActive;
  document.getElementById('inboxToggleAiHighlightsBtn')?.classList.toggle('active', isAiHighlightsActive);
  if (currentSelectedEmailId) selectInboxEmail(currentSelectedEmailId);
}

function copyInboxEmailBody() {
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  if (!email) return;
  navigator.clipboard.writeText(email.body || '').then(() => showToast('Email content copied', 'info'));
}

function initMailInspectorScrollEffects() {
  const scrollEl = document.getElementById('inboxMailScroll');
  const topBtn = document.getElementById('inboxScrollToTopBtn');
  if (!scrollEl || !topBtn) return;
  scrollEl.addEventListener('scroll', () => {
    topBtn.classList.toggle('visible', scrollEl.scrollTop > 220);
  });
}

function scrollMailToTop() {
  const scrollEl = document.getElementById('inboxMailScroll');
  if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
}

// Transfer / Reassign Email Modal
function openTransferDepartmentModal() {
  const email = allInboxEmails.find(e => e.id === currentSelectedEmailId);
  if (!email) {
    showToast('Select an email first', 'warning');
    return;
  }
  document.getElementById('transferEmailId').value = email.id;
  setText('transferEmailSubjectDisplay', email.subject || 'Untitled Email');
  document.getElementById('transferRoutingNotes').value = '';

  const deptSel = document.getElementById('transferTargetDeptSelect');
  if (deptSel) {
    deptSel.innerHTML = allDepartments.map(d =>
      `<option value="${d.id}" ${Number(d.id) === Number(email.department_id) ? 'selected' : ''}>${escapeHtml(d.team_name)} (${escapeHtml(d.dept_code)})</option>`
    ).join('');
  }
  document.getElementById('transferEmailModal').style.display = 'flex';
  handleTransferDeptChange(email);
}

async function handleTransferDeptChange(passedEmail = null) {
  const deptId = document.getElementById('transferTargetDeptSelect')?.value;
  const agentSel = document.getElementById('transferTargetAgentSelect');
  if (!agentSel || !deptId) return;

  agentSel.innerHTML = `<option value="">Loading specialists...</option>`;
  try {
    const res = await fetch(`/api/v1/admin/users?department_id=${deptId}&limit=50`);
    const data = await res.json();
    const users = data.users || [];
    let html = `<option value="">Leave in Department Desk Pool</option>`;
    users.forEach(u => {
      const sel = passedEmail && Number(passedEmail.assigned_user_id) === Number(u.id) ? 'selected' : '';
      html += `<option value="${u.id}" data-name="${escapeHtml(u.name)}" data-email="${escapeHtml(u.email)}" ${sel}>${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`;
    });
    agentSel.innerHTML = html;
  } catch (err) {
    agentSel.innerHTML = `<option value="">Auto-assign / Desk Pool</option>`;
  }
}

function closeTransferDepartmentModal() {
  const m = document.getElementById('transferEmailModal');
  if (m) m.style.display = 'none';
}

async function handleTransferDepartmentSubmit(e) {
  e.preventDefault();
  const emailId = document.getElementById('transferEmailId').value;
  const targetDeptId = Number(document.getElementById('transferTargetDeptSelect').value);
  const agentSel = document.getElementById('transferTargetAgentSelect');
  const assignedUserId = agentSel?.value ? Number(agentSel.value) : null;
  const selectedOpt = agentSel?.options[agentSel.selectedIndex];
  const notes = document.getElementById('transferRoutingNotes').value.trim();

  const btn = document.getElementById('btnConfirmTransfer');
  if (btn) { btn.disabled = true; btn.innerText = 'Saving...'; }

  try {
    const res = await fetch(`/api/v1/inbox/emails/${emailId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_department_id: targetDeptId,
        assigned_user_id: assignedUserId,
        assigned_user_name: selectedOpt?.dataset?.name || null,
        assigned_user_email: selectedOpt?.dataset?.email || null,
        notes: notes || null,
        user_id: currentUser?.id,
        user_name: currentUser?.name,
        user_email: currentUser?.email
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Reassignment complete!', 'success');
      closeTransferDepartmentModal();
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
    } else {
      showToast(data.detail || 'Transfer failed', 'error');
    }
  } catch (err) {
    showToast('Network error during transfer', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Confirm Reassignment'; }
  }
}

// =========================================================================
// 6. VIEW 2: CASES COMMAND (MASTER-DETAIL)
// =========================================================================
async function loadCases() {
  await fetchCasesData();
  loadAgentCasesKPIs();
  renderAgentQueueTabs();
  populateAgentSpecialistFilter();
  renderAgentCasesTable();
}

function loadAgentCasesKPIs() {
  const total = allCases.length;
  let active = 0;
  let breached = 0;
  let resolved = 0;
  const now = new Date();

  allCases.forEach(c => {
    const isResolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
    if (isResolved) {
      resolved++;
    } else {
      active++;
      if (c.due_at && now > new Date(c.due_at)) breached++;
    }
  });

  const rate = total > 0 ? Math.round((resolved / total) * 100) : 100;
  setText('caseKpiTotal', total);
  setText('caseKpiActive', active);
  setText('caseKpiBreached', breached);
  setText('caseKpiResolved', resolved);
  setText('caseKpiRate', `${rate}%`);
}

function renderAgentQueueTabs() {
  const container = document.getElementById('caseQueueTabsBar');
  if (!container) return;

  const deptCounts = {};
  allCases.forEach(c => {
    const dId = String(c.department_id || '');
    deptCounts[dId] = (deptCounts[dId] || 0) + 1;
  });

  let html = `
    <button type="button" class="v2-dept-tab ${agentQueueDeptId === 'ALL' ? 'active' : ''}" onclick="selectAgentQueueTab('ALL', this)">
      <span>All Queues</span>
      <span class="v2-tab-badge">${allCases.length}</span>
    </button>
  `;

  allDepartments.forEach(d => {
    const cnt = deptCounts[String(d.id)] || 0;
    const isAct = String(agentQueueDeptId) === String(d.id);
    html += `
      <button type="button" class="v2-dept-tab ${isAct ? 'active' : ''}" onclick="selectAgentQueueTab('${d.id}', this)">
        <span>${escapeHtml(d.team_name || d.name)}</span>
        <span class="v2-tab-badge">${cnt}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function selectAgentQueueTab(deptId, btnEl) {
  agentQueueDeptId = deptId;
  document.querySelectorAll('#caseQueueTabsBar .v2-dept-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderAgentCasesTable();
}

function filterCasesByBento(filterType, el) {
  agentCasesFilter = filterType;
  document.querySelectorAll('.v2-kpi-pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  renderAgentCasesTable();
}

function filterAgentCasesByStatus(statusVal, btnEl) {
  agentStatusFilter = statusVal;
  document.querySelectorAll('#caseStatusPillsBar .v2-pill-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderAgentCasesTable();
}

function handleAgentCaseSearch() {
  agentCaseSearchQuery = (document.getElementById('caseSearchInput')?.value || '').toLowerCase().trim();
  renderAgentCasesTable();
}

function filterAgentCasesByPriority() {
  agentPriorityFilter = document.getElementById('casePriorityFilter')?.value || 'ALL';
  renderAgentCasesTable();
}

function filterAgentCasesBySlaRisk() {
  agentSlaRiskFilter = document.getElementById('caseSlaRiskFilter')?.value || 'ALL';
  renderAgentCasesTable();
}

function filterAgentCasesBySpecialist() {
  agentSpecialistFilter = document.getElementById('caseSpecialistFilter')?.value || 'ALL';
  renderAgentCasesTable();
}

function populateAgentSpecialistFilter() {
  const sel = document.getElementById('caseSpecialistFilter');
  if (!sel) return;
  const current = sel.value;
  const specs = new Set();
  allCases.forEach(c => {
    if (c.assigned_user && c.assigned_user !== 'Central Triage' && c.assigned_user !== 'Unassigned') {
      specs.add(c.assigned_user);
    }
  });
  let html = `<option value="ALL">All Specialists</option>`;
  html += `<option value="MINE">Assigned to Me (${escapeHtml(currentUser.name || 'You')})</option>`;
  html += `<option value="UNASSIGNED">Unassigned Queue</option>`;
  specs.forEach(s => {
    html += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
  });
  sel.innerHTML = html;
  if (current) sel.value = current;
}

function resetAgentCaseFilters() {
  agentCasesFilter = 'ALL';
  agentQueueDeptId = 'ALL';
  agentStatusFilter = 'ALL';
  agentPriorityFilter = 'ALL';
  agentSlaRiskFilter = 'ALL';
  agentSpecialistFilter = 'ALL';
  agentCaseSearchQuery = '';

  const s = document.getElementById('caseSearchInput');
  if (s) s.value = '';
  document.getElementById('casePriorityFilter').value = 'ALL';
  document.getElementById('caseSlaRiskFilter').value = 'ALL';
  document.getElementById('caseSpecialistFilter').value = 'ALL';

  document.querySelectorAll('.v2-kpi-pill').forEach((p, i) => p.classList.toggle('active', i === 0));
  document.querySelectorAll('#caseStatusPillsBar .v2-pill-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  renderAgentQueueTabs();
  renderAgentCasesTable();
}

function getFilteredCases() {
  const now = new Date();
  return allCases.filter(c => {
    if (agentQueueDeptId !== 'ALL' && String(c.department_id) !== String(agentQueueDeptId)) return false;

    const isResolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
    if (agentCasesFilter === 'ACTIVE' && isResolved) return false;
    if (agentCasesFilter === 'RESOLVED' && !isResolved) return false;
    if (agentCasesFilter === 'BREACHED' && (isResolved || !c.due_at || now <= new Date(c.due_at))) return false;

    if (agentStatusFilter !== 'ALL' && c.status !== agentStatusFilter) return false;
    if (agentPriorityFilter !== 'ALL' && (c.priority || 'MEDIUM').toUpperCase() !== agentPriorityFilter) return false;

    if (agentSlaRiskFilter !== 'ALL') {
      if (!c.due_at || isResolved) return false;
      const diffMs = new Date(c.due_at) - now;
      if (agentSlaRiskFilter === 'BREACHED' && diffMs >= 0) return false;
      if (agentSlaRiskFilter === 'AT_RISK' && (diffMs < 0 || diffMs > 2 * 3600 * 1000)) return false;
      if (agentSlaRiskFilter === 'SAFE' && diffMs <= 2 * 3600 * 1000) return false;
    }

    if (agentSpecialistFilter === 'MINE') {
      const isMine = (
        (c.assigned_user && currentUser?.name && c.assigned_user.toLowerCase() === currentUser.name.toLowerCase()) ||
        (c.assigned_user_email && currentUser?.email && c.assigned_user_email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (c.assigned_user_id && currentUser?.id && c.assigned_user_id === currentUser.id)
      );
      if (!isMine) return false;
    } else if (agentSpecialistFilter === 'UNASSIGNED') {
      if (c.assigned_user && c.assigned_user !== 'Central Triage' && c.assigned_user !== 'Unassigned') return false;
    } else if (agentSpecialistFilter !== 'ALL' && c.assigned_user !== agentSpecialistFilter) {
      return false;
    }

    if (agentCaseSearchQuery) {
      const q = agentCaseSearchQuery;
      const hay = `${c.case_number || ''} ${c.title || ''} ${c.description || ''} ${c.employee_email || ''} ${c.employee_name || ''} ${c.department_name || ''} ${c.assigned_user || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderAgentCasesTable() {
  const container = document.getElementById('agentCasesListContainer');
  if (!container) return;

  const filtered = getFilteredCases();
  setText('caseTableCountText', `${filtered.length} Case${filtered.length === 1 ? '' : 's'} In Queue`);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="v2-empty-state">
        <div class="v2-empty-icon">📂</div>
        <h3>No Matching Cases</h3>
        <p>Try adjusting your active filters or log a new employee inquiry.</p>
        <div style="display:flex; gap:8px;">
          <button type="button" class="v2-btn-secondary sm" onclick="resetAgentCaseFilters()">Reset Filters</button>
          <button type="button" class="v2-btn-primary sm" onclick="openNewCaseModal()">+ Log Case</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(c => {
    const isSel = activeDossierCase && activeDossierCase.id === c.id;
    const prio = (c.priority || 'MEDIUM').toLowerCase();
    const statusCls = (c.status || 'OPEN').toLowerCase();
    const slaHtml = renderSlaBadge(c.due_at, c.status);
    const empCode = c.hrms_profile?.employee_code && c.hrms_profile.employee_code !== '—' ? c.hrms_profile.employee_code : c.employee_code;

    return `
      <div class="v2-case-row ${isSel ? 'selected' : ''}" onclick="openAgentCaseDossier(${c.id})">
        <div class="v2-cr-main">
          <div class="v2-cr-top">
            <span class="v2-id-chip mono">${escapeHtml(formatCaseNumber(c.case_number))}</span>
            <span class="v2-prio-chip prio-${prio}">${escapeHtml(c.priority || 'MEDIUM')}</span>
            <span class="v2-desk-chip">${escapeHtml(c.department_name || 'Central Desk')}</span>
            ${c.ai_badge?.intent_name ? `<span class="v2-mini-tag intent">${escapeHtml(c.ai_badge.intent_name)}</span>` : ''}
          </div>
          <div class="v2-cr-title">${escapeHtml(c.title || 'Untitled Case')}</div>
          <div class="v2-cr-meta">
            <span>👤 ${escapeHtml(c.employee_name || c.employee_email || 'Employee')}</span>
            ${empCode ? `<span class="mono">(${escapeHtml(empCode)})</span>` : ''}
            <span>·</span>
            <span>Owner: <strong>${escapeHtml(c.assigned_user || 'Unassigned')}</strong></span>
            <span>·</span>
            <span>${formatRelativeTime(c.created_at)}</span>
          </div>
        </div>
        <div class="v2-cr-right">
          <span class="v2-status-chip status-${statusCls}">${escapeHtml((c.status || 'OPEN').replace(/_/g, ' '))}</span>
          ${slaHtml}
        </div>
      </div>
    `;
  }).join('');
}

async function openAgentCaseDossier(caseId) {
  const ws = document.getElementById('casesMasterDetail');
  const pane = document.getElementById('casesDossierPane');
  if (ws) ws.classList.add('dossier-open');
  if (pane) pane.style.display = 'flex';

  setText('heroCaseTitle', 'Loading Case Dossier...');

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();
    if (!data.success || !data.case) {
      showToast('Case not found', 'error');
      return;
    }

    const c = data.case;
    activeDossierCase = c;
    currentSelectedCaseId = c.id;
    renderAgentCasesTable();

    setText('dossierNavCaseNum', formatCaseNumber(c.case_number));
    setText('heroCaseTitle', c.title || 'Untitled Case');
    setText('heroDeptBadge', c.department_name || c.assigned_team || 'People Desk');
    setText('heroCreatedTime', formatDate(c.created_at));
    setText('tileSpecialistName', c.assigned_user || 'Unassigned');

    const fullLink = document.getElementById('dossierFullPageLink');
    if (fullLink) fullLink.href = `/agent/case-details?id=${c.id}`;

    const statusBadge = document.getElementById('heroStatusBadge');
    if (statusBadge) {
      statusBadge.className = `v2-status-chip status-${(c.status || 'OPEN').toLowerCase()}`;
      statusBadge.innerText = (c.status || 'OPEN').replace(/_/g, ' ');
    }

    const prioBadge = document.getElementById('heroPriorityBadge');
    if (prioBadge) {
      prioBadge.className = `v2-prio-chip prio-${(c.priority || 'MEDIUM').toLowerCase()}`;
      prioBadge.innerText = c.priority || 'MEDIUM';
    }

    const claimBtn = document.getElementById('btnHeroClaim');
    if (claimBtn) {
      const isUnclaimed = !c.assigned_user || c.assigned_user === 'Unassigned' || c.assigned_user === 'Central Triage';
      claimBtn.style.display = isUnclaimed ? 'inline-flex' : 'none';
    }

    // Pipeline highlight
    const stages = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_EMPLOYEE', 'RESOLVED'];
    const curIdx = stages.indexOf(c.status === 'CLOSED' ? 'RESOLVED' : (c.status || 'OPEN'));
    document.querySelectorAll('#dossierLifecyclePipeline .v2-pipe-step').forEach((btn, idx) => {
      btn.classList.remove('current', 'done');
      if (idx === curIdx) btn.classList.add('current');
      else if (idx < curIdx) btn.classList.add('done');
    });

    // SLA text
    setText('tileSlaCountdown', c.due_at ? formatSlaText(c.due_at, c.status) : `${c.sla_hours || 24}h Policy`);
    setText('tileSlaPolicyText', `${c.sla_hours || 24}h Standard SLA`);

    // Inquiry + Timeline
    setText('dossierMetaFrom', `${c.employee_name || 'Employee'} <${c.employee_email || ''}>`);
    setText('dossierMetaReceived', formatDate(c.created_at));
    setText('dossierInquiryBody', c.description || 'No description provided.');
    renderDossierTimeline(data.audit_logs || []);

    // AI Studio
    const ai = c.ai || c.ai_badge || {};
    dossierAiTones = ai.draft_responses || {
      empathetic: `Dear ${c.employee_name || 'Colleague'},\n\nThank you for reaching out regarding "${c.title}". Our ${c.department_name || 'People Desk'} team is reviewing your request and will update you shortly.\n\nWarm regards,\n${currentUser.name || 'People Desk Specialist'}`,
      concise: `Hi ${c.employee_name || 'Colleague'},\n\nWe have logged Case ${formatCaseNumber(c.case_number)} for "${c.title}" and are processing it now.\n\nRegards,\nPeople Desk`,
      verify_docs: `Dear ${c.employee_name || 'Colleague'},\n\nTo proceed with Case ${formatCaseNumber(c.case_number)}, please confirm your Employee ID and attach any supporting screenshot.\n\nRegards,\nPeople Desk`
    };
    setText('tileAiCode', ai.intent_code || 'AI01');
    setText('tileAiConfidence', `${ai.confidence || 98}% Match`);
    setText('tileAiUrgency', ai.urgency || 'NORMAL');
    setText('tileAiIntentTitle', ai.intent_name || 'Automated Classification');
    setText('dossierAiRecommendation', ai.recommended_action || 'Verify employee HRMS record and dispatch response.');
    renderDossierAiDraft('empathetic');

    // HRMS Profile
    const hp = c.hrms_profile || {};
    const empName = hp.employee_name || c.employee_name || 'Tata 1mg Staff';
    setText('sideEmpAvatar', empName.charAt(0).toUpperCase());
    setText('sideEmpName', empName);
    setText('sideEmpDesig', hp.designation || 'Employee');
    setText('sideBentoCode', hp.employee_code || c.employee_code || '—');
    setText('sideBentoGrade', hp.grade || '—');
    setText('sideBentoLocation', hp.location || 'Gurugram HQ');
    setText('sideEmpManager', hp.manager || c.manager || '—');
    setText('sideEmpEmail', hp.company_email || c.employee_email || '—');
    setText('sideEmpShift', hp.shift || 'General Day Shift');
    setText('sideEmpType', hp.employment_type || 'Permanent');

    const verChip = document.getElementById('sideEmpVerifiedChip');
    if (verChip) {
      const isVer = Boolean(hp.is_profile_verified || (c.employee_email || '').endsWith('@1mg.com'));
      verChip.innerText = isVer ? '✓ Verified Directory' : 'External Inbound';
      verChip.className = isVer ? 'v2-verified-pill' : 'v2-verified-pill ext';
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to load case dossier', 'error');
  }
}

function closeAgentCaseDossier() {
  activeDossierCase = null;
  document.getElementById('casesMasterDetail')?.classList.remove('dossier-open');
  const pane = document.getElementById('casesDossierPane');
  if (pane) pane.style.display = 'none';
  renderAgentCasesTable();
}

function switchDossierTab(tabKey, btnEl) {
  document.querySelectorAll('#casesDossierPane .v2-dtab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  document.querySelectorAll('#casesDossierPane .v2-dtab-panel').forEach(p => p.classList.remove('active'));
  const map = { thread: 'dtabThread', ai: 'dtabAi', hrms: 'dtabHrms' };
  document.getElementById(map[tabKey])?.classList.add('active');
}

function renderDossierTimeline(logs) {
  const el = document.getElementById('dossierTimelineList');
  if (!el) return;
  if (!logs.length) {
    el.innerHTML = `<div class="v2-muted-sm">No activity logged yet.</div>`;
    return;
  }

  el.innerHTML = logs.map(log => {
    let details = {};
    try {
      details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
    } catch (e) {}

    if (log.action === 'REPLY_SENT') {
      return `
        <div class="v2-tl-item reply">
          <div class="v2-tl-head">
            <span>✉️ Official Reply · ${escapeHtml(log.actor_name || 'Specialist')}</span>
            <span>${formatDate(log.created_at)}</span>
          </div>
          <div style="white-space:pre-wrap;">${escapeHtml(details.message || '')}</div>
        </div>
      `;
    }
    if (log.action === 'INTERNAL_NOTE') {
      return `
        <div class="v2-tl-item note">
          <div class="v2-tl-head">
            <span>🔒 Internal Note · ${escapeHtml(log.actor_name || 'Agent')}</span>
            <span>${formatDate(log.created_at)}</span>
          </div>
          <div style="white-space:pre-wrap;">${escapeHtml(details.message || '')}</div>
        </div>
      `;
    }
    return `
      <div class="v2-tl-item audit">
        <strong>${escapeHtml(log.action)}</strong> by ${escapeHtml(log.actor_name || 'System')} · ${formatDate(log.created_at)}
      </div>
    `;
  }).join('');
}

async function transitionDossierStatus(newStatus) {
  if (!activeDossierCase) return;
  try {
    const res = await fetch(`/api/v1/cases/${activeDossierCase.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        actor_name: currentUser.name || 'Agent',
        actor_email: currentUser.email || 'agent@1mg.com'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Case moved to ${newStatus.replace(/_/g, ' ')}`, 'success');
      await Promise.all([fetchCasesData(), loadInboxEmails({ silent: true })]);
      loadAgentCasesKPIs();
      openAgentCaseDossier(activeDossierCase.id);
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

function setDossierComposerMode(mode) {
  activeDossierReplyMode = mode;
  document.getElementById('dossierModePublic')?.classList.toggle('active', mode === 'PUBLIC_REPLY');
  document.getElementById('dossierModeInternal')?.classList.toggle('active', mode === 'INTERNAL_NOTE');
  const ta = document.getElementById('dossierReplyInput');
  const lbl = document.getElementById('btnSendDossierReplyLabel');
  if (mode === 'INTERNAL_NOTE') {
    if (ta) ta.placeholder = 'Write confidential internal team note...';
    if (lbl) lbl.innerText = 'Save Note';
  } else {
    if (ta) ta.placeholder = 'Type reply to employee...';
    if (lbl) lbl.innerText = 'Send Reply';
  }
}

function renderDossierAiDraft(toneKey = 'empathetic') {
  const box = document.getElementById('dossierAiDraftBox');
  if (box) box.innerText = dossierAiTones[toneKey] || dossierAiTones.empathetic || 'No draft available.';
}

function switchDossierTone(toneKey, btnEl) {
  document.querySelectorAll('#dtabAi .v2-tone-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderDossierAiDraft(toneKey);
}

function insertDossierAiDraft() {
  const draft = document.getElementById('dossierAiDraftBox')?.innerText?.trim();
  const ta = document.getElementById('dossierReplyInput');
  if (draft && ta) {
    ta.value = draft;
    switchDossierTab('thread', document.querySelector('#casesDossierPane .v2-dtab'));
    ta.focus();
    showToast('AI draft inserted', 'info');
  }
}

async function sendDossierAiDraftDirectly() {
  insertDossierAiDraft();
  const statusSel = document.getElementById('dossierReplyStatusSelect');
  if (statusSel) statusSel.value = 'RESOLVED';
  await sendDossierReply();
}

function insertDossierPreset(key) {
  if (!key || !CANNED_RESPONSES[key]) return;
  const ta = document.getElementById('dossierReplyInput');
  if (ta) {
    ta.value = CANNED_RESPONSES[key].text;
    ta.focus();
  }
}

async function sendDossierReply() {
  if (!activeDossierCase) return;
  const ta = document.getElementById('dossierReplyInput');
  const msg = (ta?.value || '').trim();
  if (!msg) {
    showToast('Enter a reply or note first', 'warning');
    return;
  }

  const newStatus = activeDossierReplyMode === 'PUBLIC_REPLY'
    ? (document.getElementById('dossierReplyStatusSelect')?.value || null)
    : null;

  const btn = document.getElementById('btnSendDossierReply');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/v1/cases/${activeDossierCase.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        reply_type: activeDossierReplyMode,
        new_status: newStatus,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Agent'
      })
    });
    const data = await res.json();
    if (data.success) {
      ta.value = '';
      showToast(activeDossierReplyMode === 'PUBLIC_REPLY' ? 'Reply dispatched!' : 'Internal note saved!', 'success');
      await Promise.all([fetchCasesData(), loadInboxEmails({ silent: true })]);
      loadAgentCasesKPIs();
      openAgentCaseDossier(activeDossierCase.id);
    } else {
      showToast(data.detail || 'Failed to send reply', 'error');
    }
  } catch (err) {
    showToast('Network error sending reply', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function claimCurrentCase() {
  if (!activeDossierCase || !currentUser.id) return;
  try {
    const res = await fetch(`/api/v1/cases/${activeDossierCase.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: activeDossierCase.department_id,
        user_id: currentUser.id,
        actor_email: currentUser.email,
        actor_name: currentUser.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case claimed!', 'success');
      await fetchCasesData();
      openAgentCaseDossier(activeDossierCase.id);
    }
  } catch (err) {
    showToast('Failed to claim case', 'error');
  }
}

function exportCasesCsv() {
  const rows = getFilteredCases();
  if (!rows.length) {
    showToast('No cases to export', 'warning');
    return;
  }
  const headers = ['Case Number', 'Title', 'Employee Name', 'Employee Email', 'Department', 'Priority', 'Status', 'Assignee', 'Due At', 'Created At'];
  const csvRows = [headers.join(',')];
  rows.forEach(c => {
    const vals = [
      c.case_number,
      c.title,
      c.employee_name,
      c.employee_email,
      c.department_name,
      c.priority,
      c.status,
      c.assigned_user || 'Unassigned',
      c.due_at || '',
      c.created_at || ''
    ].map(v => `"${String(v || '').replace(/"/g, '""')}"`);
    csvRows.push(vals.join(','));
  });
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `peopledesk_cases_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

// =========================================================================
// 7. VIEW 3: ACTIVE THREADS STUDIO
// =========================================================================
async function initReplyWorkspace() {
  await fetchCasesData();
  renderReplyCasesList();

  const openCases = allCases.filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED');
  if (currentSelectedCaseId && openCases.some(c => c.id === currentSelectedCaseId)) {
    selectReplyCase(currentSelectedCaseId);
  } else if (openCases.length) {
    selectReplyCase(openCases[0].id);
  } else {
    showReplyEmptyState();
  }
}

function renderReplyCasesList() {
  const container = document.getElementById('replyCasesList');
  if (!container) return;

  const active = allCases.filter(c => c.status !== 'RESOLVED' && c.status !== 'CLOSED');
  const pending = active.filter(c => c.status === 'OPEN' || c.status === 'IN_PROGRESS');

  setText('replyFilterAllCount', active.length);
  setText('replyFilterPendingCount', pending.length);

  let list = replyCurrentFilter === 'PENDING' ? pending : active;
  if (replySearchQuery) {
    const q = replySearchQuery.toLowerCase();
    list = list.filter(c =>
      (c.case_number || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.employee_name || '').toLowerCase().includes(q) ||
      (c.employee_email || '').toLowerCase().includes(q)
    );
  }

  setText('replyStreamTotalCount', list.length);

  if (!list.length) {
    container.innerHTML = `<div class="v2-loading-box">No active tickets match filter.</div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const isSel = currentSelectedCaseId === c.id;
    return `
      <div class="v2-email-card ${isSel ? 'active' : ''}" onclick="selectReplyCase(${c.id})">
        <div class="v2-ec-top">
          <span class="v2-id-chip mono">${escapeHtml(formatCaseNumber(c.case_number))}</span>
          <span class="v2-prio-chip prio-${(c.priority || 'MEDIUM').toLowerCase()}">${escapeHtml(c.priority || 'MEDIUM')}</span>
        </div>
        <div class="v2-ec-subject">${escapeHtml(c.title || 'Untitled Ticket')}</div>
        <div class="v2-ec-tags">
          <span class="v2-mini-tag">${escapeHtml(c.employee_name || 'Employee')}</span>
          <span class="v2-mini-tag">${escapeHtml(formatRelativeTime(c.created_at))}</span>
        </div>
      </div>
    `;
  }).join('');
}

function setReplyFilter(filter, btnEl) {
  replyCurrentFilter = filter;
  document.querySelectorAll('#threadsView .v2-seg-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderReplyCasesList();
}

function handleReplySearch(val) {
  replySearchQuery = (val || '').trim();
  renderReplyCasesList();
}

function selectReplyCase(caseId) {
  currentSelectedCaseId = parseInt(caseId, 10);
  renderReplyCasesList();
  loadReplyThread(currentSelectedCaseId);
}

function showReplyEmptyState() {
  setText('replyHeaderCaseRef', '1MG-—');
  setText('replyHeaderCaseTitle', 'No Active Ticket Selected');
  setText('replyHeaderMeta', 'All tickets resolved or no open tickets in your queue.');
  document.getElementById('replyHeaderPriorityBadge').style.display = 'none';
  document.getElementById('replyHeaderStatusBadge').style.display = 'none';
  document.getElementById('replyHeaderActions').style.display = 'none';
  document.getElementById('replyComposerPane').style.display = 'none';
  document.getElementById('replyThreadList').innerHTML = `
    <div class="v2-empty-state">
      <div class="v2-empty-icon">✓</div>
      <h3>All Caught Up</h3>
      <p>No active threads require a reply right now.</p>
    </div>
  `;
}

async function loadReplyThread(caseId) {
  const threadList = document.getElementById('replyThreadList');
  if (threadList) threadList.innerHTML = `<div class="v2-loading-box">Loading thread...</div>`;

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();
    if (!data.success || !data.case) return;

    const c = data.case;
    currentReplyCaseData = c;
    const caseRef = formatCaseNumber(c.case_number);

    setText('replyHeaderCaseRef', caseRef);
    setText('replyHeaderCaseTitle', c.title || 'Untitled Case');
    document.getElementById('replyHeaderMeta').innerHTML = `Recipient: <strong>${escapeHtml(c.employee_email || '—')}</strong> · Desk: <strong>${escapeHtml(c.department_name || 'People Desk')}</strong>`;

    const prioEl = document.getElementById('replyHeaderPriorityBadge');
    prioEl.style.display = 'inline-block';
    prioEl.className = `v2-prio-chip prio-${(c.priority || 'MEDIUM').toLowerCase()}`;
    prioEl.innerText = c.priority || 'MEDIUM';

    const statusEl = document.getElementById('replyHeaderStatusBadge');
    statusEl.style.display = 'inline-block';
    statusEl.className = `v2-status-chip status-${(c.status || 'OPEN').toLowerCase()}`;
    statusEl.innerText = (c.status || 'OPEN').replace(/_/g, ' ');

    document.getElementById('replyHeaderActions').style.display = 'flex';
    document.getElementById('replyComposerPane').style.display = 'flex';
    document.getElementById('replySubjectInput').value = `Re: [${caseRef}] ${c.title}`;

    // Right Employee Dossier
    const empName = c.employee_name || 'Employee';
    setText('replyDossierAvatar', empName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'EM');
    setText('replyDossierName', empName);
    setText('replyDossierCode', `ID: ${c.employee_code || c.hrms_profile?.employee_code || '—'}`);
    setText('replyDossierDept', c.department_name || c.assigned_team || 'People Operations');
    setText('replyDossierEmail', c.employee_email || '—');
    setText('replyDossierManager', c.manager || c.hrms_profile?.manager || 'People Operations Lead');
    setText('replyDossierPriority', c.priority || 'MEDIUM');
    setText('replyDossierSla', c.due_at ? formatDate(c.due_at) : '24h SLA');
    setText('replyDossierCreated', formatDate(c.created_at));
    document.getElementById('replyDossierVerifiedBadge').style.display = 'block';

    // Build thread
    let html = `
      <div class="v2-tl-item">
        <div class="v2-tl-head">
          <span>👤 ${escapeHtml(empName)} &lt;${escapeHtml(c.employee_email || '')}&gt;</span>
          <span>${formatDate(c.created_at)}</span>
        </div>
        <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(c.title || '')}</div>
        <div style="white-space:pre-wrap;">${escapeHtml(c.description || '')}</div>
      </div>
    `;

    (data.audit_logs || []).forEach(log => {
      let d = {};
      try { d = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {}); } catch (e) {}
      if (log.action === 'REPLY_SENT') {
        html += `
          <div class="v2-tl-item reply">
            <div class="v2-tl-head"><span>✉️ ${escapeHtml(log.actor_name || 'Specialist')} · Official Dispatch</span><span>${formatDate(log.created_at)}</span></div>
            <div style="white-space:pre-wrap;">${escapeHtml(d.message || '')}</div>
          </div>
        `;
      } else if (log.action === 'INTERNAL_NOTE') {
        html += `
          <div class="v2-tl-item note">
            <div class="v2-tl-head"><span>🔒 Internal Note · ${escapeHtml(log.actor_name || 'Agent')}</span><span>${formatDate(log.created_at)}</span></div>
            <div style="white-space:pre-wrap;">${escapeHtml(d.message || '')}</div>
          </div>
        `;
      } else if (log.action === 'STATUS_CHANGED' || log.action === 'STATUS_UPDATED') {
        html += `<div class="v2-tl-item audit">Status changed to <strong>${escapeHtml(d.new_status || '')}</strong> · ${formatDate(log.created_at)}</div>`;
      }
    });

    threadList.innerHTML = html;
    threadList.scrollTop = threadList.scrollHeight;
  } catch (err) {
    if (threadList) threadList.innerHTML = `<div class="v2-loading-box">Error loading thread.</div>`;
  }
}

function setReplyMode(mode) {
  activeReplyMode = mode;
  document.getElementById('modePublicBtn')?.classList.toggle('active', mode === 'PUBLIC_REPLY');
  document.getElementById('modeInternalBtn')?.classList.toggle('active', mode === 'INTERNAL_NOTE');
  const resolveLabel = document.getElementById('replyResolveLabel');
  const sendBtn = document.getElementById('sendReplyBtn');
  if (mode === 'INTERNAL_NOTE') {
    if (resolveLabel) resolveLabel.style.display = 'none';
    if (sendBtn) sendBtn.innerText = 'Save Note';
  } else {
    if (resolveLabel) resolveLabel.style.display = 'inline-flex';
    if (sendBtn) sendBtn.innerText = 'Send Response';
  }
}

async function generateAiReplyDraft() {
  if (!currentSelectedCaseId) return;
  const ta = document.getElementById('replyMessageText');
  if (!ta) return;
  ta.value = '✦ Generating AI draft...';
  ta.disabled = true;
  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/ai-insights`);
    const data = await res.json();
    const draft = data?.ai?.draft_responses?.empathetic || data?.ai?.draft_responses?.direct;
    ta.value = draft || `Dear ${currentReplyCaseData?.employee_name || 'Colleague'},\n\nThank you for contacting Tata 1mg People Desk regarding "${currentReplyCaseData?.title || 'your request'}". Our team has reviewed your case and is taking action.\n\nWarm regards,\n${currentUser.name || 'People Desk Specialist'}`;
  } catch (e) {
    ta.value = `Dear ${currentReplyCaseData?.employee_name || 'Colleague'},\n\nWe are actively processing your request.\n\nRegards,\nPeople Desk`;
  } finally {
    ta.disabled = false;
    ta.focus();
  }
}

function applyCannedTemplate(key) {
  if (!key) return;
  const ta = document.getElementById('replyMessageText');
  const empName = currentReplyCaseData?.employee_name || 'Employee';
  const map = {
    attendance_regularized: CANNED_RESPONSES.attendance_reg.text,
    payroll_reconciled: CANNED_RESPONSES.payroll_tds.text,
    mediclaim_ecard: CANNED_RESPONSES.mediclaim_tpa.text,
    request_more_info: CANNED_RESPONSES.info_needed.text,
    resolved_standard: CANNED_RESPONSES.resolved.text
  };
  if (ta && map[key]) {
    ta.value = map[key].replace(/Dear Employee/g, `Dear ${empName}`);
  }
  document.getElementById('replyCannedSelect').value = '';
}

function clearReplyDraft() {
  const ta = document.getElementById('replyMessageText');
  if (ta) ta.value = '';
}

async function submitReply() {
  if (!currentSelectedCaseId) return;
  const ta = document.getElementById('replyMessageText');
  const msg = (ta?.value || '').trim();
  if (!msg) { showToast('Enter a response message', 'warning'); return; }

  const shouldResolve = activeReplyMode === 'PUBLIC_REPLY' && document.getElementById('replyAutoResolveCheck')?.checked;
  const btn = document.getElementById('sendReplyBtn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/v1/cases/${currentSelectedCaseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        reply_type: activeReplyMode,
        new_status: shouldResolve ? 'RESOLVED' : null,
        actor_email: currentUser.email,
        actor_name: currentUser.name || 'Agent'
      })
    });
    const data = await res.json();
    if (data.success) {
      ta.value = '';
      showToast(shouldResolve ? 'Reply sent & case resolved!' : 'Message saved!', 'success');
      await Promise.all([fetchCasesData(), loadInboxEmails({ silent: true })]);
      renderReplyCasesList();
      loadReplyThread(currentSelectedCaseId);
    } else {
      showToast(data.detail || 'Failed to send reply', 'error');
    }
  } catch (err) {
    showToast('Network error sending reply', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function jumpToReply(caseId) {
  currentSelectedCaseId = caseId;
  switchView('threadsView');
}

// =========================================================================
// 8. VIEW 4: SLA RADAR & INTAKE
// =========================================================================
async function loadSlaDashboard() {
  await fetchCasesData();
  const now = Date.now();
  let breached = 0;
  let warning = 0;
  let resolvedCount = 0;
  let resolvedDurationSum = 0;

  const enriched = allCases.map(c => {
    const isResolved = c.status === 'RESOLVED' || c.status === 'CLOSED';
    let dueMs = c.due_at ? new Date(c.due_at).getTime() : 0;
    if (!dueMs || isNaN(dueMs)) {
      const createdMs = c.created_at ? new Date(c.created_at).getTime() : now;
      dueMs = createdMs + (c.sla_hours || 24) * 3600 * 1000;
    }
    const diffMs = dueMs - now;
    let slaState = 'HEALTHY';
    if (isResolved) {
      slaState = 'RESOLVED';
      resolvedCount++;
      if (c.created_at && c.resolved_at) {
        const dur = Math.max(0, new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime());
        resolvedDurationSum += dur;
      }
    } else if (diffMs < 0) {
      slaState = 'BREACHED';
      breached++;
    } else if (diffMs <= 4 * 3600 * 1000) {
      slaState = 'WARNING';
      warning++;
    }
    return { ...c, dueMs, diffMs, slaState, isResolved };
  });

  const openCases = enriched.filter(c => !c.isResolved);
  const totalCount = enriched.length || 1;
  const compliance = Math.max(0, Math.round(((totalCount - breached) / totalCount) * 1000) / 10);

  setText('slaComplianceVal', `${compliance}%`);
  setText('slaBreachedVal', breached);
  setText('slaAtRiskVal', warning);

  if (resolvedCount > 0 && resolvedDurationSum > 0) {
    const avgHours = (resolvedDurationSum / resolvedCount / 3600000).toFixed(1);
    setText('slaAvgTurnaroundVal', `${avgHours}h`);
  } else {
    setText('slaAvgTurnaroundVal', '—');
  }

  setText('slaFilterAllCount', openCases.length);
  setText('slaFilterWarningCount', warning);
  setText('slaFilterBreachedCount', breached);

  // Render Live Dept Health dynamically
  renderRadarDeptBenchmarks(enriched);

  let rows = openCases.sort((a, b) => a.diffMs - b.diffMs);
  if (slaCurrentFilter === 'WARNING') rows = rows.filter(r => r.slaState === 'WARNING');
  else if (slaCurrentFilter === 'BREACHED') rows = rows.filter(r => r.slaState === 'BREACHED');

  if (slaSearchQuery) {
    const q = slaSearchQuery.toLowerCase();
    rows = rows.filter(r =>
      (r.case_number || '').toLowerCase().includes(q) ||
      (r.title || '').toLowerCase().includes(q) ||
      (r.employee_name || '').toLowerCase().includes(q) ||
      (r.department_name || '').toLowerCase().includes(q)
    );
  }

  const tbody = document.getElementById('slaRadarTableBody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="v2-loading-cell">No open SLA tickets match current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(c => `
    <tr>
      <td><button type="button" class="v2-btn-ghost xs mono" onclick="switchView('casesView'); setTimeout(() => openAgentCaseDossier(${c.id}), 60);">${escapeHtml(formatCaseNumber(c.case_number))}</button></td>
      <td>
        <div style="font-weight:700;">${escapeHtml(c.employee_name || c.employee_email || 'Employee')}</div>
        <div class="v2-muted-sm">${escapeHtml(c.department_name || 'Central Desk')}</div>
      </td>
      <td>${escapeHtml(c.title || 'Untitled')}</td>
      <td><span class="v2-prio-chip prio-${(c.priority || 'MEDIUM').toLowerCase()}">${escapeHtml(c.priority || 'MEDIUM')}</span></td>
      <td>${renderSlaBadge(c.due_at, c.status)}</td>
      <td><span class="v2-status-chip status-${(c.status || 'OPEN').toLowerCase()}">${escapeHtml((c.status || 'OPEN').replace(/_/g, ' '))}</span></td>
      <td class="right">
        <button type="button" class="v2-btn-secondary xs" onclick="jumpToReply(${c.id})">Reply</button>
        <button type="button" class="v2-btn-teal xs" onclick="openResolveModal(${c.id}, '${escapeHtml(c.case_number)}')">Resolve</button>
      </td>
    </tr>
  `).join('');
}

function renderRadarDeptBenchmarks(enrichedCases) {
  const container = document.getElementById('radarDeptBenchmarks');
  if (!container) return;

  const byDept = {};
  enrichedCases.forEach(c => {
    const name = c.department_name || 'Central People Desk';
    if (!byDept[name]) byDept[name] = { total: 0, breached: 0 };
    byDept[name].total++;
    if (c.slaState === 'BREACHED') byDept[name].breached++;
  });

  const entries = Object.entries(byDept);
  if (!entries.length) {
    container.innerHTML = `<div class="v2-muted-sm">No case metrics yet.</div>`;
    return;
  }

  container.innerHTML = entries.map(([name, stat]) => {
    const pct = Math.round(((stat.total - stat.breached) / stat.total) * 100);
    return `
      <div class="v2-dh-row">
        <div class="v2-dh-top">
          <span>${escapeHtml(name)}</span>
          <span class="mono">${pct}% (${stat.total})</span>
        </div>
        <div class="v2-dh-track">
          <div class="v2-dh-fill" style="width:${pct}%; background:${pct < 85 ? '#DC2626' : (pct < 95 ? '#D97706' : '#10B190')};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function setSlaFilter(filter, btnEl) {
  slaCurrentFilter = filter;
  document.querySelectorAll('#radarView .v2-seg-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  loadSlaDashboard();
}

function handleSlaSearch(q) {
  slaSearchQuery = (q || '').trim();
  loadSlaDashboard();
}

async function handleManualIntake(e) {
  e.preventDefault();
  const payload = {
    employee_email: document.getElementById('actionNewEmail').value.trim(),
    employee_name: document.getElementById('actionNewName').value.trim() || null,
    title: document.getElementById('actionNewTitle').value.trim(),
    description: document.getElementById('actionNewDesc').value.trim(),
    priority: 'MEDIUM'
  };
  try {
    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Case created & routed!', 'success');
      document.getElementById('manualIntakeForm').reset();
      loadSlaDashboard();
    } else {
      showToast(data.detail || 'Failed to create case', 'error');
    }
  } catch (err) {
    showToast('Network error creating case', 'error');
  }
}

// =========================================================================
// 9. MODALS (NEW CASE, INGEST EMAIL, RESOLVE, REASSIGN, PASSWORD, MAILBOX)
// =========================================================================
function openNewCaseModal() { document.getElementById('newCaseModal').style.display = 'flex'; }
function closeNewCaseModal() { document.getElementById('newCaseModal').style.display = 'none'; }

async function handleNewCaseSubmit(e) {
  e.preventDefault();
  const deptVal = document.getElementById('modalNewDept').value;
  const payload = {
    employee_email: document.getElementById('modalNewEmail').value.trim(),
    employee_name: document.getElementById('modalNewName').value.trim() || null,
    title: document.getElementById('modalNewTitle').value.trim(),
    description: document.getElementById('modalNewDesc').value.trim(),
    priority: document.getElementById('modalNewPriority').value,
    department_id: deptVal ? Number(deptVal) : null
  };
  try {
    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Case created!', 'success');
      document.getElementById('newCaseModalForm').reset();
      closeNewCaseModal();
      await fetchCasesData();
      if (currentViewId === 'casesView') loadCases();
    } else {
      showToast(data.detail || 'Failed to create case', 'error');
    }
  } catch (err) {
    showToast('Network error creating case', 'error');
  }
}

function openIngestEmailModal() { document.getElementById('ingestEmailModal').style.display = 'flex'; }
function closeIngestEmailModal() { document.getElementById('ingestEmailModal').style.display = 'none'; }

async function handleIngestEmailSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('ingestSubmitBtn');
  if (btn) { btn.disabled = true; btn.innerText = 'Ingesting...'; }

  try {
    const res = await fetch('/api/v1/inbox/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_email: document.getElementById('ingestSenderEmail').value.trim(),
        sender_name: document.getElementById('ingestSenderName').value.trim() || null,
        subject: document.getElementById('ingestSubject').value.trim(),
        body: document.getElementById('ingestBody').value.trim(),
        category: document.getElementById('ingestCategory').value || null,
        is_actionable: Number(document.getElementById('ingestActionable').value)
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Email ingested!', 'success');
      document.getElementById('ingestEmailForm').reset();
      closeIngestEmailModal();
      await Promise.all([loadInboxEmails(), fetchCasesData()]);
    } else {
      showToast(data.detail || 'Ingest failed', 'error');
    }
  } catch (err) {
    showToast('Network error ingesting email', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Ingest to Mailbox'; }
  }
}

function openResolveModalForCurrent() {
  const c = activeDossierCase || currentReplyCaseData || allCases.find(x => x.id === currentSelectedCaseId);
  if (!c) return;
  openResolveModal(c.id, c.case_number);
}

function openResolveModal(caseId, caseNumber) {
  targetResolveCaseId = caseId;
  setText('resolveCaseNumberDisplay', formatCaseNumber(caseNumber));
  document.getElementById('resolveNotesInput').value = '';
  document.getElementById('resolveModal').style.display = 'flex';
}

function closeResolveModal() {
  document.getElementById('resolveModal').style.display = 'none';
}

async function confirmResolve() {
  if (!targetResolveCaseId) return;
  const notes = document.getElementById('resolveNotesInput').value.trim();
  try {
    const res = await fetch(`/api/v1/cases/${targetResolveCaseId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolution_notes: notes || 'Resolved by specialist',
        actor_name: currentUser.name || 'Agent',
        actor_email: currentUser.email || 'agent@1mg.com'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case marked as resolved!', 'success');
      closeResolveModal();
      await Promise.all([fetchCasesData(), loadInboxEmails({ silent: true })]);
      if (currentViewId === 'casesView') {
        loadAgentCasesKPIs();
        renderAgentCasesTable();
        if (activeDossierCase?.id === targetResolveCaseId) openAgentCaseDossier(targetResolveCaseId);
      } else if (currentViewId === 'threadsView') {
        initReplyWorkspace();
      } else if (currentViewId === 'radarView') {
        loadSlaDashboard();
      }
    } else {
      showToast(data.detail || 'Resolve failed', 'error');
    }
  } catch (err) {
    showToast('Network error resolving case', 'error');
  }
}

function openReassignModalForCurrent() {
  const c = activeDossierCase || currentReplyCaseData || allCases.find(x => x.id === currentSelectedCaseId);
  if (!c) return;
  openReassignModal(c.id);
}

function openReassignModal(caseId) {
  targetReassignCaseId = caseId;
  const c = allCases.find(x => x.id === caseId) || activeDossierCase || currentReplyCaseData;
  setText('reassignCaseNumberDisplay', c ? formatCaseNumber(c.case_number) : '');

  const deptSel = document.getElementById('reassignDeptSelect');
  if (deptSel) {
    deptSel.innerHTML = allDepartments.map(d =>
      `<option value="${d.id}" ${c && Number(c.department_id) === Number(d.id) ? 'selected' : ''}>${escapeHtml(d.team_name)} (${escapeHtml(d.dept_code)})</option>`
    ).join('');
  }
  document.getElementById('reassignModal').style.display = 'flex';
  populateSpecialistsForDept();
}

function closeReassignModal() {
  document.getElementById('reassignModal').style.display = 'none';
}

async function populateSpecialistsForDept() {
  const deptId = document.getElementById('reassignDeptSelect')?.value;
  const userSel = document.getElementById('reassignUserSelect');
  if (!userSel || !deptId) return;
  userSel.innerHTML = `<option value="">Loading...</option>`;
  try {
    const res = await fetch(`/api/v1/admin/users?department_id=${deptId}&limit=50`);
    const data = await res.json();
    let html = `<option value="">Central Desk Pool (Unassigned)</option>`;
    (data.users || []).forEach(u => {
      html += `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`;
    });
    userSel.innerHTML = html;
  } catch (e) {
    userSel.innerHTML = `<option value="">Central Desk Pool</option>`;
  }
}

async function submitReassignAction() {
  if (!targetReassignCaseId) return;
  const deptId = Number(document.getElementById('reassignDeptSelect').value);
  const userVal = document.getElementById('reassignUserSelect').value;
  try {
    const res = await fetch(`/api/v1/cases/${targetReassignCaseId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: deptId,
        user_id: userVal ? Number(userVal) : null,
        actor_email: currentUser.email,
        actor_name: currentUser.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Case reassigned!', 'success');
      closeReassignModal();
      await fetchCasesData();
      if (activeDossierCase?.id === targetReassignCaseId) openAgentCaseDossier(targetReassignCaseId);
      if (currentViewId === 'casesView') renderAgentCasesTable();
      if (currentViewId === 'threadsView') initReplyWorkspace();
    } else {
      showToast(data.detail || 'Reassign failed', 'error');
    }
  } catch (err) {
    showToast('Network error reassigning case', 'error');
  }
}

function openMailboxConfigModal() { document.getElementById('mailboxConfigModal').style.display = 'flex'; }
function closeMailboxConfigModal() { document.getElementById('mailboxConfigModal').style.display = 'none'; }
function openChangePasswordModal() {
  document.getElementById('profilePopover').style.display = 'none';
  document.getElementById('changePasswordForm').reset();
  document.getElementById('changePasswordModal').style.display = 'flex';
}
function closeChangePasswordModal() { document.getElementById('changePasswordModal').style.display = 'none'; }

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const current_password = document.getElementById('currentPasswordInput').value.trim();
  const new_password = document.getElementById('newPasswordChangeInput').value.trim();
  const confirm_password = document.getElementById('confirmPasswordChangeInput').value.trim();
  if (new_password !== confirm_password) {
    showToast('New passwords do not match', 'error');
    return;
  }
  try {
    const res = await fetch('/api/v1/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, current_password, new_password, confirm_password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Password updated!', 'success');
      closeChangePasswordModal();
    } else {
      showToast(data.detail || 'Failed to update password', 'error');
    }
  } catch (err) {
    showToast('Network error updating password', 'error');
  }
}

// =========================================================================
// 10. THREAD & EMAIL BODY RICH FORMATTER
// =========================================================================
function formatThreadConversationHtml(email) {
  const rawThreads = email.thread_messages || [];
  if (!rawThreads.length) return formatEmailBodyHtml(email.body, email, email.ai_insights || {});

  const replyMsgs = rawThreads
    .filter(m => m.type === 'AGENT_REPLY' || m.type === 'EMPLOYEE_REPLY')
    .sort((a, b) => (new Date(b.received_at || 0).getTime()) - (new Date(a.received_at || 0).getTime()));
  const botMsgs = rawThreads.filter(m => m.type === 'SYSTEM_BOT');
  const initialMsgs = rawThreads.filter(m => m.type === 'EMPLOYEE_INITIAL');
  const threads = [...replyMsgs, ...botMsgs, ...initialMsgs];

  let html = `
    <div class="inbox-thread-timeline">
      <div class="inbox-thread-header">
        <div class="inbox-thread-header-title">
          <span>Conversation History (${threads.length} ${threads.length === 1 ? 'message' : 'messages'} · Latest at Top)</span>
        </div>
      </div>
  `;

  threads.forEach((msg, idx) => {
    if (msg.type === 'SYSTEM_BOT') {
      html += `
        <div class="thread-item-bot">
          <div class="thread-bot-avatar">🤖</div>
          <div style="flex:1;">
            <div class="thread-bot-title-group">
              <span class="thread-bot-heading">Tata 1mg Automated Identity Verification <span class="thread-bot-tag">Bot</span></span>
              <span class="thread-timestamp">${msg.received_at ? formatAppleDate(msg.received_at) : ''}</span>
            </div>
            <div class="thread-bot-body">Dispatched official verification request asking external sender for their Tata 1mg Employee ID.</div>
          </div>
        </div>
      `;
    } else {
      const isAgent = msg.type === 'AGENT_REPLY';
      const isEmpReply = msg.type === 'EMPLOYEE_REPLY';
      const sender = msg.sender_name || (isAgent ? 'People Desk' : email.sender_name || 'Employee');
      const cardClass = isAgent ? 'agent-reply' : (isEmpReply ? 'reply' : 'initial');
      const badgeLabel = isAgent ? 'Sent Reply' : (isEmpReply ? 'Employee Reply' : 'Original Query');
      const latestTag = (idx === 0 && (isAgent || isEmpReply)) ? `<span class="thread-latest-tag">Latest</span>` : '';
      const codeChip = msg.detected_code ? `<span class="thread-id-badge">ID: <strong>${escapeHtml(msg.detected_code)}</strong></span>` : '';

      html += `
        <div class="thread-item-message ${cardClass}">
          <div class="thread-message-header">
            <div style="display:flex; align-items:center; gap:9px;">
              <div class="thread-user-avatar ${isAgent ? 'agent' : (isEmpReply ? 'reply' : '')}">${sender.charAt(0).toUpperCase()}</div>
              <div>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <strong>${escapeHtml(sender)}</strong>
                  <span class="thread-role-badge ${isAgent ? 'agent' : (isEmpReply ? 'reply' : '')}">${badgeLabel}</span>
                  ${latestTag}
                  ${codeChip}
                </div>
                <div style="font-size:11px; color:#64748B;">&lt;${escapeHtml(msg.sender_email || email.sender_email || '')}&gt;</div>
              </div>
            </div>
            <span class="thread-timestamp">${msg.received_at ? formatAppleDate(msg.received_at) : ''}</span>
          </div>
          <div>${formatEmailBodyHtml(msg.body, email, isAgent ? {} : (email.ai_insights || {}))}</div>
        </div>
      `;
    }
  });

  html += `</div>`;
  return html;
}

function formatEmailBodyHtml(rawBody) {
  if (!rawBody) return '<p class="mail-para" style="color:#64748B;">No message content provided.</p>';

  let text = decodeHtmlEntities(String(rawBody))
    .replace(/\u00A0/g, ' ')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  const quoteMatch = text.match(/(?:\n){2,}\s*(?:>{1,4}(?:\s|$)|On\s+[\s\S]{10,160}?\bwrote:|---+ Original Message ---+)/i);
  let mainBody = text;
  let quotedHistory = '';
  if (quoteMatch && quoteMatch.index > 0) {
    mainBody = text.substring(0, quoteMatch.index).trim();
    quotedHistory = text.substring(quoteMatch.index).trim();
  }

  function applyHighlights(safe) {
    if (!isAiHighlightsActive) return safe;
    return safe
      .replace(/\b(CON1MG-?\d+|1MG[A-Z]{0,4}-?\d+|EMP[A-Z]{0,3}-?\d+)\b/gi, m => `<mark class="ai-mark ai-mark-code">${m}</mark>`)
      .replace(/\b(AuthBridge|HireRight|Darwinbox|MediBuddy|Tata 1mg|ESIC|EPFO)\b/gi, m => `<mark class="ai-mark ai-mark-org">${m}</mark>`)
      .replace(/\b(pending|missing|urgent|discrepancy|hold|rejected|incorrect)\b/gi, m => `<mark class="ai-mark ai-mark-status">${m}</mark>`)
      .replace(/\b(background verification|biometric punch|punch regularization|salary slip|payslip|mediclaim)\b/gi, m => `<mark class="ai-mark ai-mark-topic">${m}</mark>`);
  }

  const renderPara = (content, isQuoted = false) => {
    return content.split(/\n\s*\n/).map(block => {
      const clean = block.trim();
      if (!clean) return '';
      const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
      const kvRows = [];
      let nonKv = 0;
      lines.forEach(l => {
        const c = l.replace(/^[-•*]\s+/, '');
        const m = c.match(/^([A-Za-z0-9\s\/()]{2,40}):\s+(.+)$/);
        if (m && !/^https?$/i.test(m[1])) kvRows.push({ k: m[1].trim(), v: m[2].trim() });
        else nonKv++;
      });

      if (!isQuoted && kvRows.length >= 2 && nonKv <= 1) {
        return `<div class="mail-kv-card"><div class="mail-kv-grid">${kvRows.map(r =>
          `<div class="mail-kv-row"><div class="mail-kv-label">${escapeHtml(r.k)}</div><div class="mail-kv-value">${applyHighlights(escapeHtml(r.v))}</div></div>`
        ).join('')}</div></div>`;
      }

      const rendered = lines.map(l => isQuoted ? escapeHtml(l) : applyHighlights(escapeHtml(l))).join('<br>');
      return `<p class="mail-para">${rendered}</p>`;
    }).filter(Boolean).join('');
  };

  let html = renderPara(mainBody, false);
  if (quotedHistory) {
    html += `
      <details class="mail-quoted-details">
        <summary class="mail-quoted-summary">••• Show quoted history</summary>
        <div class="mail-quoted-content">${renderPara(quotedHistory, true)}</div>
      </details>
    `;
  }
  return html;
}

// =========================================================================
// 11. UTILITIES
// =========================================================================
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

function formatCaseNumber(num) {
  if (!num) return '1MG-00000';
  const s = String(num).trim();
  if (s.includes('-')) return s;
  if (s.toUpperCase().startsWith('1MG')) return `1MG-${s.slice(3)}`;
  return s;
}

function formatCategoryTitle(raw) {
  if (!raw) return 'People Desk';
  const map = {
    ATTENDANCE: 'Attendance HR',
    PAYROLL: 'Payroll & Tax',
    BENEFITS: 'Benefits & Mediclaim',
    ONBOARDING: 'Onboarding & BGV',
    LEAVE: 'Leave & Time Off',
    PEOPLEDESK: 'People Desk',
    GENERAL_HR: 'General HR',
    SYSTEM_ALERT: 'System Alert',
    NEWSLETTER: 'Newsletter',
    SPAM: 'Spam'
  };
  return map[String(raw).toUpperCase()] || String(raw).replace(/_/g, ' ');
}

function renderSlaBadge(dueAtStr, status) {
  const isRes = status === 'RESOLVED' || status === 'CLOSED';
  if (isRes) return `<span class="v2-sla-badge sla-safe">✓ Closed</span>`;
  if (!dueAtStr) return `<span class="v2-sla-badge sla-safe">24h SLA</span>`;
  const diff = new Date(dueAtStr).getTime() - Date.now();
  if (diff < 0) return `<span class="v2-sla-badge sla-breached">Breached ${formatDuration(Math.abs(diff))}</span>`;
  if (diff < 4 * 3600 * 1000) return `<span class="v2-sla-badge sla-urgent">${formatDuration(diff)} left</span>`;
  return `<span class="v2-sla-badge sla-safe">${formatDuration(diff)} left</span>`;
}

function formatSlaText(dueAtStr, status) {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'Completed';
  const diff = new Date(dueAtStr).getTime() - Date.now();
  return diff < 0 ? `Breached by ${formatDuration(Math.abs(diff))}` : `${formatDuration(diff)} remaining`;
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatAppleDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function decodeHtmlEntities(str) {
  const ta = document.createElement('textarea');
  ta.innerHTML = str;
  return ta.value;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `v2-toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 220);
  }, 3400);
}
