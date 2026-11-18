/* Additive admin entry points. Existing Firebase collections and handlers are retained. */
const ADMIN_MANAGEMENT_OPTIONS = [
  ['students', 'Student Management'], ['marathon', 'Past Paper Marathon'],
  ['guidance', 'Guidance PDFs'], ['live', 'Live Classes'],
  ['tests', 'MCQ Test Manager'], ['analytics', 'Performance Analytics'],
  ['notices', 'Notice Management'], ['community', 'Community Moderation'],
];
function adminErrorText(error) {
  const code = String(error?.code || 'unknown').replace(/[^a-zA-Z0-9/_-]/g, '');
  const advice = {
    'permission-denied': 'Access was denied. Check the signed-in administrator and deployed Firestore rules.',
    'unauthenticated': 'Your session expired. Sign in again.',
    'unavailable': 'Firebase is unavailable. Check your connection and retry.',
    'failed-precondition': 'Firebase requires configuration. Check the database indexes and deployed rules.',
    'resource-exhausted': 'Firebase quota was reached. Retry after the quota resets.',
  };
  return (advice[code.replace('firestore/', '')] || 'The operation failed. Retry and check Firebase configuration if it continues.') + ' (' + code + ')';
}
function adminVerified() {
  return !!signedInUser && signedInUser.emailVerified === true &&
    (signedInUser.email || '').toLowerCase() === ADMIN_EMAIL;
}
async function openAdminManagement(key) {
  if (!requireAdmin()) return;
  const option = ADMIN_MANAGEMENT_OPTIONS.find(([value]) => value === key);
  if (!option) return;
  const buttons = [...document.querySelectorAll('#admin-management-options button')];
  buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-pressed', String(button.dataset.section === key)); });
  const host = document.getElementById('s2-panel');
  host.setAttribute('aria-busy', 'true');
  host.textContent = 'Loading ' + option[1] + '…';
  document.querySelectorAll('#s2-tabs .tab').forEach(tab => tab.classList.toggle('active', tab.dataset.s2tab === key));
  try {
    const handlers = {
      students: () => s2Students(false), marathon: s2MarathonAdmin,
      guidance: s2GuidanceAdmin, live: s2LiveAdmin,
      tests: async () => {
        host.innerHTML = '<p class="subtitle">Create and edit tests with the existing question editor. Manage publishing, answer release and deletion below.</p>';
        const edit = document.createElement('button'); edit.className = 'btn btn-secondary';
        edit.textContent = 'Open question editor';
        edit.onclick = () => document.getElementById('admin-test-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
        host.append(edit); await s1LoadAdminTests();
        document.getElementById('admin-tests-list').scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      analytics: s2Analytics, notices: async () => {
        await s2Notices();
        const button = document.createElement('button'); button.className = 'btn btn-secondary';
        button.textContent = 'Publish a notice'; button.onclick = () => document.getElementById('admin-notice-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
        host.prepend(button);
      }, community: s2Moderation,
    };
    await handlers[key]();
    if (key !== 'tests') host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    host.textContent = adminErrorText(error);
  } finally {
    host.setAttribute('aria-busy', 'false'); buttons.forEach(button => { button.disabled = false; });
  }
}

const management = document.createElement('div');
management.id = 'admin-management-options'; management.className = 'card';
management.setAttribute('role', 'group'); management.setAttribute('aria-label', 'Management sections');
management.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
ADMIN_MANAGEMENT_OPTIONS.forEach(([key, label]) => {
  const button = document.createElement('button'); button.className = 'btn btn-secondary';
  button.type = 'button'; button.textContent = label; button.dataset.section = key;
  button.style.cssText = 'max-width:100%;white-space:normal;text-align:left';
  button.setAttribute('aria-controls', 's2-panel'); button.setAttribute('aria-pressed', 'false');
  button.onclick = () => openAdminManagement(key); management.append(button);
});
document.querySelector('#page-admin-dashboard .subtitle').after(management);
document.getElementById('s2-panel').setAttribute('aria-live', 'polite');

function addPdfUpload(inputId) {
  const input = document.getElementById(inputId);
  if (!input || !adminVerified() || document.getElementById(inputId + '-upload')) return;
  const box = document.createElement('div'); box.style.marginTop = '8px';
  const label = document.createElement('label'); label.htmlFor = inputId + '-upload'; label.textContent = 'Or upload a PDF (up to 5 MB)';
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.pdf,application/pdf';
  file.id = inputId + '-upload'; file.className = 'field';
  const button = document.createElement('button'); button.className = 'btn btn-secondary'; button.type = 'button'; button.textContent = 'Upload PDF';
  const status = document.createElement('small'); status.setAttribute('role', 'status'); status.style.display = 'block';
  button.onclick = async () => {
    if (!requireAdmin()) return;
    const selected = file.files[0];
    if (!selected || !/\.pdf$/i.test(selected.name)) { status.textContent = 'Choose a PDF file first.'; return; }
    if (selected.size > 5 * 1024 * 1024) { status.textContent = 'PDFs must be at most 5 MB.'; return; }
    button.disabled = true; file.disabled = true; status.textContent = 'Uploading PDF…';
    try {
      const token = await signedInUser.getIdToken();
      const response = await fetch('/api/admin-files/', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf' }, body: selected });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed. Retry.');
      input.value = result.url;
      status.textContent = 'Uploaded. Save this form to attach the PDF. Signed-in users can download it.';
    } catch (error) { status.textContent = error.message || 'Upload failed. Check your connection and retry.'; }
    finally { button.disabled = false; file.disabled = false; }
  };
  box.append(label, file, button, status); input.after(box);
}
// Observe only the existing admin panel; no student content is rendered or replaced.
const uploadObserver = new MutationObserver(() => {
  ['s2-m-url', 's2-g-url', 's2r-a-url'].forEach(addPdfUpload);
});
uploadObserver.observe(document.getElementById('s2-panel'), { childList: true, subtree: true });
addPdfUpload('admin-material-url');
const previousInitAdmin = s2InitAdminPanel;
s2InitAdminPanel = function () { previousInitAdmin(); addPdfUpload('admin-material-url'); };

// Existing PDF links retain their appearance; protected Netlify files use the Firebase session.
document.addEventListener('click', async event => {
  const link = event.target.closest?.('a[href]'); if (!link) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !/^\/api\/admin-files\/[a-f0-9-]{36}$/.test(url.pathname)) return;
  event.preventDefault();
  if (!signedInUser) { toast('Sign in to download this PDF.'); return; }
  try {
    const token = await signedInUser.getIdToken();
    const response = await fetch(url.pathname, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error); }
    const objectUrl = URL.createObjectURL(await response.blob());
    const download = document.createElement('a'); download.href = objectUrl; download.download = 'learning-resource.pdf';
    document.body.append(download); download.click(); download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) { toast(error.message || 'The PDF could not be downloaded. Retry.'); }
});

// Keep the designated owner's dashboard discoverable while verification is pending.
function adminAccount() {
  return !!signedInUser && (signedInUser.email || '').toLowerCase() === ADMIN_EMAIL;
}
function refreshAdminNavigation() {
  document.getElementById('admin-nav-label').style.display = adminAccount() ? 'block' : 'none';
  document.getElementById('admin-nav-item').style.display = adminAccount() ? 'flex' : 'none';
}
function showAdminAccess() {
  let section = document.getElementById('page-admin-access');
  if (!section) {
    section = document.createElement('section');
    section.id = 'page-admin-access'; section.className = 'content page';
    section.innerHTML = '<h1 class="title">Admin Dashboard</h1><div class="card"><h2>Verify your administrator email</h2><p>jahangeerahmedu@gmail.com is the designated administrator. Verify this email address to unlock management access.</p><p id="admin-access-status" role="status" aria-live="polite"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="admin-send-verification">Send verification email</button><button type="button" class="btn btn-secondary" id="admin-check-verification">I have verified my email</button></div></div>';
    document.getElementById('page-admin-dashboard').after(section);
    document.getElementById('admin-send-verification').onclick = () => updateAdminVerification(false);
    document.getElementById('admin-check-verification').onclick = () => updateAdminVerification(true);
  }
  showPage('admin-access');
}
async function updateAdminVerification(check) {
  if (!adminAccount()) return;
  const user = signedInUser;
  const status = document.getElementById('admin-access-status');
  const buttons = [...document.querySelectorAll('#page-admin-access button')];
  buttons.forEach(button => { button.disabled = true; });
  status.textContent = check ? 'Checking email verification…' : 'Sending verification email…';
  try {
    if (!check) {
      await user.sendEmailVerification();
      if (signedInUser !== user) return;
      status.textContent = 'Verification email sent. Check your inbox and spam folder, follow the link, then select “I have verified my email”.';
      return;
    }
    await user.reload();
    await user.getIdToken(true);
    if (signedInUser !== user) return;
    if (!adminVerified()) {
      status.textContent = 'Your email is still unverified. Follow the email link, then check again.';
      return;
    }
    refreshAdminNavigation();
    showPage('admin-dashboard');
    toast('Welcome, administrator.');
  } catch (error) {
    if (signedInUser !== user) return;
    status.textContent = error.code === 'auth/too-many-requests'
      ? 'Too many requests. Wait a few minutes before trying again.'
      : 'Could not complete verification. Check your connection or sign out and sign in again.';
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}
const adminAccessShowPage = showPage;
showPage = function (name) {
  if (name === 'admin-dashboard' && adminAccount() && !adminVerified()) {
    showAdminAccess();
    return;
  }
  adminAccessShowPage(name);
};
const adminAccessLogin = login;
login = async function () {
  await adminAccessLogin();
  refreshAdminNavigation();
  if (adminAccount()) showPage('admin-dashboard');
};
