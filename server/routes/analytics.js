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
    distanceKm: row.distance_km,
    fuelLiters: Number(row.fuel_liters),
    deliveries: row.deliveries,
    onTimeRate: Number(row.on_time_rate),
    delayed: row.delayed,
    kmpl: Number((row.distance_km / Math.max(1, row.fuel_liters)).toFixed(2)),
  }));

  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const avg = (rows, field) => rows.length
    ? rows.reduce((total, row) => total + Number(row[field] || 0), 0) / rows.length
    : 0;

  const totalDistanceKm = sum(series, 'distanceKm');
  const totalFuelLiters = sum(series, 'fuelLiters');
  const totalDeliveries = sum(series, 'deliveries');
  const avgOnTime = avg(series, 'onTimeRate');
  const avgKmpl = totalFuelLiters ? Number((totalDistanceKm / totalFuelLiters).toFixed(2)) : 0;
  const prevDistanceKm = sum(previous, 'distanceKm');
  const prevFuelLiters = sum(previous, 'fuelLiters');
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
      totalDistanceKm,
      totalFuelLiters,
      totalDeliveries,
      avgOnTime: Number(avgOnTime.toFixed(1)),
      avgKmpl,
      fuelCost: Math.round(totalFuelLiters * 88),
      delayed: sum(series, 'delayed'),
      distanceChange: pctChange(totalDistanceKm, prevDistanceKm),
      fuelChange: pctChange(totalFuelLiters, prevFuelLiters),
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
