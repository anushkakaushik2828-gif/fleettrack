/* Live Leaflet map with lightweight DivIcon vehicle markers. */
export class FleetMap {
  constructor(container, { onSelect } = {}) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.onSelect = onSelect;
    this.markers = new Map();
    this.vehicles = new Map();
    this.selectedCode = null;
    if (!this.container || !window.L) return;
    this.map = window.L.map(this.container, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false,
      minZoom: 3,
      maxZoom: 9,
      worldCopyJump: false,
    }).setView([39.1, -96.8], 4);

    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    window.L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.map.on('click', () => {
      this.select(null);
      this.onSelect?.(null);
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize({ animate: false });
    });
    this.resizeObserver.observe(this.container);
    setTimeout(() => this.map?.invalidateSize({ animate: false }), 300);
  }

  iconFor(vehicle) {
    return window.L.divIcon({
      className: 'fleet-marker-host',
      html: `<div class="vehicle-marker ${vehicle.status}${vehicle.code === this.selectedCode ? ' selected' : ''}" data-vehicle="${vehicle.code}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  tooltipFor(vehicle) {
    const statusLabel = vehicle.status === 'active' ? 'Active' : vehicle.status === 'idle' ? 'Idle' : 'Maintenance';
    const speed = Number(vehicle.speed || 0).toFixed(0);
    return `
      <div class="fleet-tooltip">
        <div class="flex items-center justify-between gap-6">
          <strong class="text-slate-900 text-[12px]">${escape(vehicle.code)}</strong>
          <span class="text-[9px] uppercase tracking-wider font-bold ${vehicle.status === 'active' ? 'text-emerald-600' : vehicle.status === 'idle' ? 'text-slate-500' : 'text-rose-600'}">${statusLabel}</span>
        </div>
        <div class="mt-1 text-[10px] text-slate-500">${escape(vehicle.driverName || 'Unassigned driver')}</div>
        <div class="mt-1.5 flex items-center gap-2 text-[10px] text-slate-600">
          <span>${speed} mph</span><span class="text-slate-300">·</span><span>${Number(vehicle.fuelLevel || 0).toFixed(0)}% fuel</span>
        </div>
        ${vehicle.currentOrder ? `<div class="mt-1.5 pt-1.5 border-t border-slate-100 text-[9px] font-semibold text-blue-600">#${escape(vehicle.currentOrder)} → ${escape(vehicle.currentDestination || '')}</div>` : ''}
      </div>
    `;
  }

  addMarker(vehicle) {
    if (!this.map || !Number.isFinite(Number(vehicle.lat)) || !Number.isFinite(Number(vehicle.lng))) return null;
    const marker = window.L.marker([Number(vehicle.lat), Number(vehicle.lng)], {
      icon: this.iconFor(vehicle),
      riseOnHover: true,
      keyboard: true,
      title: `${vehicle.code} · ${vehicle.driverName || 'Unassigned'}`,
      zIndexOffset: vehicle.status === 'active' ? 200 : 0,
    }).addTo(this.map);
    marker.bindTooltip(this.tooltipFor(vehicle), {
      direction: 'top',
      offset: [0, -8],
      opacity: 1,
      className: 'fleet-tooltip-host',
      sticky: false,
    });
    marker.on('click', (event) => {
      window.L.DomEvent.stopPropagation(event);
      this.select(vehicle.code);
      this.onSelect?.(vehicle);
    });
    return marker;
  }

  updateVehicles(vehicles) {
    if (!this.map) return;
    const incoming = new Set();
    for (const vehicle of vehicles) {
      incoming.add(vehicle.code);
      this.vehicles.set(vehicle.code, vehicle);
      const existing = this.markers.get(vehicle.code);
      if (!existing) {
        const marker = this.addMarker(vehicle);
        if (marker) this.markers.set(vehicle.code, marker);
      } else {
        existing.setLatLng([Number(vehicle.lat), Number(vehicle.lng)]);
        existing.setIcon(this.iconFor(vehicle));
        existing.setTooltipContent(this.tooltipFor(vehicle));
      }
    }
    for (const [code, marker] of this.markers.entries()) {
      if (!incoming.has(code)) {
        marker.remove();
        this.markers.delete(code);
        this.vehicles.delete(code);
      }
    }
  }

  select(code) {
    this.selectedCode = code;
    for (const [vehicleCode, marker] of this.markers.entries()) {
      const vehicle = this.vehicles.get(vehicleCode);
      if (vehicle) marker.setIcon(this.iconFor(vehicle));
    }
    if (code) {
      const marker = this.markers.get(code);
      const vehicle = this.vehicles.get(code);
      if (marker && vehicle) {
        marker.setZIndexOffset(500);
        marker.openTooltip();
      }
    }
  }

  focus(code) {
    const vehicle = this.vehicles.get(code);
    if (!vehicle || !this.map) return;
    this.select(code);
    this.map.flyTo([vehicle.lat, vehicle.lng], Math.max(6, this.map.getZoom()), { duration: 0.75 });
    this.onSelect?.(vehicle);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = null;
    this.markers.clear();
  }
}

function escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
