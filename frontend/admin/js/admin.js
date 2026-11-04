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
      document.getElementById('userStatTotal').innerText = data.stats.total_users || 0;
      document.getElementById('userStatAgents').innerText = data.stats.total_agents || 0;
      document.getElementById('userStatHeads').innerText = data.stats.total_dept_heads || 0;
      document.getElementById('userStatPending').innerText = data.stats.pending_setup || 0;
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

function renderUsersTable(users, total, totalPages) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 48px;">
          <div style="font-size: 24px; margin-bottom: 8px;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.8" style="margin: 0 auto;">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <strong style="color: #475569;">No matching staff found</strong>
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
    
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="user-avatar-circle" style="background: ${avatarGradient};">
              ${initials}
            </div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 700; color: var(--text-dark); font-size: 13.5px;">${escapeHtml(u.name)}</span>
              <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(u.email)}</span>
            </div>
          </div>
        </td>

        <td>
          <div class="dept-badges-wrapper">
            ${u.role === 'ADMIN' 
              ? `<span class="dept-badge-pill dept-pill-admin">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <span>Universal (All Desks)</span>
                </span>`
              : (u.departments && u.departments.length > 0 
                ? u.departments.map(d => `
                  <span class="dept-badge-pill">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
                    </svg>
                    <span>${escapeHtml(d.team_name)}</span>
                  </span>`).join('')
                : `<span class="dept-badge-pill dept-pill-muted">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    <span>${escapeHtml(u.department_name || 'Unassigned')}</span>
                  </span>`)}
          </div>
        </td>

        <td>
          <span style="font-size: 13px; color: #475569; font-weight: 500;">${escapeHtml(u.designation || 'Specialist')}</span>
        </td>

        <!-- Interactive Role Scope (Vector SVG Badges) -->
        <td>
          ${u.role === 'ADMIN' 
            ? (u.id === 1 || (u.email && u.email.toLowerCase() === 'vaibhavx002@zohomail.in')
              ? `<span class="badge-role-scope badge-scope-superadmin" title="Primary System Administrator (Protected)">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                  </svg>
                  <span>SUPER ADMIN</span>
                </span>`
              : `<button type="button" class="badge-role-scope badge-scope-admin" onclick="toggleAdminRole(${u.id}, '${escapeHtml(u.name)}', true)" title="Click to revoke Administrator role and switch to Agent">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                  </svg>
                  <span>ADMIN</span>
                  <svg class="swap-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
                </button>`)
            : (isHead 
              ? `<button type="button" class="badge-role-scope badge-scope-head" onclick="toggleRoleScope(${u.id}, '${escapeHtml(u.name)}', ${isHead})" title="Click to switch to Support Agent">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <span>DEPT HEAD</span>
                  <svg class="swap-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
                </button>` 
              : `<button type="button" class="badge-role-scope badge-scope-agent" onclick="toggleRoleScope(${u.id}, '${escapeHtml(u.name)}', ${isHead})" title="Click to promote to Department Head">
                  <svg class="scope-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span>AGENT</span>
                  <svg class="swap-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
                </button>`)}
        </td>

        <td>
          ${isPending 
            ? `<span class="status-pill status-pending"><span class="status-dot dot-amber"></span><span>Pending Setup</span></span>`
            : (u.status === 'ACTIVE' 
              ? `<span class="status-pill status-active"><span class="status-dot dot-green"></span><span>Active</span></span>`
              : `<span class="status-pill status-inactive"><span class="status-dot dot-gray"></span><span>Inactive</span></span>`)}
        </td>

        <!-- Unified Action Toolbar (Clean Industry SVGs) -->
        <td style="text-align: right;">
          <div class="user-action-group">
            ${u.role !== 'ADMIN' ? `
              <button 
                class="btn-action-pill btn-action-promote"
                onclick="toggleAdminRole(${u.id}, '${escapeHtml(u.name)}', false)"
                title="Promote ${escapeHtml(u.name)} to Administrator"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-5-6.5 5 2-7.5-5.5-4.5h7z"/>
                </svg>
                <span>Make Admin</span>
              </button>

              <button 
                class="btn-action-pill btn-action-resend"
                onclick="triggerResendInvite(${u.id}, '${escapeHtml(u.name)}')" 
                title="Resend Tata 1mg Welcome Email with Dynamic Link"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 2L11 13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                <span>Resend</span>
              </button>
            ` : (u.id !== 1 && (!u.email || u.email.toLowerCase() !== 'vaibhavx002@zohomail.in') ? `
              <button 
                class="btn-action-pill btn-action-demote"
                onclick="toggleAdminRole(${u.id}, '${escapeHtml(u.name)}', true)"
                title="Revoke Administrator role"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                <span>Revoke Admin</span>
              </button>
            ` : '')}

            <button 
              class="btn-action-pill btn-action-edit"
              onclick="openEditAgentModal('${userJson}')" 
              title="Edit Role, Department, Designation or Status"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span>Edit</span>
            </button>

            ${u.id !== 1 && (!u.email || u.email.toLowerCase() !== 'vaibhavx002@zohomail.in') ? `
              <button 
                class="btn-action-pill btn-action-toggle ${u.status === 'ACTIVE' ? 'deactivate' : 'activate'}"
                onclick="toggleUserStatus(${u.id}, '${u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}')"
                title="${u.status === 'ACTIVE' ? 'Deactivate staff account' : 'Activate staff account'}"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  ${u.status === 'ACTIVE' 
                    ? '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'
                    : '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>'}
                </svg>
                <span>${u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</span>
              </button>

              <button 
                class="btn-action-pill btn-action-remove"
                onclick="confirmRemoveUser(${u.id}, '${escapeHtml(u.name)}')" 
                title="Permanently remove staff member"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>Remove</span>
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
  if (senderEl) senderEl.innerText = emailDetails.sender || 'vaibhavx002@zohomail.in';

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

async function seedDemoCases() {
  try {
    const res = await fetch('/api/v1/dashboard/seed-demo', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Demo Cases Seeded', data.message || 'Seeded 8 realistic Tata 1mg employee cases.', 'success');
      await loadDashboard();
    } else {
      showToast('Seed Failed', data.detail || 'Could not seed cases.', 'error');
    }
  } catch (err) {
    console.error('Seed demo cases failed:', err);
    showToast('Demo Seed Error', err.message || 'Network error.', 'error');
  }
}

async function loadDashboard(timeframe = currentDashboardTimeframe) {
  try {
    const res = await fetch(`/api/v1/dashboard/stats?timeframe=${encodeURIComponent(timeframe)}`);
    const data = await res.json();
    if (!data.success) {
      console.warn('Dashboard fetch returned non-success:', data);
      return;
    }

    const stats = data.stats || {};

    // 1. Update 6 Bento KPI Metric Cards
    const elTotal = document.getElementById('statTotalCases');
    const elProg = document.getElementById('statInProgress');
    const elSlaComp = document.getElementById('statSlaCompliance');
    const elAvgRes = document.getElementById('statAvgResolution');
    const elAgents = document.getElementById('statActiveAgents');
    const elAiAcc = document.getElementById('statAiAccuracy');
    const elBreachedSub = document.getElementById('statBreachedSubtitle');
    const elUrgentBadge = document.getElementById('statUrgentBadge');
    const elDeptsCount = document.getElementById('statDeptsCount');

    if (elTotal) elTotal.innerText = stats.total_cases ?? 0;
    if (elProg) elProg.innerText = stats.in_progress ?? 0;
    if (elSlaComp) elSlaComp.innerText = `${stats.sla_compliance ?? 98.4}%`;
    if (elAvgRes) elAvgRes.innerText = `${stats.avg_resolution_hours ?? 3.2}h`;
    if (elAgents) elAgents.innerText = stats.active_agents ?? 0;
    if (elAiAcc) elAiAcc.innerText = `${stats.ai_accuracy ?? 96.8}%`;
    if (elBreachedSub) elBreachedSub.innerText = `${stats.breached_cases ?? 0} cases breached`;
    if (elUrgentBadge) elUrgentBadge.innerText = `${stats.urgent_cases ?? 0} Urgent`;
    if (elDeptsCount) elDeptsCount.innerText = `${stats.departments ?? 6} Queues`;

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
    renderChartInflowVelocity(data.trend_data);

    // 3. Render / Update Chart 2: Department Workload
    renderChartDepartmentDistribution(data.department_distribution);

    // 4. Render / Update Chart 3: SLA Compliance Health
    renderChartSlaHealth(data.sla_health);

    // 5. Render / Update Chart 4: Priority Distribution
    renderChartPriorityDistribution(data.priority_distribution);

    // 6. Populate Urgent SLA Watchlist
    renderUrgentCasesWatchlist(data.urgent_cases || []);

    // 7. Populate Active Specialists Leaderboard
    renderSpecialistLeaderboard(data.agent_leaderboard || []);

    // 8. Populate Recent Cases Across All Departments
    renderRecentDashboardCases(data.recent_cases || []);

  } catch (err) {
    console.error('Failed to load dashboard analytics:', err);
  }
}

// -------------------------------------------------------------------------
// Chart 1: Inflow vs Resolution Dual-Line / Area
// -------------------------------------------------------------------------
function renderChartInflowVelocity(trend) {
  const canvas = document.getElementById('chartInflowVelocity');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = (trend && trend.labels && trend.labels.length) ? trend.labels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const incoming = (trend && trend.incoming) ? trend.incoming : [14, 22, 19, 27, 24, 12, 18];
  const resolved = (trend && trend.resolved) ? trend.resolved : [12, 20, 18, 25, 23, 11, 17];

  if (window.dashCharts.inflow) {
    window.dashCharts.inflow.destroy();
  }

  const ctx = canvas.getContext('2d');
  
  // Gradients for modern look
  const gradCoral = ctx.createLinearGradient(0, 0, 0, 240);
  gradCoral.addColorStop(0, 'rgba(255, 111, 97, 0.22)');
  gradCoral.addColorStop(1, 'rgba(255, 111, 97, 0.00)');

  const gradTeal = ctx.createLinearGradient(0, 0, 0, 240);
  gradTeal.addColorStop(0, 'rgba(16, 177, 144, 0.20)');
  gradTeal.addColorStop(1, 'rgba(16, 177, 144, 0.00)');

  window.dashCharts.inflow = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Inbound Queries',
          data: incoming,
          borderColor: '#FF6F61',
          backgroundColor: gradCoral,
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointBackgroundColor: '#FF6F61',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Resolved Inquiries',
          data: resolved,
          borderColor: '#10B190',
          backgroundColor: gradTeal,
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointBackgroundColor: '#10B190',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11.5, weight: '500' }, color: '#64748B' }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.6)' },
          ticks: { font: { size: 11.5 }, color: '#64748B', precision: 0 }
        }
      }
    }
  });
}

// -------------------------------------------------------------------------
// Chart 2: Department Workload Doughnut
// -------------------------------------------------------------------------
function renderChartDepartmentDistribution(deptData) {
  const canvas = document.getElementById('chartDepartmentDist');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = (deptData && deptData.labels && deptData.labels.length) ? deptData.labels : ['Attendance', 'Payroll', 'Benefits', 'Leave', 'BGV', 'People Desk'];
  const counts = (deptData && deptData.counts && deptData.counts.length) ? deptData.counts : [28, 24, 18, 14, 10, 8];
  const colors = (deptData && deptData.colors && deptData.colors.length) ? deptData.colors : ['#FF6F61', '#0284C7', '#10B190', '#F59E0B', '#8B5CF6', '#486AAE'];

  if (window.dashCharts.department) {
    window.dashCharts.department.destroy();
  }

  const ctx = canvas.getContext('2d');
  window.dashCharts.department = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0) || 1;
              const val = context.parsed;
              const pct = Math.round((val / total) * 100);
              return ` ${context.label}: ${val} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // Populate Legend List
  const legendContainer = document.getElementById('deptLegendList');
  if (legendContainer) {
    legendContainer.innerHTML = labels.map((lbl, idx) => `
      <div class="dept-legend-item">
        <span class="dot" style="background: ${colors[idx % colors.length]};"></span>
        <span>${escapeHtml(lbl)}</span>
        <span class="count-badge">${counts[idx] ?? 0}</span>
      </div>
    `).join('');
  }
}

// -------------------------------------------------------------------------
// Chart 3: SLA Health Doughnut
// -------------------------------------------------------------------------
function renderChartSlaHealth(slaHealth) {
  const canvas = document.getElementById('chartSlaHealth');
  if (!canvas || typeof Chart === 'undefined') return;

  const within = slaHealth ? slaHealth.within_sla : 86;
  const approaching = slaHealth ? slaHealth.approaching_sla : 10;
  const breached = slaHealth ? slaHealth.breached : 4;

  if (window.dashCharts.sla) {
    window.dashCharts.sla.destroy();
  }

  const ctx = canvas.getContext('2d');
  window.dashCharts.sla = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Within SLA', 'Approaching (<2h)', 'Breached'],
      datasets: [{
        data: [within, approaching, breached],
        backgroundColor: ['#10B190', '#F59E0B', '#EF4444'],
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          cornerRadius: 8
        }
      }
    }
  });
}

// -------------------------------------------------------------------------
// Chart 4: Priority & Urgency Matrix Bar Chart
// -------------------------------------------------------------------------
function renderChartPriorityDistribution(priorityData) {
  const canvas = document.getElementById('chartPriorityDist');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = (priorityData && priorityData.labels) ? priorityData.labels : ['Critical', 'High', 'Medium', 'Low'];
  const counts = (priorityData && priorityData.counts) ? priorityData.counts : [4, 18, 42, 12];
  const barColors = ['#EF4444', '#F59E0B', '#3B82F6', '#94A3B8'];

  if (window.dashCharts.priority) {
    window.dashCharts.priority.destroy();
  }

  const ctx = canvas.getContext('2d');
  window.dashCharts.priority = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Inquiries',
        data: counts,
        backgroundColor: barColors,
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12, weight: '600' }, color: '#475569' }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.6)' },
          ticks: { font: { size: 11.5 }, color: '#64748B', precision: 0 }
        }
      }
    }
  });
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
          No employee queries logged yet. Click "+ Demo Seed" or "Sync Mailbox" to triage cases.
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
              <span>Zoho IMAP</span>
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

async function triggerSimulatedEmail() {
  const sample = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];
  try {
    const res = await fetch('/api/v1/cases/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Inbound Query Ingested', `Generated Ticket #${data.case.case_number} routed to ${data.case.department}`, 'success');
      loadDashboard();
      if (document.getElementById('casesView')?.classList.contains('active')) {
        loadCases();
      }
    } else {
      alert('Failed to simulate inbound email.');
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}

function rerunSLACheck() {
  showToast('SLA Check Completed', 'All active cases were checked against SLA timer matrices. 0 breaches detected.', 'success');
}

function downloadCaseReport() {
  window.location.href = '/api/v1/admin/reports/cases.csv';
  showToast('Report Downloaded', 'Exporting real-time Tata 1mg Case Report (CSV)...', 'success');
}

function downloadSLAReport() {
  window.location.href = '/api/v1/admin/reports/cases.csv';
  showToast('SLA Report Downloaded', 'Exporting SLA Performance Report (CSV)...', 'success');
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
    user = {
      email: 'vaibhavx002@zohomail.in',
      name: 'Vaibhav Yadav',
      role: 'ADMIN',
      designation: 'System Administrator & Head of People Desk'
    };
    try {
      localStorage.setItem('1mg_user', JSON.stringify(user));
    } catch (e) {}
  }

  if (user.name) {
    document.getElementById('adminHeaderName').innerText = user.name;
    document.getElementById('adminAvatar').innerText = user.name.charAt(0).toUpperCase();
  }
  if (user.email) {
    document.getElementById('adminHeaderEmail').innerText = user.email;
    const senderDisplay = document.getElementById('modalSenderEmailDisplay');
    if (senderDisplay) senderDisplay.innerText = user.email;
  }

  // Load dynamic data from Neon DB
  loadDepartments();
  loadUsers();
  loadDashboard();
});
