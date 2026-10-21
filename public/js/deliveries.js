import {
  $,
  $$,
  api,
  avatarMarkup,
  copyText,
  debounce,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  relativeTime,
  renderIcons,
  setButtonLoading,
  setupGlobalShortcuts,
  showToast,
  statusBadge,
} from './shared.js';
import { connectRealtime, onRealtime } from './realtime.js';

const state = {
  page: 1,
  limit: 10,
  q: '',
  status: 'all',
  vehicle: 'all',
  region: 'all',
  shipments: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  summary: null,
  meta: null,
  selectedId: null,
  detail: null,
  selected: new Map(),
  requestId: 0,
  refreshTimer: null,
  socketRefreshTimer: null,
};

const searchInput = document.getElementById('shipmentSearch');
const deliveriesBody = document.getElementById('deliveriesBody');
const detailPanel = document.getElementById('detailPanel');
const pagination = document.getElementById('pagination');
const selectionBar = document.getElementById('selectionBar');
const selectAll = document.getElementById('selectAll');

const initialParams = new URLSearchParams(location.search);
const initialOrder = initialParams.get('order') || initialParams.get('q') || '';
if (initialOrder) {
  state.q = initialOrder.replace(/^#/, '').trim();
  if (searchInput) searchInput.value = initialOrder;
}
const initialStatus = initialParams.get('status');
if (['in_transit', 'delivered', 'delayed'].includes(initialStatus)) state.status = initialStatus;
const initialRegion = initialParams.get('region');
if (['North', 'East', 'South', 'West'].includes(initialRegion)) state.region = initialRegion;

function buildQuery({ includePage = true } = {}) {
  const params = new URLSearchParams();
  if (state.status !== 'all') params.set('status', state.status);
  if (state.q) params.set('q', state.q);
  if (state.vehicle !== 'all') params.set('vehicle', state.vehicle);
  if (state.region !== 'all') params.set('region', state.region);
  if (includePage) {
    params.set('page', String(state.page));
    params.set('limit', String(state.limit));
  }
  return params;
}

function clearSelection() {
  state.selected.clear();
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = state.selected.size;
  selectionBar?.classList.toggle('hidden', count === 0);
  selectionBar?.classList.toggle('flex', count > 0);
  const countEl = document.getElementById('selectedCount');
  if (countEl) countEl.textContent = String(count);
  const visibleIds = state.shipments.map((shipment) => shipment.id);
  const visibleSelected = visibleIds.filter((id) => state.selected.has(id)).length;
  if (selectAll) {
    selectAll.checked = visibleIds.length > 0 && visibleSelected === visibleIds.length;
    selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;
  }
  $$('#deliveriesBody input[data-select]').forEach((checkbox) => {
    checkbox.checked = state.selected.has(Number(checkbox.value));
  });
}

function updateSummary(summary) {
  if (!summary) return;
  state.summary = summary;
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  set('kpiTotal', formatNumber(summary.totalShipments));
  set('kpiTransit', formatNumber(summary.inTransit));
  set('kpiDelivered', formatNumber(summary.delivered));
  set('kpiDelayed', formatNumber(summary.delayed));
  set('kpiOnTime', `${summary.onTimeRate}% on-time`);
  set('kpiDelayedBadge', summary.delayed > 0 ? 'Immediate action' : 'All clear');
  set('kpiTotalSub', `${summary.activeVehicles} active vehicles in the live network`);
  set('kpiTransitSub', `${summary.activeVehicles} vehicles reporting GPS telemetry`);
  set('kpiDeliveredSub', `${formatNumber(Math.round(summary.delivered * 0.29))} electronic POD signatures validated`);
  set('kpiDelayedSub', summary.delayed > 0 ? 'Weather, mechanical and route exceptions' : 'No open delivery exceptions');
  const tabCounts = {
    all: summary.totalShipments,
    in_transit: summary.inTransit,
    delivered: summary.delivered,
    delayed: summary.delayed,
  };
  for (const [key, value] of Object.entries(tabCounts)) {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = formatNumber(value);
  }
}

function updateFilterTabs() {
  const buttons = $$('[data-status]');
  for (const button of buttons) {
    const status = button.dataset.status;
    const active = status === state.status;
    let classes = 'filter-pill ';
    if (status === 'all') classes += active ? 'filter-pill-all' : 'filter-pill-neutral';
    else if (status === 'in_transit') classes += 'filter-pill-amber';
    else if (status === 'delivered') classes += 'filter-pill-emerald';
    else classes += 'filter-pill-rose';
    if (active && status !== 'all') classes += ' filter-pill-active';
    button.className = classes;
    button.setAttribute('aria-selected', String(active));
  }
}

function etaCell(shipment) {
  const departure = formatTime(shipment.departedAt);
  if (shipment.status === 'delivered') {
    return `
      <div class="font-mono text-[11px] text-slate-800 font-medium">${departure} → ${formatTime(shipment.deliveredAt, true)}</div>
      <div class="text-[10px] text-emerald-600 font-semibold mt-0.5">Completed · POD signed</div>`;
  }
  if (shipment.status === 'delayed') {
    return `
      <div class="font-mono text-[11px] text-rose-700 font-semibold">${departure} → ${formatTime(shipment.etaAt)}</div>
      <div class="text-[10px] text-rose-500 font-medium mt-0.5 max-w-[160px] truncate" title="${escapeHtml(shipment.delayReason || '')}">${escapeHtml(shipment.delayReason || 'Exception reported')}</div>`;
  }
  return `
    <div class="font-mono text-[11px] text-slate-800 font-medium">${departure} → ${formatTime(shipment.etaAt)}</div>
    <div class="text-[10px] text-amber-600 font-medium mt-0.5">${relativeTime(shipment.etaAt)}</div>`;
}

function progressColor(status) {
  if (status === 'delivered') return 'bg-emerald-500';
  if (status === 'delayed') return 'bg-rose-500';
  return 'bg-amber-500';
}

function renderTable() {
  if (!deliveriesBody) return;
  if (!state.shipments.length) {
    deliveriesBody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state">
        <div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center"><i data-lucide="search-x" class="w-5 h-5 text-slate-400"></i></div>
        <p class="text-xs font-bold text-slate-700 mt-3">No shipments match these filters</p>
        <p class="text-[11px] text-slate-400 mt-1 max-w-xs">Try clearing the search or expanding the status filter to see more of the dispatch manifest.</p>
        <button type="button" data-reset-empty class="btn-secondary !py-2 mt-4">Reset filters</button>
      </div>
    </td></tr>`;
    renderIcons();
    updateSelectionUI();
    return;
  }

  deliveriesBody.innerHTML = state.shipments.map((shipment) => {
    const selectedRow = shipment.id === state.selectedId;
    const checked = state.selected.has(shipment.id);
    const meta = shipment.status === 'delivered'
      ? { color: 'text-emerald-600', label: 'Delivered' }
      : shipment.status === 'delayed'
        ? { color: 'text-rose-600', label: 'Exception' }
        : { color: 'text-slate-500', label: 'On route' };
    return `
      <tr data-shipment-id="${shipment.id}" data-status="${shipment.status}" class="${selectedRow ? 'table-row-selected' : ''}" tabindex="0" aria-label="Open shipment ${shipment.orderCode}">
        <td class="!pr-1">
          <input type="checkbox" data-select value="${shipment.id}" class="accent-blue-600 w-3.5 h-3.5 rounded cursor-pointer" aria-label="Select shipment ${shipment.orderCode}" ${checked ? 'checked' : ''}>
        </td>
        <td>
          <div class="flex items-center gap-1">
            <span class="font-mono text-[11px] font-semibold text-slate-900">#${escapeHtml(shipment.orderCode)}</span>
            <button type="button" data-copy="${escapeHtml(shipment.orderCode)}" class="text-slate-300 hover:text-blue-600 p-0.5" title="Copy order ID" aria-label="Copy order ID">
              <i data-lucide="copy" class="w-3 h-3"></i>
            </button>
          </div>
          <p class="text-[9px] text-slate-400 mt-1">${escapeHtml(shipment.region)} region</p>
        </td>
        <td>
          <div class="font-semibold text-slate-900 text-[11px]">${escapeHtml(shipment.vehicleCode)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5 max-w-[110px] truncate">${escapeHtml(shipment.driverName)}</div>
        </td>
        <td>
          <div class="font-medium text-slate-700 text-[11px] max-w-[190px] truncate">${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.destination)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5 max-w-[170px] truncate">${escapeHtml(shipment.route)}</div>
        </td>
        <td class="w-32">
          <div class="flex items-center justify-between text-[10px] mb-1 font-mono text-slate-500">
            <span>${formatNumber(shipment.distanceDone)} / ${formatNumber(shipment.distanceTotal)} km</span>
            <span class="row-progress-text text-slate-800 font-bold">${Math.round(shipment.progress)}%</span>
          </div>
          <div class="progress-track h-1.5">
            <div class="row-progress-fill progress-fill ${progressColor(shipment.status)}" style="width:${Math.min(100, shipment.progress)}%"></div>
          </div>
          <div class="text-[9px] mt-1 ${meta.color}">${meta.label}</div>
        </td>
        <td>${statusBadge(shipment.status)}</td>
        <td>${etaCell(shipment)}</td>
        <td class="text-right">
          <button type="button" data-detail="${shipment.id}" class="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-blue-600 hover:bg-blue-50 font-semibold text-[10px] whitespace-nowrap">
            Details <i data-lucide="chevron-right" class="w-3 h-3"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  renderIcons();
  updateSelectionUI();
}

function pageNumbers(totalPages, current) {
  const values = new Set([1, totalPages, current, current - 1, current + 1]);
  values.add(2);
  values.add(totalPages - 1);
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
  const info = document.getElementById('pageInfo');
  if (info) info.innerHTML = `Showing <strong class="text-slate-800">${start}–${end}</strong> of <strong class="text-slate-800">${formatNumber(total)}</strong> shipments`;
  const summary = document.getElementById('tableSummary');
  if (summary) summary.textContent = `${formatNumber(total)} dispatch records · live feed active`;
  if (pagination) {
    pagination.innerHTML = `
      <button type="button" data-page="${page - 1}" class="icon-btn !w-7 !h-7" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>
      ${pageNumbers(totalPages, page).map((value) => value === '…'
        ? '<span class="px-1 text-[10px] text-slate-400">…</span>'
        : `<button type="button" data-page="${value}" class="min-w-7 h-7 px-1.5 rounded-md border text-[10px] font-semibold transition-colors ${value === page ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}" ${value === page ? 'aria-current="page"' : ''}>${value}</button>`).join('')}
      <button type="button" data-page="${page + 1}" class="icon-btn !w-7 !h-7" ${page >= totalPages ? 'disabled' : ''} aria-label="Next page"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
    `;
    renderIcons(pagination);
  }
  $$('#deliveriesBody tr[data-shipment-id]').forEach((row) => {
    row.classList.toggle('table-row-selected', Number(row.dataset.shipmentId) === state.selectedId);
  });
}

function detailSkeleton() {
  detailPanel.innerHTML = `
    <div class="card p-5">
      <div class="skeleton h-5 w-40"></div>
      <div class="skeleton h-3 w-full mt-3"></div>
      <div class="skeleton h-16 w-full mt-5"></div>
      <div class="grid grid-cols-3 gap-2 mt-4"><div class="skeleton h-16"></div><div class="skeleton h-16"></div><div class="skeleton h-16"></div></div>
      <div class="skeleton h-4 w-full mt-6"></div>
      <div class="skeleton h-4 w-5/6 mt-2"></div>
      <div class="skeleton h-4 w-full mt-2"></div>
      <div class="skeleton h-4 w-3/4 mt-2"></div>
    </div>
  `;
}

function renderDetail(shipment) {
  state.detail = shipment;
  if (!detailPanel || !shipment) return;
  const driver = shipment.driver;
  const vehicle = shipment.vehicle;
  const progress = Math.min(100, Math.round(Number(shipment.progress) || 0));
  const status = statusBadge(shipment.status);
  const temp = shipment.tempC === null || shipment.tempC === undefined ? 'Ambient' : `${Number(shipment.tempC).toFixed(1)}°C`;
  const tempColor = temp === 'Ambient' ? 'text-slate-800' : 'text-emerald-700';
  const battery = vehicle?.battery != null ? `${Number(vehicle.battery).toFixed(1)}%` : '—';
  const etaLabel = shipment.status === 'delivered'
    ? `Delivered ${formatDateTime(shipment.deliveredAt)}`
    : `ETA ${formatDateTime(shipment.etaAt)}`;
  const events = shipment.events || [];
  const timeline = events.length ? events.map((event) => {
    const icon = event.kind === 'delivery' ? 'check' : event.kind === 'exception' ? 'triangle-alert' : event.kind === 'checkpoint' ? 'map-pin-check' : 'package-open';
    const color = event.kind === 'delivery' ? 'bg-emerald-500' : event.kind === 'exception' ? 'bg-rose-500' : event.kind === 'checkpoint' ? 'bg-blue-500' : 'bg-slate-400';
    const iconBg = event.kind === 'delivery' ? 'bg-emerald-50 text-emerald-600' : event.kind === 'exception' ? 'bg-rose-50 text-rose-600' : event.kind === 'checkpoint' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500';
    return `
      <div class="relative pl-7 pb-4 last:pb-0">
        <span class="absolute left-0 top-0.5 w-5 h-5 rounded-full ${iconBg} flex items-center justify-center ring-4 ring-white z-10">
          <i data-lucide="${icon}" class="w-3 h-3"></i>
        </span>
        <div class="flex items-start justify-between gap-2">
          <p class="text-[11px] font-semibold text-slate-800 leading-snug">${escapeHtml(event.title)}</p>
          <time class="text-[9px] font-mono text-slate-400 whitespace-nowrap">${formatDate(event.occurredAt)} · ${formatTime(event.occurredAt)}</time>
        </div>
        ${event.detail ? `<p class="text-[10px] text-slate-400 leading-relaxed mt-1">${escapeHtml(event.detail)}</p>` : ''}
        <span class="hidden">${color}</span>
      </div>
    `;
  }).join('') : '<p class="text-[11px] text-slate-400 py-3">No milestones recorded yet.</p>';

  const advisory = shipment.status === 'delayed'
    ? { icon: 'triangle-alert', classes: 'border-rose-200 bg-rose-50 text-rose-700', text: shipment.delayReason || 'A delivery exception is open for this shipment.' }
    : shipment.status === 'delivered'
      ? { icon: 'shield-check', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700', text: 'Proof of delivery is complete and the shipment has been closed in the dispatch ledger.' }
      : { icon: 'info', classes: 'border-blue-200 bg-blue-50 text-blue-700', text: 'Vehicle telemetry is healthy. Cargo conditions remain within the configured tolerance band.' };

  detailPanel.innerHTML = `
    <div class="card p-5 space-y-4">
      <div class="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-slate-950 font-mono">#${escapeHtml(shipment.orderCode)}</h2>
            ${status}
          </div>
          <p class="text-[11px] text-slate-500 mt-1 truncate">${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.destination)}</p>
          <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(shipment.vehicleType || 'Fleet vehicle')} · ${escapeHtml(shipment.region)} region</p>
        </div>
        <button type="button" data-detail-copy class="icon-btn !w-8 !h-8" title="Copy order ID" aria-label="Copy order ID"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
      </div>

      <div class="rounded-xl bg-slate-50/80 border border-slate-100 p-3">
        <div class="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1.5">
          <span>Delivery progress</span>
          <span id="detailProgressValue" class="text-slate-900 font-bold">${progress}%</span>
        </div>
        <div class="progress-track h-2"><div id="detailProgressBar" class="progress-fill ${progressColor(shipment.status)}" style="width:${progress}%"></div></div>
        <div class="flex items-center justify-between mt-2 text-[10px] text-slate-400">
          <span>${formatNumber(shipment.distanceDone)} / ${formatNumber(shipment.distanceTotal)} km</span>
          <span>${escapeHtml(etaLabel)}</span>
        </div>
      </div>

      <div class="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          ${avatarMarkup(driver?.name || shipment.driverName, driver?.avatarColor || shipment.driverColor, 'w-10 h-10', 'text-xs')}
          <div class="min-w-0">
            <p class="text-xs font-bold text-slate-900 truncate">${escapeHtml(driver?.name || shipment.driverName)}</p>
            <p class="text-[10px] text-slate-500 truncate mt-0.5">Vehicle: <strong class="text-slate-800">${escapeHtml(shipment.vehicleCode)}</strong> · ${escapeHtml(vehicle?.model || vehicle?.make || 'Fleet truck')}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${driver?.phone ? `<a href="tel:${escapeHtml(driver.phone)}" class="icon-btn !w-8 !h-8" title="Call driver" aria-label="Call driver"><i data-lucide="phone" class="w-3.5 h-3.5"></i></a>` : ''}
          ${driver?.email ? `<a href="mailto:${escapeHtml(driver.email)}" class="icon-btn !w-8 !h-8" title="Email driver" aria-label="Email driver"><i data-lucide="mail" class="w-3.5 h-3.5"></i></a>` : ''}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
          <span class="text-[9px] uppercase font-semibold text-slate-400 tracking-wider">Temp lock</span>
          <div class="text-[12px] font-bold ${tempColor} mt-1 flex items-center justify-center gap-1"><i data-lucide="thermometer" class="w-3.5 h-3.5"></i>${temp}</div>
        </div>
        <div class="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
          <span class="text-[9px] uppercase font-semibold text-slate-400 tracking-wider">Payload</span>
          <div class="text-[12px] font-bold text-slate-800 mt-1 flex items-center justify-center gap-1"><i data-lucide="weight" class="w-3.5 h-3.5"></i>${Number(shipment.weightTons).toFixed(1)} T</div>
        </div>
        <div class="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
          <span class="text-[9px] uppercase font-semibold text-slate-400 tracking-wider">Battery / Tele</span>
          <div class="text-[12px] font-bold text-blue-600 mt-1 flex items-center justify-center gap-1"><i data-lucide="radio-tower" class="w-3.5 h-3.5"></i>${battery}</div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dispatch &amp; Route Milestones</h3>
          <span class="text-[9px] text-slate-400">${events.length} events</span>
        </div>
        <div class="relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
          ${timeline}
        </div>
      </div>

      <div class="pt-1 flex items-center gap-2">
        <button type="button" data-action="pod" class="flex-1 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-semibold text-slate-700 flex items-center justify-center gap-1.5">
          <i data-lucide="receipt-text" class="w-3.5 h-3.5"></i> BOL / POD
        </button>
        <button type="button" data-action="telemetry" class="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-[10px] font-semibold text-white flex items-center justify-center gap-1.5">
          <i data-lucide="satellite" class="w-3.5 h-3.5"></i> Live telemetry
        </button>
      </div>
    </div>
    <div class="mt-3 p-3.5 rounded-xl border ${advisory.classes} flex items-start gap-2.5">
      <i data-lucide="${advisory.icon}" class="w-4 h-4 shrink-0 mt-0.5"></i>
      <p class="text-[10px] leading-relaxed">${escapeHtml(advisory.text)}</p>
    </div>
  `;
  renderIcons();
}

async function selectShipment(id, { quiet = false } = {}) {
  if (!id) return;
  state.selectedId = Number(id);
  $$('#deliveriesBody tr[data-shipment-id]').forEach((row) => {
    row.classList.toggle('table-row-selected', Number(row.dataset.shipmentId) === state.selectedId);
  });
  if (!quiet) detailSkeleton();
  try {
    const { shipment } = await api(`/api/deliveries/${state.selectedId}`);
    if (state.selectedId !== Number(id)) return;
    renderDetail(shipment);
    if (!quiet && window.innerWidth < 1280) {
      detailPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (error.status === 401) return;
    if (!quiet) {
      detailPanel.innerHTML = `<div class="card p-6 empty-state"><i data-lucide="circle-alert" class="w-7 h-7 text-rose-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Could not load shipment detail</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(error.message)}</p></div>`;
      renderIcons();
    }
  }
}

async function loadShipments({ silent = false } = {}) {
  const requestId = ++state.requestId;
  if (!silent) {
    const summaryText = document.getElementById('tableSummary');
    if (summaryText) summaryText.textContent = 'Refreshing dispatch manifest…';
  }
  try {
    const data = await api(`/api/deliveries?${buildQuery().toString()}`);
    if (requestId !== state.requestId) return;
    state.shipments = data.shipments;
    state.pagination = data.pagination;
    updateSummary(data.summary);
    updateFilterTabs();
    renderTable();
    renderPagination();
    const selectedStillVisible = state.shipments.some((shipment) => shipment.id === state.selectedId);
    if (!selectedStillVisible && state.shipments.length) {
      await selectShipment(state.shipments[0].id, { quiet: silent });
    } else if (!state.shipments.length) {
      state.selectedId = null;
      state.detail = null;
      detailPanel.innerHTML = `<div class="card p-6 empty-state"><div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center"><i data-lucide="inbox" class="w-5 h-5 text-slate-400"></i></div><p class="text-xs font-semibold text-slate-600 mt-3">No shipment selected</p><p class="text-[11px] text-slate-400 mt-1">Adjust your filters or create a new shipment to begin.</p></div>`;
      renderIcons();
    }
  } catch (error) {
    if (error.status === 401) return;
    if (!silent) showToast({ title: 'Could not load shipments', message: error.message, type: 'error' });
    if (!state.shipments.length) {
      deliveriesBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i data-lucide="wifi-off" class="w-7 h-7 text-rose-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Unable to load the dispatch manifest</p><button type="button" data-reset-empty class="btn-secondary !py-2 mt-3">Try again</button></div></td></tr>`;
      renderIcons();
    }
  }
}

function scheduleListRefresh() {
  clearTimeout(state.socketRefreshTimer);
  state.socketRefreshTimer = setTimeout(() => loadShipments({ silent: true }), 1200);
}

function applyLiveUpdates(updates) {
  if (!Array.isArray(updates) || !updates.length) return;
  let needsRefresh = false;
  let detailNeedsRefresh = false;
  for (const update of updates) {
    const row = document.querySelector(`#deliveriesBody tr[data-shipment-id="${update.id}"]`);
    if (row) {
      const percentage = Math.min(100, Number(update.progress) || 0);
      const fill = row.querySelector('.row-progress-fill');
      if (fill) fill.style.width = `${percentage}%`;
      const text = row.querySelector('.row-progress-text');
      if (text) text.textContent = `${Math.round(percentage)}%`;
      if (row.dataset.status !== update.status) {
        needsRefresh = true;
      }
    }
    if (state.detail?.id === update.id) {
      const percentage = Math.min(100, Number(update.progress) || 0);
      const bar = document.getElementById('detailProgressBar');
      const value = document.getElementById('detailProgressValue');
      if (bar) bar.style.width = `${percentage}%`;
      if (value) value.textContent = `${Math.round(percentage)}%`;
      if (update.status !== state.detail.status) detailNeedsRefresh = true;
    }
  }
  if (detailNeedsRefresh && state.selectedId) selectShipment(state.selectedId, { quiet: true });
  if (needsRefresh) scheduleListRefresh();
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  const focusable = modal.querySelector('input, select, button:not([data-close-modal]), textarea');
  setTimeout(() => focusable?.focus(), 60);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('is-open');
  if (!document.querySelector('.modal-overlay.is-open')) document.body.style.overflow = '';
}

function setupModals() {
  $$('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.closeModal));
  });
  $$('.modal-overlay').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const open = document.querySelector('.modal-overlay.is-open');
      if (open) closeModal(open.id);
    }
  });

  document.getElementById('openCreate')?.addEventListener('click', () => openCreateModal());
  document.getElementById('createShipmentForm')?.addEventListener('submit', submitCreate);
  document.getElementById('printDoc')?.addEventListener('click', () => {
    document.body.classList.add('print-doc');
    const cleanup = () => document.body.classList.remove('print-doc');
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => window.print(), 50);
    setTimeout(cleanup, 1500);
  });
}

async function loadMeta() {
  try {
    const meta = await api('/api/deliveries/meta');
    state.meta = meta;
    populateVehicleFilter(meta);
    populateCreateForm(meta);
  } catch (error) {
    if (error.status !== 401) showToast({ title: 'Filters unavailable', message: error.message, type: 'warning' });
  }
}

function populateVehicleFilter(meta) {
  const select = document.getElementById('vehicleFilter');
  if (!select) return;
  const current = state.vehicle;
  select.innerHTML = '<option value="all">Vehicle: All</option>' + meta.vehicles.map((vehicle) => `
    <option value="${escapeHtml(vehicle.code)}">${escapeHtml(vehicle.code)} · ${escapeHtml(vehicle.driverName || 'Unassigned')}</option>
  `).join('');
  select.value = current;
}

function cityOptions(meta, selected) {
  const byRegion = new Map();
  for (const city of meta.cities) {
    if (!byRegion.has(city.region)) byRegion.set(city.region, []);
    byRegion.get(city.region).push(city);
  }
  return [...byRegion.entries()].map(([region, cities]) => `
    <optgroup label="${escapeHtml(region)} region">
      ${cities.map((city) => `<option value="${escapeHtml(city.name)}" ${city.name === selected ? 'selected' : ''}>${escapeHtml(city.short)}, ${escapeHtml(city.region)}</option>`).join('')}
    </optgroup>
  `).join('');
}

function populateCreateForm(meta) {
  const vehicleSelect = document.getElementById('createVehicle');
  const originSelect = document.getElementById('originCity');
  const destinationSelect = document.getElementById('destinationCity');
  const cargoSelect = document.getElementById('cargoType');
  if (!vehicleSelect || !originSelect || !destinationSelect || !cargoSelect) return;

  const available = meta.vehicles.filter((vehicle) => vehicle.status === 'active' && !vehicle.currentOrder);
  const previousVehicle = vehicleSelect.value;
  vehicleSelect.innerHTML = '<option value="">Select an available vehicle…</option>' + available.map((vehicle) => `
    <option value="${vehicle.id}" ${String(vehicle.id) === previousVehicle ? 'selected' : ''}>${escapeHtml(vehicle.code)} · ${escapeHtml(vehicle.driverName || 'Unassigned')} (${escapeHtml(vehicle.type)})</option>
  `).join('');
  const vehicleHelp = document.getElementById('vehicleHelp');
  if (vehicleHelp) {
    vehicleHelp.textContent = available.length
      ? `${available.length} vehicles are currently available for dispatch.`
      : 'No vehicles are currently available. Complete an active trip or clear maintenance first.';
    vehicleHelp.classList.toggle('text-rose-500', available.length === 0);
  }

  if (!originSelect.options.length) {
    originSelect.innerHTML = cityOptions(meta, 'Chicago, IL');
    destinationSelect.innerHTML = cityOptions(meta, 'Detroit, MI');
    cargoSelect.innerHTML = '<option value="">Select cargo type…</option>' + meta.cargoTypes.map((cargo) => `<option value="${escapeHtml(cargo)}">${escapeHtml(cargo)}</option>`).join('');
    cargoSelect.value = 'General Freight';
  }
}

async function openCreateModal() {
  const form = document.getElementById('createShipmentForm');
  form?.reset();
  document.getElementById('createError')?.classList.add('hidden');
  await loadMeta();
  openModal('createModal');
}

async function submitCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = document.getElementById('createError');
  const submit = document.getElementById('createSubmit');
  const vehicleId = Number(document.getElementById('createVehicle')?.value);
  const originCity = document.getElementById('originCity')?.value;
  const destinationCity = document.getElementById('destinationCity')?.value;
  const cargo = document.getElementById('cargoType')?.value;
  const weightTons = Number(document.getElementById('weightTons')?.value);
  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  if (!vehicleId || !originCity || !destinationCity || !cargo || !Number.isFinite(weightTons)) {
    showError('Complete all shipment fields before publishing.');
    return;
  }
  if (originCity === destinationCity) {
    showError('Origin and destination must be different cities.');
    return;
  }
  errorBox.classList.add('hidden');
  setButtonLoading(submit, true, 'Publishing…');
  try {
    const result = await api('/api/deliveries', {
      method: 'POST',
      body: { vehicleId, originCity, destinationCity, cargo, weightTons },
    });
    closeModal('createModal');
    clearSelection();
    state.q = '';
    state.status = 'all';
    state.vehicle = 'all';
    state.region = 'all';
    state.page = 1;
    if (searchInput) searchInput.value = '';
    document.getElementById('vehicleFilter').value = 'all';
    document.getElementById('regionFilter').value = 'all';
    state.selectedId = result.shipment.id;
    state.detail = null;
    await loadMeta();
    await loadShipments();
    showToast({
      title: `Shipment #${result.shipment.orderCode} dispatched`,
      message: `${result.shipment.vehicleCode} is en route to ${result.shipment.destination}.`,
      type: 'success',
    });
    form.reset();
  } catch (error) {
    if (error.status !== 401) showError(error.message);
  } finally {
    setButtonLoading(submit, false);
  }
}

function setupFilters() {
  if (searchInput) {
    const debounced = debounce(() => {
      state.q = searchInput.value.trim().replace(/^#/, '');
      state.page = 1;
      state.selectedId = null;
      state.detail = null;
      clearSelection();
      loadShipments();
    }, 320);
    searchInput.addEventListener('input', debounced);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.blur();
      }
    });
  }

  $$('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.status === button.dataset.status) return;
      state.status = button.dataset.status;
      state.page = 1;
      state.selectedId = null;
      state.detail = null;
      clearSelection();
      updateFilterTabs();
      loadShipments();
    });
  });

  document.getElementById('vehicleFilter')?.addEventListener('change', (event) => {
    state.vehicle = event.target.value;
    state.page = 1;
    state.selectedId = null;
    state.detail = null;
    clearSelection();
    loadShipments();
  });
  document.getElementById('regionFilter')?.addEventListener('change', (event) => {
    state.region = event.target.value;
    state.page = 1;
    state.selectedId = null;
    state.detail = null;
    clearSelection();
    loadShipments();
  });
  document.getElementById('resetFilters')?.addEventListener('click', resetFilters);
  document.getElementById('pageSize')?.addEventListener('change', (event) => {
    state.limit = Number(event.target.value);
    state.page = 1;
    loadShipments();
  });
  document.getElementById('exportCsv')?.addEventListener('click', () => {
    const params = buildQuery({ includePage: false });
    location.assign(`/api/deliveries/export.csv${params.toString() ? `?${params.toString()}` : ''}`);
  });
  document.getElementById('copySelected')?.addEventListener('click', () => {
    const values = [...state.selected.values()].map((order) => `#${order}`);
    copyText(values.join(', '), `${values.length} order IDs copied`);
  });
  document.getElementById('clearSelected')?.addEventListener('click', clearSelection);
}

function resetFilters() {
  state.q = '';
  state.status = 'all';
  state.vehicle = 'all';
  state.region = 'all';
  state.page = 1;
  state.selectedId = null;
  state.detail = null;
  if (searchInput) searchInput.value = '';
  const vehicleSelect = document.getElementById('vehicleFilter');
  const regionSelect = document.getElementById('regionFilter');
  if (vehicleSelect) vehicleSelect.value = 'all';
  if (regionSelect) regionSelect.value = 'all';
  clearSelection();
  updateFilterTabs();
  loadShipments();
}

function setupTableInteractions() {
  deliveriesBody?.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset-empty]')) {
      resetFilters();
      return;
    }
    const row = event.target.closest('tr[data-shipment-id]');
    if (!row) return;
    const checkbox = event.target.closest('input[data-select]');
    if (checkbox) return;
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      copyText(copy.dataset.copy, `Order #${copy.dataset.copy} copied`);
      return;
    }
    selectShipment(Number(row.dataset.shipmentId));
  });

  deliveriesBody?.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[data-select]');
    if (!checkbox) return;
    const id = Number(checkbox.value);
    const shipment = state.shipments.find((item) => item.id === id);
    if (checkbox.checked && shipment) state.selected.set(id, shipment.orderCode);
    else state.selected.delete(id);
    updateSelectionUI();
  });

  deliveriesBody?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-shipment-id]');
    if (!row || event.target.closest('input, button')) return;
    event.preventDefault();
    selectShipment(Number(row.dataset.shipmentId));
  });

  selectAll?.addEventListener('change', () => {
    if (selectAll.checked) {
      for (const shipment of state.shipments) state.selected.set(shipment.id, shipment.orderCode);
    } else {
      for (const shipment of state.shipments) state.selected.delete(shipment.id);
    }
    updateSelectionUI();
  });

  pagination?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    const nextPage = Number(button.dataset.page);
    if (nextPage === state.page || nextPage < 1 || nextPage > state.pagination.totalPages) return;
    state.page = nextPage;
    state.selectedId = null;
    state.detail = null;
    loadShipments();
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  detailPanel?.addEventListener('click', async (event) => {
    if (event.target.closest('[data-detail-copy]') && state.detail) {
      copyText(state.detail.orderCode, 'Order ID copied');
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !state.detail) return;
    if (action === 'pod') openDocument(state.detail);
    if (action === 'telemetry') openTelemetry(state.detail);
  });
}

function openDocument(shipment) {
  const driver = shipment.driver;
  const content = document.getElementById('docContent');
  if (!content) return;
  const delivered = shipment.status === 'delivered';
  content.innerHTML = `
    <div class="border border-slate-200 rounded-xl overflow-hidden">
      <div class="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center"><i data-lucide="zap" class="w-3.5 h-3.5"></i></div>
            <span class="text-lg font-extrabold tracking-tight text-slate-950">FleetTrack</span>
          </div>
          <p class="text-[9px] uppercase tracking-[0.15em] font-bold text-slate-400 mt-2">Bill of Lading &amp; Proof of Delivery</p>
        </div>
        <div class="text-right">
          <p class="text-[10px] text-slate-400 font-medium">Document</p>
          <p class="font-mono text-xs font-bold text-slate-900">BOL-${escapeHtml(shipment.orderCode)}</p>
          <p class="text-[9px] text-slate-400 mt-1">${formatDate(shipment.createdAt)}</p>
        </div>
      </div>
      <div class="p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-xs">
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Shipment order</p><p class="font-mono font-bold text-slate-900 mt-1">#${escapeHtml(shipment.orderCode)}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Status</p><div class="mt-1">${statusBadge(shipment.status)}</div></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Origin</p><p class="font-medium text-slate-800 mt-1">${escapeHtml(shipment.origin)}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Destination</p><p class="font-medium text-slate-800 mt-1">${escapeHtml(shipment.destination)}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Carrier / vehicle</p><p class="font-medium text-slate-800 mt-1">${escapeHtml(shipment.vehicleCode)} · ${escapeHtml(driver?.name || shipment.driverName)}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Route</p><p class="font-medium text-slate-800 mt-1">${escapeHtml(shipment.route)}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Cargo</p><p class="font-medium text-slate-800 mt-1">${escapeHtml(shipment.cargo)}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Weight</p><p class="font-medium text-slate-800 mt-1">${Number(shipment.weightTons).toFixed(1)} tons</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Temperature</p><p class="font-medium text-slate-800 mt-1">${shipment.tempC != null ? `${Number(shipment.tempC).toFixed(1)}°C` : 'Ambient / dry freight'}</p></div>
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Distance</p><p class="font-medium text-slate-800 mt-1">${formatNumber(shipment.distanceTotal)} km</p></div>
      </div>
      <div class="mx-5 mb-5 border-t border-dashed border-slate-200 pt-4 grid grid-cols-2 gap-6">
        <div>
          <p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Dispatched</p>
          <p class="text-[11px] text-slate-700 mt-1">${formatDateTime(shipment.departedAt)}</p>
        </div>
        <div>
          <p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">${delivered ? 'Delivered & signed' : 'Estimated arrival'}</p>
          <p class="text-[11px] text-slate-700 mt-1">${delivered ? formatDateTime(shipment.deliveredAt) : formatDateTime(shipment.etaAt)}</p>
        </div>
      </div>
      <div class="bg-slate-50 border-t border-slate-200 px-5 py-4 flex items-end justify-between gap-6">
        <div>
          <p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">POD signature</p>
          <p class="font-serif italic text-lg text-slate-800 mt-1">${escapeHtml(shipment.podSignature || 'Pending electronic signature')}</p>
        </div>
        <p class="text-[9px] text-slate-400 text-right">System generated · FleetTrack Ops<br>${formatDateTime(new Date())}</p>
      </div>
    </div>
  `;
  renderIcons();
  openModal('docModal');
}

async function openTelemetry(shipment) {
  const content = document.getElementById('telemetryContent');
  if (!content) return;
  content.innerHTML = '<div class="flex items-center justify-center py-12 gap-2 text-xs text-slate-500"><span class="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></span>Reading live telemetry…</div>';
  openModal('telemetryModal');
  try {
    const data = await api('/api/vehicles/live');
    const vehicle = data.vehicles.find((item) => item.code === shipment.vehicleCode);
    if (!vehicle) {
      content.innerHTML = '<div class="empty-state"><i data-lucide="wifi-off" class="w-7 h-7 text-slate-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Telemetry unavailable</p><p class="text-[11px] text-slate-400 mt-1">This vehicle is not reporting a live telemetry packet.</p></div>';
      renderIcons();
      return;
    }
    const metrics = [
      { label: 'Speed', value: `${Number(vehicle.speed).toFixed(0)} km/h`, icon: 'gauge' },
      { label: 'Fuel level', value: `${Number(vehicle.fuelLevel).toFixed(1)}%`, icon: 'fuel' },
      { label: 'Battery', value: `${Number(vehicle.battery).toFixed(1)}%`, icon: 'battery-charging' },
      { label: 'Engine temp', value: `${Number(vehicle.engineTemp).toFixed(0)}°C`, icon: 'thermometer' },
      { label: 'Region', value: vehicle.region, icon: 'map-pinned' },
      { label: 'Odometer', value: `${formatNumber(vehicle.odometer)} km`, icon: 'route' },
    ];
    content.innerHTML = `
      <div class="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
        ${avatarMarkup(vehicle.driverName, vehicle.driverColor, 'w-10 h-10', 'text-xs')}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-sm font-bold text-slate-900">${escapeHtml(vehicle.code)}</p>
            <span class="status-badge ${vehicle.status === 'active' ? 'status-delivered' : vehicle.status === 'idle' ? 'status-muted' : 'status-delayed'}">${vehicle.status}</span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(vehicle.driverName || 'Unassigned')} · ${escapeHtml(vehicle.model)}</p>
        </div>
        <span class="live-dot"></span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
        ${metrics.map((metric) => `<div class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-semibold text-slate-400"><i data-lucide="${metric.icon}" class="w-3 h-3"></i>${metric.label}</div>
          <p class="text-sm font-bold text-slate-900 mt-1.5">${escapeHtml(metric.value)}</p>
        </div>`).join('')}
      </div>
      <div class="mt-4 p-3.5 rounded-xl border border-blue-100 bg-blue-50/60">
        <div class="flex items-start gap-2">
          <i data-lucide="map-pin" class="w-4 h-4 text-blue-600 mt-0.5"></i>
          <div>
            <p class="text-[10px] font-bold text-blue-900">Live GPS packet</p>
            <p class="text-[10px] text-blue-700 mt-1 font-mono">${Number(vehicle.lat).toFixed(5)}, ${Number(vehicle.lng).toFixed(5)}</p>
            <p class="text-[9px] text-blue-500 mt-1">Last sync ${relativeTime(vehicle.updatedAt)} · Plate ${escapeHtml(vehicle.plate)}</p>
          </div>
        </div>
      </div>
      ${vehicle.currentOrder ? `<div class="mt-3 flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200">
        <div><p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Active dispatch</p><p class="text-[11px] font-semibold text-slate-800 mt-0.5">#${escapeHtml(vehicle.currentOrder)} → ${escapeHtml(vehicle.currentDestination || '')}</p></div>
        <span class="text-[10px] font-bold text-slate-700">${Math.round(Number(vehicle.currentProgress) || 0)}%</span>
      </div>` : ''}
    `;
    renderIcons();
  } catch (error) {
    if (error.status === 401) return;
    content.innerHTML = `<div class="empty-state"><i data-lucide="wifi-off" class="w-7 h-7 text-rose-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">Telemetry could not be loaded</p><p class="text-[11px] text-slate-400 mt-1">${escapeHtml(error.message)}</p></div>`;
    renderIcons();
  }
}

function setupRealtime() {
  connectRealtime();
  onRealtime('fleet:summary', ({ summary }) => updateSummary(summary));
  onRealtime('fleet:tick', ({ summary, updates }) => {
    if (summary) updateSummary(summary);
    applyLiveUpdates(updates);
  });
  onRealtime('shipment:created', ({ shipment }) => {
    showToast({
      title: `Shipment #${shipment.orderCode} created`,
      message: `${shipment.vehicleCode} is now live on the dispatch board.`,
      type: 'info',
    });
    scheduleListRefresh();
  });
  onRealtime('shipment:updated', ({ shipment }) => {
    if (state.detail?.id === shipment?.id) selectShipment(shipment.id, { quiet: true });
    scheduleListRefresh();
  });
  onRealtime('connection:state', ({ state: connectionState }) => {
    const sync = document.querySelector('#deliveriesBody')?.closest('.card')?.querySelector('.bg-emerald-50');
    if (!sync) return;
    if (connectionState === 'disconnected') {
      sync.classList.remove('text-emerald-600', 'bg-emerald-50', 'border-emerald-100');
      sync.classList.add('text-slate-500', 'bg-slate-50', 'border-slate-200');
      sync.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Reconnecting';
    } else if (connectionState === 'connected') {
      sync.classList.add('text-emerald-600', 'bg-emerald-50', 'border-emerald-100');
      sync.classList.remove('text-slate-500', 'bg-slate-50', 'border-slate-200');
      sync.innerHTML = '<span class="live-dot !w-1.5 !h-1.5"></span> Synced';
    }
  });
}

setupGlobalShortcuts({
  onSearch: () => searchInput?.focus(),
  onCreate: () => openCreateModal(),
});
setupFilters();
setupModals();
setupTableInteractions();
setupRealtime();
updateFilterTabs();
(async () => {
  await loadMeta();
  if (state.region !== 'all') {
    const regionSelect = document.getElementById('regionFilter');
    if (regionSelect) regionSelect.value = state.region;
  }
  await loadShipments();
})();
