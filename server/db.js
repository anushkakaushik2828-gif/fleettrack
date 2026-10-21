import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    license_no TEXT,
    status TEXT NOT NULL DEFAULT 'on_duty',
    safety_score REAL NOT NULL DEFAULT 90,
    efficiency REAL NOT NULL DEFAULT 12,
    total_km INTEGER NOT NULL DEFAULT 0,
    deliveries_completed INTEGER NOT NULL DEFAULT 0,
    on_time_rate REAL NOT NULL DEFAULT 98,
    rating REAL NOT NULL DEFAULT 4.8,
    joined_at TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#2563eb'
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    plate TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    fuel_level REAL NOT NULL DEFAULT 80,
    odometer INTEGER NOT NULL DEFAULT 0,
    battery REAL NOT NULL DEFAULT 98,
    engine_temp REAL NOT NULL DEFAULT 90,
    last_service_at TEXT,
    next_service_km INTEGER NOT NULL DEFAULT 0,
    lat REAL,
    lng REAL,
    speed_kmh REAL NOT NULL DEFAULT 0,
    region TEXT NOT NULL DEFAULT 'North',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL UNIQUE,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    origin TEXT NOT NULL,
    origin_lat REAL NOT NULL,
    origin_lng REAL NOT NULL,
    destination TEXT NOT NULL,
    destination_lat REAL NOT NULL,
    destination_lng REAL NOT NULL,
    route TEXT NOT NULL,
    region TEXT NOT NULL,
    distance_total REAL NOT NULL,
    distance_done REAL NOT NULL DEFAULT 0,
    cargo TEXT NOT NULL,
    weight_tons REAL NOT NULL DEFAULT 0,
    temp_c REAL,
    status TEXT NOT NULL DEFAULT 'in_transit',
    progress REAL NOT NULL DEFAULT 0,
    departed_at TEXT NOT NULL,
    eta_at TEXT,
    delivered_at TEXT,
    delay_reason TEXT,
    pod_signature TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shipment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    detail TEXT,
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'checkpoint'
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    vehicle_code TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    acknowledged_at TEXT,
    acknowledged_by TEXT,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    speed_kmh REAL NOT NULL DEFAULT 0,
    fuel_level REAL NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_metrics (
    day TEXT PRIMARY KEY,
    distance_km REAL NOT NULL DEFAULT 0,
    fuel_liters REAL NOT NULL DEFAULT 0,
    deliveries INTEGER NOT NULL DEFAULT 0,
    on_time_rate REAL NOT NULL DEFAULT 0,
    delayed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
  CREATE INDEX IF NOT EXISTS idx_shipments_vehicle ON shipments(vehicle_id);
  CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments(created_at);
  CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
  CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
  CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle ON telemetry(vehicle_id, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
`);

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // rollback may fail if the transaction already closed
    }
    throw error;
  }
}

export function isDatabaseEmpty() {
  const row = get('SELECT COUNT(*) AS count FROM users');
  return !row || row.count === 0;
}
