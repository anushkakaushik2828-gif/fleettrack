/* FleetTrack — analytics workspace */
import {
  $,
  $$,
  api,
  avatarMarkup,
  dayLabel,
  monthDay,
  escapeHtml,
  formatCompact,
  formatDecimal,
  formatNumber,
  renderIcons,
  showToast,
} from './shared.js';
import { donutChart, lineChart, sparkline } from './charts.js';
import { connectRealtime, onRealtime } from './realtime.js';

const state = {
  range: 7,
  mode: 'distance',
  data: null,
  loading: false,
  refreshTimer: null,
};

const RANGE_LABELS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' };

const MODE_CONFIG = {
  distance: {
    name: 'Distance',
    field: 'distanceKm',
    color: '#2563eb',
    subtitle: (range) => `Distance traveled across the fleet over the last ${range} days.`,
    yFormat: (value) => formatCompact(value),
    valueFormat: (value) => `${formatNumber(value)} km`,
  },
  deliveries: {
    name: 'Deliveries',
    field: 'deliveries',
    color: '#10b981',
    subtitle: (range) => `Confirmed deliveries completed over the last ${range} days.`,
    yFormat: (value) => formatNumber(value),
    valueFormat: (value) => `${formatNumber(value)} delivered`,
  },
  fuel: {
    name: 'Fuel used',
    field: 'fuelLiters',
    color: '#f59e0b',
    subtitle: (range) => `Diesel and electric-equivalent consumption over the last ${range} days.`,
    yFormat: (value) => `${formatCompact(value)} L`,
    valueFormat: (value) => `${formatNumber(value)} L`,
  },
  ontime: {
    name: 'On-time rate',
    field: 'onTimeRate',
    color: '#7c3aed',
    subtitle: (range) => `Delivery punctuality against the 98% network target — last ${range} days.`,
    yFormat: (value) => `${Number(value).toFixed(0)}%`,
    valueFormat: (value) => `${Number(value).toFixed(1)}%`,
  },
};

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setUnit(id, value, unit) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = `${escapeHtml(value)}<span class="text-[13px] font-semibold text-slate-400 ml-1">${escapeHtml(unit)}</span>`;
}

function setChange(id, value, { suffix = '%', invert = false } = {}) {
  const element = document.getElementById(id);
  if (!element) return;
  const number = Number(value || 0);
  const positive = invert ? number < 0 : number > 0;
  const negative = invert ? number > 0 : number < 0;
  element.textContent = `${number > 0 ? '+' : ''}${formatDecimal(number, 1)}${suffix}`;
  element.classList.remove('text-emerald-600', 'text-rose-600', 'text-slate-400');
  element.classList.add(positive ? 'text-emerald-600' : negative ? 'text-rose-600' : 'text-slate-400');
}

function labelForRange(day) {
  return state.range <= 10 ? dayLabel(day).split(',')[0] : monthDay(day);
}

function renderKpis() {
  const { summary, series } = state.data;
  setUnit('analyticsDistance', formatCompact(summary.totalDistanceKm), 'km');
  document.getElementById('analyticsDistance')?.setAttribute('title', `${formatNumber(summary.totalDistanceKm)} km`);
  setText('analyticsDeliveries', formatNumber(summary.totalDeliveries));
  setUnit('analyticsKmpl', formatDecimal(summary.avgKmpl, 2), 'kmpl');
  setText('analyticsOnTime', `${formatDecimal(summary.avgOnTime, 1)}%`);

  setChange('analyticsDistanceChange', summary.distanceChange);
  setChange('analyticsDeliveriesChange', summary.deliveriesChange);
  setChange('analyticsFuelChange', summary.fuelChange, { invert: true });
  setChange('analyticsOnTimeChange', summary.onTimeChange, { suffix: ' pts' });

  sparkline(document.getElementById('distanceSpark'), {
    values: series.map((item) => item.distanceKm),
    color: '#2563eb',
  });
  sparkline(document.getElementById('deliveriesSpark'), {
    values: series.map((item) => item.deliveries),
    color: '#10b981',
  });
  sparkline(document.getElementById('kmplSpark'), {
    values: series.map((item) => item.kmpl),
    color: '#7c3aed',
  });
  sparkline(document.getElementById('onTimeSpark'), {
    values: series.map((item) => item.onTimeRate),
    color: '#f59e0b',
  });
}

function renderMainChart() {
  const container = document.getElementById('mainChart');
  if (!container) return;
  const config = MODE_CONFIG[state.mode];
  const { series } = state.data;
  setText('mainChartSubtitle', config.subtitle(state.range));
  setText('analyticsRangeLabel', RANGE_LABELS[state.range]);
  lineChart(container, {
    labels: series.map((item) => item.day),
    series: [{
      name: config.name,
      values: series.map((item) => item[config.field]),
      color: config.color,
    }],
    height: 300,
    min: state.mode === 'ontime' ? 90 : 0,
    max: state.mode === 'ontime' ? 100 : null,
    target: state.mode === 'ontime' ? 98 : null,
    yFormat: config.yFormat,
    valueFormat: config.valueFormat,
    xLabelFormatter: labelForRange,
    showLegend: false,
    ariaLabel: `Fleet ${config.name.toLowerCase()} over the last ${state.range} days`,
  });

  $$('[data-chart-mode]').forEach((button) => {
    const active = button.dataset.chartMode === state.mode;
    button.classList.toggle('bg-white', active);
    button.classList.toggle('text-slate-900', active);
    button.classList.toggle('shadow-sm', active);
    button.classList.toggle('text-slate-500', !active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderOps() {
  const { live, summary } = state.data;
  const total = Math.max(1, live.delivered + live.inTransit + live.delayed);
  const deliveredPercent = Math.round((live.delivered / total) * 100);
  donutChart(document.getElementById('opsDonut'), {
    segments: [
      { label: 'Delivered', value: live.delivered, color: '#2563eb' },
      { label: 'In transit', value: live.inTransit, color: '#10b981' },
      { label: 'Delayed', value: live.delayed, color: '#ef4444' },
    ],
    size: 156,
    thickness: 13,
    centerValue: `${deliveredPercent}%`,
    centerLabel: 'delivered',
    ariaLabel: 'Live delivery operations distribution',
  });
  setText('opsDelivered', formatNumber(live.delivered));
  setText('opsTransit', formatNumber(live.inTransit));
  setText('opsDelayed', formatNumber(live.delayed));
  setText('opsUtilization', `${formatDecimal(live.utilization, 1)}%`);
  setText('opsActiveVehicles', `${formatNumber(live.activeVehicles)} active vehicles`);
  setText('opsTotalVehicles', `${formatNumber(live.totalVehicles)} total`);
  const bar = document.getElementById('opsUtilizationBar');
  if (bar) bar.style.width = `${Math.min(100, live.utilization)}%`;

  const fleetMix = document.getElementById('fleetMix');
  if (fleetMix) {
    const mix = state.data.fleetMix || [];
    const mixTotal = mix.reduce((sum, item) => sum + item.count, 0) || 1;
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#7c3aed', '#0891b2', '#ef4444', '#64748b'];
    fleetMix.innerHTML = mix.map((item, index) => {
      const percent = (item.count / mixTotal) * 100;
      return `
        <div>
          <div class="flex items-center justify-between gap-2 text-[10px]">
            <span class="flex items-center gap-1.5 font-medium text-slate-600 min-w-0"><span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${colors[index % colors.length]}"></span><span class="truncate">${escapeHtml(item.type)}</span></span>
            <span class="font-semibold text-slate-900 shrink-0">${formatNumber(item.count)} <span class="text-slate-400 font-normal">· ${formatDecimal(percent, 0)}%</span></span>
          </div>
          <div class="progress-track h-1 mt-1"><div class="progress-fill" style="width:${percent}%;background:${colors[index % colors.length]}"></div></div>
        </div>
      `;
    }).join('');
  }
  setText('analyticsUpdated', `Synced ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
  document.getElementById('analyticsUpdated')?.setAttribute('title', `Live fleet state · ${summary.openAlerts ?? 0} open alerts`);
}

function renderEfficiency() {
  const { series } = state.data;
  lineChart(document.getElementById('kmplChart'), {
    labels: series.map((item) => item.day),
    series: [{ name: 'KM/L', values: series.map((item) => item.kmpl), color: '#10b981' }],
    height: 190,
    yFormat: (value) => formatDecimal(value, 1),
    valueFormat: (value) => `${formatDecimal(value, 2)} kmpl`,
    xLabelFormatter: labelForRange,
    showLegend: false,
    ariaLabel: 'Average fleet fuel efficiency',
  });
  const best = series.reduce((winner, item) => (!winner || item.kmpl > winner.kmpl ? item : winner), null);
  const bestDay = document.getElementById('kmplBestDay');
  if (bestDay && best) {
    bestDay.textContent = `${monthDay(best.day)} · ${formatDecimal(best.kmpl, 2)} kmpl`;
  }

  lineChart(document.getElementById('ontimeChart'), {
    labels: series.map((item) => item.day),
    series: [{ name: 'On-time', values: series.map((item) => item.onTimeRate), color: '#7c3aed' }],
    height: 190,
    min: 90,
    max: 100,
    target: 98,
    yFormat: (value) => `${Number(value).toFixed(0)}%`,
    valueFormat: (value) => `${formatDecimal(value, 1)}%`,
    xLabelFormatter: labelForRange,
    showLegend: false,
    ariaLabel: 'On-time delivery rate against target',
  });

  const verdict = document.getElementById('ontimeVerdict');
  if (verdict) {
    const rate = state.data.summary.avgOnTime;
    const strong = rate >= 98;
    const close = rate >= 96;
    verdict.className = `text-[10px] font-semibold inline-flex items-center gap-1 ${strong ? 'text-emerald-600' : close ? 'text-amber-600' : 'text-rose-600'}`;
    verdict.innerHTML = `<i data-lucide="${strong ? 'badge-check' : close ? 'triangle-alert' : 'circle-alert'}" class="w-3 h-3"></i>${strong ? 'Above network target' : close ? 'Within tolerance' : 'Needs attention'}`;
  }
  renderIcons();
}

function renderRegions() {
  const body = document.getElementById('regionBody');
  if (!body) return;
  const regions = state.data.regions || [];
  if (!regions.length) {
    body.innerHTML = '<tr><td colspan="5"><div class="empty-state !py-8"><p class="text-xs text-slate-500">No regional data available.</p></div></td></tr>';
    return;
  }
  body.innerHTML = regions.map((region) => {
    const rate = Number(region.onTimeRate) || 0;
    const color = rate >= 98 ? 'bg-emerald-500' : rate >= 95 ? 'bg-blue-500' : 'bg-rose-500';
    const text = rate >= 98 ? 'text-emerald-600' : rate >= 95 ? 'text-blue-600' : 'text-rose-600';
    return `
      <tr>
        <td>
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500">${escapeHtml(region.region.slice(0, 2).toUpperCase())}</span>
            <div>
              <p class="font-semibold text-slate-900">${escapeHtml(region.region)}</p>
              <p class="text-[9px] text-slate-400 mt-0.5">${formatNumber(region.shipments)} dispatch records</p>
            </div>
          </div>
        </td>
        <td class="font-mono text-[11px] text-slate-700">${formatNumber(region.shipments)}</td>
        <td class="font-mono text-[11px] text-slate-700">${formatNumber(region.delivered)}</td>
        <td><span class="font-mono text-[11px] font-semibold ${text}">${formatDecimal(rate, 1)}%</span></td>
        <td>
          <div class="flex items-center justify-end gap-2">
            <div class="progress-track h-1.5 w-20"><div class="progress-fill ${color}" style="width:${Math.min(100, rate)}%"></div></div>
            <span class="text-[9px] uppercase tracking-wide font-semibold ${text}">${rate >= 98 ? 'Elite' : rate >= 95 ? 'Stable' : 'Watch'}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  renderIcons();
}

function renderTopDrivers() {
  const container = document.getElementById('analyticsDrivers');
  if (!container) return;
  const drivers = state.data.topDrivers || [];
  if (!drivers.length) {
    container.innerHTML = '<div class="empty-state !py-8"><p class="text-xs text-slate-500">No driver performance data yet.</p></div>';
    return;
  }
  container.innerHTML = drivers.slice(0, 5).map((driver, index) => `
    <a href="/drivers?driver=${driver.id}" class="py-2.5 flex items-center gap-3 group hover:bg-slate-50/80 rounded-lg px-1 transition-colors">
      <span class="w-4 text-center text-[9px] font-bold text-slate-400">${String(index + 1).padStart(2, '0')}</span>
      ${avatarMarkup(driver.name, driver.avatarColor, 'w-8 h-8', 'text-[10px]')}
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">${escapeHtml(driver.name)}</p>
          <span class="text-[10px] font-bold text-slate-900 shrink-0">${formatDecimal(driver.safetyScore, 1)}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-1">
          <p class="text-[9px] text-slate-400 truncate">${escapeHtml(driver.vehicleCode || 'Unassigned')} · ${formatDecimal(driver.efficiency, 1)} kmpl</p>
          <div class="progress-track h-1 w-16 shrink-0"><div class="progress-fill bg-blue-500" style="width:${Math.min(100, driver.safetyScore)}%"></div></div>
        </div>
      </div>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 transition-transform group-hover:translate-x-0.5"></i>
    </a>
  `).join('');
  renderIcons();
}

function renderAll() {
  renderKpis();
  renderMainChart();
  renderOps();
  renderEfficiency();
  renderRegions();
  renderTopDrivers();
}

function updateRangeButtons() {
  $$('[data-range]').forEach((button) => {
    const active = Number(button.dataset.range) === state.range;
    button.classList.toggle('bg-blue-600', active);
    button.classList.toggle('text-white', active);
    button.classList.toggle('text-slate-500', !active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function loadAnalytics({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  try {
    const data = await api(`/api/analytics?range=${state.range}`);
    state.data = data;
    renderAll();
  } catch (error) {
    if (error.status === 401) return;
    if (!silent) showToast({ title: 'Could not load analytics', message: error.message, type: 'error' });
  } finally {
    state.loading = false;
  }
}

function updateLiveOps(summary) {
  if (!summary || !state.data) return;
  state.data.live = {
    ...state.data.live,
    delivered: summary.delivered,
    inTransit: summary.inTransit,
    delayed: summary.delayed,
    total: summary.totalShipments,
    utilization: summary.utilization,
    activeVehicles: summary.activeVehicles,
    totalVehicles: summary.totalVehicles,
  };
  renderOps();
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => loadAnalytics({ silent: true }), 1600);
}

function setupControls() {
  $$('[data-range]').forEach((button) => {
    button.addEventListener('click', () => {
      const range = Number(button.dataset.range);
      if (range === state.range) return;
      state.range = range;
      updateRangeButtons();
      loadAnalytics();
    });
  });

  $$('[data-chart-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.chartMode === state.mode) return;
      state.mode = button.dataset.chartMode;
      renderMainChart();
    });
  });

  document.getElementById('refreshAnalytics')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadAnalytics();
      showToast({ title: 'Analytics refreshed', message: 'The latest fleet telemetry rollup is now on screen.', type: 'success', duration: 3000 });
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('exportAnalytics')?.addEventListener('click', () => {
    if (!state.data?.series?.length) {
      showToast({ title: 'Nothing to export yet', message: 'Analytics are still loading.', type: 'warning' });
      return;
    }
    const rows = [
      ['Date', 'Distance km', 'Fuel liters', 'KM/L', 'Deliveries', 'On-time rate', 'Delayed'],
      ...state.data.series.map((item) => [
        item.day,
        item.distanceKm,
        item.fuelLiters,
        item.kmpl,
        item.deliveries,
        item.onTimeRate,
        item.delayed,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fleettrack-analytics-${state.range}d.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    showToast({
      title: `${state.range}-day analytics exported`,
      message: 'CSV includes distance, fuel, efficiency, deliveries and punctuality.',
      type: 'success',
    });
  });
}

function setupRealtime() {
  connectRealtime();
  onRealtime('fleet:tick', ({ summary }) => {
    updateLiveOps(summary);
    if (summary?.delivered) scheduleRefresh();
  });
  onRealtime('fleet:summary', ({ summary }) => updateLiveOps(summary));
  onRealtime('alert:new', ({ alert, summary }) => {
    updateLiveOps(summary);
    showToast({
      title: alert?.title || 'New fleet alert',
      message: alert?.message || 'A new operational alert needs attention.',
      type: alert?.severity === 'critical' ? 'error' : alert?.severity === 'warning' ? 'warning' : 'info',
    });
  });
  onRealtime('alert:updated', scheduleRefresh);
  onRealtime('shipment:created', scheduleRefresh);
  onRealtime('shipment:updated', scheduleRefresh);
}

setupControls();
setupRealtime();
updateRangeButtons();
loadAnalytics();
