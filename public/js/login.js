import { $, api, renderIcons, setButtonLoading, showToast } from './shared.js';

renderIcons();

const form = document.getElementById('loginForm');
const email = document.getElementById('email');
const password = document.getElementById('password');
const errorBox = document.getElementById('loginError');
const button = document.getElementById('loginButton');
const fillDemo = document.getElementById('fillDemo');
const togglePassword = document.getElementById('togglePassword');

const params = new URLSearchParams(location.search);
const requestedNext = params.get('next') || '/';
const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

if (params.get('reason') === 'session') {
  showError('Your session expired. Please sign in again.');
}

togglePassword?.addEventListener('click', () => {
  const isPassword = password.type === 'password';
  password.type = isPassword ? 'text' : 'password';
  togglePassword.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>`;
  togglePassword.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  renderIcons();
});

fillDemo?.addEventListener('click', async () => {
  fillDemo.disabled = true;
  try {
    const demo = await api('/api/auth/demo');
    email.value = demo.email;
    password.value = demo.password;
    email.dispatchEvent(new Event('input'));
    password.dispatchEvent(new Event('input'));
    clearError();
    password.focus();
    showToast({ title: 'Demo credentials filled', message: 'Press sign in to open the live workspace.', type: 'success', duration: 3000 });
  } catch {
    email.value = 'admin@fleettrack.app';
    password.value = 'Fleet123!';
    clearError();
  } finally {
    fillDemo.disabled = false;
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  if (!email.value.trim() || !password.value) {
    showError('Enter your email and password to continue.');
    (!email.value.trim() ? email : password).focus();
    return;
  }
  setButtonLoading(button, true, 'Signing in…');
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: { email: email.value.trim(), password: password.value },
    });
    button.innerHTML = '<span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"></span>Opening workspace…';
    location.assign(next);
  } catch (error) {
    showError(error.message || 'Unable to sign in right now.');
    setButtonLoading(button, false);
    password.select();
  }
});

email?.addEventListener('input', clearError);
password?.addEventListener('input', clearError);
