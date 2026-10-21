/* Shared FleetTrack UI helpers, header, and API client */
import { connectRealtime, onRealtime } from './realtime.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

export function initials(name) {
  return String(name || 'Fleet Track')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function avatarMarkup(name, color = '#2563eb', size = 'w-9 h-9', extraClass = '') {
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : '#2563eb';
  return `<span class="inline-flex ${size} shrink-0 items-center justify-center rounded-full font-bold ${extraClass}" style="background:${safeColor}1a;color:${safeColor}">${escapeHtml(initials(name))}</span>`;
}

export const STATUS_META = {
  delivered: {
    label: 'Delivered',
    className: 'status-delivered',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600',
    icon: 'check-circle-2',
  },
  in_transit: {
    label: 'In Transit',
    className: 'status-transit',
    dot: 'bg-amber-500',
    text: 'text-amber-600',
    icon: 'navigation',
  },
  delayed: {
    label: 'Delayed',
    className: 'status-delayed',
    dot: 'bg-rose-500',
    text: 'text-rose-600',
    icon: 'alert-triangle',
  },
};

export const SEVERITY_META = {
  critical: {
    label: 'Critical',
    className: 'status-critical',
    dot: 'bg-rose-500',
    icon: 'siren',
    iconBg: 'bg-rose-100 text-rose-600',
  },
  warning: {
    label: 'Warning',
    className: 'status-warning',
    dot: 'bg-amber-500',
    icon: 'triangle-alert',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  info: {
    label: 'Info',
    className: 'status-info',
    dot: 'bg-blue-500',
    icon: 'info',
    iconBg: 'bg-blue-100 text-blue-600',
  },
};

export const ALERT_STATUS_META = {
  active: { label: 'Open', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  acknowledged: { label: 'Acknowledged', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolved: { label: 'Resolved', className: 'bg-slate-50 text-slate-600 border-slate-200' },
};

export function shipmentStatus(status) {
  return STATUS_META[status] || { label: 'Unknown', className: 'status-muted', dot: 'bg-slate-400', text: 'text-slate-500' };
}

export function severityMeta(severity) {
  return SEVERITY_META[severity] || SEVERITY_META.info;
}

export function statusBadge(status, withDot = true) {
  const meta = shipmentStatus(status);
  return `<span class="status-badge ${meta.className}">${withDot ? `<span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>` : ''}${meta.label}</span>`;
}

export function severityBadge(severity) {
  const meta = severityMeta(severity);
  return `<span class="status-badge ${meta.className}"><i data-lucide="${meta.icon}" class="w-3 h-3"></i>${meta.label}</span>`;
}

const numberFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatNumber(value, digits = 0) {
  const number = Number(value || 0);
  if (digits) return number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return numberFormatter.format(Math.round(number));
}

export function formatCompact(value) {
  return compactFormatter.format(Number(value || 0));
}

export function formatDecimal(value, digits = 1) {
  return Number(value || 0).toFixed(digits);
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...options });
}

export function formatLongDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(value, withSeconds = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function relativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const text = minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes}m`
      : hours < 24
        ? `${hours}h`
        : `${days}d`;
  if (minutes < 1) return 'just now';
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

export function dayLabel(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

export function monthDay(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function debounce(fn, wait = 250) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

export async function api(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    redirectOnUnauthorized = true,
    ...rest
  } = options;
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...rest,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (!response.ok) {
    if (response.status === 401 && redirectOnUnauthorized && !location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.assign(`/login?next=${next}`);
    }
    const message = typeof payload === 'object' && payload?.error
      ? payload.error
      : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function showToast({ title, message = '', type = 'info', duration = 5000 }) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'fixed top-4 right-4 z-[2000] flex flex-col items-end gap-2 pointer-events-none no-print';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  const config = {
    success: { icon: 'check-circle-2', background: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
    error: { icon: 'circle-alert', background: 'bg-rose-50 text-rose-700', border: 'border-rose-200' },
    warning: { icon: 'triangle-alert', background: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
    info: { icon: 'info', background: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  }[type] || { icon: 'info', background: 'bg-slate-50 text-slate-700', border: 'border-slate-200' };

  const toast = document.createElement('div');
  toast.className = `toast ${config.border}`;
  toast.innerHTML = `
    <div class="w-8 h-8 rounded-lg ${config.background} flex items-center justify-center shrink-0">
      <i data-lucide="${config.icon}" class="w-4 h-4"></i>
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-xs font-bold text-slate-900 leading-snug">${escapeHtml(title)}</p>
      ${message ? `<p class="text-[11px] text-slate-500 mt-1 leading-snug">${escapeHtml(message)}</p>` : ''}
    </div>
    <button class="text-slate-400 hover:text-slate-700 shrink-0" type="button" aria-label="Dismiss notification">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;
  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    toast.style.transition = 'all .18s ease';
    setTimeout(() => toast.remove(), 190);
  };
  toast.querySelector('button')?.addEventListener('click', dismiss);
  root.appendChild(toast);
  renderIcons(toast);
  if (duration > 0) setTimeout(dismiss, duration);
}

export async function copyText(value, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(String(value));
    showToast({ title: label, type: 'success', duration: 2600 });
  } catch {
    showToast({ title: 'Could not copy', message: 'Please copy the value manually.', type: 'error' });
  }
}

export function setButtonLoading(button, loading, loadingLabel = 'Working…') {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"></span>${escapeHtml(loadingLabel)}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
      renderIcons(button);
    }
  }
}

export function downloadDeliveriesCsv() {
  const params = new URLSearchParams(location.search);
  const query = params.toString();
  location.assign(`/api/deliveries/export.csv${query ? `?${query}` : ''}`);
}

const NAV_ITEMS = [
  { key: 'overview', href: '/', label: 'Fleet Overview', icon: 'layout-dashboard' },
  { key: 'deliveries', href: '/deliveries', label: 'Recent Deliveries', icon: 'truck' },
  { key: 'analytics', href: '/analytics', label: 'Analytics', icon: 'chart-no-axes-combined' },
  { key: 'drivers', href: '/drivers', label: 'Driver Scores', icon: 'users-round' },
  { key: 'alerts', href: '/alerts', label: 'Alerts', icon: 'bell-ring' },
];

class FleetHeader extends HTMLElement {
  connectedCallback() {
    this.active = this.getAttribute('active') || 'overview';
    this.render();
    this.loadUser();
    this.bindHeaderEvents();
    this.startRealtime();
    this.alertCount = 0;
    this.loadAlertCount();
  }

  render() {
    const nav = NAV_ITEMS.map((item) => {
      const active = item.key === this.active;
      return `<a class="nav-item ${active ? 'nav-item-active' : ''}" href="${item.href}">${item.label}</a>`;
    }).join('');
    const mobileNav = NAV_ITEMS.map((item) => {
      const active = item.key === this.active;
      return `<a class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}" href="${item.href}">
        <i data-lucide="${item.icon}" class="w-4 h-4"></i>${item.label}
      </a>`;
    }).join('');

    this.innerHTML = `
      <header class="site-header">
        <div class="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center md:space-x-8">
              <a href="/" class="flex items-center space-x-2.5 shrink-0" aria-label="FleetTrack home">
                <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/25">
                  <i data-lucide="zap" class="w-4.5 h-4.5"></i>
                </div>
                <span class="text-xl font-bold tracking-tight text-slate-900">FleetTrack</span>
              </a>
              <nav class="hidden md:flex md:space-x-7 text-sm font-medium" aria-label="Primary navigation">${nav}</nav>
            </div>
            <div class="flex items-center space-x-3 sm:space-x-4">
              <div class="hidden lg:flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                <span class="live-dot !w-1.5 !h-1.5"></span> Live
              </div>
              <div class="hidden sm:flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 shadow-xs">
                <i data-lucide="calendar-days" class="w-4 h-4 text-slate-400"></i>
                <span>${formatLongDate(new Date())}</span>
              </div>
              <a href="/alerts" class="relative icon-btn" aria-label="View alerts">
                <i data-lucide="bell" class="w-4 h-4"></i>
                <span data-alert-badge class="hidden absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">0</span>
              </a>
              <div class="relative flex items-center pl-2 sm:pl-3 border-l border-slate-200">
                <button class="flex items-center gap-2.5 cursor-pointer rounded-lg py-1 pr-1 hover:bg-slate-50 transition-colors" type="button" data-profile-toggle aria-expanded="false" aria-haspopup="menu">
                  <span data-avatar class="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center border border-blue-200">SC</span>
                  <span class="hidden lg:flex flex-col text-left">
                    <span data-user-name class="text-xs font-semibold text-slate-900 leading-tight">Loading…</span>
                    <span data-user-role class="text-[11px] text-slate-500 leading-tight">Fleet admin</span>
                  </span>
                  <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 hidden lg:block"></i>
                </button>
                <div data-profile-menu class="hidden absolute right-0 top-[calc(100%+10px)] w-56 rounded-xl border border-slate-200 bg-white shadow-xl p-1.5 z-50" role="menu">
                  <div class="px-3 py-2.5 border-b border-slate-100 mb-1">
                    <p data-menu-name class="text-xs font-bold text-slate-900">Fleet admin</p>
                    <p data-menu-email class="text-[11px] text-slate-500 truncate mt-0.5">—</p>
                  </div>
                  <a href="/alerts" class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" role="menuitem">
                    <i data-lucide="bell" class="w-4 h-4 text-slate-400"></i> Notification center
                  </a>
                  <a href="/drivers" class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" role="menuitem">
                    <i data-lucide="users-round" class="w-4 h-4 text-slate-400"></i> Driver directory
                  </a>
                  <button data-logout type="button" class="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 mt-1" role="menuitem">
                    <i data-lucide="log-out" class="w-4 h-4"></i> Sign out
                  </button>
                </div>
              </div>
              <button class="md:hidden icon-btn" type="button" data-mobile-toggle aria-label="Open navigation" aria-expanded="false">
                <i data-lucide="menu" class="w-5 h-5"></i>
              </button>
            </div>
          </div>
          <div data-mobile-menu class="hidden md:hidden pb-4 pt-1 border-t border-slate-100">
            <div class="flex flex-col gap-1 mt-2">${mobileNav}</div>
          </div>
        </div>
      </header>
    `;
    renderIcons(this);
  }

  async loadUser() {
    try {
      const { user } = await api('/api/auth/me');
      this.user = user;
      const name = this.querySelector('[data-user-name]');
      const role = this.querySelector('[data-user-role]');
      const menuName = this.querySelector('[data-menu-name]');
      const menuEmail = this.querySelector('[data-menu-email]');
      const avatar = this.querySelector('[data-avatar]');
      if (name) name.textContent = user.name;
      if (role) role.textContent = user.role === 'admin' ? 'Fleet Admin' : user.role;
      if (menuName) menuName.textContent = user.name;
      if (menuEmail) menuEmail.textContent = user.email;
      if (avatar) avatar.textContent = initials(user.name);
    } catch (error) {
      if (error.status !== 401) {
        showToast({ title: 'Could not load profile', message: error.message, type: 'error' });
      }
    }
  }

  async loadAlertCount() {
    try {
      const { summary } = await api('/api/dashboard/summary');
      this.setAlertCount(summary.openAlerts);
    } catch {
      // Header badge is non-critical.
    }
  }

  setAlertCount(count) {
    this.alertCount = Number(count || 0);
    const badge = this.querySelector('[data-alert-badge]');
    if (!badge) return;
    if (this.alertCount > 0) {
      badge.textContent = this.alertCount > 99 ? '99+' : String(this.alertCount);
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
    }
  }

  bindHeaderEvents() {
    const toggle = this.querySelector('[data-profile-toggle]');
    const menu = this.querySelector('[data-profile-menu]');
    const closeMenu = () => {
      menu?.classList.add('hidden');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    toggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const isHidden = menu?.classList.contains('hidden');
      menu?.classList.toggle('hidden', !isHidden);
      toggle.setAttribute('aria-expanded', String(Boolean(isHidden)));
    });
    document.addEventListener('click', (event) => {
      if (!this.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    const mobileToggle = this.querySelector('[data-mobile-toggle]');
    const mobileMenu = this.querySelector('[data-mobile-menu]');
    mobileToggle?.addEventListener('click', () => {
      const isHidden = mobileMenu?.classList.contains('hidden');
      mobileMenu?.classList.toggle('hidden', !isHidden);
      mobileToggle.setAttribute('aria-expanded', String(Boolean(isHidden)));
      mobileToggle.innerHTML = `<i data-lucide="${isHidden ? 'x' : 'menu'}" class="w-5 h-5"></i>`;
      renderIcons(mobileToggle);
    });

    this.querySelector('[data-logout]')?.addEventListener('click', async () => {
      const button = this.querySelector('[data-logout]');
      button.disabled = true;
      try {
        await api('/api/auth/logout', { method: 'POST', body: {} });
      } catch {
        // Continue to the login screen even if the network call fails.
      }
      location.assign('/login');
    });
  }

  startRealtime() {
    connectRealtime();
    onRealtime('fleet:summary', ({ summary }) => {
      if (summary && typeof summary.openAlerts === 'number') this.setAlertCount(summary.openAlerts);
    });
    onRealtime('alert:new', ({ summary }) => {
      if (summary && typeof summary.openAlerts === 'number') this.setAlertCount(summary.openAlerts);
    });
    onRealtime('alert:updated', () => this.loadAlertCount());
  }
}

if (!customElements.get('fleet-header')) {
  customElements.define('fleet-header', FleetHeader);
}

export function setupGlobalShortcuts({ onSearch, onCreate } = {}) {
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      onSearch?.();
    }
    if (event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onCreate?.();
    }
  });
}
