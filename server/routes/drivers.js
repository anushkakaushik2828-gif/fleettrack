import express from 'express';
import { all, get } from '../db.js';
import { requireAuth } from '../auth.js';
import { SHIPMENT_SELECT, toCamelDriver, toCamelShipment } from '../lib/fleet.js';

const router = express.Router();
router.use(requireAuth);

function trendFor(driverId, score) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Array.from({ length: 7 }, (_, index) => {
    const offset = ((driverId * (index + 3)) % 11 - 5) * 0.18;
    return {
      label: days[index],
      score: Number(Math.min(100, Math.max(70, score + offset)).toFixed(1)),
    };
  });
}

router.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'safety';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(5, Number.parseInt(req.query.limit, 10) || 12));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (q) {
    where.push('(d.name LIKE ? OR v.code LIKE ? OR d.email LIKE ?)');
    const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(term, term, term);
  }
  if (['on_duty', 'off_duty'].includes(status)) {
    where.push('d.status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortMap = {
    safety: 'd.safety_score DESC, d.efficiency DESC',
    efficiency: 'd.efficiency DESC, d.safety_score DESC',
    deliveries: 'd.deliveries_completed DESC',
    miles: 'd.total_miles DESC',
    name: 'd.name ASC',
    ontime: 'd.on_time_rate DESC',
  };
  const orderBy = sortMap[sort] || sortMap.safety;

  const count = get(
    `SELECT COUNT(*) AS count FROM drivers d LEFT JOIN vehicles v ON v.driver_id = d.id ${whereSql}`,
    ...params,
  ).count;
  const rows = all(
    `SELECT d.*, v.code AS vehicle_code, v.type AS vehicle_type, v.status AS vehicle_status, v.region
     FROM drivers d LEFT JOIN vehicles v ON v.driver_id = d.id
     ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );
  const stats = get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'on_duty' THEN 1 ELSE 0 END) AS on_duty,
           ROUND(AVG(safety_score), 1) AS avg_safety,
           ROUND(AVG(efficiency), 2) AS avg_efficiency,
           ROUND(AVG(on_time_rate), 1) AS avg_on_time,
           SUM(deliveries_completed) AS total_deliveries
    FROM drivers
  `);
  const bands = get(`
    SELECT SUM(CASE WHEN safety_score >= 95 THEN 1 ELSE 0 END) AS elite,
           SUM(CASE WHEN safety_score >= 90 AND safety_score < 95 THEN 1 ELSE 0 END) AS strong,
           SUM(CASE WHEN safety_score >= 85 AND safety_score < 90 THEN 1 ELSE 0 END) AS stable,
           SUM(CASE WHEN safety_score < 85 THEN 1 ELSE 0 END) AS developing
    FROM drivers
  `);
  const leaders = all(`
    SELECT d.*, v.code AS vehicle_code, v.type AS vehicle_type, v.status AS vehicle_status, v.region
    FROM drivers d LEFT JOIN vehicles v ON v.driver_id = d.id
    ORDER BY d.safety_score DESC, d.efficiency DESC
    LIMIT 5
  `).map((row) => toCamelDriver(row));

  res.json({
    drivers: rows.map((row) => toCamelDriver(row)),
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    },
    summary: {
      total: stats.total,
      onDuty: stats.on_duty,
      offDuty: stats.total - stats.on_duty,
      averageSafety: stats.avg_safety,
      averageEfficiency: stats.avg_efficiency,
      averageOnTime: stats.avg_on_time,
      totalDeliveries: stats.total_deliveries,
    },
    distribution: {
      elite: bands.elite || 0,
      strong: bands.strong || 0,
      stable: bands.stable || 0,
      developing: bands.developing || 0,
    },
    leaders,
    applied: { q, status, sort },
  });
});

router.get('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid driver ID.' });
  }
  const row = get(`
    SELECT d.*, v.code AS vehicle_code, v.type AS vehicle_type, v.status AS vehicle_status, v.region
    FROM drivers d LEFT JOIN vehicles v ON v.driver_id = d.id
    WHERE d.id = ?
  `, id);
  if (!row) return res.status(404).json({ error: 'Driver not found.' });
  const shipments = all(
    `${SHIPMENT_SELECT} WHERE s.driver_id = ? ORDER BY s.created_at DESC LIMIT 6`,
    id,
  ).map(toCamelShipment);
  const alerts = all(
    `SELECT id, title, severity, status, created_at FROM alerts
     WHERE vehicle_code = ? ORDER BY created_at DESC LIMIT 4`,
    row.vehicle_code,
  ).map((alert) => ({
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    createdAt: alert.created_at,
  }));
  res.json({
    driver: {
      ...toCamelDriver(row),
      scoreHistory: trendFor(row.id, Number(row.safety_score)),
    },
    shipments,
    alerts,
    monthlyDeliveries: Math.round(row.deliveries_completed / Math.max(1, (Date.now() - new Date(row.joined_at).getTime()) / (30 * 86400000))),
  });
});

export default router;
