import express from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';
import { ALERT_COLUMNS, getFleetSummary, toCamelAlert } from '../lib/fleet.js';

const router = express.Router();
router.use(requireAuth);

function summary() {
  const rows = all('SELECT severity, status, COUNT(*) AS count FROM alerts GROUP BY severity, status');
  const counts = {
    total: 0,
    active: 0,
    acknowledged: 0,
    resolved: 0,
    critical: 0,
    warning: 0,
    info: 0,
    activeCritical: 0,
    activeWarning: 0,
    activeInfo: 0,
  };
  for (const row of rows) {
    counts.total += row.count;
    counts[row.status] = (counts[row.status] || 0) + row.count;
    counts[row.severity] = (counts[row.severity] || 0) + row.count;
    if (row.status === 'active') {
      counts[`active${row.severity[0].toUpperCase()}${row.severity.slice(1)}`] += row.count;
    }
  }
  return counts;
}

function emitAlertUpdate(req, alert) {
  const io = req.app.get('io');
  if (!io) return;
  io.emit('alert:updated', { alert });
  io.emit('fleet:summary', { summary: getFleetSummary() });
}

router.get('/', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const severity = typeof req.query.severity === 'string' ? req.query.severity : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const where = [];
  const params = [];
  if (['active', 'acknowledged', 'resolved'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (['critical', 'warning', 'info'].includes(severity)) {
    where.push('severity = ?');
    params.push(severity);
  }
  if (q) {
    where.push('(title LIKE ? OR message LIKE ? OR vehicle_code LIKE ?)');
    const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(term, term, term);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const alerts = all(
    `SELECT ${ALERT_COLUMNS} FROM alerts ${whereSql}
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              created_at DESC
     LIMIT 250`,
    ...params,
  ).map(toCamelAlert);
  res.json({
    alerts,
    summary: summary(),
    applied: { status, severity, q },
  });
});

router.patch('/:id/acknowledge', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid alert ID.' });
  const alert = get(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = ?`, id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  if (alert.status === 'resolved') {
    return res.status(409).json({ error: 'A resolved alert cannot be acknowledged.' });
  }
  run(
    `UPDATE alerts SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ? WHERE id = ?`,
    new Date().toISOString(),
    req.user.name,
    id,
  );
  const updated = toCamelAlert(get(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = ?`, id));
  emitAlertUpdate(req, updated);
  return res.json({ alert: updated, summary: summary() });
});

router.patch('/:id/resolve', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid alert ID.' });
  const alert = get(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = ?`, id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  if (alert.status === 'resolved') return res.json({ alert: toCamelAlert(alert), summary: summary() });
  const now = new Date().toISOString();
  run(
    `UPDATE alerts SET status = 'resolved', resolved_at = ?,
     acknowledged_at = COALESCE(acknowledged_at, ?),
     acknowledged_by = COALESCE(acknowledged_by, ?) WHERE id = ?`,
    now,
    now,
    req.user.name,
    id,
  );
  const updated = toCamelAlert(get(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = ?`, id));
  emitAlertUpdate(req, updated);
  return res.json({ alert: updated, summary: summary() });
});

router.post('/acknowledge-all', (req, res) => {
  const now = new Date().toISOString();
  const result = run(
    `UPDATE alerts SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?
     WHERE status = 'active'`,
    now,
    req.user.name,
  );
  const io = req.app.get('io');
  if (io) {
    io.emit('alerts:bulk-updated', { count: result.changes });
    io.emit('fleet:summary', { summary: getFleetSummary() });
  }
  res.json({ updated: result.changes, summary: summary() });
});

export default router;
