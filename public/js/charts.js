/* Lightweight, dependency-free SVG charts tailored to the FleetTrack design. */

const DEFAULT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#0891b2'];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function niceScale(values, ticks = 4, minOverride = null, maxOverride = null) {
  const rawMin = minOverride !== null ? minOverride : 0;
  let rawMax = Math.max(...values.map((value) => Number(value) || 0), rawMin + 1);
  if (!Number.isFinite(rawMax)) rawMax = 1;
  rawMax = maxOverride !== null ? maxOverride : rawMax * 1.08;
  const rough = (rawMax - rawMin) / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 0.0001)));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const labels = [];
  for (let value = min; value <= max + step / 2; value += step) {
    labels.push(Number(value.toFixed(6)));
  }
  return { min, max: labels[labels.length - 1], ticks: labels };
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    path += ` C ${midX.toFixed(2)} ${current.y.toFixed(2)}, ${midX.toFixed(2)} ${next.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function tooltipHtml(label, rows) {
  return `<p class="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">${esc(label)}</p>${rows
    .map((row) => `<div class="flex items-center justify-between gap-4"><span class="flex items-center gap-1.5 text-slate-300"><span class="w-1.5 h-1.5 rounded-full" style="background:${esc(row.color)}"></span>${esc(row.name)}</span><span class="tt-value">${esc(row.value)}</span></div>`)
    .join('')}`;
}

export function lineChart(container, options = {}) {
  if (!container) return null;
  const {
    labels = [],
    series = [],
    height = 220,
    min = null,
    max = null,
    yFormat = (value) => value,
    valueFormat = (value) => value,
    showLegend = true,
    showArea = true,
    xLabelFormatter = (label) => label,
    target = null,
  } = options;
  if (!series.length || !labels.length) {
    container.innerHTML = '<div class="flex items-center justify-center h-48 text-xs text-slate-400">No chart data available</div>';
    return null;
  }

  const W = Math.max(280, Math.round(container.clientWidth || 780));
  const H = height;
  const pad = { top: 18, right: 14, bottom: 30, left: 42 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const allValues = [...series.flatMap((item) => item.values), ...(target !== null ? [target] : [])];
  const scale = niceScale(allValues, 4, min, max);
  const xAt = (index) => labels.length === 1
    ? pad.left + plotW / 2
    : pad.left + (index / (labels.length - 1)) * plotW;
  const yAt = (value) => pad.top + plotH - ((Number(value) - scale.min) / (scale.max - scale.min || 1)) * plotH;
  const tickStep = Math.max(1, Math.ceil(labels.length / 7));
  const gradientId = `line-grad-${Math.random().toString(36).slice(2, 8)}`;

  const grid = scale.ticks.map((tick) => `
    <line class="chart-grid-line" x1="${pad.left}" x2="${W - pad.right}" y1="${yAt(tick).toFixed(2)}" y2="${yAt(tick).toFixed(2)}"></line>
    <text class="chart-axis-label" x="${pad.left - 8}" y="${(yAt(tick) + 3).toFixed(2)}" text-anchor="end">${esc(yFormat(tick))}</text>
  `).join('');

  const xAxis = labels.map((label, index) => {
    if (index % tickStep !== 0 && index !== labels.length - 1) return '';
    return `<text class="chart-axis-label" x="${xAt(index).toFixed(2)}" y="${H - 8}" text-anchor="middle">${esc(xLabelFormatter(label, index))}</text>`;
  }).join('');

  const targetLine = target !== null ? `
    <line x1="${pad.left}" x2="${W - pad.right}" y1="${yAt(target).toFixed(2)}" y2="${yAt(target).toFixed(2)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="5 5"></line>
    <text class="chart-axis-label" x="${W - pad.right}" y="${(yAt(target) - 5).toFixed(2)}" text-anchor="end" fill="#64748b">Target ${esc(yFormat(target))}</text>
  ` : '';

  const seriesSvg = series.map((item, itemIndex) => {
    const color = item.color || DEFAULT_COLORS[itemIndex % DEFAULT_COLORS.length];
    const points = item.values.map((value, index) => ({ x: xAt(index), y: yAt(value), value }));
    const line = smoothPath(points);
    const area = `${line} L ${xAt(points.length - 1).toFixed(2)} ${pad.top + plotH} L ${xAt(0).toFixed(2)} ${pad.top + plotH} Z`;
    return `
      ${showArea && item.area !== false ? `<path d="${area}" fill="url(#${gradientId}-${itemIndex})"></path>` : ''}
      <path d="${line}" fill="none" stroke="${esc(color)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
      ${points.map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.6" fill="#fff" stroke="${esc(color)}" stroke-width="1.8"></circle>`).join('')}
    `;
  }).join('');

  const gradients = series.map((item, itemIndex) => {
    const color = item.color || DEFAULT_COLORS[itemIndex % DEFAULT_COLORS.length];
    return `<linearGradient id="${gradientId}-${itemIndex}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${esc(color)}" stop-opacity="0.22"></stop>
      <stop offset="100%" stop-color="${esc(color)}" stop-opacity="0.015"></stop>
    </linearGradient>`;
  }).join('');

  const legend = showLegend ? `<div class="chart-legend mt-2 px-1">${series.map((item, index) => `
    <span class="chart-legend-item"><span class="chart-legend-dot" style="background:${esc(item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length])}"></span>${esc(item.name)}</span>
  `).join('')}</div>` : '';

  container.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(options.ariaLabel || 'Fleet analytics line chart')}">
        <defs>${gradients}</defs>
        ${grid}
        ${targetLine}
        ${seriesSvg}
        ${xAxis}
        <line class="hover-line" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + plotH}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3" opacity="0" pointer-events="none"></line>
        <g class="hover-points" pointer-events="none"></g>
        <rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="transparent" class="chart-interactive"></rect>
      </svg>
      <div class="chart-tooltip"></div>
    </div>
    ${legend}
  `;

  const svg = container.querySelector('svg');
  const tooltip = container.querySelector('.chart-tooltip');
  const hoverLine = container.querySelector('.hover-line');
  const hoverPoints = container.querySelector('.hover-points');
  const interactive = container.querySelector('.chart-interactive');

  const onMove = (event) => {
    const bounds = svg.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * W;
    const ratio = Math.min(1, Math.max(0, (relativeX - pad.left) / plotW));
    const index = Math.round(ratio * (labels.length - 1));
    const x = xAt(index);
    hoverLine.setAttribute('x1', x);
    hoverLine.setAttribute('x2', x);
    hoverLine.setAttribute('opacity', '0.65');
    hoverPoints.innerHTML = series.map((item, itemIndex) => {
      const color = item.color || DEFAULT_COLORS[itemIndex % DEFAULT_COLORS.length];
      return `<circle cx="${x.toFixed(2)}" cy="${yAt(item.values[index]).toFixed(2)}" r="4" fill="#fff" stroke="${esc(color)}" stroke-width="2.2"></circle>`;
    }).join('');
    const rows = series.map((item, itemIndex) => ({
      name: item.name,
      color: item.color || DEFAULT_COLORS[itemIndex % DEFAULT_COLORS.length],
      value: valueFormat(item.values[index], item.name),
    }));
    tooltip.innerHTML = tooltipHtml(xLabelFormatter(labels[index], index), rows);
    const tooltipY = Math.min(...series.map((item) => yAt(item.values[index])));
    tooltip.style.left = `${(x / W) * 100}%`;
    tooltip.style.top = `${(tooltipY / H) * 100}%`;
    tooltip.classList.add('visible');
  };

  const hide = () => {
    tooltip.classList.remove('visible');
    hoverLine.setAttribute('opacity', '0');
    hoverPoints.innerHTML = '';
  };

  interactive.addEventListener('mousemove', onMove);
  interactive.addEventListener('mouseleave', hide);
  interactive.addEventListener('touchstart', (event) => {
    if (event.touches[0]) onMove(event.touches[0]);
  }, { passive: true });
  interactive.addEventListener('touchmove', (event) => {
    if (event.touches[0]) onMove(event.touches[0]);
  }, { passive: true });
  interactive.addEventListener('touchend', hide);

  return { destroy() { interactive.replaceWith(interactive.cloneNode(true)); } };
}

export function barChart(container, options = {}) {
  if (!container) return null;
  const {
    labels = [],
    series = [],
    height = 210,
    yFormat = (value) => value,
    valueFormat = (value) => value,
    xLabelFormatter = (label) => label,
    showLegend = true,
    maxBarWidth = 44,
    stacked = true,
  } = options;
  if (!series.length || !labels.length) {
    container.innerHTML = '<div class="flex items-center justify-center h-48 text-xs text-slate-400">No chart data available</div>';
    return null;
  }

  const W = Math.max(280, Math.round(container.clientWidth || 780));
  const H = height;
  const pad = { top: 18, right: 14, bottom: 30, left: 42 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const totals = stacked
    ? labels.map((_, index) => series.reduce((sum, item) => sum + (Number(item.values[index]) || 0), 0))
    : series.flatMap((item) => item.values);
  const scale = niceScale(totals, 4, 0);
  const slot = plotW / labels.length;
  const barWidth = Math.min(maxBarWidth, slot * 0.55);
  const yAt = (value) => pad.top + plotH - ((Number(value) - scale.min) / (scale.max - scale.min || 1)) * plotH;
  const tickStep = Math.max(1, Math.ceil(labels.length / 7));

  const grid = scale.ticks.map((tick) => `
    <line class="chart-grid-line" x1="${pad.left}" x2="${W - pad.right}" y1="${yAt(tick).toFixed(2)}" y2="${yAt(tick).toFixed(2)}"></line>
    <text class="chart-axis-label" x="${pad.left - 8}" y="${(yAt(tick) + 3).toFixed(2)}" text-anchor="end">${esc(yFormat(tick))}</text>
  `).join('');

  const bars = labels.map((label, labelIndex) => {
    const center = pad.left + slot * labelIndex + slot / 2;
    let running = 0;
    const groupIndex = labelIndex;
    const segments = series.map((item, seriesIndex) => {
      const value = Number(item.values[labelIndex]) || 0;
      const previous = running;
      running += value;
      if (value <= 0) return '';
      const topValue = stacked ? previous + value : value;
      const y = yAt(topValue);
      const h = Math.max(2, yAt(previous) - yAt(previous + value));
      const color = item.colors?.[labelIndex] || item.color || DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length];
      return `<rect x="${(center - barWidth / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="${esc(color)}" opacity="0.95" pointer-events="none"></rect>`;
    }).join('');
    return `
      <g>
        ${segments}
        <rect data-index="${groupIndex}" x="${(center - slot / 2).toFixed(2)}" y="${pad.top}" width="${slot.toFixed(2)}" height="${plotH}" fill="transparent" class="bar-hit"></rect>
        ${labelIndex % tickStep === 0 || labelIndex === labels.length - 1 ? `<text class="chart-axis-label" x="${center.toFixed(2)}" y="${H - 8}" text-anchor="middle">${esc(xLabelFormatter(label, labelIndex))}</text>` : ''}
      </g>
    `;
  }).join('');

  const legend = showLegend ? `<div class="chart-legend mt-2 px-1">${series.map((item, index) => `
    <span class="chart-legend-item"><span class="chart-legend-dot" style="background:${esc(item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length])}"></span>${esc(item.name)}</span>
  `).join('')}</div>` : '';

  container.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(options.ariaLabel || 'Fleet analytics bar chart')}">
        ${grid}
        ${bars}
      </svg>
      <div class="chart-tooltip"></div>
    </div>
    ${legend}
  `;

  const svg = container.querySelector('svg');
  const tooltip = container.querySelector('.chart-tooltip');
  container.querySelectorAll('.bar-hit').forEach((hit) => {
    hit.addEventListener('mousemove', (event) => {
      const index = Number(hit.dataset.index);
      const rows = series.map((item, seriesIndex) => ({
        name: item.name,
        color: item.color || DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length],
        value: valueFormat(item.values[index], item.name),
      }));
      tooltip.innerHTML = tooltipHtml(xLabelFormatter(labels[index], index), rows);
      const bounds = svg.getBoundingClientRect();
      tooltip.style.left = `${((event.clientX - bounds.left) / bounds.width) * 100}%`;
      tooltip.style.top = `${(pad.top / H) * 100}%`;
      tooltip.classList.add('visible');
    });
    hit.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  });
  return { destroy() {} };
}

export function donutChart(container, options = {}) {
  if (!container) return;
  const {
    segments = [],
    size = 168,
    thickness = 14,
    centerValue = '',
    centerLabel = '',
    showLegend = false,
  } = options;
  const total = segments.reduce((sum, segment) => sum + (Number(segment.value) || 0), 0);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = segments.map((segment, index) => {
    const value = Number(segment.value) || 0;
    const portion = total > 0 ? value / total : 0;
    const dash = Math.max(0, portion * circumference - 2.5);
    const circle = `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="${esc(segment.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length])}"
      stroke-width="${thickness}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 50 50)" stroke-linecap="butt"></circle>`;
    offset += portion * circumference;
    return circle;
  }).join('');

  const legend = showLegend ? `<div class="mt-3 space-y-1.5">${segments.map((segment, index) => `
    <div class="flex items-center justify-between gap-2 text-[11px]">
      <span class="flex items-center gap-1.5 text-slate-600"><span class="w-2 h-2 rounded-full" style="background:${esc(segment.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length])}"></span>${esc(segment.label)}</span>
      <span class="font-semibold text-slate-900">${esc(segment.display || segment.value)}</span>
    </div>
  `).join('')}</div>` : '';

  container.innerHTML = `
    <div class="flex flex-col items-center">
      <div class="relative flex items-center justify-center" style="width:${Number(size)}px;height:${Number(size)}px">
        <svg viewBox="0 0 100 100" class="w-full h-full" role="img" aria-label="${esc(options.ariaLabel || 'Distribution chart')}">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="${thickness}"></circle>
          ${circles}
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-5">
          <span class="text-2xl font-extrabold text-slate-950 leading-none">${esc(centerValue)}</span>
          ${centerLabel ? `<span class="text-[9px] uppercase tracking-wider font-semibold text-slate-400 mt-1.5 leading-tight">${esc(centerLabel)}</span>` : ''}
        </div>
      </div>
      ${legend}
    </div>
  `;
}

export function sparkline(container, options = {}) {
  if (!container) return;
  const { values = [], color = '#2563eb', height = 38, showArea = true } = options;
  if (!values.length) {
    container.innerHTML = '';
    return;
  }
  const W = 160;
  const H = height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? W / 2 : (index / (values.length - 1)) * W,
    y: 4 + (1 - (value - min) / (max - min || 1)) * (H - 8),
  }));
  const path = smoothPath(points);
  const gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`;
  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-full" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${esc(color)}" stop-opacity="0.25"></stop>
        <stop offset="100%" stop-color="${esc(color)}" stop-opacity="0"></stop>
      </linearGradient></defs>
      ${showArea ? `<path d="${path} L ${W} ${H} L 0 ${H} Z" fill="url(#${gradientId})"></path>` : ''}
      <path d="${path}" fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

export function progressRing(value, options = {}) {
  const { size = 72, thickness = 6, color = '#2563eb' } = options;
  const safeValue = Math.min(100, Math.max(0, Number(value) || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeValue / 100) * circumference;
  return `<div class="relative inline-flex items-center justify-center" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="${thickness}"></circle>
      <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${esc(color)}" stroke-width="${thickness}" stroke-linecap="round"
        stroke-dasharray="${dash} ${circumference - dash}"></circle>
    </svg>
    <span class="absolute text-xs font-extrabold text-slate-900">${Math.round(safeValue)}%</span>
  </div>`;
}

export const chartColors = DEFAULT_COLORS;
