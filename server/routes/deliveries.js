import crypto from 'node:crypto';
import express from 'express';
import { all, get, run, transaction } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  SHIPMENT_SELECT,
  getFleetSummary,
  toCamelDriver,
  toCamelShipment,
} from '../lib/fleet.js';
import {
  CARGO_TYPES,
  CITIES,
  cityByName,
  roadDistance,
  routeName,
} from '../lib/geo.js';

const router = express.Router();
router.use(requireAuth);

const VALID_STATUSES = new Set(['in_transit', 'delivered', 'delayed']);

function likeTerm(value) {
  return `%${String(value).replace(/[\\%_]/g, '\\$&')}%`;
}

function parseFilters(query) {
  const where = [];
  const params = [];
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const status = typeof query.status === 'string' ? query.status.trim() : 'all';
  const vehicle = typeof query.vehicle === 'string' ? query.vehicle.trim() : 'all';
  const region = typeof query.region === 'string' ? query.region.trim() : 'all';

  if (status !== 'all' && VALID_STATUSES.has(status)) {
    where.push('s.status = ?');
    params.push(status);
  }
  if (q) {
    where.push(`(s.order_code LIKE ? ESCAPE '\\' OR v.code LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\'
      OR s.origin LIKE ? ESCAPE '\\' OR s.destination LIKE ? ESCAPE '\\' OR s.cargo LIKE ? ESCAPE '\\')`);
    const term = likeTerm(q);
    params.push(term, term, term, term, term, term);
  }
  if (vehicle && vehicle !== 'all') {
    where.push('v.code = ?');
    params.push(vehicle);
  }
  if (region && region !== 'all') {
    where.push('s.region = ?');
    params.push(region);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    applied: { q, status, vehicle, region },
  };
}

function clampLimit(value, fallback = 10) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(5, parsed));
}

function serializeDetail(row) {
  const shipment = toCamelShipment(row);
  const vehicleRow = get('SELECT * FROM vehicles WHERE id = ?', row.vehicle_id);
  const driverRow = get('SELECT * FROM drivers WHERE id = ?', row.driver_id);
  const events = all(
    `SELECT id, title, detail, occurred_at, kind FROM shipment_events
     WHERE shipment_id = ? ORDER BY occurred_at ASC, id ASC`,
    row.id,
  ).map((event) => ({
    id: event.id,
    title: event.title,
    detail: event.detail,
    occurredAt: event.occurred_at,
    kind: event.kind,
  }));
  return {
    ...shipment,
    events,
    vehicle: vehicleRow ? {
      id: vehicleRow.id,
      code: vehicleRow.code,
      type: vehicleRow.type,
      make: vehicleRow.make,
      model: vehicleRow.model,
      plate: vehicleRow.plate,
      fuelLevel: Number(vehicleRow.fuel_level),
      battery: Number(vehicleRow.battery),
      engineTemp: Number(vehicleRow.engine_temp),
      status: vehicleRow.status,
    } : null,
    driver: driverRow ? toCamelDriver(driverRow) : null,
  };
}

function broadcastSummary(req) {
  const io = req.app.get('io');
  if (!io) return;
  io.emit('fleet:summary', { summary: getFleetSummary() });
}

function shipmentById(id) {
  return get(`${SHIPMENT_SELECT} WHERE s.id = ?`, id);
}

router.get('/meta', (req, res) => {
  const vehicles = all(`
    SELECT v.id, v.code, v.type, v.status, v.driver_id, v.region,
           d.name AS driver_name,
           (SELECT order_code FROM shipments s
            WHERE s.vehicle_id = v.id AND s.status IN ('in_transit', 'delayed')
            ORDER BY s.created_at DESC LIMIT 1) AS current_order
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.driver_id
    ORDER BY v.code
  `).map((row) => ({
    id: row.id,
    code: row.code,
    type: row.type,
    status: row.status,
    driverId: row.driver_id,
    driverName: row.driver_name,
    region: row.region,
    currentOrder: row.current_order,
  }));
  res.json({
    vehicles,
    regions: [...new Set(CITIES.map((city) => city.region))],
    cities: CITIES.map(({ name, short, region }) => ({ name, short, region })),
    cargoTypes: CARGO_TYPES,
  });
});

router.get('/export.csv', (req, res) => {
  const { whereSql, params } = parseFilters(req.query);
  const rows = all(
    `${SHIPMENT_SELECT} ${whereSql} ORDER BY s.created_at DESC, s.id DESC LIMIT 5000`,
    ...params,
  ).map(toCamelShipment);
  const headers = ['Order ID', 'Vehicle', 'Driver', 'Origin', 'Destination', 'Route', 'Status', 'Progress', 'Distance (mi)', 'Cargo', 'Weight (t)', 'Departure', 'ETA', 'Delivered', 'Region'];
  const escapeCell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const lines = [headers.map(escapeCell).join(',')];
  for (const shipment of rows) {
    lines.push([
      `#${shipment.orderCode}`,
      shipment.vehicleCode,
      shipment.driverName,
      shipment.origin,
      shipment.destination,
      shipment.route,
      shipment.status,
      `${shipment.progress}%`,
      shipment.distanceTotal,
      shipment.cargo,
      shipment.weightTons,
      shipment.departedAt,
      shipment.etaAt,
      shipment.deliveredAt,
      shipment.region,
    ].map(escapeCell).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fleettrack-deliveries-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${lines.join('\r\n')}`);
});

router.get('/', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = clampLimit(req.query.limit, 10);
  const offset = (page - 1) * limit;
  const { whereSql, params, applied } = parseFilters(req.query);
  const countRow = get(
    `SELECT COUNT(*) AS count
     FROM shipments s
     LEFT JOIN vehicles v ON v.id = s.vehicle_id
     LEFT JOIN drivers d ON d.id = s.driver_id
     ${whereSql}`,
    ...params,
  );
  const total = countRow?.count || 0;
  const shipments = all(
    `${SHIPMENT_SELECT} ${whereSql} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  ).map(toCamelShipment);
  res.json({
    shipments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    summary: getFleetSummary(),
    applied,
  });
});

router.get('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid shipment ID.' });
  }
  const row = shipmentById(id);
  if (!row) return res.status(404).json({ error: 'Shipment not found.' });
  return res.json({ shipment: serializeDetail(row) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const vehicleId = Number.parseInt(body.vehicleId, 10);
  const originCity = CITIES.find((city) => city.name === body.originCity);
  const destinationCity = CITIES.find((city) => city.name === body.destinationCity);
  const cargo = typeof body.cargo === 'string' ? body.cargo.trim() : '';
  const weightTons = Number(body.weightTons);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return res.status(400).json({ error: 'Select a valid vehicle.' });
  }
  if (!originCity || !destinationCity) {
    return res.status(400).json({ error: 'Select a valid origin and destination city.' });
  }
  if (originCity.name === destinationCity.name) {
    return res.status(400).json({ error: 'Origin and destination must be different.' });
  }
  if (!CARGO_TYPES.includes(cargo)) {
    return res.status(400).json({ error: 'Select a valid cargo type.' });
  }
  if (!Number.isFinite(weightTons) || weightTons <= 0 || weightTons > 40) {
    return res.status(400).json({ error: 'Weight must be between 0.1 and 40 tons.' });
  }

  const vehicle = get(`
    SELECT v.*, d.name AS driver_name, d.status AS driver_status
    FROM vehicles v LEFT JOIN drivers d ON d.id = v.driver_id WHERE v.id = ?
  `, vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });
  if (vehicle.status === 'maintenance') {
    return res.status(409).json({ error: 'This vehicle is currently in maintenance.' });
  }
  if (!vehicle.driver_id || vehicle.driver_status !== 'on_duty') {
    return res.status(409).json({ error: 'This vehicle has no on-duty driver assigned.' });
  }
  const current = get(
    "SELECT order_code FROM shipments WHERE vehicle_id = ? AND status IN ('in_transit', 'delayed') LIMIT 1",
    vehicleId,
  );
  if (current) {
    return res.status(409).json({ error: `Vehicle already has an active shipment (#${current.order_code}).` });
  }

  let orderCode;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    orderCode = String(crypto.randomInt(10000000, 100000000));
    if (!get('SELECT id FROM shipments WHERE order_code = ?', orderCode)) break;
    orderCode = null;
  }
  if (!orderCode) {
    return res.status(500).json({ error: 'Could not allocate an order number. Please retry.' });
  }

  const distance = roadDistance(originCity, destinationCity);
  const now = new Date();
  const eta = new Date(now.getTime() + ((distance / 85) + 0.35) * 3600 * 1000);
  const reefer = cargo === 'Refrigerated' || cargo === 'Medical Supplies';
  const result = transaction(() => {
    const insert = run(
      `INSERT INTO shipments
        (order_code, vehicle_id, driver_id, origin, origin_lat, origin_lng, destination,
         destination_lat, destination_lng, route, region, distance_total, distance_done, cargo,
         weight_tons, temp_c, status, progress, departed_at, eta_at, delivered_at, delay_reason,
         pod_signature, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'in_transit', 2, ?, ?, NULL, NULL, NULL, ?, ?)`,
      orderCode,
      vehicle.id,
      vehicle.driver_id,
      `${originCity.short} DC`,
      originCity.lat,
      originCity.lng,
      `${destinationCity.short} Hub`,
      destinationCity.lat,
      destinationCity.lng,
      routeName(originCity, destinationCity),
      originCity.region,
      distance,
      cargo,
      Number(weightTons.toFixed(1)),
      reefer ? Number((22 + Math.random() * 5).toFixed(1)) : null,
      now.toISOString(),
      eta.toISOString(),
      now.toISOString(),
      now.toISOString(),
    );
    const shipmentId = Number(insert.lastInsertRowid);
    run(
      'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
      shipmentId,
      `Depot departure · ${originCity.short} DC`,
      'Manifest created and load sealed for departure.',
      now.toISOString(),
      'departure',
    );
    run(
      'UPDATE vehicles SET status = ?, lat = ?, lng = ?, speed_kmh = 0, updated_at = ? WHERE id = ?',
      'active',
      originCity.lat,
      originCity.lng,
      now.toISOString(),
      vehicle.id,
    );
    return shipmentId;
  });

  const row = shipmentById(result);
  const shipment = toCamelShipment(row);
  const io = req.app.get('io');
  if (io) {
    io.emit('shipment:created', { shipment });
    io.emit('fleet:summary', { summary: getFleetSummary() });
    io.emit('notification:new', {
      title: `Shipment #${shipment.orderCode} dispatched`,
      message: `${shipment.vehicleCode} departing ${shipment.origin} for ${shipment.destination}.`,
      severity: 'info',
    });
  }
  res.status(201).json({ shipment: serializeDetail(row) });
});

router.patch('/:id/status', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid shipment ID.' });
  }
  const status = req.body?.status;
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Status must be in_transit, delivered, or delayed.' });
  }
  const row = shipmentById(id);
  if (!row) return res.status(404).json({ error: 'Shipment not found.' });
  const now = new Date().toISOString();
  const delayReason = typeof req.body?.delayReason === 'string'
    ? req.body.delayReason.trim().slice(0, 240)
    : null;

  transaction(() => {
    if (status === 'delivered') {
      run(
        `UPDATE shipments SET status = 'delivered', progress = 100, distance_done = distance_total,
         delivered_at = ?, eta_at = ?, pod_signature = COALESCE(pod_signature, ?), delay_reason = NULL,
         updated_at = ? WHERE id = ?`,
        now,
        now,
        'Sarah Chen',
        now,
        id,
      );
      run(
        'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
        id,
        `Signed & verified · ${row.destination}`,
        'Delivery manually confirmed by dispatch administrator.',
        now,
        'delivery',
      );
      run(
        'UPDATE drivers SET deliveries_completed = deliveries_completed + 1 WHERE id = ?',
        row.driver_id,
      );
      const day = now.slice(0, 10);
      run(
        `INSERT INTO daily_metrics (day, distance_km, fuel_liters, deliveries, on_time_rate, delayed)
         VALUES (?, ?, ?, 1, 100, 0)
         ON CONFLICT(day) DO UPDATE SET
           deliveries = deliveries + 1,
           distance_km = distance_km + ?,
           fuel_liters = fuel_liters + ?`,
        day,
        row.distance_total,
        Number((row.distance_total / 7).toFixed(1)),
        row.distance_total,
        Number((row.distance_total / 8.4).toFixed(1)),
      );
    } else if (status === 'delayed') {
      run(
        `UPDATE shipments SET status = 'delayed', delay_reason = ?, updated_at = ? WHERE id = ?`,
        delayReason || 'Delay reported by dispatch.',
        now,
        id,
      );
      run(
        'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
        id,
        'Exception reported',
        delayReason || 'Delay reported by dispatch administrator.',
        now,
        'exception',
      );
    } else {
      run(
        `UPDATE shipments SET status = 'in_transit', delay_reason = NULL, updated_at = ? WHERE id = ?`,
        now,
        id,
      );
      run(
        'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
        id,
        'Shipment resumed',
        'Dispatch moved this shipment back to active transit.',
        now,
        'checkpoint',
      );
    }
  });

  const updated = serializeDetail(shipmentById(id));
  const io = req.app.get('io');
  if (io) {
    io.emit('shipment:updated', { shipment: updated });
    io.emit('fleet:summary', { summary: getFleetSummary() });
  }
  res.json({ shipment: updated });
});

router.post('/:id/copy', (req, res) => {
  res.status(405).json({ error: 'Copy the order ID in the interface.' });
});

export default router;

