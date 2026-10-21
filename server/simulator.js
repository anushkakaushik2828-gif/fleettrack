import { all, get, run, transaction } from './db.js';
import { config } from './config.js';
import { getFleetSummary, getLiveVehicles } from './lib/fleet.js';
import { interpolate } from './lib/geo.js';

const liveAlerts = [
  { type: 'speed', severity: 'warning', title: (code) => `Overspeed Alert: ${code}`, message: (code) => `${code} exceeded the configured 68 mph fleet limit for more than 90 seconds.` },
  { type: 'harsh_braking', severity: 'warning', title: (code) => `Harsh Braking: ${code}`, message: (code) => `Telematics recorded a hard braking event on ${code} near a construction zone.` },
  { type: 'idle', severity: 'info', title: (code) => `Long Idle: ${code}`, message: (code) => `${code} has been idling for more than 20 minutes at a scheduled stop.` },
  { type: 'geofence', severity: 'critical', title: (code) => `Geofence Breach: ${code}`, message: (code) => `${code} left its approved dispatch corridor. Route review is recommended.` },
  { type: 'temperature', severity: 'warning', title: (code) => `Reefer Variance: ${code}`, message: (code) => `Cargo temperature on ${code} moved outside the configured tolerance band.` },
  { type: 'fuel', severity: 'info', title: (code) => `Fuel Level Update: ${code}`, message: (code) => `${code} is approaching the recommended refuel threshold.` },
];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function makeAlert(shipment) {
  const template = liveAlerts[Math.floor(Math.random() * liveAlerts.length)];
  const severity = template.severity;
  return {
    type: template.type,
    severity,
    title: template.title(shipment.vehicle_code),
    message: template.message(shipment.vehicle_code),
    vehicleCode: shipment.vehicle_code,
  };
}

export function startSimulator(io) {
  if (!config.simulationEnabled) {
    console.log('[fleettrack] Live simulator disabled.');
    return { stop() {} };
  }

  let lastAlertAt = Date.now();
  let running = false;

  const tick = () => {
    if (running) return;
    running = true;
    try {
      const shipments = all(`
        SELECT s.id, s.vehicle_id, s.status, s.progress, s.distance_total, s.origin_lat,
               s.origin_lng, s.destination_lat, s.destination_lng, s.vehicle_id,
               v.code AS vehicle_code, v.fuel_level
        FROM shipments s
        JOIN vehicles v ON v.id = s.vehicle_id
        WHERE s.status IN ('in_transit', 'delayed')
        ORDER BY s.id
      `);
      const now = new Date().toISOString();
      const updates = [];
      const completed = [];

      transaction(() => {
        for (const shipment of shipments) {
          const isDelayed = shipment.status === 'delayed';
          if (isDelayed && Math.random() < 0.28) continue;
          const previous = Number(shipment.progress);
          const delta = isDelayed ? randomBetween(0.008, 0.035) : randomBetween(0.025, 0.09);
          const progress = Math.min(100, previous + delta);
          const distanceDone = Math.min(
            shipment.distance_total,
            shipment.distance_total * (progress / 100),
          );
          const point = interpolate(
            { lat: shipment.origin_lat, lng: shipment.origin_lng },
            { lat: shipment.destination_lat, lng: shipment.destination_lng },
            progress,
          );
          const speed = progress >= 100 ? 0 : isDelayed ? randomBetween(4, 22) : randomBetween(48, 67);
          const fuel = Math.max(8, Number(shipment.fuel_level) - randomBetween(0.001, 0.006));

          if (progress >= 100 && shipment.status !== 'delivered') {
            run(
              `UPDATE shipments SET status = 'delivered', progress = 100, distance_done = distance_total,
               delivered_at = ?, eta_at = ?, pod_signature = ?, delay_reason = NULL, updated_at = ?
               WHERE id = ?`,
              now,
              now,
              'Electronic POD',
              now,
              shipment.id,
            );
            run(
              'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
              shipment.id,
              'Signed & verified delivery',
              'Electronic proof of delivery captured at the destination hub.',
              now,
              'delivery',
            );
            run(
              'UPDATE vehicles SET lat = ?, lng = ?, speed_mph = 0, fuel_level = ?, updated_at = ? WHERE id = ?',
              shipment.destination_lat,
              shipment.destination_lng,
              fuel,
              now,
              shipment.vehicle_id,
            );
            run(
              'UPDATE drivers SET deliveries_completed = deliveries_completed + 1 WHERE id = (SELECT driver_id FROM vehicles WHERE id = ?)',
              shipment.vehicle_id,
            );
            const day = now.slice(0, 10);
            run(
              `INSERT INTO daily_metrics (day, miles, fuel_gallons, deliveries, on_time_rate, delayed)
               VALUES (?, ?, ?, 1, 100, 0)
               ON CONFLICT(day) DO UPDATE SET
                 deliveries = deliveries + 1,
                 miles = miles + ?,
                 fuel_gallons = fuel_gallons + ?`,
              day,
              shipment.distance_total,
              Number((shipment.distance_total / 7).toFixed(1)),
              shipment.distance_total,
              Number((shipment.distance_total / 8.4).toFixed(1)),
            );
            completed.push({
              id: shipment.id,
              vehicleCode: shipment.vehicle_code,
              deliveredAt: now,
            });
            updates.push({
              id: shipment.id,
              vehicleCode: shipment.vehicle_code,
              status: 'delivered',
              progress: 100,
              distanceDone: shipment.distance_total,
              deliveredAt: now,
            });
          } else {
            run(
              'UPDATE shipments SET progress = ?, distance_done = ?, updated_at = ? WHERE id = ?',
              progress,
              Number(distanceDone.toFixed(1)),
              now,
              shipment.id,
            );
            run(
              'UPDATE vehicles SET lat = ?, lng = ?, speed_mph = ?, fuel_level = ?, updated_at = ? WHERE id = ?',
              point.lat,
              point.lng,
              Number(speed.toFixed(1)),
              Number(fuel.toFixed(1)),
              now,
              shipment.vehicle_id,
            );
            updates.push({
              id: shipment.id,
              vehicleCode: shipment.vehicle_code,
              status: shipment.status,
              progress: Number(progress.toFixed(1)),
              distanceDone: Number(distanceDone.toFixed(1)),
            });
          }

          if (Math.random() < 0.12) {
            run(
              'INSERT INTO telemetry (vehicle_id, lat, lng, speed_mph, fuel_level, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
              shipment.vehicle_id,
              point.lat,
              point.lng,
              Number(speed.toFixed(1)),
              Number(fuel.toFixed(1)),
              now,
            );
          }
        }
      });

      const summary = getFleetSummary();
      if (io) {
        io.emit('fleet:tick', {
          updates,
          completed,
          summary,
          generatedAt: now,
        });
        io.emit('fleet:positions', {
          vehicles: getLiveVehicles(),
          generatedAt: now,
        });
        for (const item of completed) {
          io.emit('notification:new', {
            title: `Delivery complete: ${item.vehicleCode}`,
            message: 'Electronic proof of delivery has been verified and the shipment is now closed.',
            severity: 'success',
          });
        }
      }

      // Occasionally inject a realistic operational alert to exercise the realtime pipeline.
      if (shipments.length && Date.now() - lastAlertAt > 75_000 && Math.random() < 0.075) {
        const shipment = shipments[Math.floor(Math.random() * shipments.length)];
        const alert = makeAlert(shipment);
        const insert = run(
          `INSERT INTO alerts (type, severity, title, message, vehicle_code, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
          alert.type,
          alert.severity,
          alert.title,
          alert.message,
          alert.vehicleCode,
          now,
        );
        lastAlertAt = Date.now();
        if (io) {
          io.emit('alert:new', {
            alert: {
              id: Number(insert.lastInsertRowid),
              ...alert,
              status: 'active',
              createdAt: now,
              acknowledgedAt: null,
              acknowledgedBy: null,
              resolvedAt: null,
            },
            summary: getFleetSummary(),
          });
        }
      }
    } catch (error) {
      console.error('[fleettrack] Simulator tick failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, config.simulatorIntervalMs);
  timer.unref?.();
  // Warm the first positions immediately without waiting for the first interval.
  setTimeout(() => {
    if (io) {
      io.emit('fleet:positions', {
        vehicles: getLiveVehicles(),
        generatedAt: new Date().toISOString(),
      });
    }
  }, 1200).unref?.();

  console.log(`[fleettrack] Live simulator running every ${config.simulatorIntervalMs}ms.`);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
