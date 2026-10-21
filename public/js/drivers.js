/* FleetTrack — driver performance roster */
import {
  $,
  $$,
  api,
  avatarMarkup,
  debounce,
  escapeHtml,
  formatCompact,
  formatDate,
  formatDecimal,
  formatNumber,
  relativeTime,
  renderIcons,
  severityBadge,
  statusBadge,
  showToast,
} from './shared.js';
import { lineChart } from './charts.js';
import { connectRealtime, onRealtime } from './realtime.js';

const state = {
  page: 1,
  limit: 10,
  q: '',
  status: 'all',
  sort: 'safety',
  drivers: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  summary: null,
  selectedDriver: null,
  requestId: 0,
  refreshTimer: null,
  openedFromUrl: false,
};

const searchInput = document.getElementById('driverSearch');
const driversBody = document.getElementById('driversBody');
const pagination = document.getElementById('driverPagination');
const modal = document.getElementById('driverModal');
const modalBody = document.getElementById('driverModalBody');

const initialParams = new URLSearchParams(location.search);
const initialDriver = Number.parseInt(initialParams.get('driver'), 10);
if (Number.isInteger(initialDriver) && initialDriver > 0) {
  state.pendingDriver = initialDriver;
}
const initialStatus = initialParams.get('status');
if (['on_duty', 'off_duty'].includes(initialStatus)) state.status = initialStatus;

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status !== 'all') params.set('status', state.status);
  params.set('sort', state.sort);
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
  return params;
}

function scoreTone(score) {
  if (score >= 95) return { text: 'text-emerald-600', bar: 'bg-emerald-500', ring: 'border-emerald-200 bg-emerald-50' };
  if (score >= 90) return { text: 'text-blue-600', bar: 'bg-blue-500', ring: 'border-blue-200 bg-blue-50' };
  if (score >= 85) return { text: 'text-amber-600', bar: 'bg-amber-500', ring: 'border-amber-200 bg-amber-50' };
  return { text: 'text-rose-600', bar: 'bg-rose-500', ring: 'border-rose-200 bg-rose-50' };
}

function dutyBadge(status) {
  const onDuty = status === 'on_duty';
  return `<span class="status-badge ${onDuty ? 'status-delivered' : 'status-muted'}"><span class="w-1.5 h-1.5 rounded-full ${onDuty ? 'bg-emerald-500' : 'bg-slate-400'}"></span>${onDuty ? 'On duty' : 'Off duty'}</span>`;
}

function updateSummary(summary) {
  if (!summary) return;
  state.summary = summary;
  const coverage = summary.total ? (summary.onDuty / summary.total) * 100 : 0;
  const tier = summary.averageSafety >= 92 ? 'Elite' : summary.averageSafety >= 88 ? 'Strong' : 'Developing';
  setText('driverTotal', formatNumber(summary.total));
  setText('driverOffDuty', formatNumber(summary.offDuty));
  setText('driverOnDuty', formatNumber(summary.onDuty));
  setText('driverCoverage', `${formatDecimal(coverage, 0)}% coverage`);
  setText('driverSafety', formatDecimal(summary.averageSafety, 1));
  setText('driverSafetyTier', tier);
  setText('driverOnTime', `${formatDecimal(summary.averageOnTime, 1)}%`);
  setText('driverDeliveries', `${formatCompact(summary.totalDeliveries)} lifetime deliveries`);
  const safetyBar = document.getElementById('driverSafetyBar');
  if (safetyBar) safetyBar.style.width = `${Math.min(100, summary.averageSafety)}%`;
  const badge = document.getElementById('driverOnTimeBadge');
  if (badge) {
    const above = summary.averageOnTime >= 98;
    badge.className = `text-[9px] font-semibold rounded-full px-1.5 py-0.5 ${above ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-amber-700 bg-amber-50 border border-amber-200'}`;
    badge.textContent = above ? 'Above target' : 'Near target';
  }
}

function renderTable() {
  if (!driversBody) return;
  if (!state.drivers.length) {
    driversBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center"><i data-lucide="search-x" class="w-5 h-5 text-slate-400"></i></div><p class="text-xs font-bold text-slate-700 mt-3">No drivers match these filters</p><p class="text-[11px] text-slate-400 mt-1 max-w-xs">Try a different name, vehicle code, or duty status.</p><button type="button" data-reset-drivers class="btn-secondary !py-2 mt-4">Reset roster filters</button></div></td></tr>`;
    renderIcons();
    return;
  }
  const start = (state.pagination.page - 1) * state.pagination.limit;
  driversBody.innerHTML = state.drivers.map((driver, index) => {
    const score = Number(driver.safetyScore);
    const tone = scoreTone(score);
    return `
      <tr data-driver-id="${driver.id}" tabindex="0" aria-label="Open profile for ${escapeHtml(driver.name)}" class="cursor-pointer">
        <td>
          <div class="flex items-center gap-2.5">
            <span class="w-5 text-[9px] font-bold text-slate-400">${String(start + index + 1).padStart(2, '0')}</span>
            ${avatarMarkup(driver.name, driver.avatarColor, 'w-8 h-8', 'text-[10px]')}
            <div class="min-w-0">
              <p class="font-semibold text-slate-900 truncate max-w-[150px]">${escapeHtml(driver.name)}</p>
              <p class="text-[9px] text-slate-400 mt-0.5 truncate max-w-[150px]">${escapeHtml(driver.email)}</p>
            </div>
          </div>
        </td>
        <td>
          <p class="font-mono text-[11px] font-semibold text-slate-800">${escapeHtml(driver.vehicleCode || 'Unassigned')}</p>
          <p class="text-[9px] text-slate-400 mt-0.5">${escapeHtml(driver.region || '—')} region</p>
        </td>
        <td>
          <div class="flex items-center gap-2">
            <span class="font-mono text-[11px] font-bold ${tone.text}">${formatDecimal(score, 1)}</span>
            <div class="progress-track h-1 w-11"><div class="progress-fill ${tone.bar}" style="width:${Math.min(100, score)}%"></div></div>
          </div>
        </td>
        <td>
          <span class="font-mono text-[11px] font-semibold text-slate-800">${formatDecimal(driver.efficiency, 1)}</span>
          <span class="text-[9px] text-slate-400">kmpl</span>
        </td>
        <td><span class="font-mono text-[11px] font-semibold ${Number(driver.onTimeRate) >= 97 ? 'text-emerald-600' : 'text-slate-700'}">${formatDecimal(driver.onTimeRate, 1)}%</span></td>
        <td><span class="font-mono text-[11px] text-slate-700">${formatNumber(driver.deliveriesCompleted)}</span></td>
        <td>${dutyBadge(driver.status)}</td>
        <td class="text-right">
          <button type="button" data-driver="${driver.id}" class="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50 font-semibold text-[10px] whitespace-nowrap">Profile <i data-lucide="chevron-right" class="w-3 h-3"></i></button>
        </td>
      </tr>
    `;
  }).join('');
  renderIcons();
}

function pageNumbers(totalPages, current) {
  const values = new Set([1, totalPages, current, current - 1, current + 1, 2, totalPages - 1]);
  const sorted = [...values].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result = [];
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) result.push('…');
    result.push(sorted[index]);
  }
  return result;
}

function renderPagination() {
  const { page, limit, total, totalPages } = state.pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  setText('driverPageInfo', `Showing ${start}–${end} of ${formatNumber(total)} drivers`);
  if (!pagination) return;
  pagination.innerHTML = `
    <button type="button" data-page="${page - 1}" class="icon-btn !w-7 !h-7" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>
    ${pageNumbers(totalPages, page).map((value) => value === '…'
      ? '<span class="px-1 text-[10px] text-slate-400">…</span>'
      : `<button type="button" data-page="${value}" class="min-w-7 h-7 px-1.5 rounded-md border text-[10px] font-semibold transition-colors ${value === page ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}" ${value === page ? 'aria-current="page"' : ''}>${value}</button>`).join('')}
    <button type="button" data-page="${page + 1}" class="icon-btn !w-7 !h-7" ${page >= totalPages ? 'disabled' : ''} aria-label="Next page"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
  `;
  renderIcons(pagination);
}

function renderLeaderboard(leaders = []) {
  const container = document.getElementById('driverLeaderboard');
  if (!container) return;
  if (!leaders.length) {
    container.innerHTML = '<p class="text-[11px] text-slate-400 py-3">No leaderboard data available.</p>';
    return;
  }
  container.innerHTML = leaders.map((driver, index) => `
    <button type="button" data-driver="${driver.id}" class="w-full py-2.5 flex items-center gap-2.5 text-left group">
      <span class="w-4 text-center text-[9px] font-bold ${index === 0 ? 'text-amber-500' : 'text-slate-400'}">${String(index + 1).padStart(2, '0')}</span>
      ${avatarMarkup(driver.name, driver.avatarColor, 'w-7 h-7', 'text-[9px]')}
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">${escapeHtml(driver.name)}</p>
        <p class="text-[9px] text-slate-400 mt-0.5">${escapeHtml(driver.vehicleCode || 'Unassigned')} · ${formatDecimal(driver.onTimeRate, 1)}% on-time</p>
      </div>
      <span class="font-mono text-[10px] font-bold text-emerald-600">${formatDecimal(driver.safetyScore, 1)}</span>
    </button>
  `).join('');
  renderIcons(container);
}

function renderDistribution(distribution, total) {
  const container = document.getElementById('driverDistribution');
  if (!container || !distribution) return;
  const config = [
    { key: 'elite', label: 'Elite · 95+', color: 'bg-emerald-500', text: 'text-emerald-600' },
    { key: 'strong', label: 'Strong · 90–94', color: 'bg-blue-500', text: 'text-blue-600' },
    { key: 'stable', label: 'Stable · 85–89', color: 'bg-amber-500', text: 'text-amber-600' },
    { key: 'developing', label: 'Coaching · below 85', color: 'bg-rose-500', text: 'text-rose-600' },
  ];
  const denominator = Math.max(1, total);
  container.innerHTML = config.map((tier) => {
    const count = Number(distribution[tier.key] || 0);
    const percent = (count / denominator) * 100;
    return `
      <div>
        <div class="flex items-center justify-between gap-2 text-[10px]">
          <span class="flex items-center gap-1.5 text-slate-600"><span class="w-1.5 h-1.5 rounded-full ${tier.color}"></span>${tier.label}</span>
          <span class="font-semibold ${tier.text}">${formatNumber(count)} <span class="text-slate-400 font-normal">· ${formatDecimal(percent, 0)}%</span></span>
        </div>
        <div class="progress-track h-1.5 mt-1"><div class="progress-fill ${tier.color}" style="width:${percent}%"></div></div>
      </div>
    `;
  }).join('');
  const readiness = total ? ((Number(distribution.elite) + Number(distribution.strong)) / total) * 100 : 0;
  setText('driverReadiness', `${formatDecimal(readiness, 0)}% in top tiers`);
  const bar = document.getElementById('driverReadinessBar');
  if (bar) bar.style.width = `${readiness}%`;
  const coaching = Number(distribution.developing || 0);
  setText(
    'driverCoaching',
    coaching
      ? `${formatNumber(coaching)} driver${coaching === 1 ? '' : 's'} below the 85-point threshold. Schedule a safety check-in this week.`
      : 'Every driver is above the 85-point coaching threshold. Keep the current safety program running.',
  );
}

function renderAll(data) {
  updateSummary(data.summary);
  renderTable();
  renderPagination();
  renderLeaderboard(data.leaders);
  renderDistribution(data.distribution, data.summary.total);
  const filterLabels = [];
  if (state.q) filterLabels.push(`“${state.q}”`);
  if (state.status !== 'all') filterLabels.push(state.status === 'on_duty' ? 'on duty' : 'off duty');
  setText('driverTableSummary', `${formatNumber(data.pagination.total)} drivers${filterLabels.length ? ` · ${filterLabels.join(' · ')}` : ''} · ranked by ${state.sort === 'ontime' ? 'on-time rate' : state.sort === 'safety' ? 'safety score' : state.sort}`);
}

async function loadDrivers({ silent = false, openPending = true } = {}) {
  const requestId = ++state.requestId;
  try {
    const data = await api(`/api/drivers?${buildQuery().toString()}`);
    if (requestId !== state.requestId) return;
    state.drivers = data.drivers;
    state.pagination = data.pagination;
    state.summary = data.summary;
    renderAll(data);
    if (openPending && state.pendingDriver) {
      const id = state.pendingDriver;
      state.pendingDriver = null;
      openDriverModal(id);
    }
  } catch (error) {
    if (error.status === 401) return;
    if (!silent) showToast({ title: 'Could not load driver roster', message: error.message, type: 'error' });
    driversBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i data-lucide="wifi-off" class="w-7 h-7 text-rose-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Driver roster unavailable</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(error.message)}</p><button type="button" data-reset-drivers class="btn-secondary !py-2 mt-3">Try again</button></div></td></tr>`;
    renderIcons();
  }
}

function modalSkeleton() {
  modalBody.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="skeleton w-14 h-14 !rounded-full"></div>
      <div class="flex-1 space-y-2"><div class="skeleton h-4 w-40"></div><div class="skeleton h-3 w-56"></div></div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
      ${Array.from({ length: 4 }, () => '<div class="skeleton h-16"></div>').join('')}
    </div>
    <div class="skeleton h-36 w-full mt-5"></div>
    <div class="skeleton h-24 w-full mt-4"></div>
  `;
}

function openDriverModal(id) {
  if (!modal) return;
  state.selectedDriver = Number(id);
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  modalSkeleton();
  loadDriverDetail(id);
  const url = new URL(location.href);
  url.searchParams.set('driver', String(id));
  history.replaceState({}, '', url);
}

function closeDriverModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  state.selectedDriver = null;
  document.body.style.overflow = '';
  const url = new URL(location.href);
  url.searchParams.delete('driver');
  history.replaceState({}, '', url);
}

function driverAlertTone(severity) {
  return severity === 'critical' ? 'text-rose-600' : severity === 'warning' ? 'text-amber-600' : 'text-blue-600';
}

async function loadDriverDetail(id) {
  if (!modalBody) return;
  try {
    const data = await api(`/api/drivers/${id}`);
    if (state.selectedDriver !== Number(id)) return;
    const driver = data.driver;
    const score = Number(driver.safetyScore);
    const tone = scoreTone(score);
    const shipments = data.shipments || [];
    const alerts = data.alerts || [];
    const history = driver.scoreHistory || [];
    modalBody.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          ${avatarMarkup(driver.name, driver.avatarColor, 'w-14 h-14', 'text-base')}
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 id="driverProfileName" class="text-lg font-extrabold tracking-tight text-slate-950">${escapeHtml(driver.name)}</h3>
              ${dutyBadge(driver.status)}
            </div>
            <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(driver.vehicleCode || 'Unassigned')} · ${escapeHtml(driver.vehicleType || 'Fleet vehicle')} · ${escapeHtml(driver.region || '—')} region</p>
            <p class="text-[10px] text-slate-400 mt-0.5">CDL ${escapeHtml(driver.licenseNo)} · joined ${formatDate(driver.joinedAt, { year: 'numeric' })}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 no-print">
          ${driver.phone ? `<a href="tel:${escapeHtml(driver.phone)}" class="icon-btn !w-8 !h-8" title="Call driver" aria-label="Call ${escapeHtml(driver.name)}"><i data-lucide="phone" class="w-3.5 h-3.5"></i></a>` : ''}
          ${driver.email ? `<a href="mailto:${escapeHtml(driver.email)}" class="icon-btn !w-8 !h-8" title="Email driver" aria-label="Email ${escapeHtml(driver.name)}"><i data-lucide="mail" class="w-3.5 h-3.5"></i></a>` : ''}
        </div>
      </div>

      <div class="mt-5 rounded-xl border ${tone.ring} p-3.5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-white/80 border border-white flex items-center justify-center"><i data-lucide="shield-check" class="w-5 h-5 ${tone.text}"></i></div>
          <div>
            <p class="text-[9px] uppercase tracking-wider font-bold text-slate-500">Composite safety score</p>
            <p class="text-xl font-extrabold ${tone.text} leading-tight mt-0.5">${formatDecimal(score, 1)} <span class="text-[10px] font-semibold text-slate-400">/ 100</span></p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-[9px] uppercase tracking-wider font-bold text-slate-400">Rating</p>
          <p class="text-sm font-bold text-slate-900 mt-0.5 flex items-center justify-end gap-1"><i data-lucide="star" class="w-3.5 h-3.5 text-amber-400 fill-amber-400"></i>${formatDecimal(driver.rating, 2)}</p>
          <p class="text-[9px] text-slate-400">${formatNumber(data.monthlyDeliveries)} deliveries / month</p>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <div class="rounded-lg border border-slate-200 p-2.5">
          <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Safety</p>
          <p class="text-sm font-bold ${tone.text} mt-1">${formatDecimal(score, 1)}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-2.5">
          <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Efficiency</p>
          <p class="text-sm font-bold text-slate-900 mt-1">${formatDecimal(driver.efficiency, 1)} <span class="text-[9px] font-normal text-slate-400">kmpl</span></p>
        </div>
        <div class="rounded-lg border border-slate-200 p-2.5">
          <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">On-time</p>
          <p class="text-sm font-bold text-slate-900 mt-1">${formatDecimal(driver.onTimeRate, 1)}%</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-2.5">
          <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Total km</p>
          <p class="text-sm font-bold text-slate-900 mt-1">${formatCompact(driver.totalMiles)}</p>
        </div>
      </div>

      <div class="mt-5">
        <div class="flex items-center justify-between mb-1">
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Seven-day safety trend</h4>
          <span class="text-[9px] text-slate-400">Score / 100</span>
        </div>
        <div id="driverScoreChart" class="min-h-[150px]"></div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent dispatch</h4>
            <a href="/deliveries?q=${encodeURIComponent(driver.vehicleCode || '')}" class="text-[9px] font-semibold text-blue-600 hover:text-blue-700">Open board</a>
          </div>
          <div class="space-y-1.5">
            ${shipments.length ? shipments.slice(0, 3).map((shipment) => `
              <a href="/deliveries?order=${encodeURIComponent(shipment.orderCode)}" class="block rounded-lg border border-slate-200 p-2.5 hover:border-blue-200 hover:bg-blue-50/40 transition-colors">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-mono text-[10px] font-bold text-slate-900">#${escapeHtml(shipment.orderCode)}</span>
                  ${statusBadge(shipment.status)}
                </div>
                <p class="text-[9px] text-slate-500 mt-1 truncate">${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.destination)}</p>
                <p class="text-[9px] text-slate-400 mt-0.5">${formatDate(shipment.createdAt)} · ${formatNumber(shipment.distanceTotal)} km</p>
              </a>
            `).join('') : '<p class="text-[10px] text-slate-400 py-3">No recent shipments assigned.</p>'}
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent vehicle alerts</h4>
            <a href="/alerts" class="text-[9px] font-semibold text-blue-600 hover:text-blue-700">Alert center</a>
          </div>
          <div class="space-y-1.5">
            ${alerts.length ? alerts.slice(0, 3).map((alert) => `
              <a href="/alerts?focus=${alert.id}" class="block rounded-lg border border-slate-200 p-2.5 hover:border-blue-200 hover:bg-blue-50/40 transition-colors">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-[10px] font-semibold ${driverAlertTone(alert.severity)} leading-snug line-clamp-2">${escapeHtml(alert.title)}</p>
                  ${severityBadge(alert.severity)}
                </div>
                <p class="text-[9px] text-slate-400 mt-1">${relativeTime(alert.createdAt)} · ${escapeHtml(alert.status)}</p>
              </a>
            `).join('') : '<div class="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3"><p class="text-[10px] font-semibold text-emerald-700 flex items-center gap-1"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i>No recent vehicle alerts</p><p class="text-[9px] text-emerald-600/80 mt-1">This driver is operating within the safety envelope.</p></div>'}
          </div>
        </div>
      </div>
    `;
    renderIcons();
    if (history.length) {
      lineChart(document.getElementById('driverScoreChart'), {
        labels: history.map((point) => point.label),
        series: [{ name: 'Safety score', values: history.map((point) => point.score), color: score >= 95 ? '#10b981' : score >= 90 ? '#2563eb' : score >= 85 ? '#f59e0b' : '#ef4444' }],
        height: 160,
        min: 75,
        yFormat: (value) => Number(value).toFixed(0),
        valueFormat: (value) => `${formatDecimal(value, 1)} / 100`,
        showLegend: false,
        ariaLabel: `Seven-day safety score trend for ${driver.name}`,
      });
    } else {
      document.getElementById('driverScoreChart').innerHTML = '<p class="text-[10px] text-slate-400 py-4">No score history available.</p>';
    }
  } catch (error) {
    if (error.status === 401) return;
    modalBody.innerHTML = `<div class="empty-state"><i data-lucide="circle-alert" class="w-7 h-7 text-rose-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Could not load driver profile</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(error.message)}</p><button type="button" data-close-driver class="btn-secondary !py-2 mt-3">Close</button></div>`;
    renderIcons();
  }
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => loadDrivers({ silent: true, openPending: false }), 1800);
}

function setupInteractions() {
  driversBody?.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset-drivers]')) {
      resetFilters();
      return;
    }
    const row = event.target.closest('tr[data-driver-id]');
    if (!row) return;
    openDriverModal(Number(row.dataset.driverId));
  });

  driversBody?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-driver-id]');
    if (!row || event.target.closest('button')) return;
    event.preventDefault();
    openDriverModal(Number(row.dataset.driverId));
  });

  document.getElementById('driverLeaderboard')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-driver]');
    if (button) openDriverModal(Number(button.dataset.driver));
  });

  pagination?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    const next = Number(button.dataset.page);
    if (next === state.page || next < 1 || next > state.pagination.totalPages) return;
    state.page = next;
    loadDrivers({ openPending: false });
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $$('[data-close-driver]').forEach((button) => button.addEventListener('click', closeDriverModal));
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeDriverModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('is-open')) closeDriverModal();
  });

  document.getElementById('refreshDrivers')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadDrivers({ openPending: false });
      showToast({ title: 'Roster refreshed', message: 'Driver scores and dispatch status are up to date.', type: 'success', duration: 3000 });
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('exportDrivers')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const data = await api(`/api/drivers?${buildQuery().toString().replace(/([?&])page=\d+&?/, '$1').replace(/limit=10/, 'limit=100')}`);
      const rows = [
        ['Name', 'Email', 'Phone', 'Status', 'Vehicle', 'Region', 'Safety score', 'Efficiency (kmpl)', 'On-time rate', 'Deliveries', 'Total km', 'Rating', 'Joined'],
        ...data.drivers.map((driver) => [
          driver.name,
          driver.email,
          driver.phone,
          driver.status,
          driver.vehicleCode || '',
          driver.region || '',
          driver.safetyScore,
          driver.efficiency,
          driver.onTimeRate,
          driver.deliveriesCompleted,
          driver.totalMiles,
          driver.rating,
          driver.joinedAt,
        ]),
      ];
      const csv = rows.map((row) => row.map((value) => {
        let text = String(value ?? '');
        if (/^[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
      }).join(',')).join('\r\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fleettrack-driver-roster.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      showToast({ title: 'Driver roster exported', message: `${formatNumber(data.drivers.length)} driver records written to CSV.`, type: 'success' });
    } catch (error) {
      if (error.status !== 401) showToast({ title: 'Export failed', message: error.message, type: 'error' });
    } finally {
      button.disabled = false;
    }
  });
}

function resetFilters() {
  state.q = '';
  state.status = 'all';
  state.sort = 'safety';
  state.page = 1;
  if (searchInput) searchInput.value = '';
  const statusSelect = document.getElementById('driverStatus');
  const sortSelect = document.getElementById('driverSort');
  if (statusSelect) statusSelect.value = 'all';
  if (sortSelect) sortSelect.value = 'safety';
  loadDrivers();
}

function setupFilters() {
  if (searchInput) {
    const debounced = debounce(() => {
      state.q = searchInput.value.trim();
      state.page = 1;
      loadDrivers({ openPending: false });
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
  document.getElementById('driverStatus')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    loadDrivers({ openPending: false });
  });
  document.getElementById('driverSort')?.addEventListener('change', (event) => {
    state.sort = event.target.value;
    state.page = 1;
    loadDrivers({ openPending: false });
  });
}

function setupRealtime() {
  connectRealtime();
  onRealtime('fleet:tick', ({ completed }) => {
    if (completed?.length) scheduleRefresh();
  });
  onRealtime('fleet:summary', ({ summary }) => {
    if (!summary || !state.summary) return;
    updateSummary({
      ...state.summary,
      onDuty: summary.activeDrivers ?? state.summary.onDuty,
      offDuty: summary.totalVehicles != null ? summary.totalVehicles - (summary.activeDrivers ?? 0) : state.summary.offDuty,
    });
  });
  onRealtime('alert:new', scheduleRefresh);
}

function initSelects() {
  const statusSelect = document.getElementById('driverStatus');
  const sortSelect = document.getElementById('driverSort');
  if (statusSelect) statusSelect.value = state.status;
  if (sortSelect) sortSelect.value = state.sort;
}

initSelects();
setupFilters();
setupInteractions();
setupRealtime();
loadDrivers();
