import express from 'express';
import { all } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  getFleetSummary,
  getRegionPerformance,
  getTopDrivers,
  getWeeklyMetrics,
} from '../lib/fleet.js';

const router = express.Router();
router.use(requireAuth);

function pctChange(current, previous) {
  if (!previous) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

router.get('/', (req, res) => {
  const requested = Number.parseInt(req.query.range, 10);
  const range = [7, 30, 90].includes(requested) ? requested : 7;
  const series = getWeeklyMetrics(range);
  const previous = all(
    'SELECT * FROM daily_metrics ORDER BY day DESC LIMIT ? OFFSET ?',
    range,
    range,
  ).reverse().map((row) => ({
    day: row.day,
    miles: row.miles,
    fuelGallons: Number(row.fuel_gallons),
    deliveries: row.deliveries,
    onTimeRate: Number(row.on_time_rate),
    delayed: row.delayed,
    mpg: Number((row.miles / Math.max(1, row.fuel_gallons)).toFixed(2)),
  }));

  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const avg = (rows, field) => rows.length
    ? rows.reduce((total, row) => total + Number(row[field] || 0), 0) / rows.length
    : 0;

  const totalMiles = sum(series, 'miles');
  const totalFuel = sum(series, 'fuelGallons');
  const totalDeliveries = sum(series, 'deliveries');
  const avgOnTime = avg(series, 'onTimeRate');
  const avgMpg = totalFuel ? Number((totalMiles / totalFuel).toFixed(2)) : 0;
  const prevMiles = sum(previous, 'miles');
  const prevFuel = sum(previous, 'fuelGallons');
  const prevDeliveries = sum(previous, 'deliveries');
  const prevOnTime = avg(previous, 'onTimeRate');
  const summary = getFleetSummary();

  const fleetMix = all(
    'SELECT type, COUNT(*) AS count FROM vehicles GROUP BY type ORDER BY count DESC',
  ).map((row) => ({ type: row.type, count: row.count }));

  res.json({
    range,
    series,
    summary: {
      totalMiles,
      totalFuel,
      totalDeliveries,
      avgOnTime: Number(avgOnTime.toFixed(1)),
      avgMpg,
      fuelCost: Math.round(totalFuel * 3.94),
      delayed: sum(series, 'delayed'),
      milesChange: pctChange(totalMiles, prevMiles),
      fuelChange: pctChange(totalFuel, prevFuel),
      deliveriesChange: pctChange(totalDeliveries, prevDeliveries),
      onTimeChange: Number((avgOnTime - prevOnTime).toFixed(1)),
    },
    live: {
      delivered: summary.delivered,
      inTransit: summary.inTransit,
      delayed: summary.delayed,
      total: summary.totalShipments,
      utilization: summary.utilization,
      activeVehicles: summary.activeVehicles,
      totalVehicles: summary.totalVehicles,
    },
    regions: getRegionPerformance(),
    topDrivers: getTopDrivers(8),
    fleetMix,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
