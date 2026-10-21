import express from 'express';
import { requireAuth } from '../auth.js';
import {
  getActiveAlerts,
  getFleetSummary,
  getLiveVehicles,
  getRecentShipments,
  getTopDrivers,
  getWeeklyMetrics,
} from '../lib/fleet.js';

const router = express.Router();
router.use(requireAuth);

router.get('/summary', (req, res) => {
  res.json({ summary: getFleetSummary(), generatedAt: new Date().toISOString() });
});

router.get('/', (req, res) => {
  const summary = getFleetSummary();
  const weeklyMetrics = getWeeklyMetrics(7);
  const topDrivers = getTopDrivers(5);
  return res.json({
    summary,
    recentShipments: getRecentShipments(6),
    alerts: getActiveAlerts(4),
    topDrivers,
    weeklyMetrics,
    liveVehicles: getLiveVehicles(),
    generatedAt: new Date().toISOString(),
  });
});

export default router;
