import { all, get } from '../db.js';

export const SHIPMENT_SELECT = `
  SELECT s.*,
         v.code AS vehicle_code,
         v.type AS vehicle_type,
         v.driver_id AS vehicle_driver_id,
         d.name AS driver_name,
         d.initials AS driver_initials,
         d.avatar_color AS driver_color
  FROM shipments s
  LEFT JOIN vehicles v ON v.id = s.vehicle_id
  LEFT JOIN drivers d ON d.id = s.driver_id
`;

export const ALERT_COLUMNS = `
  id, type, severity, title, message, vehicle_code, status, created_at,
  acknowledged_at, acknowledged_by, resolved_at
`;

export function toCamelShipment(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderCode: row.order_code,
    vehicleId: row.vehicle_id,
    vehicleCode: row.vehicle_code || 'Unassigned',
    vehicleType: row.vehicle_type || '',
    driverId: row.driver_id,
    driverName: row.driver_name || 'Unassigned',
    driverInitials: row.driver_initials || 'FT',
    driverColor: row.driver_color || '#2563eb',
    origin: row.origin,
    destination: row.destination,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    route: row.route,
    region: row.region,
    distanceTotal: row.distance_total,
    distanceDone: row.distance_done,
    cargo: row.cargo,
    weightTons: row.weight_tons,
    tempC: row.temp_c,
    status: row.status,
    progress: Number(row.progress.toFixed(1)),
    departedAt: row.departed_at,
    etaAt: row.eta_at,
    deliveredAt: row.delivered_at,
    delayReason: row.delay_reason,
    podSignature: row.pod_signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCamelDriver(row, vehicle = null) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    phone: row.phone,
    email: row.email,
    licenseNo: row.license_no,
    status: row.status,
    safetyScore: Number(row.safety_score),
    efficiency: Number(row.efficiency),
    totalKm: row.total_km,
    deliveriesCompleted: row.deliveries_completed,
    onTimeRate: Number(row.on_time_rate),
    rating: Number(row.rating),
    joinedAt: row.joined_at,
    avatarColor: row.avatar_color,
    vehicleCode: vehicle?.code || row.vehicle_code || null,
    vehicleType: vehicle?.type || row.vehicle_type || null,
    vehicleStatus: vehicle?.status || row.vehicle_status || null,
    region: vehicle?.region || row.region || null,
    scoreChange: Number((((row.id % 9) - 4) * 0.1).toFixed(1)),
  };
}

export function toCamelAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    vehicleCode: row.vehicle_code,
    status: row.status,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    resolvedAt: row.resolved_at,
  };
}

export function getFleetSummary() {
  const vehicleCounts = all('SELECT status, COUNT(*) AS count FROM vehicles GROUP BY status');
  const shipmentCounts = all('SELECT status, COUNT(*) AS count FROM shipments GROUP BY status');
  const totalVehicles = vehicleCounts.reduce((sum, row) => sum + row.count, 0);
  const activeVehicles = vehicleCounts.find((row) => row.status === 'active')?.count || 0;
  const idleVehicles = vehicleCounts.find((row) => row.status === 'idle')?.count || 0;
  const maintenanceVehicles = vehicleCounts.find((row) => row.status === 'maintenance')?.count || 0;
  const totalShipments = shipmentCounts.reduce((sum, row) => sum + row.count, 0);
  const delivered = shipmentCounts.find((row) => row.status === 'delivered')?.count || 0;
  const inTransit = shipmentCounts.find((row) => row.status === 'in_transit')?.count || 0;
  const delayed = shipmentCounts.find((row) => row.status === 'delayed')?.count || 0;
  const utilization = totalVehicles ? Number(((activeVehicles / totalVehicles) * 100).toFixed(1)) : 0;
  const onTimeRate = delivered + delayed > 0
    ? Number(((delivered / (delivered + delayed)) * 100).toFixed(1))
    : 0;
  return {
    totalVehicles,
    activeVehicles,
    idleVehicles,
    maintenanceVehicles,
    utilization,
    totalShipments,
    delivered,
    inTransit,
    delayed,
    onTimeRate,
    activeDrivers: activeVehicles,
    openAlerts: get("SELECT COUNT(*) AS count FROM alerts WHERE status != 'resolved'").count,
    lastUpdated: new Date().toISOString(),
  };
}

export function getLiveVehicles() {
  const rows = all(`
    SELECT v.*, d.name AS driver_name, d.initials AS driver_initials, d.avatar_color,
           s.order_code AS current_order, s.status AS current_status, s.destination AS current_destination,
           s.progress AS current_progress
    FROM vehicles v
    LEFT JOIN drivers d ON d.id = v.driver_id
    LEFT JOIN shipments s ON s.id = (
      SELECT id FROM shipments
      WHERE vehicle_id = v.id AND status IN ('in_transit', 'delayed')
      ORDER BY created_at DESC LIMIT 1
    )
    ORDER BY v.code ASC
  `);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    type: row.type,
    plate: row.plate,
    model: `${row.make} ${row.model}`,
    status: row.status,
    driverName: row.driver_name,
    driverInitials: row.driver_initials,
    driverColor: row.avatar_color,
    lat: row.lat,
    lng: row.lng,
    speed: Number(row.speed_kmh),
    fuelLevel: Number(row.fuel_level),
    battery: Number(row.battery),
    engineTemp: Number(row.engine_temp),
    region: row.region,
    odometer: row.odometer,
    currentOrder: row.current_order,
    currentStatus: row.current_status,
    currentDestination: row.current_destination,
    currentProgress: row.current_progress,
    updatedAt: row.updated_at,
  }));
}

export function getRecentShipments(limit = 6) {
  const rows = all(`${SHIPMENT_SELECT} ORDER BY s.created_at DESC, s.id DESC LIMIT ?`, limit);
  return rows.map(toCamelShipment);
}

export function getActiveAlerts(limit = 12) {
  return all(
    `SELECT ${ALERT_COLUMNS} FROM alerts WHERE status != 'resolved'
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              created_at DESC LIMIT ?`,
    limit,
  ).map(toCamelAlert);
}

export function getTopDrivers(limit = 5) {
  const rows = all(`
    SELECT d.*, v.code AS vehicle_code, v.type AS vehicle_type, v.status AS vehicle_status, v.region
    FROM drivers d
    LEFT JOIN vehicles v ON v.driver_id = d.id
    ORDER BY d.safety_score DESC, d.efficiency DESC
    LIMIT ?
  `, limit);
  return rows.map((row) => toCamelDriver(row));
}

export function getWeeklyMetrics(days = 7) {
  const rows = all(
    'SELECT * FROM daily_metrics ORDER BY day DESC LIMIT ?',
    days,
  ).reverse();
  return rows.map((row) => ({
    day: row.day,
    distanceKm: Math.round(row.distance_km),
    fuelLiters: Math.round(row.fuel_liters),
    deliveries: row.deliveries,
    onTimeRate: Number(row.on_time_rate),
    delayed: row.delayed,
    kmpl: Number((row.distance_km / Math.max(1, row.fuel_liters)).toFixed(2)),
  }));
}

export function getRegionPerformance() {
  return all(`
    SELECT region,
           COUNT(*) AS shipments,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) AS delayed,
           ROUND(AVG(progress), 1) AS avg_progress
    FROM shipments
    GROUP BY region
    ORDER BY shipments DESC
  `).map((row) => ({
    region: row.region,
    shipments: row.shipments,
    delivered: row.delivered,
    delayed: row.delayed,
    onTimeRate: row.delivered + row.delayed > 0
      ? Number(((row.delivered / (row.delivered + row.delayed)) * 100).toFixed(1))
      : 0,
    avgProgress: row.avg_progress,
  }));
}
