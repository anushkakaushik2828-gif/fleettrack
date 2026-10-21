/* FleetTrack — real-time alert center */
import {
  $,
  $$,
  api,
  ALERT_STATUS_META,
  debounce,
  escapeHtml,
  formatDateTime,
  formatNumber,
  relativeTime,
  renderIcons,
  severityBadge,
  severityMeta,
  showToast,
} from './shared.js';
import { donutChart } from './charts.js';
import { connectRealtime, onRealtime } from './realtime.js';

const state = {
  status: 'all',
  severity: 'all',
  q: '',
  alerts: [],
  summary: null,
  focus: null,
  requestId: 0,
  refreshTimer: null,
  modalAlertId: null,
};

const alertsList = document.getElementById('alertsList');
const modal = document.getElementById('alertModal');
const modalBody = document.getElementById('alertModalBody');
const searchInput = document.getElementById('alertSearch');
const acknowledgeAllButton = document.getElementById('acknowledgeAll');

const initialParams = new URLSearchParams(location.search);
const initialStatus = initialParams.get('status');
if (['active', 'acknowledged', 'resolved'].includes(initialStatus)) state.status = initialStatus;
const initialSeverity = initialParams.get('severity');
if (['critical', 'warning', 'info'].includes(initialSeverity)) state.severity = initialSeverity;
const initialQuery = initialParams.get('q');
if (initialQuery) state.q = initialQuery.trim().slice(0, 100);
const focusParam = Number.parseInt(initialParams.get('focus'), 10);
if (Number.isInteger(focusParam) && focusParam > 0) {
  state.focus = focusParam;
  state.status = 'all';
  state.severity = 'all';
  state.q = '';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.status !== 'all') params.set('status', state.status);
  if (state.severity !== 'all') params.set('severity', state.severity);
  if (state.q) params.set('q', state.q);
  return params;
}

function updateSummary(summary) {
  if (!summary) return;
  state.summary = summary;
  setText('alertOpen', formatNumber(summary.active));
  setText('alertAcknowledged', formatNumber(summary.acknowledged));
  setText('alertCritical', formatNumber(summary.activeCritical));
  setText('alertWarning', formatNumber(summary.activeWarning));
  setText('alertResolved', formatNumber(summary.resolved));
  setText('alertInfo', formatNumber(summary.info));
  setText('alertOpen', formatNumber(summary.active));

  for (const [key, value] of Object.entries({
    all: summary.total,
    active: summary.active,
    acknowledged: summary.acknowledged,
    resolved: summary.resolved,
  })) {
    $$(`[data-alert-count="${key}"]`).forEach((element) => {
      element.textContent = formatNumber(value);
    });
  }
  if (acknowledgeAllButton) acknowledgeAllButton.disabled = summary.active === 0;
}

function updateTabs() {
  $$('[data-alert-status]').forEach((button) => {
    const active = button.dataset.alertStatus === state.status;
    button.className = `filter-pill ${active ? 'filter-pill-all' : 'filter-pill-neutral'}`;
    button.setAttribute('aria-selected', String(active));
  });
}

function alertStatusBadge(status) {
  const meta = ALERT_STATUS_META[status] || { label: status, className: 'bg-slate-50 text-slate-600 border-slate-200' };
  return `<span class="status-badge ${meta.className}">${escapeHtml(meta.label)}</span>`;
}

function alertTypeLabel(type) {
  return String(type || 'event')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderMix() {
  const summary = state.summary;
  const container = document.getElementById('alertDonut');
  if (!container || !summary) return;
  const segments = [
    { label: 'Critical', value: summary.activeCritical, color: '#ef4444' },
    { label: 'Warning', value: summary.activeWarning, color: '#f59e0b' },
    { label: 'Info', value: summary.activeInfo, color: '#2563eb' },
  ];
  donutChart(container, {
    segments,
    size: 158,
    thickness: 13,
    centerValue: formatNumber(summary.active),
    centerLabel: 'open alerts',
    ariaLabel: 'Open alerts by severity',
  });
  const legend = document.getElementById('alertSeverityLegend');
  if (legend) {
    const total = Math.max(1, summary.active);
    legend.innerHTML = segments.map((segment) => `
      <div class="flex items-center justify-between gap-2 text-[10px]">
        <span class="flex items-center gap-1.5 text-slate-600"><span class="w-1.5 h-1.5 rounded-full" style="background:${segment.color}"></span>${segment.label}</span>
        <span class="font-semibold text-slate-900">${formatNumber(segment.value)} <span class="text-slate-400 font-normal">· ${Math.round((segment.value / total) * 100)}%</span></span>
      </div>
    `).join('');
  }
}

function renderFeed() {
  if (!alertsList) return;
  if (!state.alerts.length) {
    const filtered = state.status !== 'all' || state.severity !== 'all' || state.q;
    alertsList.innerHTML = `
      <div class="empty-state !py-16">
        <div class="w-11 h-11 rounded-xl ${filtered ? 'bg-slate-50 border border-slate-100' : 'bg-emerald-50 border border-emerald-100'} flex items-center justify-center">
          <i data-lucide="${filtered ? 'search-x' : 'shield-check'}" class="w-5 h-5 ${filtered ? 'text-slate-400' : 'text-emerald-500'}"></i>
        </div>
        <p class="text-xs font-bold text-slate-700 mt-3">${filtered ? 'No alerts match these filters' : 'The network is all clear'}</p>
        <p class="text-[11px] text-slate-400 mt-1 max-w-xs">${filtered ? 'Adjust the status, severity, or search terms to widen the queue.' : 'No open operational incidents. New telematics alerts will arrive here instantly.'}</p>
        ${filtered ? '<button type="button" data-reset-alerts class="btn-secondary !py-2 mt-4">Reset alert filters</button>' : '<a href="/" class="btn-secondary !py-2 mt-4">Back to fleet overview</a>'}
      </div>
    `;
    renderIcons();
    setText('alertFooter', '0 alerts in the current view');
    return;
  }

  alertsList.innerHTML = state.alerts.map((alert) => {
    const severity = severityMeta(alert.severity);
    const criticalOpen = alert.severity === 'critical' && alert.status === 'active';
    return `
      <article data-alert-id="${alert.id}" class="p-4 sm:p-5 transition-colors hover:bg-slate-50/70 ${criticalOpen ? 'bg-rose-50/30' : ''}">
        <div class="flex items-start gap-3.5">
          <span class="w-9 h-9 rounded-xl ${severity.iconBg} flex items-center justify-center shrink-0">
            <i data-lucide="${severity.icon}" class="w-4 h-4"></i>
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <button type="button" data-open-alert="${alert.id}" class="text-[12px] font-bold text-slate-900 hover:text-blue-600 transition-colors text-left leading-snug">${escapeHtml(alert.title)}</button>
                  ${severityBadge(alert.severity)}
                  ${alertStatusBadge(alert.status)}
                </div>
                <p class="text-[11px] text-slate-500 leading-relaxed mt-1.5 line-clamp-2">${escapeHtml(alert.message)}</p>
                <div class="flex items-center gap-2.5 flex-wrap mt-2 text-[9px] text-slate-400">
                  ${alert.vehicleCode ? `<span class="inline-flex items-center gap-1 font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5"><i data-lucide="truck" class="w-2.5 h-2.5"></i>${escapeHtml(alert.vehicleCode)}</span>` : '<span class="inline-flex items-center gap-1 text-slate-500"><i data-lucide="radio-tower" class="w-2.5 h-2.5"></i>Fleet-wide</span>'}
                  <span class="inline-flex items-center gap-1"><i data-lucide="tag" class="w-2.5 h-2.5"></i>${escapeHtml(alertTypeLabel(alert.type))}</span>
                  <span class="inline-flex items-center gap-1" title="${escapeHtml(formatDateTime(alert.createdAt))}"><i data-lucide="clock-3" class="w-2.5 h-2.5"></i>${relativeTime(alert.createdAt)}</span>
                  ${alert.acknowledgedBy ? `<span class="inline-flex items-center gap-1"><i data-lucide="user-check" class="w-2.5 h-2.5"></i>${escapeHtml(alert.acknowledgedBy)}</span>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${alert.status === 'active' ? `<button type="button" data-ack="${alert.id}" class="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-600" title="Acknowledge alert"><i data-lucide="check" class="w-3 h-3"></i>Acknowledge</button>` : ''}
                ${alert.status !== 'resolved' ? `<button type="button" data-resolve="${alert.id}" class="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-[10px] font-semibold text-white" title="Resolve alert"><i data-lucide="check-check" class="w-3 h-3"></i>Resolve</button>` : ''}
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 mt-2.5 sm:hidden">
              <span class="text-[9px] text-slate-400">${alert.status === 'resolved' ? `Resolved ${relativeTime(alert.resolvedAt)}` : 'Awaiting resolution'}</span>
              <div class="flex items-center gap-1.5">
                ${alert.status === 'active' ? `<button type="button" data-ack="${alert.id}" class="px-2 py-1 rounded-md border border-slate-200 bg-white text-[10px] font-semibold text-slate-600">Acknowledge</button>` : ''}
                ${alert.status !== 'resolved' ? `<button type="button" data-resolve="${alert.id}" class="px-2 py-1 rounded-md bg-slate-900 text-[10px] font-semibold text-white">Resolve</button>` : ''}
                <button type="button" data-open-alert="${alert.id}" class="px-2 py-1 rounded-md text-blue-600 text-[10px] font-semibold">Details</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
  renderIcons();
  setText('alertFooter', `Showing ${formatNumber(state.alerts.length)} alert${state.alerts.length === 1 ? '' : 's'} · sorted by severity and recency`);
}

function renderAll() {
  updateSummary(state.summary);
  updateTabs();
  renderMix();
  renderFeed();
  const filters = [];
  if (state.status !== 'all') filters.push(state.status);
  if (state.severity !== 'all') filters.push(state.severity);
  if (state.q) filters.push(`“${state.q}”`);
  setText('alertFeedSummary', `${formatNumber(state.alerts.length)} alert${state.alerts.length === 1 ? '' : 's'} in view${filters.length ? ` · ${filters.join(' · ')}` : ''} · live triage queue`);
}

async function loadAlerts({ silent = false } = {}) {
  const requestId = ++state.requestId;
  try {
    const data = await api(`/api/alerts?${buildQuery().toString()}`);
    if (requestId !== state.requestId) return;
    state.alerts = data.alerts;
    state.summary = data.summary;
    renderAll();
    if (state.focus) {
      const alert = state.alerts.find((item) => item.id === state.focus);
      state.focus = null;
      if (alert) openAlertModal(alert);
    }
  } catch (error) {
    if (error.status === 401) return;
    if (!silent) showToast({ title: 'Could not load alerts', message: error.message, type: 'error' });
    alertsList.innerHTML = `<div class="empty-state !py-16"><i data-lucide="wifi-off" class="w-7 h-7 text-rose-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Alert feed unavailable</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(error.message)}</p><button type="button" data-reset-alerts class="btn-secondary !py-2 mt-3">Try again</button></div>`;
    renderIcons();
  }
}

function scheduleRefresh(delay = 1200) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => loadAlerts({ silent: true }), delay);
}

function upsertAlert(alert) {
  const index = state.alerts.findIndex((item) => item.id === alert.id);
  if (index >= 0) state.alerts[index] = alert;
  else state.alerts.unshift(alert);
}

async function performAction(id, action, button) {
  if (button) {
    button.disabled = true;
    button.dataset.previousHtml = button.innerHTML;
    button.innerHTML = '<span class="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"></span>';
  }
  try {
    const result = await api(`/api/alerts/${id}/${action}`, { method: 'PATCH', body: {} });
    if (result.summary) state.summary = result.summary;
    if (result.alert) upsertAlert(result.alert);
    renderAll();
    if (state.modalAlertId === id && result.alert) renderAlertModal(result.alert);
    showToast({
      title: action === 'acknowledge' ? 'Alert acknowledged' : 'Alert resolved',
      message: action === 'acknowledge' ? 'The incident has been assigned to you for follow-up.' : 'The incident is closed and removed from the open queue.',
      type: 'success',
      duration: 3200,
    });
    scheduleRefresh(1500);
  } catch (error) {
    if (error.status !== 401) showToast({ title: 'Could not update alert', message: error.message, type: 'error' });
    if (button) {
      button.disabled = false;
      if (button.dataset.previousHtml) button.innerHTML = button.dataset.previousHtml;
    }
    renderIcons();
  }
}

function openAlertModal(alertOrId) {
  if (!modal) return;
  const alert = typeof alertOrId === 'object'
    ? alertOrId
    : state.alerts.find((item) => item.id === Number(alertOrId));
  if (!alert) return;
  state.modalAlertId = alert.id;
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  renderAlertModal(alert);
}

function closeAlertModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  state.modalAlertId = null;
  document.body.style.overflow = '';
}

function renderAlertModal(alert) {
  if (!modalBody) return;
  const severity = severityMeta(alert.severity);
  const banner = alert.severity === 'critical'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : alert.severity === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-blue-200 bg-blue-50 text-blue-700';
  const timeline = [
    { label: 'Alert raised', time: alert.createdAt, icon: 'bell-ring', color: 'bg-slate-500' },
    ...(alert.acknowledgedAt ? [{ label: `Acknowledged${alert.acknowledgedBy ? ` by ${alert.acknowledgedBy}` : ''}`, time: alert.acknowledgedAt, icon: 'user-check', color: 'bg-blue-500' }] : []),
    ...(alert.resolvedAt ? [{ label: 'Incident resolved', time: alert.resolvedAt, icon: 'check-check', color: 'bg-emerald-500' }] : []),
  ];

  modalBody.innerHTML = `
    <div class="rounded-xl border ${banner} p-3 flex items-start gap-2.5">
      <span class="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center shrink-0"><i data-lucide="${severity.icon}" class="w-4 h-4"></i></span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          ${severityBadge(alert.severity)}
          ${alertStatusBadge(alert.status)}
        </div>
        <p class="text-[10px] mt-1.5 leading-relaxed">${alert.severity === 'critical' ? 'Critical incident — acknowledge and investigate immediately.' : alert.severity === 'warning' ? 'Warning — review the telemetry and contact the driver if needed.' : 'Informational event — no immediate action required.'}</p>
      </div>
    </div>

    <div class="mt-4">
      <h3 class="text-sm font-bold text-slate-950 leading-snug">${escapeHtml(alert.title)}</h3>
      <p class="text-[11px] text-slate-500 leading-relaxed mt-1.5">${escapeHtml(alert.message)}</p>
    </div>

    <div class="grid grid-cols-2 gap-2 mt-4">
      <div class="rounded-lg border border-slate-200 p-2.5">
        <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Vehicle</p>
        <p class="text-[11px] font-bold text-slate-900 mt-1 font-mono">${escapeHtml(alert.vehicleCode || 'Fleet-wide')}</p>
      </div>
      <div class="rounded-lg border border-slate-200 p-2.5">
        <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Alert type</p>
        <p class="text-[11px] font-bold text-slate-900 mt-1">${escapeHtml(alertTypeLabel(alert.type))}</p>
      </div>
      <div class="rounded-lg border border-slate-200 p-2.5">
        <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Raised</p>
        <p class="text-[10px] font-semibold text-slate-800 mt-1">${formatDateTime(alert.createdAt)}</p>
      </div>
      <div class="rounded-lg border border-slate-200 p-2.5">
        <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">${alert.status === 'resolved' ? 'Resolved' : 'Acknowledged'}</p>
        <p class="text-[10px] font-semibold text-slate-800 mt-1">${alert.status === 'resolved' ? (alert.resolvedAt ? formatDateTime(alert.resolvedAt) : '—') : alert.acknowledgedAt ? formatDateTime(alert.acknowledgedAt) : 'Awaiting review'}</p>
      </div>
    </div>

    <div class="mt-4">
      <h4 class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Incident timeline</h4>
      <div class="relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
        ${timeline.map((point, index) => `
          <div class="relative pl-7 ${index === timeline.length - 1 ? '' : 'pb-3.5'}">
            <span class="absolute left-0 top-0.5 w-4 h-4 rounded-full ${point.color} ring-4 ring-white flex items-center justify-center z-10">
              <i data-lucide="${point.icon}" class="w-2.5 h-2.5 text-white"></i>
            </span>
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] font-semibold text-slate-800">${escapeHtml(point.label)}</p>
              <time class="text-[9px] font-mono text-slate-400 whitespace-nowrap">${formatDateTime(point.time)}</time>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${alert.vehicleCode ? `<a href="/deliveries?q=${encodeURIComponent(alert.vehicleCode)}" class="mt-4 flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 hover:border-blue-200 hover:bg-blue-50/40 transition-colors">
      <div class="flex items-center gap-2.5">
        <span class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><i data-lucide="truck" class="w-3.5 h-3.5"></i></span>
        <div>
          <p class="text-[10px] font-semibold text-slate-800">Open vehicle dispatch context</p>
          <p class="text-[9px] text-slate-400">View shipments and telemetry for ${escapeHtml(alert.vehicleCode)}</p>
        </div>
      </div>
      <i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-slate-400"></i>
    </a>` : ''}

    <div class="mt-5 flex items-center gap-2 no-print">
      ${alert.status === 'active' ? `<button type="button" data-ack="${alert.id}" class="flex-1 btn-secondary !py-2.5"><i data-lucide="check" class="w-3.5 h-3.5"></i>Acknowledge</button>` : ''}
      ${alert.status !== 'resolved' ? `<button type="button" data-resolve="${alert.id}" class="flex-1 btn-primary !py-2.5"><i data-lucide="check-check" class="w-3.5 h-3.5"></i>Resolve incident</button>` : `<button type="button" data-close-alert class="flex-1 btn-secondary !py-2.5">Close</button>`}
    </div>
  `;
  renderIcons();
}

function setupInteractions() {
  alertsList?.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset-alerts]')) {
      resetFilters();
      return;
    }
    const ack = event.target.closest('[data-ack]');
    if (ack) {
      performAction(Number(ack.dataset.ack), 'acknowledge', ack);
      return;
    }
    const resolve = event.target.closest('[data-resolve]');
    if (resolve) {
      performAction(Number(resolve.dataset.resolve), 'resolve', resolve);
      return;
    }
    const open = event.target.closest('[data-open-alert]');
    if (open) {
      openAlertModal(Number(open.dataset.openAlert));
      return;
    }
    const article = event.target.closest('article[data-alert-id]');
    if (article) openAlertModal(Number(article.dataset.alertId));
  });

  modalBody?.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-alert]')) {
      closeAlertModal();
      return;
    }
    const ack = event.target.closest('[data-ack]');
    if (ack) {
      performAction(Number(ack.dataset.ack), 'acknowledge', ack);
      return;
    }
    const resolve = event.target.closest('[data-resolve]');
    if (resolve) performAction(Number(resolve.dataset.resolve), 'resolve', resolve);
  });

  $$('[data-close-alert]').forEach((button) => {
    if (button.closest('#alertModal') && !button.closest('#alertModalBody')) {
      button.addEventListener('click', closeAlertModal);
    }
  });
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeAlertModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('is-open')) closeAlertModal();
  });

  $$('[data-alert-status]').forEach((button) => {
    button.addEventListener('click', () => {
      const status = button.dataset.alertStatus;
      if (status === state.status) return;
      state.status = status;
      updateTabs();
      loadAlerts();
    });
  });

  document.getElementById('alertSeverity')?.addEventListener('change', (event) => {
    state.severity = event.target.value;
    loadAlerts();
  });

  if (searchInput) {
    const debounced = debounce(() => {
      state.q = searchInput.value.trim();
      loadAlerts();
    }, 300);
    searchInput.addEventListener('input', debounced);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.blur();
      }
    });
  }

  acknowledgeAllButton?.addEventListener('click', async () => {
    acknowledgeAllButton.disabled = true;
    const previous = acknowledgeAllButton.innerHTML;
    acknowledgeAllButton.innerHTML = '<span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"></span>Acknowledging…';
    try {
      const result = await api('/api/alerts/acknowledge-all', { method: 'POST', body: {} });
      updateSummary(result.summary);
      await loadAlerts({ silent: true });
      showToast({
        title: result.updated ? `${formatNumber(result.updated)} alerts acknowledged` : 'No open alerts',
        message: result.updated ? 'Every open incident is now assigned for operator follow-up.' : 'The queue was already clear.',
        type: result.updated ? 'success' : 'info',
      });
    } catch (error) {
      if (error.status !== 401) showToast({ title: 'Bulk acknowledge failed', message: error.message, type: 'error' });
    } finally {
      acknowledgeAllButton.innerHTML = previous;
      acknowledgeAllButton.disabled = !(state.summary?.active > 0);
      renderIcons(acknowledgeAllButton);
    }
  });

  document.getElementById('refreshAlerts')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadAlerts();
      showToast({ title: 'Alert queue refreshed', message: 'The latest incidents are on screen.', type: 'success', duration: 2800 });
    } finally {
      button.disabled = false;
    }
  });
}

function resetFilters() {
  state.status = 'all';
  state.severity = 'all';
  state.q = '';
  if (searchInput) searchInput.value = '';
  const severitySelect = document.getElementById('alertSeverity');
  if (severitySelect) severitySelect.value = 'all';
  updateTabs();
  loadAlerts();
}

function setupRealtime() {
  connectRealtime();
  onRealtime('alert:new', ({ alert }) => {
    showToast({
      title: alert?.title || 'New fleet alert',
      message: alert?.message || 'A new operational alert needs attention.',
      type: alert?.severity === 'critical' ? 'error' : alert?.severity === 'warning' ? 'warning' : 'info',
    });
    scheduleRefresh(350);
  });
  onRealtime('alert:updated', () => scheduleRefresh(150));
  onRealtime('alerts:bulk-updated', () => scheduleRefresh(150));
  onRealtime('connection:state', ({ state: connectionState }) => {
    const element = document.getElementById('alertSocketState');
    if (!element) return;
    if (connectionState === 'disconnected') {
      element.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Reconnecting…';
      element.className = 'inline-flex items-center gap-1.5 text-[10px] text-slate-400';
    } else {
      element.innerHTML = '<span class="live-dot !w-1.5 !h-1.5"></span> Socket connected';
      element.className = 'inline-flex items-center gap-1.5 text-[10px] text-slate-500';
    }
  });
}

function initControls() {
  const severitySelect = document.getElementById('alertSeverity');
  if (severitySelect) severitySelect.value = state.severity;
  if (searchInput && state.q) searchInput.value = state.q;
}

initControls();
setupInteractions();
setupRealtime();
updateTabs();
loadAlerts();
