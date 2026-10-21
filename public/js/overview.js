import {
  $,
  api,
  avatarMarkup,
  dayLabel,
  escapeHtml,
  formatNumber,
  initials,
  relativeTime,
  renderIcons,
  showToast,
  shipmentStatus,
  statusBadge,
  formatTime,
} from './shared.js';
import { barChart, donutChart, lineChart } from './charts.js';
import { FleetMap } from './map.js';
import { connectRealtime, onRealtime } from './realtime.js';

const state = {
  data: null,
  map: null,
  refreshTimer: null,
};

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateSummary(summary) {
  if (!summary) return;
  setText('metricTotal', formatNumber(summary.totalVehicles));
  setText('metricActive', formatNumber(summary.activeVehicles));
  setText('metricIdle', formatNumber(summary.idleVehicles));
  setText('metricMaintenance', formatNumber(summary.maintenanceVehicles));
  setText('utilizationValue', `${summary.utilization}%`);
  setText('mapActiveCount', formatNumber(summary.activeVehicles));
  setText('mapTotalCount', formatNumber(summary.totalVehicles));
  setText('legendActive', summary.activeVehicles);
  setText('legendIdle', summary.idleVehicles);
  setText('legendMaintenance', summary.maintenanceVehicles);
  setText('alertTotal', `${summary.openAlerts} notifications`);

  const total = Math.max(1, summary.totalVehicles);
  const activeBar = document.getElementById('utilActiveBar');
  const idleBar = document.getElementById('utilIdleBar');
  const maintenanceBar = document.getElementById('utilMaintenanceBar');
  if (activeBar) activeBar.style.width = `${(summary.activeVehicles / total) * 100}%`;
  if (idleBar) idleBar.style.width = `${(summary.idleVehicles / total) * 100}%`;
  if (maintenanceBar) maintenanceBar.style.width = `${(summary.maintenanceVehicles / total) * 100}%`;
}

function etaMarkup(shipment) {
  if (shipment.status === 'delivered') {
    return `<span class="font-medium text-slate-800">${formatTime(shipment.deliveredAt, true)}</span>
      <p class="text-[10px] text-emerald-600 font-semibold mt-0.5">Signed &amp; verified</p>`;
  }
  if (shipment.status === 'delayed') {
    return `<span class="font-semibold text-rose-600">${formatTime(shipment.etaAt)}</span>
      <p class="text-[10px] text-rose-500 mt-0.5 truncate max-w-[130px]">${escapeHtml(shipment.delayReason || 'Delayed')}</p>`;
  }
  return `<span class="font-medium text-slate-800">${formatTime(shipment.etaAt)}</span>
    <p class="text-[10px] text-slate-400 mt-0.5">${relativeTime(shipment.etaAt)}</p>`;
}

function renderRecent(shipments) {
  const body = document.getElementById('recentShipmentsBody');
  if (!body) return;
  if (!shipments?.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state !py-10"><i data-lucide="package-open" class="w-7 h-7 text-slate-300"></i><p class="text-xs font-semibold text-slate-600 mt-2">No shipments yet</p><p class="text-[11px] text-slate-400 mt-1">New dispatches will appear here instantly.</p></div></td></tr>`;
    renderIcons();
    return;
  }
  body.innerHTML = shipments.map((shipment) => `
      <tr>
        <td>
          <a href="/deliveries?order=${encodeURIComponent(shipment.orderCode)}" class="font-semibold text-slate-900 hover:text-blue-600 font-mono text-[11px]">#${escapeHtml(shipment.orderCode)}</a>
        </td>
        <td>
          <p class="font-semibold text-slate-900">${escapeHtml(shipment.vehicleCode)}</p>
          <p class="text-[10px] text-slate-400 mt-0.5 truncate max-w-[100px]">${escapeHtml(shipment.driverName)}</p>
        </td>
        <td class="hidden sm:table-cell">
          <p class="font-medium text-slate-700 max-w-[150px] truncate">${escapeHtml(shipment.destination)}</p>
          <p class="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]">${escapeHtml(shipment.origin)} → ${escapeHtml(shipment.region)}</p>
        </td>
        <td>${statusBadge(shipment.status)}</td>
        <td class="hidden md:table-cell">${etaMarkup(shipment)}</td>
        <td class="hidden lg:table-cell text-right">
          <a href="/deliveries?order=${encodeURIComponent(shipment.orderCode)}" class="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-600 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1.5 bg-white shadow-xs hover:border-blue-200 transition-colors">
            Details <i data-lucide="chevron-right" class="w-3 h-3"></i>
          </a>
        </td>
      </tr>
    `).join('');
  renderIcons();
}

function renderCharts(data) {
  const week = data.weeklyMetrics || [];
  const labels = week.map((item) => item.day);
  const fuel = week.map((item) => item.fuelLiters);
  lineChart(document.getElementById('fuelChart'), {
    labels,
    series: [{ name: 'Fuel used', values: fuel, color: '#3b82f6' }],
    height: 180,
    yFormat: (value) => `${Math.round(value / 100) / 10}k`,
    valueFormat: (value) => `${formatNumber(value)} L`,
    xLabelFormatter: (label) => dayLabel(label).split(',')[0],
    showLegend: false,
    ariaLabel: 'Weekly fleet fuel consumption',
    min: 0,
  });

  const top = data.topDrivers || [];
  barChart(document.getElementById('efficiencyChart'), {
    labels: top.map((driver) => driver.name.split(' ')[0]),
    series: [{
      name: 'MPG',
      values: top.map((driver) => driver.efficiency),
      colors: ['#0f172a', '#2563eb', '#0f172a', '#2563eb', '#0f766e'],
    }],
    height: 180,
    yFormat: (value) => Number(value).toFixed(0),
    valueFormat: (value) => `${Number(value).toFixed(1)} kmpl`,
    showLegend: false,
    ariaLabel: 'Top five drivers by fuel efficiency',
    maxBarWidth: 30,
  });

  const summary = data.summary;
  const deliveredPercent = summary.totalShipments
    ? Math.round((summary.delivered / summary.totalShipments) * 100)
    : 0;
  donutChart(document.getElementById('statusDonut'), {
    segments: [
      { label: 'Delivered', value: summary.delivered, color: '#2563eb' },
      { label: 'In transit', value: summary.inTransit, color: '#10b981' },
      { label: 'Delayed', value: summary.delayed, color: '#ef4444' },
    ],
    size: 142,
    thickness: 12,
    centerValue: `${deliveredPercent}%`,
    centerLabel: 'delivered',
    ariaLabel: 'Shipment delivery status distribution',
  });

  const legend = document.getElementById('donutLegend');
  if (legend) {
    legend.innerHTML = [
      { label: 'Delivered', value: summary.delivered, color: '#2563eb' },
      { label: 'Transit', value: summary.inTransit, color: '#10b981' },
      { label: 'Delayed', value: summary.delayed, color: '#ef4444' },
    ].map((item) => `
      <div>
        <div class="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
          <span class="w-1.5 h-1.5 rounded-full" style="background:${item.color}"></span>${item.label}
        </div>
        <p class="text-sm font-extrabold text-slate-900 mt-0.5">${formatNumber(item.value)}</p>
      </div>
    `).join('');
  }
}

function renderDrivers(drivers) {
  const list = document.getElementById('topDriversList');
  if (!list) return;
  list.innerHTML = drivers.map((driver, index) => `
    <div class="flex items-center gap-2">
      <span class="w-4 text-[9px] font-bold text-slate-400">${String(index + 1).padStart(2, '0')}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-medium text-slate-700 truncate">${escapeHtml(driver.name)}</span>
          <span class="text-[10px] font-bold text-slate-900">${Number(driver.safetyScore).toFixed(1)}</span>
        </div>
        <div class="progress-track h-1 mt-1"><div class="progress-fill bg-blue-500" style="width:${driver.safetyScore}%"></div></div>
      </div>
    </div>
  `).join('');
}

function renderAlerts(alerts, summary) {
  const list = document.getElementById('overviewAlerts');
  if (!list) return;
  if (!alerts?.length) {
    list.innerHTML = '<div class="empty-state !py-8"><i data-lucide="shield-check" class="w-7 h-7 text-emerald-400"></i><p class="text-xs font-semibold text-slate-600 mt-2">All clear</p><p class="text-[11px] text-slate-400 mt-1">No open operational alerts.</p></div>';
  } else {
    list.innerHTML = alerts.slice(0, 4).map((alert) => {
      const critical = alert.severity === 'critical';
      const warning = alert.severity === 'warning';
      return `
        <a href="/alerts?focus=${alert.id}" class="py-2.5 flex items-center justify-between gap-3 group hover:bg-slate-50/70 rounded-lg px-1 transition-colors">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold ${critical ? 'text-rose-700' : warning ? 'text-amber-700' : 'text-blue-700'} leading-snug truncate">${escapeHtml(alert.title)}</p>
            <p class="text-[10px] text-slate-500 mt-0.5 line-clamp-1">${escapeHtml(alert.message)}</p>
            <p class="text-[9px] text-slate-400 mt-1">${relativeTime(alert.createdAt)}</p>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 group-hover:text-slate-600 shrink-0 transition-transform group-hover:translate-x-0.5"></i>
        </a>
      `;
    }).join('');
  }
  setText('alertTotal', `${summary.openAlerts} notifications`);
  renderIcons();
}

function renderDashboard(data) {
  updateSummary(data.summary);
  renderRecent(data.recentShipments);
  renderCharts(data);
  renderDrivers(data.topDrivers);
  renderAlerts(data.alerts, data.summary);
  if (data.liveVehicles?.length) {
    state.map?.updateVehicles(data.liveVehicles);
  }
  setText('recentGeneratedAt', `Updated ${formatTime(new Date())}`);
}

async function loadDashboard({ silent = false } = {}) {
  try {
    const data = await api('/api/dashboard');
    state.data = data;
    renderDashboard(data);
  } catch (error) {
    if (error.status === 401) return;
    showToast({ title: 'Could not load dashboard', message: error.message, type: 'error' });
  }
}

function queueRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => loadDashboard({ silent: true }), 1800);
}

function showInspector(vehicle) {
  const inspector = document.getElementById('mapInspector');
  if (!inspector) return;
  if (!vehicle) {
    inspector.classList.add('hidden');
    return;
  }
  inspector.classList.remove('hidden');
  setText('inspectorVehicle', vehicle.code);
  setText('inspectorDriver', `${vehicle.driverName || 'Unassigned'} · ${vehicle.model || 'Fleet vehicle'}`);
  setText('inspectorSpeed', `${Number(vehicle.speed || 0).toFixed(0)} km/h`);
  setText('inspectorFuel', `${Number(vehicle.fuelLevel || 0).toFixed(0)}%`);
  const status = vehicle.status === 'active' ? 'Active' : vehicle.status === 'idle' ? 'Idle' : 'Service';
  setText('inspectorStatus', status);
  const statusEl = document.getElementById('inspectorStatus');
  if (statusEl) {
    statusEl.className = `text-xs font-bold mt-0.5 ${vehicle.status === 'active' ? 'text-emerald-600' : vehicle.status === 'idle' ? 'text-slate-500' : 'text-rose-600'}`;
  }
  const avatar = document.getElementById('inspectorAvatar');
  if (avatar) {
    avatar.textContent = initials(vehicle.driverName);
    avatar.style.background = `${vehicle.driverColor || '#2563eb'}1a`;
    avatar.style.color = vehicle.driverColor || '#2563eb';
  }
  const trip = document.getElementById('inspectorTrip');
  const tripText = document.getElementById('inspectorTripText');
  if (vehicle.currentOrder) {
    trip?.classList.remove('hidden');
    if (tripText) tripText.textContent = `#${vehicle.currentOrder} → ${vehicle.currentDestination || 'Destination'}`;
  } else {
    trip?.classList.add('hidden');
  }
  renderIcons();
}

function setupMap() {
  state.map = new FleetMap('fleetMap', {
    onSelect: (vehicle) => showInspector(vehicle),
  });
  document.getElementById('closeInspector')?.addEventListener('click', () => {
    document.getElementById('mapInspector')?.classList.add('hidden');
    state.map?.select(null);
  });
}

function setupRealtime() {
  connectRealtime();
  onRealtime('fleet:positions', ({ vehicles }) => {
    if (!vehicles?.length) return;
    state.map?.updateVehicles(vehicles);
    setText('mapUpdated', formatTime(new Date()));
    setText('mapActiveCount', formatNumber(vehicles.filter((vehicle) => vehicle.status === 'active').length));
    setText('mapTotalCount', formatNumber(vehicles.length));
    const selected = state.map?.selectedCode;
    if (selected) {
      const vehicle = vehicles.find((item) => item.code === selected);
      if (vehicle && !document.getElementById('mapInspector')?.classList.contains('hidden')) {
        showInspector(vehicle);
      }
    }
  });
  onRealtime('fleet:summary', ({ summary }) => updateSummary(summary));
  onRealtime('fleet:tick', ({ summary, completed }) => {
    updateSummary(summary);
    if (completed?.length) queueRefresh();
    setText('mapUpdated', 'just now');
  });
  onRealtime('shipment:created', queueRefresh);
  onRealtime('shipment:updated', queueRefresh);
  onRealtime('alert:new', ({ alert, summary }) => {
    if (summary) updateSummary(summary);
    showToast({
      title: alert?.title || 'New fleet alert',
      message: alert?.message || 'A new operational alert needs attention.',
      type: alert?.severity === 'critical' ? 'error' : alert?.severity === 'warning' ? 'warning' : 'info',
    });
    queueRefresh();
  });
  onRealtime('alert:updated', queueRefresh);
}

function startFooterClock() {
  const update = () => {
    setText('footerClock', `Synced ${formatTime(new Date())}`);
  };
  update();
  setInterval(update, 30000);
}

setupMap();
setupRealtime();
loadDashboard();
startFooterClock();
