/**
 * Tata 1mg People Desk - Login Controller
 * Handles email-first check, dynamic role branching (Admin vs Agent vs Onboarding)
 */

let currentSessionUser = null;

function showAlert(message, isError = true) {
  const alertBox = document.getElementById('alertBox');
  const alertMsg = document.getElementById('alertMsg');
  alertBox.className = isError ? 'alert-box alert-danger' : 'alert-box alert-success';
  alertMsg.innerText = message;
  alertBox.style.display = 'flex';
}

function hideAlert() {
  const alertBox = document.getElementById('alertBox');
  alertBox.style.display = 'none';
}

function showPane(paneId) {
  hideAlert();
  document.querySelectorAll('.step-pane').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(paneId);
  if (target) {
    target.classList.add('active');
  }
}

function goToEmailStep() {
  document.getElementById('pageTitle').innerText = 'Sign in to People Desk';
  document.getElementById('pageSubtitle').innerText = 'Enter your authorized email to continue';
  showPane('stepEmail');
  document.getElementById('emailInput').focus();
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerText = '🙈';
  } else {
    input.type = 'password';
    btn.innerText = '👁️';
  }
}

// =========================================================================
// STEP 1: CHECK EMAIL
// =========================================================================
async function handleCheckEmail(e) {
  e.preventDefault();
  hideAlert();
  
  const emailInput = document.getElementById('emailInput');
  const email = emailInput.value.trim().toLowerCase();
  const btn = document.getElementById('btnContinueEmail');

  if (!email) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div><span>Checking...</span>`;

  try {
    const res = await fetch('/api/v1/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!data.success || !data.exists) {
      showAlert(data.message || 'Email not registered in People Desk. Please contact your administrator.');
      btn.disabled = false;
      btn.innerHTML = `<span>Continue</span>`;
      return;
    }

    currentSessionUser = data;

    // Transition based on detected role & password status
    if (data.role === 'ADMIN') {
      // Branch A: Admin App Password
      document.getElementById('pageTitle').innerText = 'Admin Authentication';
      document.getElementById('pageSubtitle').innerText = 'Enter your secure app password to continue';
      document.getElementById('adminNameDisplay').innerText = data.name || 'Administrator';
      document.getElementById('adminEmailDisplay').innerText = data.email;
      showPane('stepAdminPassword');
      document.getElementById('adminAppPasswordInput').value = '';
      document.getElementById('adminAppPasswordInput').focus();

    } else if (data.role === 'HR_AGENT') {
      if (data.has_password) {
        // Branch B: Agent with existing password
        document.getElementById('pageTitle').innerText = 'Agent Sign In';
        document.getElementById('pageSubtitle').innerText = 'Welcome back! Enter your password';
        document.getElementById('agentNameDisplay').innerText = data.name || 'Agent';
        document.getElementById('agentEmailDisplay').innerText = data.email;
        document.getElementById('agentDeptDisplay').innerText = data.department_name || 'People Desk';
        
        // Department Head badge indicator
        const badge = document.getElementById('agentRoleBadge');
        if (data.is_dept_head) {
          badge.className = 'role-pill head';
          badge.innerText = 'DEPT HEAD';
        } else {
          badge.className = 'role-pill agent';
          badge.innerText = 'AGENT';
        }

        showPane('stepAgentPassword');
        document.getElementById('agentPasswordInput').value = '';
        document.getElementById('agentPasswordInput').focus();

      } else {
        // Branch C: Agent newly added by admin - Needs to create password
        document.getElementById('pageTitle').innerText = 'Activate Your Account';
        document.getElementById('pageSubtitle').innerText = 'Set a password to complete your onboarding';
        document.getElementById('onboardAgentName').innerText = data.name || 'Agent';
        document.getElementById('onboardDeptName').innerText = data.department_name || 'People Desk';

        showPane('stepSetPassword');
        document.getElementById('newPasswordInput').value = '';
        document.getElementById('confirmPasswordInput').value = '';
        document.getElementById('newPasswordInput').focus();
      }
    }

  } catch (err) {
    showAlert('Server connection error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Continue</span>`;
  }
}

// =========================================================================
// STEP 2A: ADMIN LOGIN
// =========================================================================
async function handleAdminLogin(e) {
  e.preventDefault();
  hideAlert();

  const password = document.getElementById('adminAppPasswordInput').value.trim();
  const btn = document.getElementById('btnAdminLogin');

  if (!password || !currentSessionUser) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div><span>Verifying...</span>`;

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentSessionUser.email, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showAlert(data.detail || 'Invalid Admin App Password. Please check and retry.');
      btn.disabled = false;
      btn.innerHTML = `<span>Sign In as Admin</span>`;
      return;
    }

    // Save session in localStorage
    localStorage.setItem('1mg_token', data.token);
    localStorage.setItem('1mg_user', JSON.stringify(data.user));

    showAlert('Authentication successful! Loading Admin Console...', false);

    setTimeout(() => {
      window.location.href = data.redirect_url || '/admin.html';
    }, 600);

  } catch (err) {
    showAlert('Login failed. Please check network connection.');
    btn.disabled = false;
    btn.innerHTML = `<span>Sign In as Admin</span>`;
  }
}

// =========================================================================
// STEP 2B: AGENT LOGIN
// =========================================================================
async function handleAgentLogin(e) {
  e.preventDefault();
  hideAlert();

  const password = document.getElementById('agentPasswordInput').value.trim();
  const btn = document.getElementById('btnAgentLogin');

  if (!password || !currentSessionUser) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div><span>Verifying...</span>`;

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentSessionUser.email, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showAlert(data.detail || 'Incorrect password. Please try again.');
      btn.disabled = false;
      btn.innerHTML = `<span>Sign In to Agent Workbench</span>`;
      return;
    }

    localStorage.setItem('1mg_token', data.token);
    localStorage.setItem('1mg_user', JSON.stringify(data.user));

    showAlert('Welcome back! Loading Workbench...', false);

    setTimeout(() => {
      window.location.href = data.redirect_url || '/agent.html';
    }, 600);

  } catch (err) {
    showAlert('Login failed. Please check connection.');
    btn.disabled = false;
    btn.innerHTML = `<span>Sign In to Agent Workbench</span>`;
  }
}

// =========================================================================
// STEP 2C: SET PASSWORD (ONBOARDING)
// =========================================================================
async function handleSetPassword(e) {
  e.preventDefault();
  hideAlert();

  const newPassword = document.getElementById('newPasswordInput').value.trim();
  const confirmPassword = document.getElementById('confirmPasswordInput').value.trim();
  const btn = document.getElementById('btnSetPassword');

  if (newPassword.length < 6) {
    showAlert('Password must be at least 6 characters long.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showAlert('Passwords do not match. Please re-enter.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div><span>Setting Password...</span>`;

  try {
    const res = await fetch('/api/v1/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentSessionUser.email,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showAlert(data.detail || 'Failed to set password. Please try again.');
      btn.disabled = false;
      btn.innerHTML = `<span>Set Password & Sign In</span>`;
      return;
    }

    localStorage.setItem('1mg_token', data.token);
    localStorage.setItem('1mg_user', JSON.stringify(data.user));

    showAlert('Password created successfully! Taking you to your workbench...', false);

    setTimeout(() => {
      window.location.href = data.redirect_url || '/agent.html';
    }, 700);

  } catch (err) {
    showAlert('Error setting password. Please try again.');
    btn.disabled = false;
    btn.innerHTML = `<span>Set Password & Sign In</span>`;
  }
}

// =========================================================================
// AUTO-PROCESS ACTIVATION LINK (from Welcome Email)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get('email');
  
  if (emailParam) {
    const emailInput = document.getElementById('emailInput');
    if (emailInput) {
      emailInput.value = emailParam.trim();
      // Auto-trigger check-email flow
      handleCheckEmail(new Event('submit'));
    }
  }
});


