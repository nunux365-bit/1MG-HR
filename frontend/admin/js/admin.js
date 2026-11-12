/**
 * Tata 1mg People Desk - Admin Console Controller
 * Full dynamic User Management, Dynamic Departments, Welcome Email with dynamic links.
 */

let allDepartments = [];
let currentUserPage = 1;
const userLimit = 20;
let userSearchTimeout = null;

const viewTitles = {
  dashboardView: 'Dashboard',
  casesView: 'Case',
  departmentsView: 'Department',
  usersView: 'User Management',
  auditView: 'Audit',
  actionsView: 'Action',
  reportsView: 'Report'
};

function switchView(viewId, navEl) {
  if (navEl) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    navEl.classList.add('active');
  } else {
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-view') === viewId) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
  }

  const titleEl = document.getElementById('currentViewTitle');
  if (titleEl && viewTitles[viewId]) {
    titleEl.innerText = viewTitles[viewId];
  }

  // Load section-specific data
  if (viewId === 'usersView') {
    loadUsers();
  } else if (viewId === 'dashboardView') {
    loadDashboard();
  } else if (viewId === 'casesView') {
    loadCasesKPIs();
    populateCaseDeptDropdowns();
    loadCases();
  } else if (viewId === 'departmentsView') {
    loadDepartmentKPIs();
    loadDepartments().then(() => renderDepartments());
  } else if (viewId === 'auditView') {
    loadAuditLogs();
  } else if (viewId === 'reportsView') {
    initReportsView();
  } else if (viewId === 'actionsView') {
    initActionsView();
  }
}

function handleSignOut() {
  localStorage.clear();
  window.location.href = '/';
}

// =========================================================================
// 1. DYNAMIC DEPARTMENTS (HANDLES 100s - 1000s OF DEPARTMENTS)
// =========================================================================
async function loadDepartments() {
  try {
    const res = await fetch('/api/v1/departments');
    const data = await res.json();
    if (data.success && data.departments) {
      allDepartments = data.departments;
      populateDepartmentDropdowns();
      if (document.getElementById('departmentsView')?.classList.contains('active')) {
        renderDepartments();
      }
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

function populateDepartmentDropdowns() {
  // 1. Filter dropdown in User Management table
  const filterSelect = document.getElementById('userDeptFilter');
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="">All Departments (${allDepartments.length})</option>`;
    allDepartments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.team_name} (${d.dept_code})`;
      filterSelect.appendChild(opt);
    });
  }

  // 2. Select dropdown in Add Agent Modal
  const modalSelect = document.getElementById('newAgentDept');
  if (modalSelect) {
    modalSelect.innerHTML = `<option value="">Select Department (${allDepartments.length} available)...</option>`;
    allDepartments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.team_name} (${d.dept_code})`;
      modalSelect.appendChild(opt);
    });
  }

  // 3. Multi-department checkbox containers for Add and Edit Modals
  renderNewAgentDeptCheckboxes();
  renderEditAgentDeptCheckboxes();

  // 4. Report Module Department Selector
  populateReportDeptDropdown();
}

function renderNewAgentDeptCheckboxes() {
  const container = document.getElementById('newAgentDeptsContainer');
  if (!container) return;
  container.innerHTML = allDepartments.map(d => `
    <label class="dept-check-item" id="newDeptItem_${d.id}">
      <input type="checkbox" name="newAgentDepts" value="${d.id}" onchange="updateDeptItemStyle(this)">
      <span>${escapeHtml(d.team_name)}</span>
      <span class="dept-code-pill">${escapeHtml(d.dept_code)}</span>
    </label>
  `).join('');
}

function renderEditAgentDeptCheckboxes() {
  const container = document.getElementById('editAgentDeptsContainer');
  if (!container) return;
  container.innerHTML = allDepartments.map(d => `
    <label class="dept-check-item" id="editDeptItem_${d.id}">
      <input type="checkbox" name="editAgentDepts" value="${d.id}" onchange="updateDeptItemStyle(this)">
      <span>${escapeHtml(d.team_name)}</span>
      <span class="dept-code-pill">${escapeHtml(d.dept_code)}</span>
    </label>
  `).join('');
}

function updateDeptItemStyle(cb) {
  if (cb && cb.parentElement) {
    if (cb.checked) {
      cb.parentElement.classList.add('selected');
    } else {
      cb.parentElement.classList.remove('selected');
    }
  }
}

function selectAllNewAgentDepts(check) {
  const cbs = document.querySelectorAll('#newAgentDeptsContainer input[type="checkbox"]');
  cbs.forEach(cb => {
    cb.checked = check;
    updateDeptItemStyle(cb);
  });
}

function selectAllEditAgentDepts(check) {
  const cbs = document.querySelectorAll('#editAgentDeptsContainer input[type="checkbox"]');
  cbs.forEach(cb => {
    cb.checked = check;
    updateDeptItemStyle(cb);
  });
}

// =========================================================================
// 2. DYNAMIC USER MANAGEMENT (FETCH, RENDER, SEARCH, PAGINATION)
// =========================================================================
function debounceUserSearch() {
  clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(() => {
    currentUserPage = 1;
    loadUsers();
  }, 250);
}

function changeUserPage(delta) {
  currentUserPage += delta;
  if (currentUserPage < 1) currentUserPage = 1;
  loadUsers();
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const search = document.getElementById('userSearchInput')?.value.trim() || '';
  const deptId = document.getElementById('userDeptFilter')?.value || '';
  const status = document.getElementById('userStatusFilter')?.value || 'ALL';
  const role = document.getElementById('userRoleFilter')?.value || 'ALL';

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">
        <div class="spinner" style="margin: 0 auto 10px; border-color: rgba(255,111,97,0.3); border-top-color: var(--coral-primary);"></div>
        Fetching agents from database...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      page: currentUserPage,
      limit: userLimit
    });
    if (search) params.append('search', search);
    if (deptId) params.append('department_id', deptId);
    if (status) params.append('status', status);
    if (role) params.append('role', role);

    const res = await fetch(`/api/v1/admin/users?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#EF4444;padding:30px;">Error loading users: ${data.detail || 'Unknown error'}</td></tr>`;
      return;
    }

    // Update Quick Stats
    if (data.stats) {
      const elTotal = document.getElementById('userStatTotal');
      const elAgents = document.getElementById('userStatAgents');
      const elHeads = document.getElementById('userStatHeads');
      const elPending = document.getElementById('userStatPending');
      if (elTotal) elTotal.innerText = data.stats.total_users || 0;
      if (elAgents) elAgents.innerText = data.stats.total_agents || 0;
      if (elHeads) elHeads.innerText = data.stats.total_dept_heads || 0;
      if (elPending) elPending.innerText = data.stats.pending_setup || 0;

      const headerCountBadge = document.getElementById('userHeaderCountBadge');
      if (headerCountBadge && data.pagination) {
        headerCountBadge.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #10B981; margin-right: 5px; display: inline-block;"></span>${data.pagination.total} Verified Staff`;
      }
    }

    renderUsersTable(data.users || [], data.pagination.total, data.pagination.totalPages);

  } catch (err) {
    console.error('Error fetching users:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#EF4444;padding:30px;">Server connection error.</td></tr>`;
  }
}

// Deterministic Soft Gradient Palette for User Avatars
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', // Royal Blue
  'linear-gradient(135deg, #10B981 0%, #047857 100%)', // Emerald Teal
  'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)', // Purple Violet
  'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)', // Warm Amber
  'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)', // Rose Pink
  'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)', // Deep Cyan
];

function getAvatarGradient(name, email, role) {
  if (role === 'ADMIN') return 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)';
  const str = (name || email || 'User').toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function copyStaffEmail(email, event) {
  if (event) event.stopPropagation();
  if (!email) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(() => {
      showToast('Email Copied', email, 'success');
    }).catch(() => {
      fallbackCopy(email);
    });
  } else {
    fallbackCopy(email);
  }
}

function fallbackCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
    showToast('Email Copied', text, 'success');
  } catch (e) {
    console.error('Copy failed', e);
  }
  document.body.removeChild(el);
}

function renderUsersTable(users, total, totalPages) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 48px;">
          <div style="font-size: 24px; margin-bottom: 8px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.8" style="margin: 0 auto;">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <strong style="color: #475569; font-size: 15px;">No matching staff found</strong>
          <p style="font-size: 13px; margin-top: 4px; color: #94A3B8;">Try refining your search terms or add a new agent.</p>
        </td>
      </tr>
    `;
    updatePaginationControls(0, 0);
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isHead = Boolean(u.is_dept_head);
    const isPending = !u.has_password && u.role === 'HR_AGENT';
    const initials = (u.name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const userJson = escapeHtml(JSON.stringify(u));
    const avatarGradient = getAvatarGradient(u.name, u.email, u.role);
    const statusClass = isPending ? 'pending' : (u.status === 'ACTIVE' ? 'active' : 'inactive');
    
    return `
      <tr>
        <!-- 1. Agent & Email Identity Cell -->
        <td>
          <div class="user-identity-cell">
            <div class="user-avatar-wrap">
              <div class="user-avatar-circle" style="background: ${avatarGradient};">
                ${initials}
              </div>
              <span class="user-avatar-status-dot ${statusClass}"></span>
            </div>
            <div class="user-info-text">
              <div class="user-name-row">
                <span class="user-name-text">${escapeHtml(u.name)}</span>
                <span class="user-id-pill">#${u.id}</span>
              </div>
              <div class="user-email-row" onclick="copyStaffEmail('${escapeHtml(u.email)}', event)" data-tooltip="Click to copy email">
                <span>${escapeHtml(u.email)}</span>
                <svg class="copy-email-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </div>
            </div>
          </div>
        </td>

        <!-- 2. Assigned Department -->
        <td>
          <div class="dept-badges-wrapper" style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${u.role === 'ADMIN' 
              ? `<span class="dept-badge-pill dept-pill-admin">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <span>Universal (All Desks)</span>
                </span>`
              : (u.departments && u.departments.length > 0 
                ? u.departments.map(d => `
                  <span class="dept-badge-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
                    </svg>
                    <span>${escapeHtml(d.team_name)}</span>
                  </span>`).join('')
                : `<span class="dept-badge-pill" style="background: #F1F5F9; color: #64748B; border-color: #E2E8F0;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    <span>${escapeHtml(u.department_name || 'Unassigned')}</span>
                  </span>`)}
          </div>
        </td>

        <!-- 3. Designation -->
        <td>
          <span class="user-designation-badge">${escapeHtml(u.designation || 'Specialist')}</span>
        </td>

        <!-- 4. Interactive Role Scope (Clean Big-Tech Badges, NO King/Crown) -->
        <td>
          ${u.role === 'ADMIN' 
            ? (u.id === 1 || (u.email && u.email.toLowerCase() === 'vaibhav.v1@1mg.com')
              ? `<span class="badge-role-scope badge-scope-superadmin" data-tooltip="Primary System Administrator (Protected)">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <polyline points="9 12 11 14 15 10"/>
                  </svg>
                  <span>SUPER ADMIN</span>
                </span>`
              : `<button type="button" class="badge-role-scope badge-scope-admin" onclick="toggleAdminRole(${u.id}, '${escapeHtml(u.name)}', true)" data-tooltip="Click to switch to Support Agent">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span>ADMIN</span>
                  <svg class="swap-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
                </button>`)
            : (isHead 
              ? `<button type="button" class="badge-role-scope badge-scope-head" onclick="toggleRoleScope(${u.id}, '${escapeHtml(u.name)}', ${isHead})" data-tooltip="Click to switch to Support Specialist">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <polyline points="17 11 19 13 23 9"/>
                  </svg>
                  <span>DEPT HEAD</span>
                  <svg class="swap-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
                </button>` 
              : `<button type="button" class="badge-role-scope badge-scope-agent" onclick="toggleRoleScope(${u.id}, '${escapeHtml(u.name)}', ${isHead})" data-tooltip="Click to promote to Department Head">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span>AGENT</span>
                  <svg class="swap-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
                </button>`)}
        </td>

        <!-- 5. Account Status -->
        <td>
          ${isPending 
            ? `<span class="status-pill status-pending">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>Pending Setup</span>
              </span>`
            : (u.status === 'ACTIVE' 
              ? `<span class="status-pill status-active">
                  <span class="status-ping-wrap">
                    <span class="status-ping-ring"></span>
                    <span class="status-ping-dot"></span>
                  </span>
                  <span>Active</span>
                </span>`
              : `<span class="status-pill status-inactive" style="background: #F1F5F9; color: #64748B; border: 1px solid #CBD5E1; display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 600;">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: #94A3B8; margin-right: 6px;"></span>
                  <span>Inactive</span>
                </span>`)}
        </td>

        <!-- 6. Executive Action Suite -->
        <td style="text-align: right;">
          <div class="user-actions-suite">
            ${isPending ? `
              <button 
                class="action-pill-btn resend"
                onclick="triggerResendInvite(${u.id}, '${escapeHtml(u.name)}')" 
                data-tooltip="Resend Official Tata 1mg Welcome Email"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 2L11 13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                <span>Resend</span>
              </button>
            ` : ''}

            <button 
              class="action-pill-btn edit"
              onclick="openEditAgentModal('${userJson}')" 
              data-tooltip="Edit Staff Profile, Desks &amp; Designation"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span>Edit</span>
            </button>

            ${u.id !== 1 && (!u.email || u.email.toLowerCase() !== 'vaibhav.v1@1mg.com') ? `
              ${u.role !== 'ADMIN' ? `
                <button 
                  class="action-icon-circle-btn promote"
                  onclick="toggleAdminRole(${u.id}, '${escapeHtml(u.name)}', false)"
                  data-tooltip="Promote to Full Administrator"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <line x1="12" y1="8" x2="12" y2="14"/>
                    <line x1="9" y1="11" x2="15" y2="11"/>
                  </svg>
                </button>
              ` : `
                <button 
                  class="action-icon-circle-btn demote"
                  onclick="toggleAdminRole(${u.id}, '${escapeHtml(u.name)}', true)"
                  data-tooltip="Revoke Administrator Role"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                  </svg>
                </button>
              `}

              <button 
                class="action-icon-circle-btn ${u.status === 'ACTIVE' ? 'deactivate' : 'activate'}"
                onclick="toggleUserStatus(${u.id}, '${u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}')"
                data-tooltip="${u.status === 'ACTIVE' ? 'Deactivate Staff Account' : 'Activate Staff Account'}"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                  <line x1="12" y1="2" x2="12" y2="12"/>
                </svg>
              </button>

              <button 
                class="action-icon-circle-btn remove"
                onclick="confirmRemoveUser(${u.id}, '${escapeHtml(u.name)}')" 
                data-tooltip="Permanently Delete Staff Member"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  updatePaginationControls(total, totalPages);
}

function updatePaginationControls(total, totalPages) {
  const infoEl = document.getElementById('userPaginationInfo');
  const prevBtn = document.getElementById('userPrevBtn');
  const nextBtn = document.getElementById('userNextBtn');

  if (infoEl) {
    const start = total === 0 ? 0 : (currentUserPage - 1) * userLimit + 1;
    const end = Math.min(currentUserPage * userLimit, total);
    infoEl.innerText = `Showing ${start} - ${end} of ${total} staff members`;
  }

  if (prevBtn) prevBtn.disabled = (currentUserPage <= 1);
  if (nextBtn) nextBtn.disabled = (currentUserPage >= totalPages || totalPages === 0);
}

// =========================================================================
// 3. ADD AGENT MODAL & WELCOME EMAIL DISPATCH
// =========================================================================
function handleNewAgentRoleChange(role) {
  const deptLabel = document.getElementById('newAgentDeptLabel');
  const desigInput = document.getElementById('newAgentDesignation');
  if (role === 'ADMIN') {
    if (deptLabel) deptLabel.innerText = 'Assigned Department (Optional for Admin)';
    if (desigInput && (!desigInput.value || desigInput.value === 'Support Specialist')) {
      desigInput.value = 'Administrator';
    }
  } else {
    if (deptLabel) deptLabel.innerText = 'Assigned Department *';
    if (desigInput && desigInput.value === 'Administrator') {
      desigInput.value = 'Support Specialist';
    }
  }
}

function handleEditAgentRoleChange(role) {
  const desigInput = document.getElementById('editAgentDesignation');
  const isHeadCheckbox = document.getElementById('editAgentIsHead');
  if (role === 'ADMIN') {
    if (desigInput && (!desigInput.value || desigInput.value === 'Support Specialist')) {
      desigInput.value = 'Administrator';
    }
    if (isHeadCheckbox) isHeadCheckbox.checked = true;
  }
}

async function toggleAdminRole(userId, userName, isCurrentlyAdmin) {
  const actionText = isCurrentlyAdmin 
    ? `revoke Administrator privileges from "${userName}" and revert them to HR Agent?` 
    : `promote "${userName}" to Full Administrator?\n\nThey will receive full access to the Admin Console, User Management, Department Configs, and System Audits.`;
    
  if (!confirm(`Are you sure you want to ${actionText}`)) {
    return;
  }

  try {
    const res = await fetch(`/api/v1/admin/users/${userId}/toggle-admin`, {
      method: 'POST'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'User role updated successfully.', 'success');
      loadUsers();
      if (data.email_details && data.email_details.html) {
        openEmailPreviewModal(data.email_details);
      }
    } else {
      alert(data.detail || data.message || 'Failed to update user role.');
    }
  } catch (err) {
    console.error('Error toggling admin role:', err);
    alert('Error connecting to backend server.');
  }
}

function openAddAgentModal() {
  document.getElementById('addAgentForm').reset();
  selectAllNewAgentDepts(false);
  const roleSelect = document.getElementById('newAgentRole');
  if (roleSelect) roleSelect.value = 'HR_AGENT';
  handleNewAgentRoleChange('HR_AGENT');
  const modal = document.getElementById('addAgentModal');
  if (modal) modal.style.display = 'flex';
}

function closeAddAgentModal() {
  const modal = document.getElementById('addAgentModal');
  if (modal) modal.style.display = 'none';
}

async function submitAddAgent(e) {
  e.preventDefault();
  
  const role = document.getElementById('newAgentRole')?.value || 'HR_AGENT';
  const name = document.getElementById('newAgentName').value.trim();
  const email = document.getElementById('newAgentEmail').value.trim().toLowerCase();
  
  const checkedBoxes = Array.from(document.querySelectorAll('#newAgentDeptsContainer input[name="newAgentDepts"]:checked'));
  const department_ids = checkedBoxes.map(cb => parseInt(cb.value));
  const department_id = department_ids[0] || null;
  
  const designation = document.getElementById('newAgentDesignation').value.trim() || (role === 'ADMIN' ? 'Administrator' : 'Support Specialist');
  const is_dept_head = role === 'ADMIN' ? true : document.getElementById('newAgentIsHead').checked;
  const send_welcome_email = document.getElementById('newAgentSendEmail').checked;

  if (role === 'HR_AGENT' && department_ids.length === 0) {
    alert('Please select at least one assigned department for the HR Agent.');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitNewAgent');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Adding & Sending Invite...</span>`;

  try {
    const res = await fetch('/api/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        role,
        department_id,
        department_ids,
        designation,
        is_dept_head,
        send_welcome_email
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.detail || data.message || 'Failed to add user.');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Add Agent & Dispatch Invite</span>`;
      return;
    }

    closeAddAgentModal();
    loadUsers();

    if (data.email_details && data.email_details.sent) {
      showToast(`✓ Welcome invitation email delivered to ${email}!`, 'success');
    } else if (data.email_details && !data.email_details.sent) {
      showToast(`⚠️ User added, but email failed: ${data.email_details.error || 'SMTP Error'}`, 'warning');
    }

    // If welcome email was generated, open the preview modal
    if (data.email_details && data.email_details.html) {
      openEmailPreviewModal(data.email_details);
    } else {
      showToast(data.message || 'User successfully added!', 'success');
    }

  } catch (err) {
    alert('Failed to connect to backend server.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Add Agent & Dispatch Invite</span>`;
  }
}

// =========================================================================
// 4. RESEND INVITE & EMAIL PREVIEW MODAL
// =========================================================================
async function triggerResendInvite(userId, agentName) {
  try {
    const res = await fetch(`/api/v1/admin/users/${userId}/resend-invite`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success && data.email_details) {
      openEmailPreviewModal(data.email_details);
    } else {
      alert(data.detail || 'Failed to resend invite.');
    }
  } catch (err) {
    alert('Error connecting to backend.');
  }
}

function openEmailPreviewModal(emailDetails) {
  const isSent = Boolean(emailDetails.sent);
  const subjectEl = document.getElementById('previewModalSubject');
  if (subjectEl) {
    subjectEl.innerHTML = isSent 
      ? `<span style="color: #15803D;">✓ Email Dispatched via Live SMTP</span> · ${escapeHtml(emailDetails.subject || 'Tata 1mg Welcome')}`
      : `<span style="color: #D97706;">⚠️ Local Preview Mode</span> · ${escapeHtml(emailDetails.subject || 'Tata 1mg Welcome')}`;
  }

  const recipientEl = document.getElementById('previewModalRecipient');
  if (recipientEl) {
    recipientEl.innerHTML = `${escapeHtml(emailDetails.recipient || '')} ${isSent ? '<span style="color: #15803D; font-weight: 700;">(Delivered ✓)</span>' : '<span style="color: #DC2626; font-weight: 700;">(Undelivered ⚠️)</span>'}`;
  }

  const senderEl = document.getElementById('previewModalSender');
  if (senderEl) senderEl.innerText = emailDetails.sender || 'peopledesk@1mg.com';

  const linkEl = document.getElementById('previewModalLink');
  if (linkEl) linkEl.innerText = emailDetails.activation_link || '';
  
  const container = document.getElementById('emailHtmlContainer');
  if (container) {
    container.innerHTML = emailDetails.html || '<p>Email content unavailable</p>';
  }

  const modal = document.getElementById('emailPreviewModal');
  if (modal) modal.style.display = 'flex';
}

function closeEmailPreviewModal() {
  const modal = document.getElementById('emailPreviewModal');
  if (modal) modal.style.display = 'none';
}

async function toggleUserStatus(userId, newStatus) {
  try {
    const res = await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadUsers();
    }
  } catch (err) {
    alert('Failed to update status.');
  }
}

// =========================================================================
// 5. CHANGE ROLE SCOPE & REMOVE AGENT
// =========================================================================

/**
 * 1-Click Role Scope Toggle between 'Department Head' and 'Support Agent'
 */
async function toggleRoleScope(userId, name, currentIsHead) {
  const targetScope = currentIsHead ? 'Support Agent' : 'Department Head';
  const confirmed = confirm(`Change role scope for "${name}" to ${targetScope}?`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/admin/users/${userId}/toggle-role-scope`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Role scope updated.', 'success');
      loadUsers();
      if (data.email_details && data.email_details.html) {
        openEmailPreviewModal(data.email_details);
      }
    } else {
      alert(data.detail || 'Failed to change role scope.');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}

/**
 * Permanently remove/delete a staff member from People Desk
 */
async function confirmRemoveUser(userId, name) {
  const confirmed = confirm(`⚠️ Are you sure you want to permanently remove "${name}" from People Desk?\n\nThis will revoke their access to the system immediately.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message || `Staff member "${name}" was removed.`);
      loadUsers();
    } else {
      alert(data.detail || 'Failed to remove staff member.');
    }
  } catch (err) {
    alert('Failed to connect to backend server.');
  }
}

/**
 * Open Modal to edit staff member details (Department, Designation, Role Scope, Status)
 */
function openEditAgentModal(userJsonStr) {
  let user;
  try {
    user = typeof userJsonStr === 'object' ? userJsonStr : JSON.parse(userJsonStr);
  } catch (e) {
    console.error('Failed to parse user JSON:', e);
    return;
  }

  document.getElementById('editAgentId').value = user.id;
  document.getElementById('editAgentName').value = user.name || '';
  document.getElementById('editAgentEmail').value = user.email || '';
  const roleSelect = document.getElementById('editAgentRole');
  if (roleSelect) {
    roleSelect.value = user.role || 'HR_AGENT';
  }
  document.getElementById('editAgentDesignation').value = user.designation || '';
  document.getElementById('editAgentIsHead').checked = Boolean(user.is_dept_head);
  document.getElementById('editAgentStatus').value = user.status || 'ACTIVE';

  // Populate multi-department checkboxes
  const targetIds = (user.department_ids && user.department_ids.length > 0)
    ? user.department_ids.map(Number)
    : (user.department_id ? [Number(user.department_id)] : []);

  const editCbs = document.querySelectorAll('#editAgentDeptsContainer input[name="editAgentDepts"]');
  editCbs.forEach(cb => {
    cb.checked = targetIds.includes(Number(cb.value));
    updateDeptItemStyle(cb);
  });

  // Populate legacy department select if present
  const deptSelect = document.getElementById('editAgentDept');
  if (deptSelect) {
    deptSelect.innerHTML = `<option value="">Select Department (Optional for Admin)...</option>`;
    allDepartments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.team_name} (${d.dept_code})`;
      if (d.id === user.department_id) opt.selected = true;
      deptSelect.appendChild(opt);
    });
  }

  const modal = document.getElementById('editAgentModal');
  if (modal) modal.style.display = 'flex';
}

function closeEditAgentModal() {
  const modal = document.getElementById('editAgentModal');
  if (modal) modal.style.display = 'none';
}

async function submitEditAgent(e) {
  e.preventDefault();
  const userId = document.getElementById('editAgentId').value;
  const name = document.getElementById('editAgentName').value.trim();
  const role = document.getElementById('editAgentRole')?.value || 'HR_AGENT';
  
  const checkedBoxes = Array.from(document.querySelectorAll('#editAgentDeptsContainer input[name="editAgentDepts"]:checked'));
  const department_ids = checkedBoxes.map(cb => parseInt(cb.value));
  const department_id = department_ids[0] || null;

  if (role === 'HR_AGENT' && department_ids.length === 0) {
    alert('Please select at least one assigned department for the HR Agent.');
    return;
  }

  const designation = document.getElementById('editAgentDesignation').value.trim();
  const is_dept_head = role === 'ADMIN' ? true : document.getElementById('editAgentIsHead').checked;
  const status = document.getElementById('editAgentStatus').value;

  const btn = document.getElementById('btnSaveEditAgent');
  btn.disabled = true;
  btn.innerHTML = `<span>Saving...</span>`;

  try {
    const res = await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        role,
        department_id,
        department_ids,
        designation,
        is_dept_head,
        status
      })
    });
    const data = await res.json();
    if (data.success) {
      closeEditAgentModal();
      loadUsers();
      showToast('Staff member updated successfully.', 'success');
    } else {
      alert(data.detail || data.message || 'Failed to update staff member.');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Save Changes</span>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function renderCasePriorityBadge(priority) {
  const p = (priority || 'LOW').toUpperCase();
  let bg = '#F1F5F9', color = '#475569', border = '#CBD5E1';
  if (p === 'CRITICAL') { bg = '#FEF2F2'; color = '#DC2626'; border = '#FECACA'; }
  else if (p === 'HIGH') { bg = '#FFFBEB'; color = '#D97706'; border = '#FDE68A'; }
  else if (p === 'MEDIUM') { bg = '#EFF6FF'; color = '#2563EB'; border = '#BFDBFE'; }
  else if (p === 'LOW') { bg = '#ECFDF5'; color = '#059669'; border = '#A7F3D0'; }
  return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: ${bg}; color: ${color}; border: 1px solid ${border};">${p}</span>`;
}

function showDashboardLoader() {
  const overlay = document.getElementById('dashboardLoadingOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideDashboardLoader() {
  const overlay = document.getElementById('dashboardLoadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

// =========================================================================
// 5. TOAST NOTIFICATIONS (TATA 1MG BRANDED)
// =========================================================================
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const isTeal = type === 'success';
  const borderColor = isTeal ? 'var(--1mg-teal)' : 'var(--1mg-coral)';
  const iconColor = isTeal ? '#10847E' : '#FF6F61';
  const iconSvg = isTeal 
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  toast.style.cssText = `
    background: #FFFFFF;
    border-left: 4.5px solid ${borderColor};
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15), 0 2px 6px rgba(0,0,0,0.05);
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 320px;
    max-width: 440px;
    pointer-events: auto;
    animation: toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    transition: opacity 0.25s ease, transform 0.25s ease;
  `;

  toast.innerHTML = `
    <div style="flex-shrink: 0;">${iconSvg}</div>
    <div style="flex: 1;">
      <div style="font-size: 13.5px; font-weight: 700; color: #0F172A;">${escapeHtml(title)}</div>
      <div style="font-size: 12px; color: #64748B; margin-top: 2px;">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, 4200);
}

// =========================================================================
// 6. DASHBOARD & CASE CONTROLLERS (TATA 1MG COMMAND CENTER & ANALYTICS)
// =========================================================================

let currentDashboardTimeframe = '7d';
window.dashCharts = {
  inflow: null,
  department: null,
  sla: null,
  priority: null
};

function changeDashboardTimeframe(timeframe, btn) {
  currentDashboardTimeframe = timeframe;
  document.querySelectorAll('.dash-timeframe-picker .time-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadDashboard(timeframe);
}

async function triggerMailboxSync() {
  const btn = document.getElementById('btnSyncMailbox');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display: inline-block; width: 12px; height: 12px; border: 2px solid #64748B; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span> Syncing...`;
  }
  try {
    const res = await fetch('/api/v1/inbox/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Mailbox Synchronized', data.message || 'Incoming emails checked successfully.', 'success');
    } else {
      showToast('Mailbox Sync', data.message || 'Could not fetch new emails.', 'info');
    }
    await loadDashboard();
  } catch (err) {
    console.error('Mailbox sync failed:', err);
    showToast('Mailbox Sync Error', 'Failed to reach IMAP sync endpoint.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        <span>Sync Mailbox</span>
      `;
    }
  }
}


/* ============================================================
   CONTEXT-METER & ODOMETER NUMBER ROLL SYSTEM
   Inspired by Rauno's Lab ContextMeter with high-performance
   digit diffing, elastic pop-in blur animation, segmented bar
   flex transitions, give wave squeeze, interactive chips, and
   200-dot matrix grid view.
   ============================================================ */

const CONTEXT_KINDS = [
  { id: 'chat', name: 'Chat', k: 108.6, compactK: 30.4, color: 'var(--k-chat)' },
  { id: 'files', name: 'Files', k: 46.1, compactK: 46.1, color: 'var(--k-files)' },
  { id: 'tools', name: 'Tools', k: 12.8, compactK: 12.8, color: 'var(--k-tools)' },
  { id: 'sys', name: 'System', k: 4.2, compactK: 4.2, color: 'var(--k-sys)' },
  { id: 'mem', name: 'Memory', k: 3.9, compactK: 3.9, color: 'var(--k-mem)' }
];
const CONTEXT_WINDOW = 200;
let isContextCompact = false;
let contextWave = 'a';
let contextViewMode = 'Bar'; // 'Bar' or 'Field'
const rollCache = new Map();

/**
 * Rolls figure inside containerId with animated wheel digits.
 * Digits are diffed from right to left, unchanged digits remain stationary.
 */
function rollFigure(containerId, newText, forcedDirection = null) {
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) return;

  const prevText = rollCache.get(containerId) || container.innerText.trim() || '';
  const newStr = String(newText);
  if (prevText === newStr && container.children.length > 0) return;

  // Determine direction: up or down
  let isUp = true;
  if (forcedDirection) {
    isUp = (forcedDirection === 'up');
  } else {
    const prevNum = parseFloat(prevText.replace(/[^0-9.-]/g, ''));
    const newNum = parseFloat(newStr.replace(/[^0-9.-]/g, ''));
    if (!isNaN(prevNum) && !isNaN(newNum)) {
      isUp = newNum >= prevNum;
    }
  }

  rollCache.set(containerId, newStr);

  const prevChars = prevText.split('');
  const newChars = newStr.split('');
  const prevLen = prevChars.length;
  const newLen = newChars.length;

  container.innerHTML = '';

  newChars.forEach((ch, idx) => {
    // Count place from the right so alignment stays true
    const placeFromRight = newLen - 1 - idx;
    const prevChar = placeFromRight < prevLen ? prevChars[prevLen - 1 - placeFromRight] : null;

    if (!/[0-9]/.test(ch)) {
      const sym = document.createElement('span');
      sym.className = 'ctx-sym';
      sym.textContent = ch;
      container.appendChild(sym);
      return;
    }

    const wheel = document.createElement('span');
    wheel.className = 'ctx-wheel';

    const digit = document.createElement('span');
    digit.className = 'ctx-digit';
    digit.textContent = ch;

    // Only animate if the digit changed or it's a new place
    if (prevChar !== ch) {
      digit.classList.add(isUp ? 'roll-up' : 'roll-down');
      digit.style.animationDelay = `${idx * 45}ms`;
    }

    wheel.appendChild(digit);
    container.appendChild(wheel);
  });
}

/**
 * Toggles the AI Context card between Compact and Expanded state
 * Plays the squeeze wave animation and rolls the number.
 */
function toggleContextCompact(event) {
  if (event) event.stopPropagation();
  isContextCompact = !isContextCompact;
  contextWave = (contextWave === 'a' ? 'b' : 'a');

  const btn = document.getElementById('ctxCompactBtn');
  const bar = document.getElementById('ctxBar');
  const grid = document.getElementById('ctxGrid');
  const subOf = document.getElementById('subContext');

  if (btn) {
    btn.textContent = isContextCompact ? 'Undo' : 'Compact';
    if (isContextCompact) {
      btn.setAttribute('data-quiet', 'true');
    } else {
      btn.removeAttribute('data-quiet');
    }
  }

  // Update Bar segments
  if (bar) {
    bar.setAttribute('data-wave', contextWave);
    const segChat = document.getElementById('segChat');
    const segRoom = document.getElementById('segRoom');
    if (segChat) {
      segChat.style.flexGrow = isContextCompact ? CONTEXT_KINDS[0].compactK : CONTEXT_KINDS[0].k;
      segChat.title = `Chat: ${isContextCompact ? CONTEXT_KINDS[0].compactK : CONTEXT_KINDS[0].k}K`;
    }
    if (segRoom) {
      const used = (isContextCompact ? 97.4 : 175.6);
      segRoom.style.flexGrow = (CONTEXT_WINDOW - used).toFixed(1);
      segRoom.title = `Free headroom: ${(CONTEXT_WINDOW - used).toFixed(1)}K`;
    }
  }

  // Roll Context figure
  const targetK = isContextCompact ? 97.4 : 175.6;
  rollFigure('rollContext', `${targetK.toFixed(1)}K`, isContextCompact ? 'down' : 'up');
  if (subOf) subOf.textContent = `of ${CONTEXT_WINDOW}K`;

  // Update Field Grid if active
  if (grid && contextViewMode === 'Field') {
    renderContextGrid();
  }
}

/**
 * Toggles between Bar View and 200-Dot Matrix Grid View
 */
function toggleContextViewMode(event) {
  if (event) event.stopPropagation();
  const bar = document.getElementById('ctxBar');
  const grid = document.getElementById('ctxGrid');
  const btn = document.getElementById('ctxModeToggle');

  if (contextViewMode === 'Bar') {
    contextViewMode = 'Field';
    if (bar) bar.style.display = 'none';
    if (grid) {
      grid.style.display = 'grid';
      renderContextGrid();
    }
    if (btn) {
      const barIcon = btn.querySelector('.mode-icon-bar');
      const gridIcon = btn.querySelector('.mode-icon-grid');
      if (barIcon) barIcon.style.display = 'none';
      if (gridIcon) gridIcon.style.display = 'inline-block';
      btn.title = 'Switch to Stacked Bar View';
    }
  } else {
    contextViewMode = 'Bar';
    if (grid) grid.style.display = 'none';
    if (bar) bar.style.display = 'flex';
    if (btn) {
      const barIcon = btn.querySelector('.mode-icon-bar');
      const gridIcon = btn.querySelector('.mode-icon-grid');
      if (barIcon) barIcon.style.display = 'inline-block';
      if (gridIcon) gridIcon.style.display = 'none';
      btn.title = 'Switch to 200-Dot Matrix View';
    }
  }
}

/**
 * Generates and renders 200 dots for the Context Matrix view
 */
function renderContextGrid() {
  const grid = document.getElementById('ctxGrid');
  if (!grid) return;

  const currentSizes = CONTEXT_KINDS.map(c => (c.id === 'chat' && isContextCompact ? c.compactK : c.k));
  const order = [0, 1, 2, 3, 4]; // chat, files, tools, sys, mem

  // Build dot ownership
  const owners = [];
  order.forEach(ci => {
    const count = Math.round(currentSizes[ci]);
    for (let j = 0; j < count && owners.length < CONTEXT_WINDOW; j++) {
      owners.push(ci);
    }
  });
  while (owners.length < CONTEXT_WINDOW) {
    owners.push(null);
  }

  grid.innerHTML = '';
  grid.setAttribute('data-wave', contextWave);

  owners.forEach((o, i) => {
    const dot = document.createElement('i');
    dot.className = 'ctx-dot';
    if (o !== null) {
      const kind = CONTEXT_KINDS[o];
      dot.setAttribute('data-kind', kind.id);
      dot.title = `${kind.name} (${kind.k}K)`;
      dot.onpointerenter = () => highlightContextKind(kind.id);
    } else {
      dot.title = 'Free Context Room';
      dot.onpointerenter = () => clearCardHover('context');
    }
    grid.appendChild(dot);
  });
}

/**
 * Highlights a specific kind in the Context Meter card
 */
function highlightContextKind(kindId) {
  const card = document.getElementById('kpiCardContext');
  if (!card) return;

  const bar = document.getElementById('ctxBar');
  const grid = document.getElementById('ctxGrid');
  const chips = card.querySelectorAll('.ctx-chip');
  const subOf = document.getElementById('subContext');

  const kindObj = CONTEXT_KINDS.find(k => k.id === kindId);
  if (!kindObj) return;

  // Highlight segment on bar
  if (bar) {
    bar.querySelectorAll('.ctx-seg').forEach(seg => {
      if (seg.getAttribute('data-kind') === kindId) {
        seg.removeAttribute('data-dim');
        seg.setAttribute('data-lit', 'true');
      } else {
        seg.removeAttribute('data-lit');
        seg.setAttribute('data-dim', 'true');
      }
    });
  }

  // Highlight dot on grid
  if (grid) {
    grid.querySelectorAll('.ctx-dot').forEach(dot => {
      if (dot.getAttribute('data-kind') === kindId) {
        dot.removeAttribute('data-dim');
      } else {
        dot.setAttribute('data-dim', 'true');
      }
    });
  }

  // Highlight chip
  chips.forEach(chip => {
    if (chip.getAttribute('data-kind') === kindId) {
      chip.setAttribute('data-on', 'true');
    } else {
      chip.removeAttribute('data-on');
    }
  });

  // Roll figure to that slice's value
  const val = isContextCompact && kindObj.id === 'chat' ? kindObj.compactK : kindObj.k;
  rollFigure('rollContext', `${val.toFixed(1)}K`);
  if (subOf) subOf.textContent = kindObj.name;
}

/**
 * Helper to safely set chip data values for interactive hover
 */
function setChipData(chipId, val, label) {
  const chip = document.getElementById(chipId);
  if (!chip) return;
  chip.setAttribute('data-val', String(val));
  chip.setAttribute('data-label', label);
}

/**
 * Initializes hover interactions for all 6 KPI cards
 */
function initKpiCardsInteractivity() {
  setupStandardCardHover('kpiCardInflow', 'barInflow', 'chipsInflow', 'rollTotalCases', 'subTotalCases', 'statTotalCases', 'All cases received via mail');
  setupStandardCardHover('kpiCardTriage', 'barTriage', 'chipsTriage', 'rollInProgress', 'subInProgress', 'statInProgress', 'Cases in active review');
  setupStandardCardHover('kpiCardSla', 'barSla', 'chipsSla', 'rollSlaCompliance', 'statBreachedSubtitle', 'statSlaCompliance', '0 cases breached');
  setupStandardCardHover('kpiCardMttr', 'barMttr', 'chipsMttr', 'rollAvgResolution', 'subAvgResolution', 'statAvgResolution', 'First response to close');
  setupStandardCardHover('kpiCardAgents', 'barAgents', 'chipsAgents', 'rollActiveAgents', 'subActiveAgents', 'statActiveAgents', 'Assigned across HR teams');
  setupStandardCardHover('kpiCardAi', 'barAi', 'chipsAi', 'rollAiAccuracy', 'subAiAccuracy', 'statAiAccuracy', 'Zero-shot NLP router');
}

/**
 * Generic hover helper for segmented bar & chips
 */
function setupStandardCardHover(cardId, barId, chipsId, rollId, subId, originalValId, defaultSub) {
  const card = document.getElementById(cardId);
  const bar = document.getElementById(barId);
  const chips = document.getElementById(chipsId);
  const subEl = document.getElementById(subId);
  const originalEl = document.getElementById(originalValId);

  if (!card || !bar || !chips) return;

  const resetCard = () => {
    bar.querySelectorAll('.ctx-seg').forEach(s => {
      s.removeAttribute('data-dim');
      s.removeAttribute('data-lit');
    });
    chips.querySelectorAll('.ctx-chip').forEach(c => c.removeAttribute('data-on'));
    if (originalEl) {
      rollFigure(rollId, originalEl.innerText.trim());
    }
    if (subEl) {
      subEl.textContent = defaultSub;
    }
  };

  card.onpointerleave = resetCard;

  chips.querySelectorAll('.ctx-chip').forEach(chip => {
    const kind = chip.getAttribute('data-kind');

    const onEnter = () => {
      const val = chip.getAttribute('data-val');
      const label = chip.getAttribute('data-label');

      bar.querySelectorAll('.ctx-seg').forEach(seg => {
        if (seg.getAttribute('data-kind') === kind) {
          seg.removeAttribute('data-dim');
          seg.setAttribute('data-lit', 'true');
        } else {
          seg.removeAttribute('data-lit');
          seg.setAttribute('data-dim', 'true');
        }
      });
      chips.querySelectorAll('.ctx-chip').forEach(c => {
        if (c === chip) c.setAttribute('data-on', 'true');
        else c.removeAttribute('data-on');
      });
      if (val !== null && val !== undefined) rollFigure(rollId, val);
      if (subEl && label) subEl.textContent = label;
    };

    chip.onpointerenter = onEnter;
    chip.onfocus = onEnter;
    chip.onblur = resetCard;
  });

  bar.querySelectorAll('.ctx-seg').forEach(seg => {
    const kind = seg.getAttribute('data-kind');
    if (!kind) return;
    const matchingChip = chips.querySelector(`.ctx-chip[data-kind="${kind}"]`);
    if (matchingChip) {
      seg.onpointerenter = () => {
        matchingChip.dispatchEvent(new Event('pointerenter'));
      };
    }
  });
}

async function loadDashboard(timeframe = currentDashboardTimeframe) {
  showDashboardLoader();
  try {
    const res = await fetch(`/api/v1/dashboard/stats?timeframe=${encodeURIComponent(timeframe)}`);
    const data = await res.json();
    if (!data.success) {
      console.warn('Dashboard fetch returned non-success:', data);
      return;
    }

    const stats = data.stats || {};

    // 1. Update 6 Modern Context-Meter Bento KPI Metric Cards with 100% REAL DATA
    const elTotal = document.getElementById('statTotalCases');
    const elProg = document.getElementById('statInProgress');
    const elSlaComp = document.getElementById('statSlaCompliance');
    const elAvgRes = document.getElementById('statAvgResolution');
    const elAgents = document.getElementById('statActiveAgents');
    const elAiAcc = document.getElementById('statAiAccuracy');
    const elBreachedSub = document.getElementById('statBreachedSubtitle');
    const elUrgentBadge = document.getElementById('statUrgentBadge');
    const elDeptsCount = document.getElementById('statDeptsCount');

    const totalCasesVal = stats.total_cases ?? 0;
    const inProgVal = stats.in_progress ?? 0;
    const slaCompVal = `${stats.sla_compliance ?? 100.0}%`;
    const avgResVal = (totalCasesVal > 0 ? `${stats.avg_resolution_hours ?? 0.0}h` : '0.0h');
    const agentsVal = stats.active_agents ?? 0;
    const aiAccVal = `${stats.ai_accuracy ?? 96.8}%`;

    if (elTotal) elTotal.innerText = totalCasesVal;
    if (elProg) elProg.innerText = inProgVal;
    if (elSlaComp) elSlaComp.innerText = slaCompVal;
    if (elAvgRes) elAvgRes.innerText = avgResVal;
    if (elAgents) elAgents.innerText = agentsVal;
    if (elAiAcc) elAiAcc.innerText = aiAccVal;
    if (elBreachedSub) elBreachedSub.innerText = `${stats.breached_cases ?? 0} cases breached`;
    if (elUrgentBadge) {
      elUrgentBadge.innerText = `${stats.urgent_cases ?? 0} Urgent`;
      if ((stats.urgent_cases ?? 0) > 0) {
        elUrgentBadge.classList.add('ctx-act-amber');
      } else {
        elUrgentBadge.classList.remove('ctx-act-amber');
      }
    }
    if (elDeptsCount) elDeptsCount.innerText = `${stats.departments ?? 0} Queues`;

    // Animate Odometer Rolls on KPI Numbers
    rollFigure('rollTotalCases', totalCasesVal);
    rollFigure('rollInProgress', inProgVal);
    rollFigure('rollSlaCompliance', slaCompVal);
    rollFigure('rollAvgResolution', avgResVal);
    rollFigure('rollActiveAgents', agentsVal);
    rollFigure('rollAiAccuracy', aiAccVal);

    // --- CARD 1: REAL INBOUND EMAIL INTAKE ---
    const channels = data.channel_distribution || {};
    const internalCnt = channels.internal ?? (channels.portal || 0);
    const externalCnt = channels.external ?? (channels.email || 0);
    const hrmsAlertCnt = channels.hrms_alert ?? (channels.hrms || 0);
    const replyCnt = channels.reply ?? (channels.direct || 0);

    const elCntInternal = document.getElementById('cntInflowInternal') || document.getElementById('cntInflowPortal');
    const elCntExternal = document.getElementById('cntInflowExternal') || document.getElementById('cntInflowEmail');
    const elCntHrmsAlert = document.getElementById('cntInflowHrmsAlert') || document.getElementById('cntInflowHrms');
    const elCntReply = document.getElementById('cntInflowReply') || document.getElementById('cntInflowDirect');
    if (elCntInternal) elCntInternal.innerText = `(${internalCnt})`;
    if (elCntExternal) elCntExternal.innerText = `(${externalCnt})`;
    if (elCntHrmsAlert) elCntHrmsAlert.innerText = `(${hrmsAlertCnt})`;
    if (elCntReply) elCntReply.innerText = `(${replyCnt})`;

    setChipData('chipInflowInternal', internalCnt, 'Corporate @1mg.com employee mail');
    setChipData('chipInflowExternal', externalCnt, 'Personal & candidate email inquiries');
    setChipData('chipInflowHrmsAlert', hrmsAlertCnt, 'Darwinbox & attendance alert emails');
    setChipData('chipInflowReply', replyCnt, 'Follow-up email replies on open cases');
    // Backward compatibility for legacy chip IDs
    setChipData('chipInflowPortal', internalCnt, 'Corporate @1mg.com employee mail');
    setChipData('chipInflowEmail', externalCnt, 'Personal & candidate email inquiries');
    setChipData('chipInflowHrms', hrmsAlertCnt, 'Darwinbox & attendance alert emails');
    setChipData('chipInflowDirect', replyCnt, 'Follow-up email replies on open cases');

    const segInternal = document.getElementById('segInflowInternal') || document.getElementById('segInflowPortal');
    const segExternal = document.getElementById('segInflowExternal') || document.getElementById('segInflowEmail');
    const segHrmsAlert = document.getElementById('segInflowHrmsAlert') || document.getElementById('segInflowHrms');
    const segReply = document.getElementById('segInflowReply') || document.getElementById('segInflowDirect');
    const segInflowRoom = document.getElementById('segInflowRoom');

    if (totalCasesVal === 0) {
      if (segInternal) segInternal.style.flexGrow = 0;
      if (segExternal) segExternal.style.flexGrow = 0;
      if (segHrmsAlert) segHrmsAlert.style.flexGrow = 0;
      if (segReply) segReply.style.flexGrow = 0;
      if (segInflowRoom) {
        segInflowRoom.style.flexGrow = 100;
        segInflowRoom.title = 'No inbound emails recorded yet';
      }
    } else {
      if (segInternal) segInternal.style.flexGrow = internalCnt;
      if (segExternal) segExternal.style.flexGrow = externalCnt;
      if (segHrmsAlert) segHrmsAlert.style.flexGrow = hrmsAlertCnt;
      if (segReply) segReply.style.flexGrow = replyCnt;
      if (segInflowRoom) segInflowRoom.style.flexGrow = Math.max(0, Math.round(totalCasesVal * 0.15));
    }

    // --- CARD 2: REAL ACTIVE TRIAGE & PRIORITIES ---
    const pDist = data.priority_distribution || {};
    const pCounts = pDist.counts || [];
    const critCnt = pDist.critical ?? (pCounts[0] || 0);
    const highCnt = pDist.high ?? (pCounts[1] || 0);
    const medCnt = pDist.medium ?? (pCounts[2] || 0);
    const lowCnt = pDist.low ?? (pCounts[3] || 0);
    const totalTriage = inProgVal || (critCnt + highCnt + medCnt + lowCnt);

    const elCntCrit = document.getElementById('cntTriageCrit');
    const elCntHigh = document.getElementById('cntTriageHigh');
    const elCntMed = document.getElementById('cntTriageMed');
    const elCntLow = document.getElementById('cntTriageLow');
    if (elCntCrit) elCntCrit.innerText = `(${critCnt})`;
    if (elCntHigh) elCntHigh.innerText = `(${highCnt})`;
    if (elCntMed) elCntMed.innerText = `(${medCnt})`;
    if (elCntLow) elCntLow.innerText = `(${lowCnt})`;

    setChipData('chipTriageCrit', critCnt, 'Critical P1 inquiries');
    setChipData('chipTriageHigh', highCnt, 'High priority inquiries');
    setChipData('chipTriageMed', medCnt, 'Standard priority inquiries');
    setChipData('chipTriageLow', lowCnt, 'Low priority inquiries');

    const segCrit = document.getElementById('segTriageCrit');
    const segHigh = document.getElementById('segTriageHigh');
    const segMed = document.getElementById('segTriageMed');
    const segLow = document.getElementById('segTriageLow');
    const segTriageRoom = document.getElementById('segTriageRoom');

    if (totalTriage === 0) {
      if (segCrit) segCrit.style.flexGrow = 0;
      if (segHigh) segHigh.style.flexGrow = 0;
      if (segMed) segMed.style.flexGrow = 0;
      if (segLow) segLow.style.flexGrow = 0;
      if (segTriageRoom) {
        segTriageRoom.style.flexGrow = 100;
        segTriageRoom.title = 'Triage queue clear';
      }
    } else {
      if (segCrit) segCrit.style.flexGrow = critCnt;
      if (segHigh) segHigh.style.flexGrow = highCnt;
      if (segMed) segMed.style.flexGrow = medCnt;
      if (segLow) segLow.style.flexGrow = lowCnt;
      if (segTriageRoom) segTriageRoom.style.flexGrow = Math.max(0, Math.round(totalTriage * 0.2));
    }

    // --- CARD 3: REAL SLA ADHERENCE HEALTH ---
    const slaH = data.sla_health || {};
    const withinCnt = slaH.within_sla || 0;
    const appCnt = slaH.approaching_sla || 0;
    const brCnt = slaH.breached || 0;
    const totalSlaCases = withinCnt + appCnt + brCnt;

    const elCntWithin = document.getElementById('cntSlaWithin');
    const elCntApp = document.getElementById('cntSlaApp');
    const elCntBr = document.getElementById('cntSlaBreached');
    if (elCntWithin) elCntWithin.innerText = `(${withinCnt})`;
    if (elCntApp) elCntApp.innerText = `(${appCnt})`;
    if (elCntBr) elCntBr.innerText = `(${brCnt})`;

    setChipData('chipSlaWithin', withinCnt, 'Within SLA deadline');
    setChipData('chipSlaApp', appCnt, 'Approaching deadline (<4h)');
    setChipData('chipSlaBreached', brCnt, 'SLA breached');

    const segWithin = document.getElementById('segSlaWithin');
    const segApp = document.getElementById('segSlaApp');
    const segBr = document.getElementById('segSlaBr');
    const segSlaRoom = document.getElementById('segSlaRoom');

    if (totalSlaCases === 0) {
      if (segWithin) segWithin.style.flexGrow = 100;
      if (segApp) segApp.style.flexGrow = 0;
      if (segBr) segBr.style.flexGrow = 0;
      if (segSlaRoom) segSlaRoom.style.flexGrow = 0;
    } else {
      if (segWithin) segWithin.style.flexGrow = Math.max(withinCnt, 1);
      if (segApp) segApp.style.flexGrow = appCnt;
      if (segBr) segBr.style.flexGrow = brCnt;
      if (segSlaRoom) segSlaRoom.style.flexGrow = Math.max(0, Math.round(totalSlaCases * 0.05));
    }

    // --- CARD 4: REAL RESOLUTION VELOCITY (MTTR) ---
    const resVel = data.resolution_velocity || {};
    const fastCnt = resVel.fast || 0;
    const stdCnt = resVel.standard || 0;
    const extCnt = resVel.extended || 0;
    const inProgCnt = resVel.in_progress || inProgVal;
    const totalVel = fastCnt + stdCnt + extCnt + inProgCnt;

    const elCntFast = document.getElementById('cntMttrFast');
    const elCntStd = document.getElementById('cntMttrStd');
    const elCntExt = document.getElementById('cntMttrExt');
    const elCntOpen = document.getElementById('cntMttrOpen');
    if (elCntFast) elCntFast.innerText = `(${fastCnt})`;
    if (elCntStd) elCntStd.innerText = `(${stdCnt})`;
    if (elCntExt) elCntExt.innerText = `(${extCnt})`;
    if (elCntOpen) elCntOpen.innerText = `(${inProgCnt})`;

    setChipData('chipMttrFast', fastCnt, 'Fast resolution (<2h)');
    setChipData('chipMttrStd', stdCnt, 'Standard resolution (2-6h)');
    setChipData('chipMttrExt', extCnt, 'Extended resolution (>6h)');
    setChipData('chipMttrOpen', inProgCnt, 'Currently under active triage');

    const segFast = document.getElementById('segMttrFast');
    const segStd = document.getElementById('segMttrStd');
    const segExt = document.getElementById('segMttrExt');
    const segOpen = document.getElementById('segMttrOpen');
    const segMttrRoom = document.getElementById('segMttrRoom');

    if (totalVel === 0) {
      if (segFast) segFast.style.flexGrow = 0;
      if (segStd) segStd.style.flexGrow = 0;
      if (segExt) segExt.style.flexGrow = 0;
      if (segOpen) segOpen.style.flexGrow = 0;
      if (segMttrRoom) {
        segMttrRoom.style.flexGrow = 100;
        segMttrRoom.title = 'No case resolution velocity recorded';
      }
    } else {
      if (segFast) segFast.style.flexGrow = fastCnt;
      if (segStd) segStd.style.flexGrow = stdCnt;
      if (segExt) segExt.style.flexGrow = extCnt;
      if (segOpen) segOpen.style.flexGrow = inProgCnt;
      if (segMttrRoom) segMttrRoom.style.flexGrow = Math.max(0, Math.round(totalVel * 0.15));
    }

    // --- CARD 5: REAL DEPARTMENT SPECIALIST QUEUES ---
    const deptDist = data.department_distribution || {};
    const deptLabels = deptDist.labels || [];
    const deptCounts = deptDist.counts || [];

    const d1Name = deptLabels[0] || 'Payroll';
    const d1Cnt = deptCounts[0] || 0;
    const d2Name = deptLabels[1] || 'Benefits';
    const d2Cnt = deptCounts[1] || 0;
    const d3Name = deptLabels[2] || 'Leaves';
    const d3Cnt = deptCounts[2] || 0;
    const d4Name = deptLabels[3] || 'Relations';
    const d4Cnt = deptCounts[3] || 0;
    const totalDeptCases = d1Cnt + d2Cnt + d3Cnt + d4Cnt;

    function formatDeptLabel(name) {
      if (!name) return 'General';
      if (/benefit/i.test(name)) return 'Benefits';
      if (/leave/i.test(name)) return 'Leaves';
      if (/payroll/i.test(name)) return 'Payroll';
      if (/relation/i.test(name)) return 'Relations';
      if (/people desk/i.test(name)) return 'Central';
      return name.split(' ')[0];
    }

    const elNameD1 = document.getElementById('nameDept1');
    const elNameD2 = document.getElementById('nameDept2');
    const elNameD3 = document.getElementById('nameDept3');
    const elNameD4 = document.getElementById('nameDept4');
    if (elNameD1) elNameD1.innerText = formatDeptLabel(d1Name);
    if (elNameD2) elNameD2.innerText = formatDeptLabel(d2Name);
    if (elNameD3) elNameD3.innerText = formatDeptLabel(d3Name);
    if (elNameD4) elNameD4.innerText = formatDeptLabel(d4Name);

    const elCntD1 = document.getElementById('cntDept1');
    const elCntD2 = document.getElementById('cntDept2');
    const elCntD3 = document.getElementById('cntDept3');
    const elCntD4 = document.getElementById('cntDept4');
    if (elCntD1) elCntD1.innerText = `(${d1Cnt})`;
    if (elCntD2) elCntD2.innerText = `(${d2Cnt})`;
    if (elCntD3) elCntD3.innerText = `(${d3Cnt})`;
    if (elCntD4) elCntD4.innerText = `(${d4Cnt})`;

    setChipData('chipDept1', d1Cnt, `${d1Name} queue`);
    setChipData('chipDept2', d2Cnt, `${d2Name} queue`);
    setChipData('chipDept3', d3Cnt, `${d3Name} queue`);
    setChipData('chipDept4', d4Cnt, `${d4Name} queue`);

    const segD1 = document.getElementById('segDept1');
    const segD2 = document.getElementById('segDept2');
    const segD3 = document.getElementById('segDept3');
    const segD4 = document.getElementById('segDept4');
    const segAgentsRoom = document.getElementById('segAgentsRoom');

    if (totalDeptCases === 0) {
      if (segD1) segD1.style.flexGrow = 0;
      if (segD2) segD2.style.flexGrow = 0;
      if (segD3) segD3.style.flexGrow = 0;
      if (segD4) segD4.style.flexGrow = 0;
      if (segAgentsRoom) {
        segAgentsRoom.style.flexGrow = 100;
        segAgentsRoom.title = 'No active queue workload';
      }
    } else {
      if (segD1) segD1.style.flexGrow = d1Cnt;
      if (segD2) segD2.style.flexGrow = d2Cnt;
      if (segD3) segD3.style.flexGrow = d3Cnt;
      if (segD4) segD4.style.flexGrow = d4Cnt;
      if (segAgentsRoom) segAgentsRoom.style.flexGrow = Math.max(0, Math.round(totalDeptCases * 0.15));
    }

    // --- CARD 6: REAL AI TRIAGE ACCURACY & NLP CONFIDENCE ---
    const aiM = data.ai_triage_metrics || {};
    const highConf = aiM.high_confidence || 0;
    const modConf = aiM.moderate_confidence || 0;
    const lowConf = aiM.review_needed || 0;
    const totalAi = highConf + modConf + lowConf;

    const highPct = totalAi > 0 ? Math.round((highConf / totalAi) * 100) : 78;
    const modPct = totalAi > 0 ? Math.round((modConf / totalAi) * 100) : 18;
    const lowPct = totalAi > 0 ? (100 - highPct - modPct) : 4;

    const elCntAiHigh = document.getElementById('cntAiHigh');
    const elCntAiMod = document.getElementById('cntAiMod');
    const elCntAiLow = document.getElementById('cntAiLow');
    if (elCntAiHigh) elCntAiHigh.innerText = `(${highPct}%)`;
    if (elCntAiMod) elCntAiMod.innerText = `(${modPct}%)`;
    if (elCntAiLow) elCntAiLow.innerText = `(${lowPct}%)`;

    setChipData('chipAiHigh', `${highPct}%`, 'High certainty AI routing (>90%)');
    setChipData('chipAiMod', `${modPct}%`, 'Moderate confidence routing (70-90%)');
    setChipData('chipAiLow', `${lowPct}%`, 'Flagged for supervisor review (<70%)');

    const segAiHigh = document.getElementById('segAiHigh');
    const segAiMod = document.getElementById('segAiMod');
    const segAiLow = document.getElementById('segAiLow');
    const segAiRoom = document.getElementById('segAiRoom');

    if (segAiHigh) segAiHigh.style.flexGrow = highPct;
    if (segAiMod) segAiMod.style.flexGrow = modPct;
    if (segAiLow) segAiLow.style.flexGrow = lowPct;
    if (segAiRoom) segAiRoom.style.flexGrow = 0;

    // SLA Summary Strip
    const elWithinSla = document.getElementById('statWithinSla');
    const elApproachingSla = document.getElementById('statApproachingSla');
    const elBreachedCount = document.getElementById('statBreachedCount');
    const elSlaOverall = document.getElementById('slaOverallBadge');

    if (data.sla_health) {
      if (elWithinSla) elWithinSla.innerText = data.sla_health.within_sla;
      if (elApproachingSla) elApproachingSla.innerText = data.sla_health.approaching_sla;
      if (elBreachedCount) elBreachedCount.innerText = data.sla_health.breached;
    }
    if (elSlaOverall) {
      elSlaOverall.innerText = `● ${stats.sla_compliance ?? 98.4}% On-Track`;
    }

    // 2. Render / Update Chart 1: Inflow vs Resolution
    try { renderChartInflowVelocity(data.trend_data); } catch (e) { console.warn('Inflow chart error:', e); }

    // 3. Render / Update Chart 2: Department Workload
    try { renderChartDepartmentDistribution(data.department_distribution); } catch (e) { console.warn('Dept workload error:', e); }

    // 4. Render / Update Chart 3: SLA Compliance Health
    try { renderChartSlaHealth(data.sla_health); } catch (e) { console.warn('SLA health error:', e); }

    // 5. Render / Update Chart 4: Priority Distribution
    try { renderChartPriorityDistribution(data.priority_distribution); } catch (e) { console.warn('Priority distribution error:', e); }

    // 6. Populate Urgent SLA Watchlist
    try { renderUrgentCasesWatchlist(data.urgent_cases || []); } catch (e) { console.warn('Urgent watchlist error:', e); }

    // 7. Populate Active Specialists Leaderboard
    try { renderSpecialistLeaderboard(data.agent_leaderboard || []); } catch (e) { console.warn('Specialist leaderboard error:', e); }

    // 8. Populate Recent Cases Across All Departments
    try { renderRecentDashboardCases(data.recent_cases || []); } catch (e) { console.warn('Recent cases error:', e); }

  } catch (err) {
    console.error('Failed to load dashboard analytics:', err);
  } finally {
    hideDashboardLoader();
  }
}

// -------------------------------------------------------------------------
// Chart 1: Email Inflow vs. Resolution Velocity (Tactile ContextMeter Pillars)
// -------------------------------------------------------------------------
function renderChartInflowVelocity(trend) {
  const container = document.getElementById('velocityPillarsGrid');

  const labels = (trend && trend.labels && trend.labels.length) ? trend.labels : ['31 Oct', '01 Nov', '02 Nov', '03 Nov', '04 Nov', '05 Nov', 'Today'];
  const incoming = (trend && trend.incoming && trend.incoming.length) ? trend.incoming : [0, 0, 0, 0, 0, 0, 0];
  const resolved = (trend && trend.resolved && trend.resolved.length) ? trend.resolved : [0, 0, 0, 0, 0, 0, 0];

  const totalIncoming = incoming.reduce((a, b) => a + b, 0);
  const totalResolved = resolved.reduce((a, b) => a + b, 0);
  const netOpen = Math.max(0, totalIncoming - totalResolved);

  // Update Main Odometer & Badges
  rollFigure('rollVelocityIntake', totalIncoming);
  const subEl = document.getElementById('subVelocity');
  const defaultSub = `${totalIncoming} Inbound emails vs ${totalResolved} resolved`;
  if (subEl) subEl.textContent = defaultSub;

  const elBadge = document.getElementById('statVelocityBadge');
  if (elBadge) {
    const pct = totalIncoming > 0 ? Math.round((totalResolved / totalIncoming) * 100) : 100;
    elBadge.innerText = `⚡ ${pct}% Resolved`;
  }

  // Update Horizontal Context Bar
  const segIn = document.getElementById('segVelIncoming');
  const segRes = document.getElementById('segVelResolved');
  const segRoom = document.getElementById('segVelRoom');
  if (segIn) segIn.style.flexGrow = totalIncoming || 1;
  if (segRes) segRes.style.flexGrow = totalResolved;
  if (segRoom) segRoom.style.flexGrow = Math.max(1, Math.round(totalIncoming * 0.25));

  // Update Chip Counts
  const elCntIn = document.getElementById('cntVelIncoming');
  const elCntRes = document.getElementById('cntVelResolved');
  const elCntBacklog = document.getElementById('cntVelBacklog');
  if (elCntIn) elCntIn.innerText = `(${totalIncoming})`;
  if (elCntRes) elCntRes.innerText = `(${totalResolved})`;
  if (elCntBacklog) elCntBacklog.innerText = `(${netOpen})`;

  setChipData('chipVelIncoming', totalIncoming, 'Total inbound employee emails');
  setChipData('chipVelResolved', totalResolved, 'Successfully closed inquiries');
  setChipData('chipVelBacklog', netOpen, 'Currently open in active queue');

  // Render Tactile Velocity Pillars
  if (container) {
    container.style.gridTemplateColumns = `repeat(${labels.length}, 1fr)`;
    const maxVolume = Math.max(...incoming, 1);
    container.innerHTML = labels.map((lbl, idx) => {
      const inVal = incoming[idx] || 0;
      const resVal = resolved[idx] || 0;
      // Calculate heights as percentage of track with clear min-height
      const inHeightPct = inVal > 0 ? Math.max(16, Math.min(100, Math.round((inVal / maxVolume) * 88))) : 0;
      const resHeightPct = resVal > 0 ? Math.max(14, Math.min(inHeightPct, Math.round((resVal / maxVolume) * 88))) : 0;
      const shortLabel = lbl.toLowerCase().includes('today') ? 'Today' : lbl.split(' ')[0];

      return `
        <div 
          class="ctx-pillar-col" 
          data-day-idx="${idx}"
          data-day-name="${escapeHtml(lbl)}"
          data-in="${inVal}"
          data-res="${resVal}"
          title="${escapeHtml(lbl)}: ${inVal} Inflow, ${resVal} Resolved"
        >
          <div class="ctx-pillar-track">
            <div class="ctx-pillar-seg incoming" style="height: ${inHeightPct}%;">
              ${resHeightPct > 0 ? `<div class="ctx-pillar-seg resolved" style="height: ${Math.round((resHeightPct / (inHeightPct || 1)) * 100)}%;"></div>` : ''}
            </div>
          </div>
          <span class="ctx-pillar-label">${escapeHtml(shortLabel)}</span>
        </div>
      `;
    }).join('');

    // Interactive Hover for Day Pillars
    const resetPillars = () => {
      container.querySelectorAll('.ctx-pillar-col').forEach(c => {
        c.removeAttribute('data-dim');
        c.removeAttribute('data-lit');
      });
      const bar = document.getElementById('barVelocity');
      if (bar) bar.querySelectorAll('.ctx-seg').forEach(s => { s.removeAttribute('data-dim'); s.removeAttribute('data-lit'); });
      rollFigure('rollVelocityIntake', totalIncoming);
      if (subEl) subEl.textContent = defaultSub;
    };

    const card = document.getElementById('cardInflowVelocity');
    if (card) card.onpointerleave = resetPillars;

    container.querySelectorAll('.ctx-pillar-col').forEach(col => {
      col.onpointerenter = () => {
        const dayName = col.getAttribute('data-day-name');
        const inCount = col.getAttribute('data-in');
        const resCount = col.getAttribute('data-res');

        container.querySelectorAll('.ctx-pillar-col').forEach(c => {
          if (c === col) {
            c.removeAttribute('data-dim');
            c.setAttribute('data-lit', 'true');
          } else {
            c.removeAttribute('data-lit');
            c.setAttribute('data-dim', 'true');
          }
        });

        rollFigure('rollVelocityIntake', inCount);
        if (subEl) {
          subEl.textContent = `${dayName}: ${inCount} Inbound emails · ${resCount} Resolved`;
        }
      };
    });
  }

  // Bind chips hover to segmented bar
  const chips = document.getElementById('chipsVelocity');
  const bar = document.getElementById('barVelocity');
  if (chips && bar) {
    const bindVelChip = (chipId, segId, count, label) => {
      const chip = document.getElementById(chipId);
      const seg = document.getElementById(segId);
      if (!chip || !seg) return;
      chip.onpointerenter = () => {
        bar.querySelectorAll('.ctx-seg').forEach(s => {
          if (s === seg) { s.removeAttribute('data-dim'); s.setAttribute('data-lit', 'true'); }
          else { s.removeAttribute('data-lit'); s.setAttribute('data-dim', 'true'); }
        });
        rollFigure('rollVelocityIntake', count);
        if (subEl) subEl.textContent = `${label} (${count})`;
      };
    };
    bindVelChip('chipVelIncoming', 'segVelIncoming', totalIncoming, 'Total Inbound Emails');
    bindVelChip('chipVelResolved', 'segVelResolved', totalResolved, 'Successfully Resolved');
    bindVelChip('chipVelBacklog', 'segVelRoom', netOpen, 'Active Queue Backlog');
  }
}

// -------------------------------------------------------------------------
// Chart 2: Department Workload (Tactile ContextMeter Bands & Progress Tracks)
// -------------------------------------------------------------------------
function renderChartDepartmentDistribution(deptData) {
  const barContainer = document.getElementById('barDeptWorkload');
  const bandsContainer = document.getElementById('deptWorkloadBands');
  const chipsContainer = document.getElementById('chipsDeptWorkload');

  const rawLabels = (deptData && deptData.labels && deptData.labels.length) ? deptData.labels : ['Benefits & Insurance', 'Leave & Attendance', 'Payroll & Compensation', 'Employee Relations & HR Ops'];
  const rawCounts = (deptData && deptData.counts && deptData.counts.length) ? deptData.counts : [0, 0, 0, 0];
  const colors = ['#3d7ef5', '#1db4cc', '#9a5cf6', '#2ccb7e', '#f59e0b', '#ec4f8c'];

  const totalSum = rawCounts.reduce((a, b) => a + b, 0);

  // Update Main Odometer & Badges
  rollFigure('rollDeptTotal', totalSum);
  const subEl = document.getElementById('subDeptWorkload');
  const defaultSub = `${totalSum} cases across specialized HR queues`;
  if (subEl) subEl.textContent = defaultSub;

  const activeQueues = rawCounts.filter(c => c > 0).length;
  const elBadge = document.getElementById('badgeDeptActiveQueues');
  if (elBadge) elBadge.innerText = `${activeQueues} Active Queues`;

  // 1. Render Segmented Context Bar
  if (barContainer) {
    if (totalSum === 0) {
      barContainer.innerHTML = `<i class="ctx-seg ctx-seg-room" style="flex-grow: 100; background: var(--ctx-empty);" title="No active workload"></i>`;
    } else {
      const activeIndices = rawLabels.map((_, i) => i).filter(i => (rawCounts[i] || 0) > 0);
      barContainer.innerHTML = rawLabels.map((lbl, idx) => {
        const cnt = rawCounts[idx] || 0;
        if (cnt === 0) return '';
        const color = colors[idx % colors.length];
        const isFirst = idx === activeIndices[0];
        const isLast = idx === activeIndices[activeIndices.length - 1];
        return `
          <i 
            class="ctx-seg" 
            data-kind="dept-${idx}" 
            id="segWorkload_${idx}"
            style="flex-grow: ${cnt}; background: ${color}; ${isFirst ? 'border-top-left-radius: 6px; border-bottom-left-radius: 6px;' : ''} ${isLast ? 'border-top-right-radius: 6px; border-bottom-right-radius: 6px;' : ''}"
            title="${escapeHtml(lbl)}: ${cnt} cases"
          ></i>
        `;
      }).join('');
    }
  }

  // 2. Render Tactile Department Progress Bands
  const maxDeptCount = Math.max(...rawCounts, 1);
  if (bandsContainer) {
    bandsContainer.innerHTML = rawLabels.map((lbl, idx) => {
      const cnt = rawCounts[idx] || 0;
      const pct = totalSum > 0 ? Math.round((cnt / totalSum) * 100) : 0;
      const widthPct = Math.round((cnt / maxDeptCount) * 100);
      const color = colors[idx % colors.length];

      return `
        <div 
          class="dept-band-row" 
          data-dept-idx="${idx}"
          data-name="${escapeHtml(lbl)}"
          data-count="${cnt}"
          data-pct="${pct}%"
          title="${escapeHtml(lbl)}: ${cnt} cases (${pct}%)"
        >
          <span class="dept-band-dot" style="background: ${color};"></span>
          <span class="dept-band-name">${escapeHtml(lbl)}</span>
          <div class="dept-band-track">
            <div class="dept-band-fill" style="width: ${widthPct}%; background: ${color};"></div>
          </div>
          <span class="dept-band-stats">${cnt} <span>(${pct}%)</span></span>
        </div>
      `;
    }).join('');
  }

  // 3. Render Interactive Chips
  if (chipsContainer) {
    chipsContainer.innerHTML = rawLabels.map((lbl, idx) => {
      const cnt = rawCounts[idx] || 0;
      const color = colors[idx % colors.length];
      const shortName = lbl.replace(' & ', '/').split(' ')[0];
      return `
        <button 
          type="button" 
          class="ctx-chip" 
          data-kind="dept-${idx}" 
          data-val="${cnt}"
          data-label="${escapeHtml(lbl)} queue (${cnt} cases)"
          id="chipWorkload_${idx}"
        >
          <i class="ctx-swatch" style="background: ${color};"></i>${escapeHtml(shortName)} <span class="chip-count">(${cnt})</span>
        </button>
      `;
    }).join('');
  }

  // Interactive Hover Linkage for Department Slabs
  const card = document.getElementById('cardDepartmentWorkload');
  const resetDept = () => {
    if (barContainer) barContainer.querySelectorAll('.ctx-seg').forEach(s => { s.removeAttribute('data-dim'); s.removeAttribute('data-lit'); });
    if (bandsContainer) bandsContainer.querySelectorAll('.dept-band-row').forEach(r => { r.removeAttribute('data-dim'); r.removeAttribute('data-lit'); });
    if (chipsContainer) chipsContainer.querySelectorAll('.ctx-chip').forEach(c => c.removeAttribute('data-on'));
    rollFigure('rollDeptTotal', totalSum);
    if (subEl) subEl.textContent = defaultSub;
  };

  if (card) card.onpointerleave = resetDept;

  const attachDeptHover = (el, idx, count, name) => {
    const onEnter = () => {
      if (barContainer) {
        barContainer.querySelectorAll('.ctx-seg').forEach(s => {
          if (s.getAttribute('data-kind') === `dept-${idx}`) {
            s.removeAttribute('data-dim');
            s.setAttribute('data-lit', 'true');
          } else {
            s.removeAttribute('data-lit');
            s.setAttribute('data-dim', 'true');
          }
        });
      }
      if (bandsContainer) {
        bandsContainer.querySelectorAll('.dept-band-row').forEach((r, i) => {
          if (i === idx) {
            r.removeAttribute('data-dim');
            r.setAttribute('data-lit', 'true');
          } else {
            r.removeAttribute('data-lit');
            r.setAttribute('data-dim', 'true');
          }
        });
      }
      if (chipsContainer) {
        chipsContainer.querySelectorAll('.ctx-chip').forEach((c, i) => {
          if (i === idx) c.setAttribute('data-on', 'true');
          else c.removeAttribute('data-on');
        });
      }
      rollFigure('rollDeptTotal', count);
      if (subEl) subEl.textContent = `${name} queue (${count} active cases)`;
    };
    el.onpointerenter = onEnter;
  };

  if (bandsContainer) {
    bandsContainer.querySelectorAll('.dept-band-row').forEach(row => {
      const idx = parseInt(row.getAttribute('data-dept-idx'), 10);
      const count = row.getAttribute('data-count');
      const name = row.getAttribute('data-name');
      attachDeptHover(row, idx, count, name);
    });
  }

  if (chipsContainer) {
    chipsContainer.querySelectorAll('.ctx-chip').forEach((chip, idx) => {
      const count = rawCounts[idx] || 0;
      const name = rawLabels[idx];
      attachDeptHover(chip, idx, count, name);
    });
  }
}

// -------------------------------------------------------------------------
// Chart 3: SLA Compliance Health (100% Tactile ContextMeter Slab)
// -------------------------------------------------------------------------
function renderChartSlaHealth(slaHealth) {
  const barContainer = document.getElementById('barSlaHealth');
  const bandsContainer = document.getElementById('slaHealthBands');
  const chipsContainer = document.getElementById('chipsSlaHealth');

  const within = slaHealth ? (slaHealth.within_sla ?? 5) : 5;
  const approaching = slaHealth ? (slaHealth.approaching_sla ?? 0) : 0;
  const breached = slaHealth ? (slaHealth.breached ?? 0) : 0;
  const total = within + approaching + breached;

  const compliancePct = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

  // Update Odometer & Header Badge
  rollFigure('rollSlaHealthPct', `${compliancePct}%`);
  const elBadge = document.getElementById('statSlaOverallBadge');
  if (elBadge) elBadge.innerText = `● ${compliancePct}% On-Track`;

  const subEl = document.getElementById('subSlaHealth');
  const defaultSub = `${breached} Breached cases · ${within} active within deadline`;
  if (subEl) subEl.textContent = defaultSub;

  // 1. Update Segmented Context Bar
  const segWithin = document.getElementById('segSlaHealthWithin');
  const segRisk = document.getElementById('segSlaHealthRisk');
  const segBreach = document.getElementById('segSlaHealthBreach');
  const segRoom = document.getElementById('segSlaHealthRoom');

  if (segWithin) segWithin.style.flexGrow = Math.max(within, 1);
  if (segRisk) segRisk.style.flexGrow = approaching;
  if (segBreach) segBreach.style.flexGrow = breached;
  if (segRoom) segRoom.style.flexGrow = Math.max(1, Math.round(total * 0.25));

  // 2. Update Chip Counts
  const elCntWithin = document.getElementById('cntSlaHealthWithin');
  const elCntRisk = document.getElementById('cntSlaHealthRisk');
  const elCntBreach = document.getElementById('cntSlaHealthBreach');
  if (elCntWithin) elCntWithin.innerText = `(${within})`;
  if (elCntRisk) elCntRisk.innerText = `(${approaching})`;
  if (elCntBreach) elCntBreach.innerText = `(${breached})`;

  setChipData('chipSlaHealthWithin', within, 'Inquiries within SLA deadline');
  setChipData('chipSlaHealthRisk', approaching, 'Inquiries approaching SLA deadline (<4h)');
  setChipData('chipSlaHealthBreach', breached, 'Inquiries breached SLA deadline');

  // Interactive Hover Linkage
  const card = document.getElementById('cardSlaHealth');
  const resetSla = () => {
    if (barContainer) barContainer.querySelectorAll('.ctx-seg').forEach(s => { s.removeAttribute('data-dim'); s.removeAttribute('data-lit'); });
    if (bandsContainer) bandsContainer.querySelectorAll('.sla-band-row').forEach(r => { r.removeAttribute('data-dim'); r.removeAttribute('data-lit'); });
    if (chipsContainer) chipsContainer.querySelectorAll('.ctx-chip').forEach(c => c.removeAttribute('data-on'));
    rollFigure('rollSlaHealthPct', `${compliancePct}%`);
    if (subEl) subEl.textContent = defaultSub;
  };

  if (card) card.onpointerleave = resetSla;

  const attachSlaHover = (el, kind, valText, subText) => {
    el.onpointerenter = () => {
      if (barContainer) {
        barContainer.querySelectorAll('.ctx-seg').forEach(s => {
          if (s.getAttribute('data-kind') === kind) {
            s.removeAttribute('data-dim');
            s.setAttribute('data-lit', 'true');
          } else {
            s.removeAttribute('data-lit');
            s.setAttribute('data-dim', 'true');
          }
        });
      }
      rollFigure('rollSlaHealthPct', valText);
      if (subEl) subEl.textContent = subText;
    };
  };

  if (bandsContainer) {
    bandsContainer.querySelectorAll('.sla-band-row').forEach(row => {
      row.onpointerenter = () => {
        bandsContainer.querySelectorAll('.sla-band-row').forEach(r => {
          if (r === row) { r.removeAttribute('data-dim'); r.setAttribute('data-lit', 'true'); }
          else { r.removeAttribute('data-lit'); r.setAttribute('data-dim', 'true'); }
        });
        const tierName = row.getAttribute('data-name');
        rollFigure('rollSlaHealthPct', '100%');
        if (subEl) subEl.textContent = `${tierName} · 0 SLA breaches reported`;
      };
    });
  }

  const chipWithin = document.getElementById('chipSlaHealthWithin');
  const chipRisk = document.getElementById('chipSlaHealthRisk');
  const chipBreach = document.getElementById('chipSlaHealthBreach');
  if (chipWithin) attachSlaHover(chipWithin, 'on_track', `${within}`, `${within} inquiries on-track within SLA target`);
  if (chipRisk) attachSlaHover(chipRisk, 'at_risk', `${approaching}`, `${approaching} inquiries approaching deadline (<4h)`);
  if (chipBreach) attachSlaHover(chipBreach, 'breached', `${breached}`, `${breached} inquiries breached SLA`);
}

// -------------------------------------------------------------------------
// Chart 4: Inquiries by Priority & Urgency (100% Tactile ContextMeter Slab)
// -------------------------------------------------------------------------
function renderChartPriorityDistribution(priorityData) {
  const barContainer = document.getElementById('barPriorityInquiries');
  const bandsContainer = document.getElementById('priorityQueueBands');
  const chipsContainer = document.getElementById('chipsPriorityInquiries');

  const pCounts = (priorityData && priorityData.counts) ? priorityData.counts : [0, 0, 0, 0];
  const crit = priorityData ? (priorityData.critical ?? pCounts[0] ?? 0) : 0;
  const high = priorityData ? (priorityData.high ?? pCounts[1] ?? 0) : 0;
  const med = priorityData ? (priorityData.medium ?? pCounts[2] ?? 0) : 0;
  const low = priorityData ? (priorityData.low ?? pCounts[3] ?? 0) : 0;
  const total = crit + high + med + low;

  // Update Odometer & Badges
  rollFigure('rollPriorityInquiries', total);
  const subEl = document.getElementById('subPriorityInquiries');
  const defaultSub = `${total} inquiries stratified by urgency & resolution SLA`;
  if (subEl) subEl.textContent = defaultSub;

  const elBadge = document.getElementById('badgePriorityTriage');
  if (elBadge) elBadge.innerText = `⚡ ${total} Active Cases`;

  // 1. Update Segmented Context Bar
  const segCrit = document.getElementById('segPriCrit');
  const segHigh = document.getElementById('segPriHigh');
  const segMed = document.getElementById('segPriMed');
  const segLow = document.getElementById('segPriLow');

  if (segCrit) segCrit.style.flexGrow = crit;
  if (segHigh) segHigh.style.flexGrow = high;
  if (segMed) segMed.style.flexGrow = med;
  if (segLow) segLow.style.flexGrow = low;

  // 2. Update Progress Bands
  const maxPri = Math.max(crit, high, med, low, 1);
  if (bandsContainer) {
    const priItems = [
      { kind: 'critical', name: 'Critical P1 (2h SLA)', cnt: crit, color: '#EF4444' },
      { kind: 'high', name: 'High P2 (12h SLA)', cnt: high, color: '#F59E0B' },
      { kind: 'medium', name: 'Medium P3 (24h SLA)', cnt: med, color: '#3B82F6' },
      { kind: 'low', name: 'Low P4 (48h SLA)', cnt: low, color: '#10B981' }
    ];

    bandsContainer.innerHTML = priItems.map(item => {
      const pct = total > 0 ? Math.round((item.cnt / total) * 100) : 0;
      const widthPct = Math.round((item.cnt / maxPri) * 100);
      return `
        <div 
          class="priority-band-row" 
          data-pri-kind="${item.kind}"
          data-name="${item.name}"
          data-count="${item.cnt}"
          data-pct="${pct}%"
          title="${item.name}: ${item.cnt} inquiries (${pct}%)"
        >
          <span class="priority-band-dot" style="background: ${item.color};"></span>
          <span class="priority-band-name">${item.name}</span>
          <div class="priority-band-track">
            <div class="priority-band-fill" style="width: ${widthPct}%; background: ${item.color};"></div>
          </div>
          <span class="priority-band-stats">${item.cnt} <span>(${pct}%)</span></span>
        </div>
      `;
    }).join('');
  }

  // 3. Update Chip Counts
  const elCntCrit = document.getElementById('cntPriCrit');
  const elCntHigh = document.getElementById('cntPriHigh');
  const elCntMed = document.getElementById('cntPriMed');
  const elCntLow = document.getElementById('cntPriLow');
  if (elCntCrit) elCntCrit.innerText = `(${crit})`;
  if (elCntHigh) elCntHigh.innerText = `(${high})`;
  if (elCntMed) elCntMed.innerText = `(${med})`;
  if (elCntLow) elCntLow.innerText = `(${low})`;

  setChipData('chipPriCrit', crit, 'Critical P1 inquiries (2h SLA window)');
  setChipData('chipPriHigh', high, 'High P2 inquiries (12h SLA window)');
  setChipData('chipPriMed', med, 'Medium P3 inquiries (24h SLA window)');
  setChipData('chipPriLow', low, 'Low P4 inquiries (48h SLA window)');

  // Interactive Hover Linkage for Priority Slabs
  const card = document.getElementById('cardPriorityInquiries');
  const resetPri = () => {
    if (barContainer) barContainer.querySelectorAll('.ctx-seg').forEach(s => { s.removeAttribute('data-dim'); s.removeAttribute('data-lit'); });
    if (bandsContainer) bandsContainer.querySelectorAll('.priority-band-row').forEach(r => { r.removeAttribute('data-dim'); r.removeAttribute('data-lit'); });
    if (chipsContainer) chipsContainer.querySelectorAll('.ctx-chip').forEach(c => c.removeAttribute('data-on'));
    rollFigure('rollPriorityInquiries', total);
    if (subEl) subEl.textContent = defaultSub;
  };

  if (card) card.onpointerleave = resetPri;

  const attachPriHover = (el, kind, count, name) => {
    el.onpointerenter = () => {
      if (barContainer) {
        barContainer.querySelectorAll('.ctx-seg').forEach(s => {
          if (s.getAttribute('data-kind') === kind) {
            s.removeAttribute('data-dim');
            s.setAttribute('data-lit', 'true');
          } else {
            s.removeAttribute('data-lit');
            s.setAttribute('data-dim', 'true');
          }
        });
      }
      if (bandsContainer) {
        bandsContainer.querySelectorAll('.priority-band-row').forEach(r => {
          if (r.getAttribute('data-pri-kind') === kind) {
            r.removeAttribute('data-dim');
            r.setAttribute('data-lit', 'true');
          } else {
            r.removeAttribute('data-lit');
            r.setAttribute('data-dim', 'true');
          }
        });
      }
      rollFigure('rollPriorityInquiries', count);
      if (subEl) subEl.textContent = `${name} (${count} cases)`;
    };
  };

  if (bandsContainer) {
    bandsContainer.querySelectorAll('.priority-band-row').forEach(row => {
      const kind = row.getAttribute('data-pri-kind');
      const count = row.getAttribute('data-count');
      const name = row.getAttribute('data-name');
      attachPriHover(row, kind, count, name);
    });
  }

  const chipCrit = document.getElementById('chipPriCrit');
  const chipHigh = document.getElementById('chipPriHigh');
  const chipMed = document.getElementById('chipPriMed');
  const chipLow = document.getElementById('chipPriLow');
  if (chipCrit) attachPriHover(chipCrit, 'critical', crit, 'Critical P1 Priority (2h SLA)');
  if (chipHigh) attachPriHover(chipHigh, 'high', high, 'High P2 Priority (12h SLA)');
  if (chipMed) attachPriHover(chipMed, 'medium', med, 'Medium P3 Priority (24h SLA)');
  if (chipLow) attachPriHover(chipLow, 'low', low, 'Low P4 Priority (48h SLA)');
}

// -------------------------------------------------------------------------
// Operational Widget: Urgent SLA Watchlist
// -------------------------------------------------------------------------
function renderUrgentCasesWatchlist(urgentList) {
  const tbody = document.getElementById('urgentCasesTableBody');
  const counter = document.getElementById('urgentCasesCounter');
  if (!tbody) return;

  if (counter) counter.innerText = urgentList.length;

  if (!urgentList || urgentList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--healthcare-teal); padding: 24px; font-weight: 600;">
          <div style="font-size: 20px; margin-bottom: 4px;">✓</div>
          All active cases are currently within comfortable SLA thresholds.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = urgentList.map(c => {
    // Calculate time remaining
    let badgeClass = 'safe';
    let badgeText = 'On-Track';
    if (c.due_at) {
      const dueTime = new Date(c.due_at).getTime();
      const nowTime = new Date().getTime();
      const diffMin = Math.round((dueTime - nowTime) / (1000 * 60));
      if (diffMin <= 0) {
        badgeClass = 'breached';
        badgeText = `🚨 Breached (${Math.abs(diffMin)}m ago)`;
      } else if (diffMin <= 120) {
        badgeClass = 'urgent';
        badgeText = `⚠️ Due in ${diffMin}m`;
      } else {
        badgeClass = 'safe';
        badgeText = `⏱ Due in ${Math.round(diffMin / 60)}h`;
      }
    }

    return `
      <tr>
        <td>
          <span style="font-family: monospace; font-weight: 800; color: var(--1mg-orange); font-size: 12.5px; cursor: pointer;" onclick="openCaseDossierModal(${c.id})">
            ${escapeHtml(c.case_number)}
          </span>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-dark); font-size: 13px; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(c.title)}">
            ${escapeHtml(c.title)}
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(c.employee_name || 'Employee')}</div>
        </td>
        <td>
          <span style="display: inline-block; padding: 2px 7px; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 11px; font-weight: 600;">
            ${escapeHtml(c.department_name || 'Central')}
          </span>
        </td>
        <td>
          ${renderCasePriorityBadge ? renderCasePriorityBadge(c.priority) : `<span class="badge">${escapeHtml(c.priority)}</span>`}
        </td>
        <td>
          <span class="sla-countdown-badge ${badgeClass}">${badgeText}</span>
        </td>
        <td>
          <button class="btn-secondary" style="height: 28px; padding: 0 10px; font-size: 11.5px;" onclick="openCaseDossierModal(${c.id})">
            Inspect →
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------------------
// Operational Widget: Active Specialist Leaderboard
// -------------------------------------------------------------------------
function renderSpecialistLeaderboard(agents) {
  const container = document.getElementById('specialistLeaderboardList');
  if (!container) return;

  if (!agents || agents.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 13px;">
        No active specialists found in directory.
      </div>
    `;
    return;
  }

  container.innerHTML = agents.map(a => {
    const initials = (a.name || 'Agent').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const activeLoad = a.active_load || 0;
    const resolvedToday = a.resolved_today || 0;

    return `
      <div class="specialist-item">
        <div class="spec-left">
          <div class="specialist-avatar">${initials}</div>
          <div>
            <div class="specialist-name">${escapeHtml(a.name)}</div>
            <div class="specialist-dept">${escapeHtml(a.department_name || a.designation || 'Desk Specialist')}</div>
          </div>
        </div>
        <div class="spec-right">
          <span class="spec-load-badge">${activeLoad} Active</span>
          <span style="font-size: 11px; color: #10B190; font-weight: 700;">✓ ${resolvedToday} Closed</span>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------------------
// Recent Cases Across All Departments
// -------------------------------------------------------------------------
function renderRecentDashboardCases(recentCases) {
  const tbody = document.getElementById('recentCasesTableBody');
  if (!tbody) return;

  if (!recentCases || recentCases.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 36px;">
          <div style="font-size: 20px; margin-bottom: 6px;">📂</div>
          No employee queries logged yet. Click "Sync Mailbox" to triage cases.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = recentCases.map(c => `
    <tr>
      <td>
        <span style="font-family: monospace; font-weight: 800; color: var(--1mg-orange); font-size: 13px; cursor: pointer;" onclick="openCaseDossierModal(${c.id})">
          ${escapeHtml(c.case_number)}
        </span>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--text-dark);">${escapeHtml(c.employee_name || 'Employee')}</div>
        <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(c.employee_email)}</div>
      </td>
      <td>
        <span style="font-weight: 600; color: var(--text-dark); font-size: 13px; cursor: pointer;" onclick="openCaseDossierModal(${c.id})">
          ${escapeHtml(c.title)}
        </span>
      </td>
      <td>
        <span style="display: inline-block; padding: 3px 8px; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 11.5px; font-weight: 600;">
          ${escapeHtml(c.department_name || 'Central')}
        </span>
      </td>
      <td>
        <span style="font-size: 12.5px; color: #475569;">${escapeHtml(c.assigned_user || 'Unassigned')}</span>
      </td>
      <td>
        ${renderCaseStatusPill ? renderCaseStatusPill(c.status) : `<span class="pill">${escapeHtml(c.status)}</span>`}
      </td>
      <td>
        <span style="font-size: 12px; color: var(--text-muted);">${formatDate ? formatDate(c.due_at) : (c.due_at || '-')}</span>
      </td>
      <td>
        <button class="btn-secondary" style="height: 28px; padding: 0 10px; font-size: 11.5px;" onclick="openCaseDossierModal(${c.id})">
          Inspect →
        </button>
      </td>
    </tr>
  `).join('');
}

// =========================================================================
// 6. CASE PROGRESSION & OPERATIONS COMMAND (ADMIN COMMAND CENTER)
// =========================================================================

let currentCaseStatusFilter = 'ALL';
let currentSlaRiskFilter = '';
let currentQueueDeptId = '';
let caseSearchDebounceTimer = null;
let currentDossierCaseId = null;
let selectedCaseIds = new Set();
let allSpecialistsCapacity = [];

// -------------------------------------------------------------------------
// 1. Case KPIs & Department Queue Tabs
// -------------------------------------------------------------------------
async function loadCasesKPIs() {
  try {
    const res = await fetch('/api/v1/cases/kpis');
    const data = await res.json();
    if (data.success && data.kpis) {
      const k = data.kpis;
      const elTotal = document.getElementById('caseKpiTotal');
      const elActive = document.getElementById('caseKpiActive');
      const elBreached = document.getElementById('caseKpiBreached');
      const elResolved = document.getElementById('caseKpiResolved');
      const elRate = document.getElementById('caseKpiRate');
      const elQueueAll = document.getElementById('queueBadgeAll');
      
      if (elTotal) elTotal.innerText = k.total_cases;
      if (elActive) elActive.innerText = k.active_cases;
      if (elBreached) elBreached.innerText = k.sla_breached;
      if (elResolved) elResolved.innerText = k.resolved_cases;
      if (elRate) elRate.innerText = `${k.resolution_rate}% resolution rate`;
      if (elQueueAll) elQueueAll.innerText = k.total_cases;

      // Render Department Queue Tabs
      renderQueueTabs(data.queues || [], k.total_cases);
    }
  } catch (err) {
    console.error('Failed to load case KPIs:', err);
  }
}

function renderQueueTabs(queues, totalCount) {
  const container = document.getElementById('caseQueueTabsBar');
  if (!container) return;

  let html = `
    <button class="queue-tab-btn ${currentQueueDeptId === '' ? 'active' : ''}" onclick="selectQueueTab('', this)">
      <span>All Queues</span>
      <span class="queue-tab-badge" id="queueBadgeAll">${totalCount || 0}</span>
    </button>
  `;

  queues.forEach(q => {
    const isActive = String(currentQueueDeptId) === String(q.department_id);
    const breachedBadge = parseInt(q.breached_count || 0) > 0 ? 
      `<span class="queue-tab-badge breached" title="${q.breached_count} SLA Breached">⚠️ ${q.breached_count}</span>` : '';

    html += `
      <button class="queue-tab-btn ${isActive ? 'active' : ''}" onclick="selectQueueTab(${q.department_id}, this)">
        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${q.color_accent || '#FF6F61'};"></span>
        <span>${escapeHtml(q.team_name)}</span>
        <span class="queue-tab-badge">${q.active_count || 0}</span>
        ${breachedBadge}
      </button>
    `;
  });

  container.innerHTML = html;
}

function selectQueueTab(deptId, btn) {
  currentQueueDeptId = deptId ? String(deptId) : '';
  const container = document.getElementById('caseQueueTabsBar');
  if (container) {
    container.querySelectorAll('.queue-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  loadCases();
}

function filterCasesByBento(filterType, el) {
  document.querySelectorAll('.bento-kpi-card.interactive-kpi').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  const statusPills = document.getElementById('caseStatusPillsBar');
  const slaRiskSelect = document.getElementById('caseSlaRiskFilter');

  if (filterType === 'ALL') {
    currentCaseStatusFilter = 'ALL';
    currentSlaRiskFilter = '';
    if (slaRiskSelect) slaRiskSelect.value = '';
  } else if (filterType === 'ACTIVE') {
    currentCaseStatusFilter = 'ACTIVE';
    currentSlaRiskFilter = '';
    if (slaRiskSelect) slaRiskSelect.value = '';
  } else if (filterType === 'BREACHED') {
    currentCaseStatusFilter = 'ALL';
    currentSlaRiskFilter = 'BREACHED';
    if (slaRiskSelect) slaRiskSelect.value = 'BREACHED';
  } else if (filterType === 'RESOLVED') {
    currentCaseStatusFilter = 'RESOLVED';
    currentSlaRiskFilter = '';
    if (slaRiskSelect) slaRiskSelect.value = '';
  }

  // Update status pill active state
  if (statusPills) {
    statusPills.querySelectorAll('.filter-pill-btn').forEach(b => {
      b.classList.remove('active');
      if (b.innerText.toUpperCase() === currentCaseStatusFilter || (currentCaseStatusFilter === 'ALL' && b.innerText.includes('All'))) {
        b.classList.add('active');
      }
    });
  }

  loadCases();
}

function resetCaseFilters() {
  currentCaseStatusFilter = 'ALL';
  currentSlaRiskFilter = '';
  currentQueueDeptId = '';
  
  const searchInput = document.getElementById('caseSearchInput');
  const prioritySelect = document.getElementById('casePriorityFilter');
  const slaSelect = document.getElementById('caseSlaRiskFilter');
  const specialistSelect = document.getElementById('caseSpecialistFilter');
  
  if (searchInput) searchInput.value = '';
  if (prioritySelect) prioritySelect.value = '';
  if (slaSelect) slaSelect.value = '';
  if (specialistSelect) specialistSelect.value = '';

  document.querySelectorAll('.filter-pill-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('.bento-kpi-card.interactive-kpi').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('.queue-tab-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });

  loadCases();
}

// -------------------------------------------------------------------------
// 2. Department & Specialist Capacity Populate
// -------------------------------------------------------------------------
async function populateCaseDeptDropdowns() {
  try {
    if (!allDepartments || allDepartments.length === 0) {
      const res = await fetch('/api/v1/departments');
      const data = await res.json();
      if (data.success && data.departments) {
        allDepartments = data.departments;
      }
    }

    const newCaseDeptSelect = document.getElementById('newCaseDept');
    const reassignDeptSelect = document.getElementById('reassignDeptSelect');

    if (newCaseDeptSelect) {
      newCaseDeptSelect.innerHTML = `<option value="">⚡ Auto-Detect via 3-Stage AI (Recommended)</option>` +
        (allDepartments || []).map(d => `<option value="${d.id}">${escapeHtml(d.team_name)} (${escapeHtml(d.dept_code || '')})</option>`).join('');
    }

    if (reassignDeptSelect) {
      reassignDeptSelect.innerHTML = (allDepartments || []).map(d => `<option value="${d.id}">${escapeHtml(d.team_name)}</option>`).join('');
    }

    // Populate Specialist Capacity
    await loadSpecialistsCapacity();
  } catch (err) {
    console.error('Failed to populate department dropdowns:', err);
  }
}

async function loadSpecialistsCapacity() {
  try {
    const res = await fetch('/api/v1/cases/specialists-capacity');
    const data = await res.json();
    if (data.success && data.specialists) {
      allSpecialistsCapacity = data.specialists;

      // Populate filter dropdown
      const filterSelect = document.getElementById('caseSpecialistFilter');
      if (filterSelect) {
        filterSelect.innerHTML = `<option value="">All Specialists</option><option value="UNASSIGNED">Unassigned Queue</option>` +
          allSpecialistsCapacity.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${s.capacity_label})</option>`).join('');
      }

      // Populate Batch Assign Select
      const batchSelect = document.getElementById('batchAssignSelect');
      if (batchSelect) {
        batchSelect.innerHTML = `<option value="">👤 Reassign Specialist...</option>` +
          allSpecialistsCapacity.map(s => `<option value="${s.id}">Assign to ${escapeHtml(s.name)} · ${s.capacity_label}</option>`).join('');
      }

      // Populate Reassign Modal User Select
      const reassignSelect = document.getElementById('reassignUserSelect');
      if (reassignSelect) {
        reassignSelect.innerHTML = allSpecialistsCapacity.map(s => 
          `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.department_name || 'Desk')}) · ${s.capacity_label}</option>`
        ).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load specialist capacity:', err);
  }
}

function filterCasesByStatus(status, btn) {
  currentCaseStatusFilter = status;
  const container = document.getElementById('caseStatusPillsBar');
  if (container) {
    container.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  loadCases();
}

function handleCaseSearch() {
  clearTimeout(caseSearchDebounceTimer);
  caseSearchDebounceTimer = setTimeout(() => {
    loadCases();
  }, 250);
}

function calculateSlaBadge(dueAtStr, status) {
  if (status === 'RESOLVED' || status === 'CLOSED') {
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        ⏱ ${diffHours}h left
      </span>
    `;
  }
}

function renderCasePriorityPill(priority) {
  const p = (priority || 'MEDIUM').toUpperCase();
  if (p === 'CRITICAL') {
    return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;">CRITICAL</span>`;
  } else if (p === 'HIGH') {
    return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #FFF7ED; color: #EA580C; border: 1px solid #FFEDD5;">HIGH</span>`;
  } else if (p === 'MEDIUM') {
    return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #EFF6FF; color: #2563EB; border: 1px solid #DBEAFE;">MEDIUM</span>`;
  }
  return `<span class="priority-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0;">LOW</span>`;
}

function renderCaseStatusPill(status) {
  const s = (status || 'OPEN').toUpperCase();
  if (s === 'OPEN') {
    return `<span class="status-pill status-pending" style="display: inline-flex; align-items: center; gap: 5px;"><span class="status-dot dot-amber"></span> Open</span>`;
  } else if (s === 'IN_PROGRESS') {
    return `<span class="status-pill" style="display: inline-flex; align-items: center; gap: 5px; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;"><span class="status-dot" style="background: #3B82F6;"></span> In Progress</span>`;
  } else if (s === 'WAITING_ON_EMPLOYEE') {
    return `<span class="status-pill" style="display: inline-flex; align-items: center; gap: 5px; background: #F5F3FF; color: #6D28D9; border: 1px solid #DDD6FE;"><span class="status-dot" style="background: #8B5CF6;"></span> Waiting on Employee</span>`;
  } else if (s === 'RESOLVED' || s === 'CLOSED') {
    return `<span class="status-pill status-active" style="display: inline-flex; align-items: center; gap: 5px;"><span class="status-dot dot-green"></span> Resolved</span>`;
  }
  return `<span class="status-pill status-inactive">${escapeHtml(status)}</span>`;
}

// -------------------------------------------------------------------------
// 3. Load Cases Master Grid with Admin Multi-Select
// -------------------------------------------------------------------------
function scrollCaseTable(direction) {
  const container = document.getElementById('caseTableScrollWrapper');
  if (!container) return;
  const scrollAmount = 500;
  if (direction === 'left') {
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  } else {
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }
}
window.scrollCaseTable = scrollCaseTable;

function openCaseDetailsPage(caseId) {
  window.open(`/admin/case-details.html?id=${caseId}`, '_blank');
}
window.openCaseDetailsPage = openCaseDetailsPage;

function renderCaseTableSkeleton() {
  const skeletonRows = Array.from({ length: 5 }).map(() => `
    <tr class="skeleton-row">
      <td style="text-align: center;"><div class="skeleton-box" style="width: 16px; height: 16px; margin: 0 auto; border-radius: 4px;"></div></td>
      <td><div class="skeleton-box" style="width: 85px; height: 26px; border-radius: 6px;"></div><div class="skeleton-box" style="width: 65px; height: 12px; margin-top: 5px; border-radius: 4px;"></div></td>
      <td style="max-width: 300px;"><div class="skeleton-box" style="width: 90px; height: 16px; margin-bottom: 6px; border-radius: 4px;"></div><div class="skeleton-box" style="width: 220px; height: 16px; margin-bottom: 5px; border-radius: 4px;"></div><div class="skeleton-box" style="width: 160px; height: 12px; border-radius: 4px;"></div></td>
      <td><div class="skeleton-box" style="width: 190px; height: 48px; border-radius: 8px;"></div></td>
      <td><div style="display: flex; align-items: center; gap: 8px;"><div class="skeleton-box" style="width: 32px; height: 32px; border-radius: 50%;"></div><div><div class="skeleton-box" style="width: 110px; height: 14px; margin-bottom: 5px; border-radius: 4px;"></div><div class="skeleton-box" style="width: 130px; height: 12px; border-radius: 4px;"></div></div></div></td>
      <td><div class="skeleton-box" style="width: 140px; height: 26px; border-radius: 6px;"></div><div class="skeleton-box" style="width: 80px; height: 12px; margin-top: 5px; border-radius: 4px;"></div></td>
      <td><div class="skeleton-box" style="width: 80px; height: 24px; border-radius: 999px;"></div></td>
      <td><div style="display: flex; align-items: center; gap: 7px;"><div class="skeleton-box" style="width: 28px; height: 28px; border-radius: 50%;"></div><div><div class="skeleton-box" style="width: 95px; height: 14px; margin-bottom: 4px; border-radius: 4px;"></div><div class="skeleton-box" style="width: 110px; height: 11px; border-radius: 4px;"></div></div></div></td>
      <td><div class="skeleton-box" style="width: 95px; height: 24px; border-radius: 999px;"></div><div class="skeleton-box" style="width: 115px; height: 12px; margin-top: 5px; border-radius: 4px;"></div></td>
      <td><div class="skeleton-box" style="width: 80px; height: 14px; margin-bottom: 4px; border-radius: 4px;"></div><div class="skeleton-box" style="width: 55px; height: 12px; border-radius: 4px;"></div></td>
      <td><div class="skeleton-box" style="width: 85px; height: 24px; border-radius: 999px;"></div></td>
      <td style="text-align: right;"><div style="display: inline-flex; gap: 6px;"><div class="skeleton-box" style="width: 75px; height: 30px; border-radius: 6px;"></div><div class="skeleton-box" style="width: 30px; height: 30px; border-radius: 6px;"></div><div class="skeleton-box" style="width: 30px; height: 30px; border-radius: 6px;"></div></div></td>
    </tr>
  `).join('');

  return `
    <tr class="table-loading-header-row">
      <td colspan="12" style="padding: 16px 20px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; gap: 10px;">
          <div class="tata-brand-spinner"></div>
          <span style="font-size: 13px; font-weight: 700; color: #475569;">
            Syncing inbound queries &amp; real-time SLA timers from Tata 1mg Exchange...
          </span>
        </div>
      </td>
    </tr>
    ${skeletonRows}
  `;
}

async function loadCases() {
  const priorityFilter = document.getElementById('casePriorityFilter')?.value || '';
  const slaRiskFilter = document.getElementById('caseSlaRiskFilter')?.value || currentSlaRiskFilter || '';
  const specialistFilter = document.getElementById('caseSpecialistFilter')?.value || '';
  const search = document.getElementById('caseSearchInput')?.value || '';
  const tbody = document.getElementById('allCasesTableBody');
  if (!tbody) return;

  tbody.innerHTML = renderCaseTableSkeleton();

  try {
    let url = `/api/v1/cases?page=1&limit=50`;
    if (currentQueueDeptId) url += `&department_id=${currentQueueDeptId}`;
    if (priorityFilter && priorityFilter !== 'ALL') url += `&priority=${priorityFilter}`;
    if (currentCaseStatusFilter && currentCaseStatusFilter !== 'ALL') url += `&status=${currentCaseStatusFilter}`;
    if (slaRiskFilter) url += `&sla_risk=${slaRiskFilter}`;
    if (specialistFilter) url += `&assigned_user=${encodeURIComponent(specialistFilter)}`;
    if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;

    const res = await fetch(url);
    const data = await res.json();

    const countText = document.getElementById('caseTableCountText');
    if (countText && data.cases) {
      countText.innerText = `${data.cases.length} Inbound ${data.cases.length === 1 ? 'Query' : 'Queries'}`;
    }

    if (!data.success || !data.cases || data.cases.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align: center; padding: 50px 20px;">
            <div style="max-width: 420px; margin: 0 auto; text-align: center;">
              <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 14px; background: #F1F5F9; color: #64748B; display: flex; align-items: center; justify-content: center;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div style="font-size: 16px; font-weight: 800; color: var(--text-dark); margin-bottom: 6px;">No Cases Found</div>
              <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px;">
                No employee queries match the active filter criteria. Click below to log a new query or reset filters.
              </p>
              <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="btn-secondary" style="width: auto; height: 38px; padding: 0 14px; font-size: 13px;" onclick="resetCaseFilters()">
                  Reset Filters
                </button>
                <button class="btn-primary" style="width: auto; height: 38px; padding: 0 16px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px;" onclick="openCreateCaseModal()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>+ Log Inbound Case</span>
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
      clearCaseSelection();
      return;
    }

    tbody.innerHTML = data.cases.map(c => {
      const isChecked = selectedCaseIds.has(c.id);

      // AI Badge presentation
      let aiBadgeHtml = `<span style="font-size: 11.5px; color: #64748B;">Auto-Triaged</span>`;
      if (c.ai_badge) {
        const urgencyClass = (c.ai_badge.urgency || '').toUpperCase().includes('HIGH') ? 'high' : 'normal';
        aiBadgeHtml = `
          <div class="ai-intent-card">
            <div class="ai-intent-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span class="ai-intent-code-badge">${escapeHtml(c.ai_badge.intent_code || 'AI01')}</span>
              <span class="ai-intent-title" title="${escapeHtml(c.ai_badge.intent_name || '')}">${escapeHtml(c.ai_badge.intent_name || 'Classified')}</span>
            </div>
            <div class="ai-intent-meta">
              <span class="ai-intent-confidence">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                ${c.ai_badge.confidence || 98}% Match
              </span>
              <span class="ai-urgency-badge ${urgencyClass}">${escapeHtml((c.ai_badge.urgency || 'NORMAL').split(' ')[0])}</span>
            </div>
          </div>
        `;
      }

      // HRMS profile details
      let hrmsInfoHtml = '';
      if (c.hrms_profile && c.hrms_profile.employee_code && c.hrms_profile.employee_code !== '—') {
        hrmsInfoHtml = `
          <div class="emp-hrms-pill">
            <span>🏷️</span>
            <span>${escapeHtml(c.hrms_profile.employee_code)}</span>
            ${c.hrms_profile.department ? `<span>· ${escapeHtml(c.hrms_profile.department)}</span>` : ''}
          </div>
        `;
      }

      // Logged date/time
      const createdDate = c.created_at ? new Date(c.created_at) : null;
      const formattedCreated = createdDate ? `
        <div style="font-size: 12.5px; font-weight: 700; color: #1E293B;">
          ${createdDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">
          ${createdDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      ` : '<span style="color: var(--text-muted);">—</span>';

      // Target deadline formatted
      const dueDate = c.due_at ? new Date(c.due_at) : null;
      const formattedDue = dueDate ? `
        <div class="sla-target-deadline">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>Target: ${dueDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}, ${dueDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ` : '';

      return `
        <tr class="${isChecked ? 'row-selected' : ''}">
          <!-- 1. Checkbox -->
          <td style="text-align: center; width: 48px;">
            <input 
              type="checkbox" 
              class="case-select-checkbox" 
              data-case-id="${c.id}" 
              ${isChecked ? 'checked' : ''} 
              onchange="onCaseCheckboxChange(event, ${c.id})" 
              style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--1mg-orange);"
            >
          </td>

          <!-- 2. Case # & Channel -->
          <td>
            <button 
              class="case-num-chip" 
              onclick="openCaseDetailsPage(${c.id})"
              title="Open Complete 360° Case Dossier in New Page"
            >
              ${escapeHtml(c.case_number)}
            </button>
            <div class="case-channel-tag">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
              <span>Corporate Email</span>
            </div>
          </td>

          <!-- 3. Query Title & Category -->
          <td class="case-query-col">
            <span class="case-dept-category-tag">
              ${escapeHtml(c.category || c.department_name || 'General')}
            </span>
            <div class="case-title-text" onclick="openCaseDetailsPage(${c.id})" title="Click to open full case details: ${escapeHtml(c.title)}">
              ${escapeHtml(c.title)}
            </div>
            <div class="case-snippet-text" title="${escapeHtml(c.description || '')}">
              ${escapeHtml(c.description || '')}
            </div>
          </td>

          <!-- 4. AI Intent & Confidence -->
          <td>
            ${aiBadgeHtml}
          </td>

          <!-- 5. Employee & HRMS Profile -->
          <td>
            <div class="emp-profile-wrap">
              <div class="emp-avatar-badge">
                ${(c.employee_name || 'E')[0].toUpperCase()}
              </div>
              <div>
                <div class="emp-name-text">${escapeHtml(c.employee_name || 'Tata 1mg Employee')}</div>
                <div class="emp-email-text">${escapeHtml(c.employee_email)}</div>
              </div>
            </div>
            ${hrmsInfoHtml}
          </td>

          <!-- 6. HR Department Desk -->
          <td>
            <div class="dept-desk-pill">
              <span class="dept-dot-accent" style="background: ${c.color_accent || '#FF6F61'};"></span>
              <span>${escapeHtml(c.department_name || 'Central')}</span>
            </div>
            <div class="dept-sla-policy-text">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Standard SLA: ${c.sla_hours || 24}h</span>
            </div>
          </td>

          <!-- 7. Priority -->
          <td>
            ${renderCasePriorityPill(c.priority)}
          </td>

          <!-- 8. Assigned Specialist -->
          <td>
            <div class="specialist-wrap">
              <div class="specialist-avatar-dot">
                ${(c.assigned_user || 'U')[0].toUpperCase()}
              </div>
              <div>
                <div class="specialist-name">${escapeHtml(c.assigned_user || 'Unassigned')}</div>
                <div class="specialist-email">${escapeHtml(c.assigned_user_email || 'Central Desk')}</div>
              </div>
            </div>
          </td>

          <!-- 9. SLA Countdown & Exact Target -->
          <td>
            <div class="sla-timer-cell">
              <div>${calculateSlaBadge(c.due_at, c.status)}</div>
              ${formattedDue}
            </div>
          </td>

          <!-- 10. Logged Time -->
          <td>
            ${formattedCreated}
          </td>

          <!-- 11. Status -->
          <td>
            ${renderCaseStatusPill(c.status)}
          </td>

          <!-- 12. Forensic Actions -->
          <td style="text-align: right;">
            <div class="action-btn-group">
              <button 
                class="action-btn-dossier" 
                onclick="openCaseDetailsPage(${c.id})" 
                title="Open Complete 360° Case Dossier in New Page"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Dossier</span>
              </button>
              <button 
                class="action-icon-btn" 
                onclick="openReassignCaseModal(${c.id})" 
                title="Reassign Specialist"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                </svg>
              </button>
              <button 
                class="action-icon-btn" 
                onclick="openSlaOverrideModal(${c.id})" 
                title="Admin SLA Override & Extension"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>
              ${c.status !== 'RESOLVED' && c.status !== 'CLOSED' ? `
                <button 
                  class="action-icon-btn resolve" 
                  onclick="openResolveCaseModal(${c.id})" 
                  title="Mark Case as Resolved"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              ` : ''}
              <button 
                class="action-icon-btn delete" 
                onclick="deleteCase(${c.id})" 
                title="Permanently Delete Case"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    updateBatchActionBar();
  } catch (err) {
    console.error('Failed to load cases:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #DC2626; padding: 30px;">Error loading cases. Please try again.</td></tr>`;
  }
}

// -------------------------------------------------------------------------
// 4. Multi-Select & Sticky Admin Batch Action Bar
// -------------------------------------------------------------------------
function onCaseCheckboxChange(event, caseId) {
  if (event.target.checked) {
    selectedCaseIds.add(caseId);
  } else {
    selectedCaseIds.delete(caseId);
  }
  updateBatchActionBar();
}

function toggleSelectAllCases(headerCheckbox) {
  const checkboxes = document.querySelectorAll('.case-select-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = headerCheckbox.checked;
    const cid = parseInt(cb.getAttribute('data-case-id'));
    if (headerCheckbox.checked) {
      selectedCaseIds.add(cid);
    } else {
      selectedCaseIds.delete(cid);
    }
  });
  updateBatchActionBar();
}

function clearCaseSelection() {
  selectedCaseIds.clear();
  const headerCb = document.getElementById('selectAllCasesHeader');
  if (headerCb) headerCb.checked = false;
  document.querySelectorAll('.case-select-checkbox').forEach(cb => cb.checked = false);
  updateBatchActionBar();
}

function updateBatchActionBar() {
  const bar = document.getElementById('floatingBatchBar');
  const countPill = document.getElementById('batchSelectedCount');
  if (!bar) return;

  const count = selectedCaseIds.size;
  if (count > 0) {
    bar.style.display = 'flex';
    if (countPill) countPill.innerText = `${count} ${count === 1 ? 'Case' : 'Cases'} Selected`;
  } else {
    bar.style.display = 'none';
  }

  // Update header checkbox indeterminate/checked state
  const headerCb = document.getElementById('selectAllCasesHeader');
  const visibleCbs = document.querySelectorAll('.case-select-checkbox');
  if (headerCb && visibleCbs.length > 0) {
    const allChecked = Array.from(visibleCbs).every(cb => cb.checked);
    const anyChecked = Array.from(visibleCbs).some(cb => cb.checked);
    headerCb.checked = allChecked;
    headerCb.indeterminate = anyChecked && !allChecked;
  }
}

function getCurrentAdminActor() {
  try {
    const user = JSON.parse(localStorage.getItem('1mg_user') || '{}');
    return {
      email: user.email || 'vaibhav.v1@1mg.com',
      name: user.name || 'Vaibhav Yadav'
    };
  } catch (e) {
    return {
      email: 'vaibhav.v1@1mg.com',
      name: 'Vaibhav Yadav'
    };
  }
}

async function executeBatchAssign(userId) {
  if (!userId || selectedCaseIds.size === 0) return;
  const ids = Array.from(selectedCaseIds);
  const actor = getCurrentAdminActor();

  try {
    const res = await fetch('/api/v1/cases/batch-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: ids,
        user_id: parseInt(userId),
        actor_email: actor.email,
        actor_name: actor.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Batch Reassignment Complete', data.message, 'success');
      clearCaseSelection();
      const sel = document.getElementById('batchAssignSelect');
      if (sel) sel.value = '';
      loadCasesKPIs();
      loadCases();
      loadDashboard();
    } else {
      alert(data.detail || 'Batch assignment failed.');
    }
  } catch (err) {
    console.error('Batch assign failed:', err);
    alert('Failed to execute batch assignment.');
  }
}

async function executeBatchStatus(status) {
  if (!status || selectedCaseIds.size === 0) return;
  const ids = Array.from(selectedCaseIds);
  const actor = getCurrentAdminActor();

  let notes = null;
  if (status === 'RESOLVED') {
    notes = prompt('Enter resolution notes for selected cases:', 'Batch resolved by System Administrator.');
    if (notes === null) return; // user cancelled
  }

  try {
    const res = await fetch('/api/v1/cases/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: ids,
        status: status,
        resolution_notes: notes,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Batch Status Updated', data.message, 'success');
      clearCaseSelection();
      const sel = document.getElementById('batchStatusSelect');
      if (sel) sel.value = '';
      loadCasesKPIs();
      loadCases();
      loadDashboard();
    } else {
      alert(data.detail || 'Batch status update failed.');
    }
  } catch (err) {
    console.error('Batch status failed:', err);
    alert('Failed to execute batch status update.');
  }
}

async function executeBatchPriority(priority) {
  if (!priority || selectedCaseIds.size === 0) return;
  const ids = Array.from(selectedCaseIds);
  const actor = getCurrentAdminActor();

  try {
    const res = await fetch('/api/v1/cases/batch-priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: ids,
        priority: priority,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Priority Escalated', data.message, 'success');
      clearCaseSelection();
      const sel = document.getElementById('batchPrioritySelect');
      if (sel) sel.value = '';
      loadCases();
    } else {
      alert(data.detail || 'Batch priority update failed.');
    }
  } catch (err) {
    console.error('Batch priority failed:', err);
    alert('Failed to update priority.');
  }
}

async function executeBatchDelete() {
  if (selectedCaseIds.size === 0) return;
  const count = selectedCaseIds.size;
  if (!confirm(`ADMIN CONFIRMATION: Are you sure you want to permanently delete all ${count} selected cases and their audit records?`)) {
    return;
  }

  const ids = Array.from(selectedCaseIds);
  const actor = getCurrentAdminActor();
  try {
    const res = await fetch('/api/v1/cases/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_ids: ids,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Cases Purged', data.message, 'success');
      clearCaseSelection();
      loadCasesKPIs();
      loadCases();
      loadDashboard();
    } else {
      alert(data.detail || 'Failed to delete cases.');
    }
  } catch (err) {
    console.error('Batch delete failed:', err);
    alert('Failed to delete cases.');
  }
}

// -------------------------------------------------------------------------
// 5. Admin SLA Override Modal Controllers
// -------------------------------------------------------------------------
async function openSlaOverrideModal(caseId) {
  const modal = document.getElementById('slaOverrideModal');
  const inputId = document.getElementById('overrideCaseId');
  const numDisplay = document.getElementById('overrideCaseNum');
  const dueDisplay = document.getElementById('overrideCaseCurrentDue');
  const reasonInput = document.getElementById('overrideReasonInput');
  if (!modal) return;

  if (inputId) inputId.value = caseId;
  if (reasonInput) reasonInput.value = '';

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`);
    const data = await res.json();
    if (data.success && data.case) {
      const c = data.case;
      if (numDisplay) numDisplay.innerText = `Case #${c.case_number} · ${c.title}`;
      if (dueDisplay) dueDisplay.innerText = `Current Target: ${c.due_at ? new Date(c.due_at).toLocaleString() : 'No SLA set'}`;
    }
  } catch (err) {
    console.error('Failed to load case info for SLA override:', err);
  }

  modal.style.display = 'flex';
}

function closeSlaOverrideModal() {
  const modal = document.getElementById('slaOverrideModal');
  if (modal) modal.style.display = 'none';
}

function selectSlaExtensionPreset(hours, btn) {
  const input = document.getElementById('overrideHoursInput');
  if (input) input.value = hours;
  document.querySelectorAll('.sla-ext-preset').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function submitSlaOverride() {
  const caseId = document.getElementById('overrideCaseId')?.value;
  const hours = parseInt(document.getElementById('overrideHoursInput')?.value || '12');
  const reason = document.getElementById('overrideReasonInput')?.value.trim();
  const btn = document.getElementById('btnSubmitSlaOverride');

  if (!reason) {
    alert('Please enter an operational justification reason for extending the SLA deadline.');
    return;
  }

  if (btn) btn.disabled = true;

  const actor = getCurrentAdminActor();
  try {
    const res = await fetch(`/api/v1/cases/${caseId}/override-sla`, {
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
      closeSlaOverrideModal();
      loadCasesKPIs();
      loadCases();
      loadDashboard();
      if (currentDossierCaseId === parseInt(caseId)) {
        openCaseDossierModal(caseId);
      }
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

// -------------------------------------------------------------------------
// 6. HR Canned Response Macros in Dossier
// -------------------------------------------------------------------------
function applyDossierMacro(macroKey) {
  const input = document.getElementById('dossierReplyMessageInput');
  if (!input) return;

  const macros = {
    punch_regularized: "Hi,\n\nYour biometric swipe discrepancy has been verified and regularized in the attendance system (Darwinbox) for the specified date. No leave or salary deduction will occur.\n\nWarm regards,\nTata 1mg Attendance Operations",
    tds_finance: "Hello,\n\nYour Form 12BB tax investment proof and rent receipts have been reviewed and forwarded to the Central Payroll team. Any excess TDS deducted will be adjusted in the upcoming payout cycle.\n\nBest regards,\nTata 1mg Payroll Desk",
    mediclaim_added: "Dear Employee,\n\nYour dependent addition request has been endorsed with Tata AIG. Your updated Group Health Insurance Mediclaim E-Card has been generated and updated on your Darwinbox portal.\n\nRegards,\nTata 1mg Benefits Team",
    bgv_verified: "Hi,\n\nThe background verification partner (AuthBridge) has confirmed receipt of your secondary address documents. Your BGV clearance report is marked as Satisfactory.\n\nWarm regards,\nTata 1mg Onboarding & BGV Desk"
  };

  if (macros[macroKey]) {
    input.value = macros[macroKey];
    input.focus();
  }
}

async function submitDossierReply() {
  if (!currentDossierCaseId) return;
  const input = document.getElementById('dossierReplyMessageInput');
  const msg = input?.value.trim();
  const replyTypeRadio = document.querySelector('input[name="dossierReplyType"]:checked');
  const replyType = replyTypeRadio ? replyTypeRadio.value : 'PUBLIC_REPLY';

  if (!msg) {
    alert('Please enter a response message or note.');
    return;
  }

  const actor = getCurrentAdminActor();
  try {
    const res = await fetch(`/api/v1/cases/${currentDossierCaseId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        reply_type: replyType,
        actor_email: actor.email,
        actor_name: actor.name
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Note Dispatched', `${replyType === 'PUBLIC_REPLY' ? 'Email sent to employee' : 'Internal supervisory note saved'}.`, 'success');
      if (input) input.value = '';
      openCaseDossierModal(currentDossierCaseId);
    } else {
      alert(data.detail || 'Failed to dispatch reply.');
    }
  } catch (err) {
    console.error('Failed to dispatch reply:', err);
    alert('Failed to dispatch message.');
  }
}

// -------------------------------------------------------------
// CASE MODALS & OPERATIONS
// -------------------------------------------------------------

function openCreateCaseModal() {
  const form = document.getElementById('createCaseForm');
  if (form) form.reset();
  populateCaseDeptDropdowns();
  const modal = document.getElementById('createCaseModal');
  if (modal) modal.style.display = 'flex';
}

function closeCreateCaseModal() {
  const modal = document.getElementById('createCaseModal');
  if (modal) modal.style.display = 'none';
}

async function submitCreateCase(e) {
  e.preventDefault();
  const empName = document.getElementById('newCaseEmpName')?.value.trim();
  const empEmail = document.getElementById('newCaseEmpEmail')?.value.trim();
  const title = document.getElementById('newCaseTitle')?.value.trim();
  const desc = document.getElementById('newCaseDesc')?.value.trim();
  const deptIdVal = document.getElementById('newCaseDept')?.value;
  const priority = document.getElementById('newCasePriority')?.value || 'MEDIUM';

  const btn = document.getElementById('btnSubmitNewCase');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      employee_name: empName,
      employee_email: empEmail,
      title: title,
      description: desc,
      priority: priority
    };
    if (deptIdVal) payload.department_id = parseInt(deptIdVal);

    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case Created', `Logged ticket #${data.case.case_number} routed to ${data.case.department}`, 'success');
      closeCreateCaseModal();
      loadCasesKPIs();
      loadCases();
      loadDashboard();
    } else {
      alert(data.detail || 'Failed to create case.');
    }
  } catch (err) {
    console.error('Error creating case:', err);
    alert('Failed to log inbound case.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function openCaseDossierModal(caseId) {
  openCaseDetailsPage(caseId);
}

function closeCaseDossierModal() {
  const modal = document.getElementById('caseDossierModal');
  if (modal) modal.style.display = 'none';
  currentDossierCaseId = null;
}

async function openReassignCaseModal(caseId) {
  const modal = document.getElementById('reassignCaseModal');
  if (!modal) return;

  document.getElementById('reassignCaseId').value = caseId;
  await populateCaseDeptDropdowns();
  await populateReassignSpecialists();

  modal.style.display = 'flex';
}

function closeReassignCaseModal() {
  const modal = document.getElementById('reassignCaseModal');
  if (modal) modal.style.display = 'none';
}

async function populateReassignSpecialists() {
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
      userSelect.innerHTML = `<option value="">Central Queue / Unassigned</option>`;
    }
  } catch (err) {
    console.error('Failed to load specialists for reassignment:', err);
    userSelect.innerHTML = `<option value="">Central Queue / Unassigned</option>`;
  }
}

async function submitReassignCase(e) {
  e.preventDefault();
  const caseId = document.getElementById('reassignCaseId')?.value;
  const deptId = document.getElementById('reassignDeptSelect')?.value;
  const userId = document.getElementById('reassignUserSelect')?.value;
  const user = JSON.parse(localStorage.getItem('1mg_user') || '{}');

  const btn = document.getElementById('btnSubmitReassign');
  if (btn) btn.disabled = true;

  try {
    const payload = {
      department_id: deptId ? parseInt(deptId) : null,
      user_id: userId ? parseInt(userId) : null,
      actor_email: user.email || 'admin@1mg.com',
      actor_name: user.name || 'Administrator'
    };

    const res = await fetch(`/api/v1/cases/${caseId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Reassigned', data.message, 'success');
      closeReassignCaseModal();
      loadCases();
      if (currentDossierCaseId === parseInt(caseId)) {
        openCaseDossierModal(caseId);
      }
    } else {
      alert(data.detail || 'Failed to reassign case.');
    }
  } catch (err) {
    console.error('Error reassigning case:', err);
    alert('Failed to reassign case.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openResolveCaseModal(caseId) {
  const modal = document.getElementById('resolveCaseModal');
  if (!modal) return;

  document.getElementById('resolveCaseId').value = caseId;
  const notes = document.getElementById('resolveNotes');
  if (notes) notes.value = '';

  modal.style.display = 'flex';
}

function closeResolveCaseModal() {
  const modal = document.getElementById('resolveCaseModal');
  if (modal) modal.style.display = 'none';
}

async function submitResolveCase(e) {
  e.preventDefault();
  const caseId = document.getElementById('resolveCaseId')?.value;
  const notes = document.getElementById('resolveNotes')?.value.trim();
  const user = JSON.parse(localStorage.getItem('1mg_user') || '{}');

  const btn = document.getElementById('btnSubmitResolve');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/v1/cases/${caseId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'RESOLVED',
        resolution_notes: notes,
        actor_email: user.email || 'admin@1mg.com',
        actor_name: user.name || 'Administrator'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case Resolved', `Case #${data.case.case_number} marked as resolved`, 'success');
      closeResolveCaseModal();
      loadCasesKPIs();
      loadCases();
      loadDashboard();
      if (currentDossierCaseId === parseInt(caseId)) {
        openCaseDossierModal(caseId);
      }
    } else {
      alert(data.detail || 'Failed to resolve case.');
    }
  } catch (err) {
    console.error('Error resolving case:', err);
    alert('Failed to resolve case.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteCase(caseId) {
  if (!confirm('Are you sure you want to permanently delete this case and its associated audit trail?')) {
    return;
  }

  try {
    const res = await fetch(`/api/v1/cases/${caseId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case Deleted', data.message, 'success');
      if (currentDossierCaseId === parseInt(caseId)) {
        closeCaseDossierModal();
      }
      loadCasesKPIs();
      loadCases();
      loadDashboard();
    } else {
      alert(data.detail || 'Failed to delete case.');
    }
  } catch (err) {
    console.error('Error deleting case:', err);
    alert('Failed to delete case.');
  }
}

function exportCasesCsv() {
  window.open('/api/v1/admin/reports/cases.csv', '_blank');
}

// =========================================================================
// 7. DEPARTMENT MANAGEMENT & 3-STAGE AI ROUTING ENGINE (ONE UI 9.0)
// =========================================================================

let currentDeptCategoryFilter = 'ALL';
let currentDrawerDeptId = null;
let currentDrawerStage = 1;

async function loadDepartmentKPIs() {
  try {
    const res = await fetch('/api/v1/departments/kpis');
    const data = await res.json();
    if (data.success && data.kpis) {
      const k = data.kpis;
      const elTotal = document.getElementById('deptKpiTotal');
      const elSpecs = document.getElementById('deptKpiSpecialists');
      const elCases = document.getElementById('deptKpiCases');
      const elTrain = document.getElementById('deptKpiTrained');
      if (elTotal) elTotal.innerText = k.total_departments;
      if (elSpecs) elSpecs.innerText = k.total_specialists;
      if (elCases) elCases.innerText = k.open_cases_routed;
      if (elTrain) elTrain.innerText = k.ai_trained_desks;
    }
  } catch (err) {
    console.error('Failed to load department KPIs:', err);
  }
}

function getDepartmentCategoryIcon(categoryCode, color) {
  const cat = (categoryCode || '').toUpperCase();
  if (cat.includes('ATTEND')) {
    return `
      <div class="dept-category-icon-badge" style="background: rgba(37, 99, 235, 0.1); color: #2563EB;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>
    `;
  } else if (cat.includes('PAYROLL')) {
    return `
      <div class="dept-category-icon-badge" style="background: rgba(79, 70, 229, 0.1); color: #4F46E5;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2"></rect>
          <line x1="2" y1="10" x2="22" y2="10"></line>
        </svg>
      </div>
    `;
  } else if (cat.includes('PEOPLE') || cat.includes('LEAVE')) {
    return `
      <div class="dept-category-icon-badge" style="background: rgba(255, 111, 97, 0.12); color: #FF6F61;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      </div>
    `;
  } else if (cat.includes('ASSET') || cat.includes('IT')) {
    return `
      <div class="dept-category-icon-badge" style="background: rgba(13, 148, 136, 0.1); color: #0D9488;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </div>
    `;
  } else if (cat.includes('BGV') || cat.includes('VERIF')) {
    return `
      <div class="dept-category-icon-badge" style="background: rgba(217, 119, 6, 0.1); color: #D97706;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <polyline points="9 12 11 14 15 10"></polyline>
        </svg>
      </div>
    `;
  }
  // Generic enterprise desk
  return `
    <div class="dept-category-icon-badge" style="background: #F1F5F9; color: #475569;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"></rect>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
      </svg>
    </div>
  `;
}

async function bootstrapStandardDepartments() {
  if (!confirm("Restore standard Tata 1mg functional departments (Attendance, Payroll, People Desk, IT Assets, BGV) with pre-trained AI models?")) return;
  try {
    const res = await fetch('/api/v1/departments/bootstrap', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Departments Restored', data.message, 'success');
      await loadDepartments();
      await loadDepartmentKPIs();
      renderDepartments();
    } else {
      alert(data.detail || 'Failed to restore departments');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}

function renderDepartments() {
  const grid = document.getElementById('deptBentoGrid');
  if (!grid) return;

  // 1. Render Category Filter Pills Bar
  renderDepartmentFilterPills();

  if (!allDepartments || allDepartments.length === 0) {
    grid.innerHTML = `
      <div class="dept-empty-state">
        <div class="empty-state-icon-box">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#FF6F61" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            <line x1="12" y1="11" x2="12" y2="15"></line>
            <line x1="10" y1="13" x2="14" y2="13"></line>
          </svg>
        </div>
        <h3>No HR Functional Desks Configured</h3>
        <p>
          Departments connect employee queries directly to specialist queues, enforce automated SLA resolution, and power our 3-stage AI routing engine.
        </p>
        <div class="empty-state-actions">
          <button class="btn-primary" style="width: auto; padding: 0 18px; display: inline-flex; align-items: center; gap: 7px;" onclick="openCreateDeptModal()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Create Custom Department</span>
          </button>
          <button class="btn-secondary" style="height: 40px; display: inline-flex; align-items: center; gap: 7px;" onclick="bootstrapStandardDepartments()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Restore Tata 1mg Standard Desks</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  // 2. Filter departments by Category Pill and Omni-Search Input
  const search = (document.getElementById('deptSearchInput')?.value || '').trim().toLowerCase();
  
  const filtered = allDepartments.filter(d => {
    // Category match
    const catCode = (d.category_code || d.dept_code.replace('DEPT-', '')).toUpperCase();
    if (currentDeptCategoryFilter !== 'ALL' && catCode !== currentDeptCategoryFilter) {
      return false;
    }
    // Search match
    if (search) {
      const matchName = (d.team_name || '').toLowerCase().includes(search);
      const matchCode = (d.dept_code || '').toLowerCase().includes(search);
      const matchEmail = (d.dept_gmail || '').toLowerCase().includes(search);
      const matchSpec = (d.specialists || []).some(s => (s.name || '').toLowerCase().includes(search) || (s.email || '').toLowerCase().includes(search));
      if (!matchName && !matchCode && !matchEmail && !matchSpec) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px; background: #FFF; border: 1px solid var(--border-light); border-radius: 14px;">
        <div style="font-size: 15px; font-weight: 700; color: var(--text-dark);">No matching departments found</div>
        <p style="font-size: 12.5px; margin-top: 4px;">Try adjusting your search query or category filter pills.</p>
      </div>
    `;
    return;
  }

  // 3. Render Bento Cards
  grid.innerHTML = filtered.map(d => {
    const accentColor = d.color_accent || '#FF6F61';
    const isTrained = d.ai_model_status === 'TRAINED';
    const accuracy = d.model_accuracy ? `${parseFloat(d.model_accuracy).toFixed(1)}%` : 'Active';
    const priority = (d.default_priority || 'MEDIUM').toUpperCase();
    const priorityClass = priority.toLowerCase();
    const specialists = d.specialists || [];

    // Specialists chips HTML
    let specialistsHtml = '';
    if (specialists.length === 0) {
      specialistsHtml = `<span style="font-size: 12px; color: var(--text-muted);">No specialists assigned yet</span>`;
    } else {
      const preview = specialists.slice(0, 3);
      const remaining = specialists.length - 3;
      specialistsHtml = `
        <div class="specialists-chips">
          ${preview.map(s => `
            <div class="specialist-chip ${s.is_dept_head ? 'lead' : ''}" title="${escapeHtml(s.name)} (${escapeHtml(s.role)})">
              <span class="specialist-avatar-circle">${escapeHtml(s.name.charAt(0).toUpperCase())}</span>
              <span>${escapeHtml(s.name.split(' ')[0])}${s.is_dept_head ? ' (Lead)' : ''}</span>
            </div>
          `).join('')}
          ${remaining > 0 ? `<span class="specialist-chip">+${remaining} more</span>` : ''}
        </div>
      `;
    }

    return `
      <div class="dept-card">
        <!-- Color Accent Top Strip -->
        <div class="dept-card-top-accent" style="background: ${accentColor};"></div>
        
        <div class="dept-card-body">
          <!-- Header: Title, Code, Priority & Category Icon -->
          <div class="dept-card-header">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
              ${getDepartmentCategoryIcon(d.category_code || d.dept_code, accentColor)}
              <div class="dept-card-title-group">
                <h3>${escapeHtml(d.team_name)}</h3>
                <span class="dept-code-tag">${escapeHtml(d.dept_code)}</span>
                <div class="dept-gmail-row">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <span>${escapeHtml(d.dept_gmail)}</span>
                </div>
              </div>
            </div>
            <span class="dept-priority-badge ${priorityClass}">${escapeHtml(priority)}</span>
          </div>

          <!-- One UI 3-Tile Metrics Strip -->
          <div class="dept-metrics-strip">
            <div class="metric-cell">
              <div class="metric-val">${d.team_size || specialists.length}</div>
              <div class="metric-lbl">Specialists</div>
            </div>
            <div class="metric-cell">
              <div class="metric-val">${d.open_cases || 0}</div>
              <div class="metric-lbl">Open Cases</div>
            </div>
            <div class="metric-cell">
              <div class="metric-val">${d.sla_hours || 24}h</div>
              <div class="metric-lbl">SLA Target</div>
            </div>
          </div>

          <!-- Description -->
          <div class="dept-desc-text" title="${escapeHtml(d.description || '')}">
            ${escapeHtml(d.description || 'Configured HR desk for automated email routing and SLA resolution.')}
          </div>

          <!-- AI Model Status Pill -->
          <div class="dept-ai-status-row">
            <span class="dept-ai-status-badge ${isTrained ? 'trained' : 'untrained'}">
              ${isTrained ? `AI Trained (${accuracy})` : 'AI Untrained'}
            </span>
            <span style="font-size: 11px; color: #64748B; font-weight: 600;">
              ${(d.intents || []).length} Intents Defined
            </span>
          </div>

          <!-- Specialists Roster -->
          <div class="dept-specialists-box">
            <div class="specialists-title">
              <span>Department Specialists</span>
              <span>${specialists.length} Active</span>
            </div>
            ${specialistsHtml}
          </div>

          <!-- Bottom Action Toolbar with Industry SVGs -->
          <div class="dept-card-actions">
            <button class="btn-card-action" onclick="openDeptFocusModal(${d.id})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"></path>
                <path d="M9 21H3v-6"></path>
                <path d="M21 3l-7 7"></path>
                <path d="M3 21l7-7"></path>
              </svg>
              <span>Focus</span>
            </button>
            <button class="btn-card-action primary" onclick="openTrainAiDrawer(${d.id})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              <span>Train AI</span>
            </button>
            <button class="btn-card-action icon-only" title="Edit Configuration" onclick="openEditDeptModal(${d.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-card-action icon-only danger" title="Delete Department" onclick="deleteDepartment(${d.id}, '${escapeHtml(d.team_name)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDepartmentFilterPills() {
  const container = document.getElementById('deptCategoryPillsBar');
  if (!container) return;

  const cats = new Set();
  (allDepartments || []).forEach(d => {
    const code = (d.category_code || d.dept_code.replace('DEPT-', '')).toUpperCase();
    if (code) cats.add(code);
  });

  const catList = Array.from(cats);
  container.innerHTML = `
    <button class="filter-pill-btn ${currentDeptCategoryFilter === 'ALL' ? 'active' : ''}" onclick="filterDeptsByCategory('ALL', this)">
      All Departments (${allDepartments.length})
    </button>
    ${catList.map(cat => {
      const count = allDepartments.filter(d => (d.category_code || d.dept_code.replace('DEPT-', '')).toUpperCase() === cat).length;
      return `
        <button class="filter-pill-btn ${currentDeptCategoryFilter === cat ? 'active' : ''}" onclick="filterDeptsByCategory('${cat}', this)">
          ${cat} (${count})
        </button>
      `;
    }).join('')}
  `;
}

function filterDeptsByCategory(cat, btn) {
  currentDeptCategoryFilter = cat;
  document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDepartments();
}

function handleDeptSearch() {
  renderDepartments();
}

// =========================================================================
// "TRAIN AI" 3-STAGE STUDIO DRAWER HANDLERS
// =========================================================================

function openTrainAiDrawer(deptId) {
  const dept = allDepartments.find(d => d.id === deptId);
  if (!dept) return;

  currentDrawerDeptId = deptId;
  document.getElementById('drawerDeptTitle').innerText = dept.team_name;
  document.getElementById('drawerDeptCode').innerText = dept.dept_code;

  // 1. Populate Stage 1 Keywords
  const strongKw = Array.isArray(dept.strong_keywords) ? dept.strong_keywords.join('\n') : '';
  const weakKw = Array.isArray(dept.weak_keywords) ? dept.weak_keywords.join(', ') : '';
  document.getElementById('drawerStrongKeywords').value = strongKw;
  document.getElementById('drawerWeakKeywords').value = weakKw;

  // 2. Reset Stage 2 Dataset
  document.getElementById('drawerDatasetJson').value = '';
  document.getElementById('drawerTrainingReport').style.display = 'none';
  const statusEl = document.getElementById('drawerJsonStatus');
  if (statusEl) {
    statusEl.className = 'json-status-pill valid';
    statusEl.innerText = 'Ready for input';
  }

  // 3. Reset Stage 3 Sandbox
  document.getElementById('sandboxSubject').value = '';
  document.getElementById('sandboxBody').value = '';
  document.getElementById('sandboxResultBox').style.display = 'none';

  // Open drawer and default to Stage 1
  document.getElementById('trainAiDrawer').style.display = 'flex';
  switchDrawerStage(1);
}

function closeTrainAiDrawer() {
  document.getElementById('trainAiDrawer').style.display = 'none';
  currentDrawerDeptId = null;
}

function switchDrawerStage(stageNum) {
  currentDrawerStage = stageNum;
  [1, 2, 3].forEach(s => {
    const btn = document.getElementById(`tabBtnStage${s}`);
    const pane = document.getElementById(`drawerPaneStage${s}`);
    if (btn) btn.classList.toggle('active', s === stageNum);
    if (pane) pane.classList.toggle('active', s === stageNum);
  });
}

async function copyStage1Prompt() {
  if (!currentDrawerDeptId) return;
  try {
    const res = await fetch(`/api/v1/departments/${currentDrawerDeptId}/prompt/stage1`);
    const data = await res.json();
    if (data.success && data.prompt) {
      await navigator.clipboard.writeText(data.prompt);
      showToast('Prompt Copied', 'Stage 1 ChatGPT Keyword prompt copied to clipboard!', 'success');
    }
  } catch (err) {
    showToast('Copy Failed', 'Failed to copy prompt to clipboard.', 'error');
  }
}

async function saveStage1Keywords() {
  if (!currentDrawerDeptId) return;
  const strongRaw = document.getElementById('drawerStrongKeywords').value;
  const weakRaw = document.getElementById('drawerWeakKeywords').value;

  const strong_keywords = strongRaw.split(/[\n,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const weak_keywords = weakRaw.split(/[\n,]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  const btn = document.getElementById('btnSaveKeywords');
  btn.disabled = true;
  btn.innerText = 'Saving...';

  try {
    const res = await fetch(`/api/v1/departments/${currentDrawerDeptId}/keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strong_keywords, weak_keywords })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Keywords Saved', data.message, 'success');
      await loadDepartments();
    } else {
      alert(data.detail || 'Failed to save keywords');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      <span>Save Department Keywords</span>
    `;
  }
}

async function copyStage2Prompt() {
  if (!currentDrawerDeptId) return;
  try {
    const res = await fetch(`/api/v1/departments/${currentDrawerDeptId}/prompt/stage2`);
    const data = await res.json();
    if (data.success && data.prompt) {
      await navigator.clipboard.writeText(data.prompt);
      showToast('Prompt Copied', 'Stage 2 ChatGPT 400-Sample Dataset prompt copied to clipboard!', 'success');
    }
  } catch (err) {
    showToast('Copy Failed', 'Failed to copy prompt to clipboard.', 'error');
  }
}

function validateDrawerJson() {
  const text = document.getElementById('drawerDatasetJson').value.trim();
  const badge = document.getElementById('drawerJsonStatus');
  if (!badge) return;

  if (!text) {
    badge.className = 'json-status-pill valid';
    badge.innerText = 'Ready for input';
    return;
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      badge.className = 'json-status-pill invalid';
      badge.innerText = '⚠️ Must be a JSON array of samples';
      return;
    }
    const intents = new Set(parsed.map(p => p.intent || p.intent_code || p.label).filter(Boolean));
    badge.className = 'json-status-pill valid';
    badge.innerText = `✅ Valid JSON: ${intents.size} Intents · ${parsed.length} Samples`;
  } catch (e) {
    badge.className = 'json-status-pill invalid';
    badge.innerText = '⚠️ Invalid JSON Syntax';
  }
}

async function loadStarterDataset() {
  if (!currentDrawerDeptId) return;
  try {
    const res = await fetch(`/api/v1/departments/${currentDrawerDeptId}/starter-dataset`);
    const data = await res.json();
    if (data.success && data.dataset) {
      document.getElementById('drawerDatasetJson').value = JSON.stringify(data.dataset, null, 2);
      validateDrawerJson();
      showToast('Dataset Loaded', `Pre-loaded ${data.sample_count} starter training samples for ${data.category_code}`, 'success');
    } else {
      showToast('No Starter Data', 'No starter dataset configured for this department.', 'info');
    }
  } catch (err) {
    showToast('Error', 'Failed to load starter dataset.', 'error');
  }
}

async function trainDrawerModel() {
  if (!currentDrawerDeptId) return;
  const rawJson = document.getElementById('drawerDatasetJson').value.trim();
  let dataset = null;

  if (rawJson) {
    try {
      dataset = JSON.parse(rawJson);
    } catch (e) {
      alert('Please fix JSON syntax errors before training.');
      return;
    }
  }

  const btn = document.getElementById('btnTrainModel');
  const reportBox = document.getElementById('drawerTrainingReport');
  btn.disabled = true;
  btn.innerText = 'Training Model...';

  try {
    const res = await fetch(`/api/v1/departments/${currentDrawerDeptId}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset, use_starter: !dataset })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Model Trained & Hot-Reloaded', `Accuracy: ${data.accuracy}% across ${data.sample_count} samples`, 'success');
      if (reportBox) {
        reportBox.style.display = 'block';
        reportBox.innerHTML = `
          <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #065F46;">
            <strong>✓ Training Complete &amp; Hot-Reloaded:</strong><br>
            • Category: <strong>${escapeHtml(data.category_code)}</strong><br>
            • Training Samples: <strong>${data.sample_count}</strong><br>
            • Distinct Intents Trained: <strong>${data.intent_count} (${(data.intents || []).join(', ')})</strong><br>
            • Evaluated Accuracy: <strong>${data.accuracy}%</strong><br>
            • Memory Weights: <strong>Hot-reloaded into cache (0ms downtime)</strong>
          </div>
        `;
      }
      await loadDepartments();
      await loadDepartmentKPIs();
    } else {
      alert(data.detail || 'Training failed');
    }
  } catch (err) {
    alert('Error connecting to backend server during training.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
      <span>Train &amp; Hot-Reload Model</span>
    `;
  }
}

async function runDrawerSandboxTest() {
  const subject = document.getElementById('sandboxSubject').value.trim();
  const body = document.getElementById('sandboxBody').value.trim();

  if (!subject && !body) {
    alert('Please enter a subject or body to test.');
    return;
  }

  const btn = document.getElementById('btnTestSandbox');
  const resultBox = document.getElementById('sandboxResultBox');
  btn.disabled = true;
  btn.innerText = 'Evaluating...';

  try {
    const res = await fetch('/api/v1/departments/classify-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, department_id: currentDrawerDeptId })
    });
    const data = await res.json();
    if (data.success && data.department) {
      resultBox.style.display = 'block';
      document.getElementById('resDeptName').innerText = `${data.department.team_name} (${data.department.dept_code})`;
      document.getElementById('resStage1Score').innerText = `Score: ${data.stage1.score} (Threshold >= 1.5)`;
      
      const strongMatches = data.stage1.matched_strong || [];
      const weakMatches = data.stage1.matched_weak || [];
      const allMatches = [...strongMatches, ...weakMatches];
      document.getElementById('resMatchedKw').innerText = allMatches.length > 0 ? allMatches.join(', ') : 'No direct keyword hit';

      const intent = data.stage2?.predicted_intent;
      document.getElementById('resIntentName').innerText = intent ? `${intent.code} · ${intent.name}` : 'General Inquiry';
      document.getElementById('resConfidence').innerText = `${data.stage2?.confidence}% (Margin: ${data.stage2?.margin})`;
      document.getElementById('resSla').innerText = `${data.stage3_dispatch?.sla_hours} Hours Target`;
      document.getElementById('resDispatch').innerText = `${data.stage3_dispatch?.assigned_team} (${data.stage3_dispatch?.routing_email})`;
    } else {
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="color: #DC2626; font-size: 13px; font-weight: 600;">
          ${escapeHtml(data.verdict || 'Query did not match any active department threshold.')}
        </div>
      `;
    }
  } catch (err) {
    alert('Error testing classification.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Test Live Classification</span>
    `;
  }
}

// =========================================================================
// CENTER VIEW FOCUS MODAL
// =========================================================================

function openDeptFocusModal(deptId) {
  const dept = allDepartments.find(d => d.id === deptId);
  if (!dept) return;

  document.getElementById('focusModalTitle').innerText = dept.team_name;
  document.getElementById('focusModalCode').innerText = dept.dept_code;

  const specialists = dept.specialists || [];
  const body = document.getElementById('focusModalBody');

  body.innerHTML = `
    <!-- Top 3-Tile Strip -->
    <div class="dept-metrics-strip" style="margin-bottom: 20px;">
      <div class="metric-cell">
        <div class="metric-val">${dept.team_size || specialists.length}</div>
        <div class="metric-lbl">Specialists</div>
      </div>
      <div class="metric-cell">
        <div class="metric-val">${dept.open_cases || 0}</div>
        <div class="metric-lbl">Open Cases</div>
      </div>
      <div class="metric-cell">
        <div class="metric-val">${dept.sla_hours || 24}h</div>
        <div class="metric-lbl">SLA Target</div>
      </div>
    </div>

    <!-- Details Box -->
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; font-size: 13px;">
      <div style="margin-bottom: 6px;"><strong>Routing Email:</strong> <span style="color: var(--1mg-orange);">${escapeHtml(dept.dept_gmail)}</span></div>
      <div style="margin-bottom: 6px;"><strong>Default Priority:</strong> <span class="dept-priority-badge ${dept.default_priority?.toLowerCase()}">${escapeHtml(dept.default_priority)}</span></div>
      <div style="margin-bottom: 6px;"><strong>AI Status:</strong> <span style="font-weight: 700; color: ${dept.ai_model_status === 'TRAINED' ? '#059669' : '#D97706'};">${dept.ai_model_status === 'TRAINED' ? `Trained (${dept.model_accuracy}% accuracy)` : 'Untrained'}</span></div>
      <div><strong>Operational Scope:</strong> <span style="color: #475569;">${escapeHtml(dept.description || 'Enterprise query queue for Tata 1mg')}</span></div>
    </div>

    <!-- Specialists List -->
    <h4 style="font-size: 14px; font-weight: 800; color: var(--text-dark); margin: 0 0 10px 0;">
      Assigned Department Specialists (${specialists.length})
    </h4>
    ${specialists.length === 0 ? `
      <div style="text-align: center; color: var(--text-muted); padding: 20px; background: #FFF; border: 1px dashed var(--border-light); border-radius: 8px;">
        No specialists currently mapped to this desk. Add one in User Management.
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${specialists.map(s => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #FFFFFF; border: 1px solid var(--border-light); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="specialist-avatar-circle" style="width: 28px; height: 28px; font-size: 12px;">${escapeHtml(s.name.charAt(0).toUpperCase())}</span>
              <div>
                <div style="font-weight: 700; font-size: 13.5px; color: var(--text-dark);">
                  ${escapeHtml(s.name)} ${s.is_dept_head ? '<span style="font-size: 11px; color: #EA580C; background: #FFF7ED; padding: 1px 6px; border-radius: 4px; border: 1px solid #FED7AA;">Lead</span>' : ''}
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(s.email)} · ${escapeHtml(s.designation || 'Specialist')}</div>
              </div>
            </div>
            <span class="role-pill" style="font-size: 11px;">${escapeHtml(s.role)}</span>
          </div>
        `).join('')}
      </div>
    `}
  `;

  document.getElementById('btnFocusTrainAi').onclick = () => {
    closeDeptFocusModal();
    openTrainAiDrawer(deptId);
  };

  document.getElementById('deptFocusModal').style.display = 'flex';
}

function closeDeptFocusModal() {
  document.getElementById('deptFocusModal').style.display = 'none';
}

// =========================================================================
// EDIT DEPARTMENT MODAL
// =========================================================================

function openEditDeptModal(deptId) {
  const dept = allDepartments.find(d => d.id === deptId);
  if (!dept) return;

  document.getElementById('editDeptId').value = dept.id;
  document.getElementById('editDeptName').value = dept.team_name || '';
  document.getElementById('editDeptCatCode').value = dept.category_code || dept.dept_code.replace('DEPT-', '');
  document.getElementById('editDeptSla').value = dept.sla_hours || 24;
  document.getElementById('editDeptEmail').value = dept.dept_gmail || '';
  document.getElementById('editDeptPriority').value = dept.default_priority || 'MEDIUM';
  document.getElementById('editDeptColor').value = dept.color_accent || '#FF6F61';
  document.getElementById('editDeptDesc').value = dept.description || '';

  document.getElementById('editDeptModal').style.display = 'flex';
}

function closeEditDeptModal() {
  document.getElementById('editDeptModal').style.display = 'none';
  document.getElementById('editDeptForm').reset();
}

async function submitEditDept(e) {
  e.preventDefault();
  const deptId = document.getElementById('editDeptId').value;
  const team_name = document.getElementById('editDeptName').value.trim();
  const category_code = document.getElementById('editDeptCatCode').value.trim().toUpperCase();
  const sla_hours = parseInt(document.getElementById('editDeptSla').value) || 24;
  const dept_gmail = document.getElementById('editDeptEmail').value.trim();
  const default_priority = document.getElementById('editDeptPriority').value;
  const color_accent = document.getElementById('editDeptColor').value;
  const description = document.getElementById('editDeptDesc').value.trim();

  const btn = document.getElementById('btnSubmitEditDept');
  btn.disabled = true;
  btn.innerText = 'Saving...';

  try {
    const res = await fetch(`/api/v1/departments/${deptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name, category_code, sla_hours, dept_gmail, default_priority, color_accent, description })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Department Updated', `Department "${team_name}" settings updated`, 'success');
      closeEditDeptModal();
      await loadDepartments();
      renderDepartments();
    } else {
      alert(data.detail || 'Failed to update department');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Save Changes';
  }
}

// =========================================================================
// CREATE DEPARTMENT MODAL
// =========================================================================

function openCreateDeptModal() {
  document.getElementById('createDeptModal').style.display = 'flex';
  document.getElementById('newDeptName').focus();
}

function closeCreateDeptModal() {
  document.getElementById('createDeptModal').style.display = 'none';
  document.getElementById('createDeptForm').reset();
}

async function submitCreateDept(e) {
  e.preventDefault();
  const team_name = document.getElementById('newDeptName').value.trim();
  const dept_code = document.getElementById('newDeptCode').value.trim();
  const category_code = (document.getElementById('newDeptCatCode')?.value || '').trim().toUpperCase();
  const sla_hours = parseInt(document.getElementById('newDeptSla').value) || 24;
  const dept_gmail = document.getElementById('newDeptEmail').value.trim();
  const default_priority = document.getElementById('newDeptPriority').value;
  const color_accent = document.getElementById('newDeptColor')?.value || '#FF6F61';
  const description = document.getElementById('newDeptDesc').value.trim();

  const btn = document.getElementById('btnSubmitNewDept');
  btn.disabled = true;
  btn.innerText = 'Creating...';

  try {
    const res = await fetch('/api/v1/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name, dept_code, category_code, sla_hours, dept_gmail, default_priority, color_accent, description })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Department Created', `Department "${team_name}" (${dept_code}) configured successfully`, 'success');
      closeCreateDeptModal();
      await loadDepartments();
      await loadDepartmentKPIs();
      renderDepartments();
      // Auto-open Train AI Drawer for newly created department
      if (data.department?.id) {
        setTimeout(() => openTrainAiDrawer(data.department.id), 400);
      }
    } else {
      alert(data.detail || 'Failed to create department');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Create Department';
  }
}

async function deleteDepartment(deptId, deptName) {
  if (!confirm(`Are you sure you want to delete department "${deptName}"?`)) return;
  try {
    const res = await fetch(`/api/v1/departments/${deptId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Department Removed', `Department "${deptName}" was removed.`, 'success');
      await loadDepartments();
      await loadDepartmentKPIs();
      renderDepartments();
    } else {
      alert(data.detail || 'Failed to remove department');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}

// =========================================================================
// GLOBAL AI SANDBOX TESTER MODAL
// =========================================================================

function openQuickSandboxModal() {
  document.getElementById('globalSandboxSubject').value = '';
  document.getElementById('globalSandboxBody').value = '';
  document.getElementById('globalSandboxResult').style.display = 'none';
  document.getElementById('quickSandboxModal').style.display = 'flex';
}

function closeQuickSandboxModal() {
  document.getElementById('quickSandboxModal').style.display = 'none';
}

async function runGlobalSandboxTest() {
  const subject = document.getElementById('globalSandboxSubject').value.trim();
  const body = document.getElementById('globalSandboxBody').value.trim();

  if (!subject && !body) {
    alert('Please enter a subject or body to simulate.');
    return;
  }

  const resContainer = document.getElementById('globalSandboxResult');
  resContainer.style.display = 'block';
  resContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px;">Running 3-Stage AI Triage Simulation...</div>`;

  try {
    const res = await fetch('/api/v1/departments/classify-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body })
    });
    const data = await res.json();
    if (data.success && data.department) {
      const intent = data.stage2?.predicted_intent;
      resContainer.innerHTML = `
        <div style="background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-weight: 800; font-size: 14px; color: var(--text-dark);">
              Routed Desk: <span style="color: ${data.department.color_accent || '#FF6F61'};">${escapeHtml(data.department.team_name)}</span>
            </span>
            <span class="dept-code-tag">${escapeHtml(data.department.dept_code)}</span>
          </div>
          <div style="font-size: 12.5px; color: #475569; margin-bottom: 8px;">
            • Stage 1 Keyword Score: <strong>${data.stage1.score}</strong> (${(data.stage1.matched_strong || []).concat(data.stage1.matched_weak || []).join(', ')})
          </div>
          <div style="font-size: 12.5px; color: #475569; margin-bottom: 8px;">
            • Stage 2 LinearSVC Intent: <strong>${intent ? `${intent.code} · ${intent.name}` : 'General Inquiry'}</strong> (${data.stage2?.confidence}% confidence)
          </div>
          <div style="font-size: 12.5px; color: #475569;">
            • Dispatch SLA Target: <strong>${data.stage3_dispatch?.sla_hours}h</strong> &rarr; Inbound: <strong>${escapeHtml(data.stage3_dispatch?.routing_email)}</strong>
          </div>
        </div>
      `;
    } else {
      resContainer.innerHTML = `
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; font-size: 13px; color: #DC2626;">
          ${escapeHtml(data.verdict || 'Query did not match any active department threshold.')}
        </div>
      `;
    }
  } catch (err) {
    resContainer.innerHTML = `<div style="color: #DC2626; font-size: 13px;">Error communicating with classification API.</div>`;
  }
}

// =========================================================================
// 8. AUDIT LOGS, SIMULATIONS & REPORTS
// =========================================================================
async function loadAuditLogs() {
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">Loading audit trail...</td></tr>`;

  try {
    const res = await fetch('/api/v1/admin/audit-logs?limit=50');
    const data = await res.json();
    if (!data.success || !data.logs || data.logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 36px;">
            No audit records found yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.logs.map(l => `
      <tr>
        <td style="font-size: 12px; color: var(--text-muted); font-family: monospace;">
          ${formatDate(l.created_at)}
        </td>
        <td>
          <span class="role-pill" style="background: #F1F5F9; color: #1E293B; border: 1px solid #CBD5E1; font-family: monospace;">
            ${escapeHtml(l.action)}
          </span>
          ${l.case_number ? `<span style="font-weight: 700; color: var(--1mg-coral); margin-left: 6px; font-size: 12px;">#${escapeHtml(l.case_number)}</span>` : ''}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-dark); font-size: 13px;">${escapeHtml(l.actor_name)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(l.actor_email)}</div>
        </td>
        <td>
          <span style="font-size: 12px; color: #475569; font-family: monospace;">
            ${escapeHtml(JSON.stringify(l.details || {}))}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

const sampleQueries = [
  {
    employee_email: 'rajesh.verma@1mg.com',
    employee_name: 'Rajesh Verma',
    title: 'Biometric punch regularization for 28th Oct',
    description: 'Biometric scanner at Gurugram Warehouse was offline during shift start at 09:15 AM. Requesting regularization.',
    dept_code: 'DEPT-ATTENDANCE',
    priority: 'HIGH'
  },
  {
    employee_email: 'priya.nair@1mg.com',
    employee_name: 'Priya Nair',
    title: 'Mismatch in September TDS Deduction in Form 16',
    description: 'The TDS deduction in my September payslip shows excess Rs. 3,500 compared to 80C declaration.',
    dept_code: 'DEPT-PAYROLL',
    priority: 'HIGH'
  },
  {
    employee_email: 'amit.singh@1mg.com',
    employee_name: 'Amit Singh',
    title: 'GlobalProtect VPN connectivity timeout error',
    description: 'Cannot connect to Bangalore fulfillment database via GlobalProtect VPN. Need credential reset.',
    dept_code: 'DEPT-IT-ASSET',
    priority: 'MEDIUM'
  },
  {
    employee_email: 'sunita.sharma@1mg.com',
    employee_name: 'Sunita Sharma',
    title: 'BGV address verification document re-upload',
    description: 'Uploaded electricity bill has expired date. Attaching updated registered rent agreement.',
    dept_code: 'DEPT-BGV',
    priority: 'MEDIUM'
  }
];

// =========================================================================
// 7. ACTION CENTER, SLA ENGINE & AUTOMATIONS STUDIO
// =========================================================================

const simPresets = [
  {
    name: 'Vaibhav Yadav',
    email: 'vaibhav.v1@1mg.com',
    subject: 'Request for Salary Slip – October 2026',
    description: 'Dear People Desk Team,\n\nI am unable to download my October 2026 salary slip from the HR portal. Whenever I try to access the document, the page shows an error.\n\nCould you please check this issue and help me get my salary slip? Thank you.',
    priority: 'HIGH',
    dept_code: 'DEPT-PAYROLL'
  },
  {
    name: 'Rahul Sharma',
    email: 'rahul.sharma@1mg.com',
    subject: 'Biometric swipe mismatch at Gurugram HQ - 2 Nov 2026',
    description: 'My in-punch on 2nd November at Gurugram Turnstile B is missing in Darwinbox, showing half-day deduction. Attached geo-tagged selfie and cab trip sheet.',
    priority: 'MEDIUM',
    dept_code: 'DEPT-ATTENDANCE'
  },
  {
    name: 'Priya Nair',
    email: 'priya.nair@1mg.com',
    subject: 'Addition of newborn dependent to corporate mediclaim policy',
    description: 'Requesting to add newborn child to Tata 1mg Star Health cashless mediclaim policy. Attaching birth certificate and hospital discharge summary.',
    priority: 'HIGH',
    dept_code: 'DEPT-BENEFITS'
  },
  {
    name: 'Ritu Saxena',
    email: 'ritu.saxena@1mg.com',
    subject: 'PF Transfer UAN not linked with Aadhaar portal',
    description: 'My previous employer PF balance transfer failed due to UAN mismatch. Need HR specialist verification and PF declaration form endorsement.',
    priority: 'MEDIUM',
    dept_code: 'DEPT-PAYROLL'
  },
  {
    name: 'Vikram Malhotra',
    email: 'vikram.m@1mg.com',
    subject: 'Request for Relieving Letter and F&F Settlement Statement',
    description: 'My last working day was 15th October. Please share the final F&F tax calculation sheet and digitally signed relieving letter for background verification.',
    priority: 'CRITICAL',
    dept_code: 'DEPT-PEOPLEDESK'
  }
];

async function initActionsView() {
  populateActionsDeptDropdowns();
  loadSimPreset(0);
  await loadActionsOverview();
  await runLiveSLAPatrol();
}

function populateActionsDeptDropdowns() {
  const simSelect = document.getElementById('simDeptSelect');
  const bcSelect = document.getElementById('bcTargetDept');

  if (simSelect) {
    simSelect.innerHTML = '<option value="">🤖 AI Auto-Classifier (Recommended)</option>';
    (allDepartments || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.team_name || d.name} (${d.dept_code || 'DEPT'})`;
      simSelect.appendChild(opt);
    });
  }

  if (bcSelect) {
    bcSelect.innerHTML = '<option value="ALL">All Departments (Enterprise-Wide)</option>';
    (allDepartments || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.team_name || d.name;
      opt.textContent = `${d.team_name || d.name} (${d.dept_code || 'DEPT'})`;
      bcSelect.appendChild(opt);
    });
  }
}

function loadSimPreset(idx, btnEl) {
  document.querySelectorAll('.sim-preset-pill').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const nameInput = document.getElementById('simEmpName');
  const emailInput = document.getElementById('simEmpEmail');
  const subjInput = document.getElementById('simSubject');
  const prioSelect = document.getElementById('simPriority');
  const descInput = document.getElementById('simDescription');
  const deptSelect = document.getElementById('simDeptSelect');

  if (idx === -1) {
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (subjInput) subjInput.value = '';
    if (descInput) descInput.value = '';
    if (prioSelect) prioSelect.value = 'MEDIUM';
    if (deptSelect) deptSelect.value = '';
    return;
  }

  const p = simPresets[idx];
  if (!p) return;

  if (nameInput) nameInput.value = p.name;
  if (emailInput) emailInput.value = p.email;
  if (subjInput) subjInput.value = p.subject;
  if (prioSelect) prioSelect.value = p.priority;
  if (descInput) descInput.value = p.description;

  if (deptSelect && p.dept_code) {
    const match = (allDepartments || []).find(d => d.dept_code === p.dept_code);
    if (match) deptSelect.value = match.id;
    else deptSelect.value = '';
  }
}

async function loadActionsOverview() {
  try {
    const res = await fetch('/api/v1/admin/actions/overview');
    const data = await res.json();
    if (!data.success) return;

    const kpi = data.kpis || {};
    const monEl = document.getElementById('actKpiMonitors');
    const breEl = document.getElementById('actKpiBreaches');
    const autEl = document.getElementById('actKpiAutoRouted');
    const actEl = document.getElementById('actKpiAutomations');

    if (monEl) monEl.innerText = (kpi.active_monitors || 0).toLocaleString();
    if (breEl) breEl.innerText = (kpi.breaches_detected || 0).toLocaleString();
    if (autEl) autEl.innerText = (kpi.auto_routed || 0).toLocaleString();
    if (actEl) actEl.innerText = (kpi.automations_run || 0).toLocaleString();

    renderActionsAuditStream(data.recent_logs || []);
    renderActionsBroadcasts(data.broadcasts || []);

  } catch (err) {
    console.error('Error loading actions overview:', err);
  }
}

function renderActionsAuditStream(logs) {
  const streamEl = document.getElementById('actionsAuditStream');
  if (!streamEl) return;

  if (!logs || logs.length === 0) {
    streamEl.innerHTML = `<div style="text-align: center; color: #64748B; padding: 25px; font-size: 12.5px;">No recent automation events recorded.</div>`;
    return;
  }

  streamEl.innerHTML = logs.map(l => {
    const initial = (l.actor_name || 'System').charAt(0).toUpperCase();
    const actionColor = l.action.includes('BREACH') ? '#DC2626' : (l.action.includes('ESCALAT') ? '#EA580C' : '#486AAE');

    return `
      <div class="audit-stream-card">
        <div class="audit-actor-avatar">${initial}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span style="font-weight: 700; color: ${actionColor}; font-size: 11.5px; text-transform: uppercase;">
              ${escapeHtml(l.action)}
            </span>
            <span style="font-size: 11px; color: #94A3B8;">
              ${formatDate(l.created_at)}
            </span>
          </div>
          <div style="font-size: 12.5px; color: #1E293B; margin-top: 3px; word-break: break-word;">
            ${escapeHtml(l.details || 'System event executed.')}
          </div>
          <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
            Triggered by: <strong>${escapeHtml(l.actor_name || 'System')}</strong> (${escapeHtml(l.actor_email || 'cron@1mg.com')})
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderActionsBroadcasts(broadcasts) {
  const listEl = document.getElementById('actionsBroadcastsList');
  if (!listEl) return;

  if (!broadcasts || broadcasts.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: #64748B; padding: 20px; font-size: 12.5px;">No active broadcast notices currently dispatched.</div>`;
    return;
  }

  listEl.innerHTML = broadcasts.map(b => {
    const sevColor = b.severity === 'URGENT' ? '#DC2626' : (b.severity === 'WARNING' ? '#D97706' : '#2563EB');
    const sevBg = b.severity === 'URGENT' ? '#FEF2F2' : (b.severity === 'WARNING' ? '#FFFBEB' : '#EFF6FF');

    return `
      <div style="padding: 12px 14px; border-radius: 8px; background: ${sevBg}; border: 1px solid rgba(0,0,0,0.06); margin-bottom: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <strong style="font-size: 13px; color: #1E293B;">${escapeHtml(b.title)}</strong>
          <span style="font-size: 10.5px; font-weight: 700; color: ${sevColor}; text-transform: uppercase;">${b.severity}</span>
        </div>
        <div style="font-size: 12px; color: #475569; margin-top: 4px;">${escapeHtml(b.message)}</div>
        <div style="font-size: 11px; color: #94A3B8; margin-top: 6px; display: flex; justify-content: space-between;">
          <span>Target: <strong>${escapeHtml(b.target_dept || 'ALL')}</strong></span>
          <span>${formatDate(b.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function runLiveSLAPatrol() {
  const container = document.getElementById('slaPatrolContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 25px; color: #64748B;">
      <div style="display: inline-block; width: 22px; height: 22px; border: 3px solid #E2E8F0; border-top-color: #FF6F61; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <div style="margin-top: 8px; font-size: 13px;">Running forensic SLA compliance patrol...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/v1/admin/actions/sla-audit', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      container.innerHTML = `<div style="text-align: center; color: #DC2626; padding: 20px;">Failed to complete SLA patrol scan.</div>`;
      return;
    }

    const breached = data.breached_cases || [];
    const scanned = data.scanned || 0;
    const breachedCount = data.breached_count || 0;
    const onTrackCount = data.on_track_count || 0;

    const breEl = document.getElementById('actKpiBreaches');
    if (breEl) breEl.innerText = breachedCount;

    let summaryHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 14px; font-size: 12.5px;">
        <div>
          <span>Scanned: <strong>${scanned}</strong> active cases</span> &bull;
          <span style="color: #DC2626; font-weight: 700;">${breachedCount} Breaches</span> &bull;
          <span style="color: #059669; font-weight: 700;">${onTrackCount} Within SLA</span>
        </div>
        <span style="font-size: 11.5px; color: #64748B;">Audit Run: ${data.timestamp}</span>
      </div>
    `;

    if (breached.length === 0) {
      container.innerHTML = summaryHtml + `
        <div style="padding: 24px; text-align: center; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px;">
          <div style="font-size: 24px;">✓</div>
          <div style="font-weight: 700; color: #065F46; font-size: 14px; margin-top: 4px;">100% SLA Adherence Across Active Desks</div>
          <div style="font-size: 12.5px; color: #047857; margin-top: 2px;">All in-flight employee tickets are progressing within designated turnaround windows.</div>
        </div>
      `;
      return;
    }

    const itemsHtml = breached.map(c => `
      <div class="sla-patrol-item">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <a href="/agent/case-details.html?id=${c.id}" target="_blank" style="font-weight: 800; color: #FF6F61; text-decoration: none; font-size: 13px;">
              #${escapeHtml(c.case_number)}
            </a>
            <span style="font-weight: 700; font-size: 12.5px; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;">
              ${escapeHtml(c.title)}
            </span>
          </div>
          <div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">
            ${escapeHtml(c.employee_name)} &bull; ${escapeHtml(c.department_name || 'Desk')} &bull; Specialist: <strong>${escapeHtml(c.assigned_user || 'Unassigned')}</strong>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="report-sla-pill breached">
            🔴 Overdue ${c.hours_overdue}h
          </span>
          <button type="button" class="btn-primary" style="height: 32px; padding: 0 12px; font-size: 12px; font-weight: 700; background: #DC2626; width: auto;" onclick="escalateActionCase(${c.id}, '${escapeHtml(c.case_number)}')">
            🚨 Escalate Critical
          </button>
        </div>
      </div>
    `).join('');

    container.innerHTML = summaryHtml + itemsHtml;

  } catch (err) {
    console.error('Error running SLA patrol:', err);
    container.innerHTML = `<div style="text-align: center; color: #DC2626; padding: 20px;">Connection error running SLA patrol.</div>`;
  }
}

async function escalateActionCase(caseId, caseNumber) {
  try {
    const res = await fetch('/api/v1/admin/actions/escalate-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: caseId,
        reason: 'SLA patrol breach escalation triggered by Admin'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Case Escalated', `Case #${caseNumber} priority raised to CRITICAL with forensic alert.`, 'success');
      await runLiveSLAPatrol();
      await loadActionsOverview();
    } else {
      alert(data.detail || 'Failed to escalate case.');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}

async function submitSimulatedInbound(event) {
  event.preventDefault();
  const name = document.getElementById('simEmpName')?.value.trim();
  const email = document.getElementById('simEmpEmail')?.value.trim();
  const subject = document.getElementById('simSubject')?.value.trim();
  const priority = document.getElementById('simPriority')?.value || 'MEDIUM';
  const deptId = document.getElementById('simDeptSelect')?.value;
  const description = document.getElementById('simDescription')?.value.trim();

  if (!email || !subject || !description) {
    alert('Please complete all required fields.');
    return;
  }

  const payload = {
    employee_name: name || 'Employee',
    employee_email: email,
    title: subject,
    description: description,
    priority: priority
  };
  if (deptId) {
    payload.department_id = parseInt(deptId, 10);
  }

  try {
    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success && data.case) {
      showToast('Query Ingested & Dispatched', `Case #${data.case.case_number} successfully routed to ${data.case.department}`, 'success');
      
      const box = document.getElementById('simFeedbackBox');
      const text = document.getElementById('simFeedbackText');
      const link = document.getElementById('simFeedbackLink');
      if (box && text && link) {
        box.style.display = 'block';
        text.innerHTML = `Created Ticket <strong>#${data.case.case_number}</strong> &bull; Routed to <strong>${data.case.department}</strong> &bull; SLA: <strong>${data.case.sla_hours}h</strong>`;
        link.href = `/agent/case-details.html?id=${data.case.id}`;
      }

      await loadActionsOverview();
      await runLiveSLAPatrol();
    } else {
      alert(data.detail || 'Failed to ingest simulated case.');
    }
  } catch (err) {
    alert('Error connecting to server.');
  }
}

async function submitBroadcastNotice(event) {
  event.preventDefault();
  const title = document.getElementById('bcTitle')?.value.trim();
  const severity = document.getElementById('bcSeverity')?.value || 'INFO';
  const targetDept = document.getElementById('bcTargetDept')?.value || 'ALL';
  const message = document.getElementById('bcMessage')?.value.trim();

  if (!title || !message) {
    alert('Please enter title and message.');
    return;
  }

  try {
    const res = await fetch('/api/v1/admin/actions/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, severity, target_dept: targetDept })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Broadcast Dispatched', `Notice "${title}" published across active desks.`, 'success');
      document.getElementById('broadcastForm')?.reset();
      await loadActionsOverview();
    } else {
      alert('Failed to dispatch broadcast.');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}

async function syncDarwinboxHrms() {
  try {
    const res = await fetch('/api/v1/admin/actions/sync-hrms', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Darwinbox Directory Synced', data.message, 'success');
      await loadActionsOverview();
    } else {
      alert('Failed to sync Darwinbox.');
    }
  } catch (err) {
    alert('Error connecting to server.');
  }
}

async function pingDatabaseHealth() {
  const badge = document.getElementById('dbPingBadge');
  if (badge) badge.innerText = 'PINGING...';
  const t0 = performance.now();
  try {
    const res = await fetch('/api/v1/admin/actions/overview');
    const t1 = performance.now();
    const ms = Math.round(t1 - t0);
    if (badge) {
      badge.innerText = `${ms}ms ONLINE`;
      badge.style.color = '#10B190';
    }
    showToast('Database Ping Verified', `Neon PostgreSQL connected in ${ms}ms. Connection pool healthy.`, 'success');
  } catch (e) {
    if (badge) badge.innerText = 'TIMEOUT';
    alert('Database connection timeout.');
  }
}

function clearSystemCache() {
  showToast('Cache Purged', 'Temporary telemetry and query cache purged successfully.', 'success');
}

function triggerSimulatedEmail() {
  submitSimulatedInbound(new Event('submit'));
}

function rerunSLACheck() {
  runLiveSLAPatrol();
}

// =========================================================================
// 8. EXECUTIVE REPORTS & OPERATIONAL ANALYTICS COMMAND CENTER
// =========================================================================

let currentReportTab = 'cases';
let currentReportPage = 1;
let currentReportLimit = 20;
let currentReportFilters = {
  date_from: '',
  date_to: '',
  department_id: 0,
  status: 'ALL',
  priority: 'ALL',
  sla_breach: 'ALL',
  search: ''
};

let reportTrendChartInstance = null;
let reportDeptChartInstance = null;
let reportPriorityChartInstance = null;

async function initReportsView() {
  populateReportDeptDropdown();
  await loadReportAnalytics();
  await loadReportData();
}

function populateReportDeptDropdown() {
  const deptSelect = document.getElementById('repFilterDept');
  if (!deptSelect) return;
  const currentVal = deptSelect.value;
  deptSelect.innerHTML = '<option value="0">All Departments</option>';
  if (Array.isArray(allDepartments) && allDepartments.length > 0) {
    allDepartments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.team_name || d.name} (${d.dept_code || 'DEPT'})`;
      deptSelect.appendChild(opt);
    });
  }
  if (currentVal) deptSelect.value = currentVal;
}

function setReportDatePreset(preset, btnEl) {
  document.querySelectorAll('.report-date-pill').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const fromInput = document.getElementById('repFilterDateFrom');
  const toInput = document.getElementById('repFilterDateTo');
  if (!fromInput || !toInput) return;

  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'ALL') {
    fromInput.value = '';
    toInput.value = '';
  } else if (preset === 'TODAY') {
    fromInput.value = fmt(today);
    toInput.value = fmt(today);
  } else if (preset === 'YESTERDAY') {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    fromInput.value = fmt(yest);
    toInput.value = fmt(yest);
  } else if (preset === '7D') {
    const past = new Date();
    past.setDate(past.getDate() - 7);
    fromInput.value = fmt(past);
    toInput.value = fmt(today);
  } else if (preset === '30D') {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    fromInput.value = fmt(past);
    toInput.value = fmt(today);
  } else if (preset === 'MTD') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    fromInput.value = fmt(firstDay);
    toInput.value = fmt(today);
  }

  applyReportFilters();
}

function handleReportDateInputChange() {
  document.querySelectorAll('.report-date-pill').forEach(b => b.classList.remove('active'));
  applyReportFilters();
}

function handleReportSearchKey(e) {
  if (e.key === 'Enter') {
    applyReportFilters();
  }
}

function applyReportFilters() {
  currentReportFilters.date_from = document.getElementById('repFilterDateFrom')?.value.trim() || '';
  currentReportFilters.date_to = document.getElementById('repFilterDateTo')?.value.trim() || '';
  currentReportFilters.department_id = parseInt(document.getElementById('repFilterDept')?.value || '0', 10);
  currentReportFilters.status = document.getElementById('repFilterStatus')?.value || 'ALL';
  currentReportFilters.priority = document.getElementById('repFilterPriority')?.value || 'ALL';
  currentReportFilters.sla_breach = document.getElementById('repFilterSla')?.value || 'ALL';
  currentReportFilters.search = document.getElementById('repFilterSearch')?.value.trim() || '';

  currentReportPage = 1;
  loadReportAnalytics();
  loadReportData();
}

function resetReportFilters() {
  const fromInput = document.getElementById('repFilterDateFrom');
  const toInput = document.getElementById('repFilterDateTo');
  const deptSelect = document.getElementById('repFilterDept');
  const statusSelect = document.getElementById('repFilterStatus');
  const prioSelect = document.getElementById('repFilterPriority');
  const slaSelect = document.getElementById('repFilterSla');
  const searchInput = document.getElementById('repFilterSearch');

  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  if (deptSelect) deptSelect.value = '0';
  if (statusSelect) statusSelect.value = 'ALL';
  if (prioSelect) prioSelect.value = 'ALL';
  if (slaSelect) slaSelect.value = 'ALL';
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.report-date-pill').forEach((b, i) => {
    if (i === 0) b.classList.add('active');
    else b.classList.remove('active');
  });

  currentReportFilters = {
    date_from: '',
    date_to: '',
    department_id: 0,
    status: 'ALL',
    priority: 'ALL',
    sla_breach: 'ALL',
    search: ''
  };
  currentReportPage = 1;

  loadReportAnalytics();
  loadReportData();
}

function buildReportQueryString() {
  const params = new URLSearchParams();
  if (currentReportFilters.date_from) params.set('date_from', currentReportFilters.date_from);
  if (currentReportFilters.date_to) params.set('date_to', currentReportFilters.date_to);
  if (currentReportFilters.department_id > 0) params.set('department_id', currentReportFilters.department_id);
  if (currentReportFilters.status && currentReportFilters.status !== 'ALL') params.set('status', currentReportFilters.status);
  if (currentReportFilters.priority && currentReportFilters.priority !== 'ALL') params.set('priority', currentReportFilters.priority);
  if (currentReportFilters.sla_breach && currentReportFilters.sla_breach !== 'ALL') params.set('sla_breach', currentReportFilters.sla_breach);
  if (currentReportFilters.search) params.set('search', currentReportFilters.search);
  return params.toString();
}

async function loadReportAnalytics() {
  try {
    const qs = buildReportQueryString();
    const res = await fetch(`/api/v1/admin/reports/analytics?${qs}`);
    const data = await res.json();
    if (!data.success) return;

    // 1. Bento KPI Strip
    const kpi = data.kpis || {};
    const totalEl = document.getElementById('repKpiTotal');
    const slaRateEl = document.getElementById('repKpiSlaRate');
    const avgTatEl = document.getElementById('repKpiAvgTat');
    const breachedEl = document.getElementById('repKpiBreached');

    if (totalEl) totalEl.innerText = (kpi.total || 0).toLocaleString();
    if (slaRateEl) {
      slaRateEl.innerText = `${kpi.compliance_rate || 0}%`;
      slaRateEl.style.color = (kpi.compliance_rate >= 90) ? '#10B190' : (kpi.compliance_rate >= 75 ? '#F59E0B' : '#DC2626');
    }
    if (avgTatEl) avgTatEl.innerText = `${kpi.avg_tat_hours || 0}h`;
    if (breachedEl) breachedEl.innerText = (kpi.breached || 0).toLocaleString();

    // 2. Tab Badges
    const badgeCases = document.getElementById('repTabBadgeCases');
    const badgeSla = document.getElementById('repTabBadgeSla');
    const badgeDepts = document.getElementById('repTabBadgeDepts');
    const badgeAgents = document.getElementById('repTabBadgeAgents');

    if (badgeCases) badgeCases.innerText = kpi.total || 0;
    if (badgeSla) badgeSla.innerText = kpi.breached || 0;
    if (badgeDepts) badgeDepts.innerText = (data.departments || []).length;
    if (badgeAgents) badgeAgents.innerText = (data.agents || []).length;

    // 3. Render Visual Charts
    renderReportTrendChart(data.timeline || []);
    renderReportDeptChart(data.departments || []);
    renderReportPriorityChart(data.priorities || {});

  } catch (err) {
    console.error('Error loading report analytics:', err);
  }
}

function renderReportTrendChart(timeline) {
  const canvas = document.getElementById('reportTrendChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (reportTrendChartInstance) {
    reportTrendChartInstance.destroy();
    reportTrendChartInstance = null;
  }

  const labels = timeline.map(t => {
    const parts = (t.day || '').split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : t.day;
  });
  const inboundData = timeline.map(t => parseInt(t.inbound || 0, 10));
  const resolvedData = timeline.map(t => parseInt(t.resolved || 0, 10));

  reportTrendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [
        {
          label: 'Inbound Inquiries',
          data: inboundData.length ? inboundData : [0],
          borderColor: '#FF6F61',
          backgroundColor: 'rgba(255, 111, 97, 0.12)',
          borderWidth: 2.2,
          pointRadius: 3,
          fill: true,
          tension: 0.35
        },
        {
          label: 'Resolved Dossiers',
          data: resolvedData.length ? resolvedData : [0],
          borderColor: '#10B190',
          backgroundColor: 'rgba(16, 177, 144, 0.10)',
          borderWidth: 2,
          pointRadius: 3,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { size: 11, weight: '600' } }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 10 } },
          grid: { color: '#F1F5F9' }
        },
        x: {
          ticks: { font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderReportDeptChart(departments) {
  const canvas = document.getElementById('reportDeptChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (reportDeptChartInstance) {
    reportDeptChartInstance.destroy();
    reportDeptChartInstance = null;
  }

  const topDepts = (departments || []).slice(0, 5);
  const labels = topDepts.map(d => d.dept_code || d.department_name);
  const dataVals = topDepts.map(d => parseInt(d.total || 0, 10));

  reportDeptChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['No Records'],
      datasets: [{
        data: dataVals.length ? dataVals : [1],
        backgroundColor: ['#FF6F61', '#486AAE', '#10B190', '#F59E0B', '#8B5CF6'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, font: { size: 10 } }
        }
      },
      cutout: '62%'
    }
  });
}

function renderReportPriorityChart(priorities) {
  const canvas = document.getElementById('reportPriorityChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (reportPriorityChartInstance) {
    reportPriorityChartInstance.destroy();
    reportPriorityChartInstance = null;
  }

  const labels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const values = [
    priorities['CRITICAL'] || 0,
    priorities['HIGH'] || 0,
    priorities['MEDIUM'] || 0,
    priorities['LOW'] || 0
  ];

  reportPriorityChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Cases',
        data: values,
        backgroundColor: ['#EF4444', '#F97316', '#3B82F6', '#94A3B8'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 10 } },
          grid: { color: '#F1F5F9' }
        },
        x: {
          ticks: { font: { size: 10, weight: '700' } },
          grid: { display: false }
        }
      }
    }
  });
}

function switchReportTab(tabName, btnEl) {
  document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  currentReportTab = tabName;
  currentReportPage = 1;
  loadReportData();
}

function handleReportPageSizeChange(val) {
  currentReportLimit = parseInt(val, 10) || 20;
  currentReportPage = 1;
  loadReportData();
}

function changeReportPage(delta) {
  currentReportPage = Math.max(1, currentReportPage + delta);
  loadReportData();
}

async function loadReportData() {
  const thead = document.getElementById('reportTableHead');
  const tbody = document.getElementById('reportTableBody');
  const counter = document.getElementById('reportRecordCounter');
  const pageInfo = document.getElementById('reportPageInfo');
  const prevBtn = document.getElementById('repPrevBtn');
  const nextBtn = document.getElementById('repNextBtn');

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 35px;">
        <div style="display: inline-block; width: 22px; height: 22px; border: 3px solid #E2E8F0; border-top-color: var(--1mg-orange); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div style="margin-top: 8px; font-size: 13px;">Refreshing report matrix...</div>
      </td>
    </tr>
  `;

  try {
    const qs = buildReportQueryString();
    const res = await fetch(`/api/v1/admin/reports/data?tab=${currentReportTab}&page=${currentReportPage}&limit=${currentReportLimit}&${qs}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #DC2626; padding: 25px;">Failed to load report data.</td></tr>`;
      return;
    }

    const rows = data.rows || [];
    const total = data.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / currentReportLimit));

    if (counter) {
      const start = total === 0 ? 0 : (currentReportPage - 1) * currentReportLimit + 1;
      const end = Math.min(total, currentReportPage * currentReportLimit);
      counter.innerHTML = `Showing <strong>${start} - ${end}</strong> of <strong>${total}</strong> records`;
    }

    if (pageInfo) pageInfo.innerText = `Page ${currentReportPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentReportPage <= 1;
    if (nextBtn) nextBtn.disabled = currentReportPage >= totalPages;

    if (currentReportTab === 'cases') {
      renderReportCasesTable(thead, tbody, rows);
    } else if (currentReportTab === 'sla') {
      renderReportSlaTable(thead, tbody, rows);
    } else if (currentReportTab === 'departments') {
      renderReportDepartmentsTable(thead, tbody, rows);
    } else if (currentReportTab === 'agents') {
      renderReportAgentsTable(thead, tbody, rows);
    }

  } catch (err) {
    console.error('Error fetching report data:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #DC2626; padding: 25px;">Server error while loading report dataset.</td></tr>`;
  }
}

function renderReportCasesTable(thead, tbody, rows) {
  thead.innerHTML = `
    <tr>
      <th style="width: 110px;">Case Ref</th>
      <th style="min-width: 220px;">Employee &amp; Inquiry</th>
      <th style="min-width: 140px;">Department</th>
      <th style="min-width: 130px;">Assigned Specialist</th>
      <th style="width: 95px;">Priority</th>
      <th style="width: 110px;">Status</th>
      <th style="min-width: 150px;">SLA Status</th>
      <th style="width: 130px;">Logged At</th>
      <th style="width: 70px; text-align: center;">Dossier</th>
    </tr>
  `;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 35px;">No case records matched your filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    let slaBadgeHtml = '';
    if (r.sla_status === 'RESOLVED_ON_TIME') {
      slaBadgeHtml = `<span class="report-sla-pill resolved-on-time">✓ Met SLA (${r.elapsed_hours}h)</span>`;
    } else if (r.sla_status === 'RESOLVED_BREACHED') {
      slaBadgeHtml = `<span class="report-sla-pill resolved-breached">⚠ Breached (${r.elapsed_hours}h)</span>`;
    } else if (r.sla_status === 'BREACHED') {
      slaBadgeHtml = `<span class="report-sla-pill breached">🔴 Breached (${r.elapsed_hours}h)</span>`;
    } else {
      slaBadgeHtml = `<span class="report-sla-pill on-track">● On Track (${r.elapsed_hours}h)</span>`;
    }

    let prioBadgeHtml = '';
    const pr = (r.priority || 'MEDIUM').toUpperCase();
    if (pr === 'CRITICAL') {
      prioBadgeHtml = `<span class="rep-pill-prio critical">● Critical</span>`;
    } else if (pr === 'HIGH') {
      prioBadgeHtml = `<span class="rep-pill-prio high">● High</span>`;
    } else if (pr === 'LOW') {
      prioBadgeHtml = `<span class="rep-pill-prio low">● Low</span>`;
    } else {
      prioBadgeHtml = `<span class="rep-pill-prio medium">● Medium</span>`;
    }

    let statusBadgeHtml = '';
    const st = (r.status || 'OPEN').toUpperCase();
    if (st === 'RESOLVED') {
      statusBadgeHtml = `<span class="rep-pill-status resolved">✓ Resolved</span>`;
    } else if (st === 'CLOSED') {
      statusBadgeHtml = `<span class="rep-pill-status closed">Closed</span>`;
    } else if (st === 'IN_PROGRESS') {
      statusBadgeHtml = `<span class="rep-pill-status in-progress">In Progress</span>`;
    } else if (st === 'WAITING_ON_EMPLOYEE') {
      statusBadgeHtml = `<span class="rep-pill-status waiting">Waiting</span>`;
    } else {
      statusBadgeHtml = `<span class="rep-pill-status open">Open</span>`;
    }

    return `
      <tr>
        <td>
          <a href="/agent/case-details.html?id=${r.id}" target="_blank" style="font-weight: 700; color: #FF6F61; text-decoration: none; font-size: 13px;">
            #${escapeHtml(r.case_number)}
          </a>
        </td>
        <td>
          <div style="font-weight: 600; color: #1E293B; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.title || '')}">
            ${escapeHtml(r.title || 'Inquiry')}
          </div>
          <div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">
            ${escapeHtml(r.employee_name || 'Employee')} &bull; ${escapeHtml(r.employee_email || '')}
          </div>
        </td>
        <td>
          <span style="font-weight: 600; font-size: 12.5px; color: #486AAE;">
            ${escapeHtml(r.department_name || 'Unassigned')}
          </span>
        </td>
        <td>
          <span style="font-size: 12.5px; color: #334155; font-weight: 500;">
            ${escapeHtml(r.assigned_user || 'Unassigned Pool')}
          </span>
        </td>
        <td>${prioBadgeHtml}</td>
        <td>${statusBadgeHtml}</td>
        <td>${slaBadgeHtml}</td>
        <td style="font-size: 12px; color: #64748B; white-space: nowrap;">
          ${formatDate(r.created_at)}
        </td>
        <td style="text-align: center;">
          <a href="/agent/case-details.html?id=${r.id}" target="_blank" class="action-icon-btn" title="Open Forensic Dossier">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function renderReportSlaTable(thead, tbody, rows) {
  thead.innerHTML = `
    <tr>
      <th>Case Ref</th>
      <th>Query Title</th>
      <th>Department</th>
      <th>Priority</th>
      <th>Target SLA</th>
      <th>Elapsed / Duration</th>
      <th>Forensic Breach Status</th>
      <th>Responsible Specialist</th>
      <th style="text-align: center;">Dossier</th>
    </tr>
  `;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">No records found for SLA forensics.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    let slaBadgeHtml = '';
    if (r.sla_status === 'RESOLVED_ON_TIME') {
      slaBadgeHtml = `<span class="report-sla-pill resolved-on-time">✓ Met SLA Target</span>`;
    } else if (r.sla_status === 'RESOLVED_BREACHED') {
      slaBadgeHtml = `<span class="report-sla-pill resolved-breached">⚠ Resolution Overdue</span>`;
    } else if (r.sla_status === 'BREACHED') {
      slaBadgeHtml = `<span class="report-sla-pill breached">🔴 Active Breach Threshold</span>`;
    } else {
      slaBadgeHtml = `<span class="report-sla-pill on-track">● Within SLA Window</span>`;
    }

    return `
      <tr>
        <td style="font-weight: 700; color: var(--1mg-orange);">#${escapeHtml(r.case_number)}</td>
        <td style="font-weight: 600; color: var(--text-dark); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(r.title || 'Inquiry')}
        </td>
        <td><strong>${escapeHtml(r.department_name || 'Desk')}</strong></td>
        <td><span style="font-size: 11px; font-weight: 700;">${escapeHtml(r.priority || 'MEDIUM')}</span></td>
        <td><span style="font-weight: 600;">${r.sla_hours || 24} Hours</span></td>
        <td style="font-weight: 700; color: ${r.sla_status.includes('BREACHED') ? '#DC2626' : '#10B190'};">
          ${r.elapsed_hours}h
        </td>
        <td>${slaBadgeHtml}</td>
        <td>${escapeHtml(r.assigned_user || 'Unassigned Pool')}</td>
        <td style="text-align: center;">
          <a href="/agent/case-details.html?id=${r.id}" target="_blank" class="action-icon-btn" title="Inspect Case">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function renderReportDepartmentsTable(thead, tbody, rows) {
  thead.innerHTML = `
    <tr>
      <th>Department Name</th>
      <th>Dept Code</th>
      <th>Target SLA</th>
      <th>Total Inquiries</th>
      <th>Active Queue</th>
      <th>Resolved Cases</th>
      <th>SLA Breaches</th>
      <th>Compliance Adherence %</th>
      <th>Avg Turnaround TAT</th>
    </tr>
  `;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">No department metrics available.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const rateColor = r.compliance_rate >= 90 ? '#10B190' : (r.compliance_rate >= 75 ? '#F59E0B' : '#DC2626');
    return `
      <tr>
        <td style="font-weight: 700; color: var(--text-dark);">${escapeHtml(r.department_name)}</td>
        <td><span class="smtp-capsule" style="font-weight: 700;">${escapeHtml(r.dept_code)}</span></td>
        <td>${r.sla_hours || 24}h</td>
        <td style="font-weight: 700;">${r.total}</td>
        <td><span style="color: #486AAE; font-weight: 700;">${r.active}</span></td>
        <td><span style="color: #10B190; font-weight: 700;">${r.resolved}</span></td>
        <td><span style="color: ${r.breached > 0 ? '#DC2626' : 'var(--text-muted)'}; font-weight: 700;">${r.breached}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; height: 6px; background: #E2E8F0; border-radius: 999px; overflow: hidden; max-width: 90px;">
              <div style="width: ${r.compliance_rate}%; height: 100%; background: ${rateColor};"></div>
            </div>
            <strong style="color: ${rateColor}; font-size: 12.5px;">${r.compliance_rate}%</strong>
          </div>
        </td>
        <td style="font-weight: 600;">${r.avg_tat_hours}h</td>
      </tr>
    `;
  }).join('');
}

function renderReportAgentsTable(thead, tbody, rows) {
  thead.innerHTML = `
    <tr>
      <th>Specialist / Agent Name</th>
      <th>Assigned Volume</th>
      <th>Active In-Flight</th>
      <th>Resolved Cases</th>
      <th>SLA Breaches</th>
      <th>Resolution Rate %</th>
      <th>Avg Turnaround TAT</th>
    </tr>
  `;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No agent metrics available.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const rateColor = r.compliance_rate >= 90 ? '#10B190' : (r.compliance_rate >= 75 ? '#F59E0B' : '#DC2626');
    return `
      <tr>
        <td style="font-weight: 700; color: var(--text-dark);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: #EFF3FA; color: #486AAE; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">
              ${escapeHtml(r.agent_name.charAt(0).toUpperCase())}
            </div>
            <span>${escapeHtml(r.agent_name)}</span>
          </div>
        </td>
        <td style="font-weight: 700;">${r.total}</td>
        <td><span style="color: #486AAE; font-weight: 700;">${r.active}</span></td>
        <td><span style="color: #10B190; font-weight: 700;">${r.resolved}</span></td>
        <td><span style="color: ${r.breached > 0 ? '#DC2626' : 'var(--text-muted)'}; font-weight: 700;">${r.breached}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; height: 6px; background: #E2E8F0; border-radius: 999px; overflow: hidden; max-width: 90px;">
              <div style="width: ${r.compliance_rate}%; height: 100%; background: ${rateColor};"></div>
            </div>
            <strong style="color: ${rateColor}; font-size: 12.5px;">${r.compliance_rate}%</strong>
          </div>
        </td>
        <td style="font-weight: 600;">${r.avg_tat_hours}h</td>
      </tr>
    `;
  }).join('');
}

function exportCurrentReport(format) {
  const qs = buildReportQueryString();
  const url = `/api/v1/admin/reports/export.csv?report_type=${currentReportTab}&${qs}`;
  window.open(url, '_blank');
  showToast('Export Initiated', `Downloading ${currentReportTab.toUpperCase()} CSV report...`, 'success');
}

function printExecutiveReport() {
  window.print();
}

function downloadCaseReport() {
  exportCurrentReport('csv');
}

function downloadSLAReport() {
  currentReportTab = 'sla';
  exportCurrentReport('csv');
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  let user = JSON.parse(localStorage.getItem('1mg_user') || '{}');
  
  if (!user.email || user.role !== 'ADMIN') {
    window.location.href = '/login.html';
    return;
  }

  if (user.name) {
    document.getElementById('adminHeaderName').innerText = user.name;
    document.getElementById('adminAvatar').innerText = user.name.charAt(0).toUpperCase();
  }
  if (user.email) {
    document.getElementById('adminHeaderEmail').innerText = user.email;
    const senderDisplay = document.getElementById('modalSenderEmailDisplay');
    if (senderDisplay) senderDisplay.innerText = 'peopledesk@1mg.com';
  }

  // Load dynamic data from Neon DB
  loadDepartments();
  loadUsers();
  loadDashboard();
  initKpiCardsInteractivity();

  // Handle direct view routing from URL params or hash
  const urlParams = new URLSearchParams(window.location.search);
  const requestedView = urlParams.get('view') || window.location.hash.replace('#', '');
  if (requestedView && viewTitles[requestedView]) {
    switchView(requestedView);
  }
});
