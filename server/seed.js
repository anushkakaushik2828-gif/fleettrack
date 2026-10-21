import { config } from './config.js';
import { clearSessionCookie, hashPassword } from './auth.js';
import {
  db,
  get,
  isDatabaseEmpty,
  run,
  transaction,
} from './db.js';
import {
  CARGO_TYPES,
  CITIES,
  cityByName,
  interpolate,
  randomCity,
  regionForRoute,
  roadDistance,
  routeName,
} from './lib/geo.js';

const NAMED_DRIVERS = [
  { code: 'TRK-092', name: 'Marcus Vance', score: 98.4, mpg: 9.4, deliveries: 842, miles: 218540, onTime: 99.4, color: '#2563eb' },
  { code: 'TRK-145', name: 'Elena Rostova', score: 97.1, mpg: 9.1, deliveries: 776, miles: 196320, onTime: 99.1, color: '#7c3aed' },
  { code: 'TRK-056', name: 'David Kim', score: 96.2, mpg: 8.9, deliveries: 731, miles: 182440, onTime: 98.8, color: '#0891b2' },
  { code: 'TRK-112', name: 'Sarah Jenkins', score: 95.6, mpg: 8.8, deliveries: 690, miles: 171810, onTime: 98.2, color: '#db2777' },
  { code: 'TRK-084', name: 'Carlos Mendez', score: 94.9, mpg: 8.7, deliveries: 668, miles: 165220, onTime: 98.0, color: '#ea580c' },
  { code: 'TRK-108', name: 'Amara Okafor', score: 94.3, mpg: 8.6, deliveries: 604, miles: 149580, onTime: 97.8, color: '#059669' },
  { code: 'TRK-031', name: 'Priya Nair', score: 93.8, mpg: 8.5, deliveries: 588, miles: 143100, onTime: 97.6, color: '#4f46e5' },
  { code: 'TRK-076', name: "Liam O'Connor", score: 93.1, mpg: 8.4, deliveries: 533, miles: 135940, onTime: 97.1, color: '#0284c7' },
  { code: 'TRK-120', name: 'Noah Williams', score: 92.4, mpg: 8.3, deliveries: 501, miles: 127880, onTime: 96.9, color: '#65a30d' },
  { code: 'TRK-017', name: 'Sofia Martinez', score: 91.8, mpg: 8.2, deliveries: 490, miles: 122650, onTime: 96.5, color: '#d946ef' },
];

const FIRST_NAMES = [
  'Ava', 'Ethan', 'Mia', 'Lucas', 'Isabella', 'Mason', 'Zoe', 'Logan', 'Nora', 'Elijah',
  'Hana', 'Owen', 'Leila', 'Caleb', 'Iris', 'Julian', 'Maya', 'Finn', 'Ruby', 'Theo',
  'Anika', 'Mateo', 'Freya', 'Micah', 'Layla', 'Arjun', 'Clara', 'Nico', 'Sana', 'Dean',
  'Kiara', 'Ravi', 'Elena', 'Jasper', 'Tara', 'Milo', 'Aisha', 'Cole', 'Lena', 'Rafael',
];

const LAST_NAMES = [
  'Bennett', 'Patel', 'Nguyen', 'Walker', 'Kim', 'Rossi', 'Clark', 'Silva', 'Brown', 'Singh',
  'Turner', 'Garcia', 'Lee', 'Evans', 'Costa', 'Morgan', 'Reyes', 'Wright', 'Shah', 'Miller',
  'Wilson', 'Petrov', 'Lopez', 'Cooper', 'Murphy', 'Chen', 'Hughes', 'Foster', 'Ortiz', 'Nelson',
  'Brooks', 'Kapoor', 'Bailey', 'Stewart', 'Diaz', 'Ward', 'Price', 'Rogers', 'Cook', 'Reed',
];

const VEHICLE_MODELS = [
  { type: 'Class 8 Heavy Rig', make: 'Freightliner', model: 'Cascadia' },
  { type: 'Class 8 Heavy Rig', make: 'Volvo', model: 'VNL 860' },
  { type: 'Class 8 Heavy Rig', make: 'Peterbilt', model: '579' },
  { type: 'Class 8 Heavy Rig', make: 'Kenworth', model: 'T680' },
  { type: 'Class 8 Heavy Rig', make: 'International', model: 'LT' },
  { type: 'Electric Box Truck', make: 'Freightliner', model: 'eCascadia' },
  { type: 'Refrigerated Rig', make: 'Volvo', model: 'VNR Electric' },
];

const PLATE_STATES = ['IL', 'MI', 'OH', 'GA', 'TX', 'WA', 'CA', 'NY', 'MA', 'CO', 'FL', 'TN'];

const NAMED_SHIPMENTS = [
  {
    order: '01471280',
    code: 'TRK-092',
    origin: 'Chicago DC',
    originCity: 'Chicago, IL',
    destination: 'Detroit Hub',
    destinationCity: 'Detroit, MI',
    route: 'I-94 Eastbound Corridor',
    distance: 284,
    status: 'delivered',
    progress: 100,
    cargo: 'Consumer Goods',
    weight: 14.2,
    temp: 38.2,
    departedHoursAgo: 8.4,
    etaHoursFromNow: -1.2,
    deliveredHoursAgo: 1.5,
    pod: 'Robert Gallagher',
    delayReason: null,
  },
  {
    order: '01634200',
    code: 'TRK-145',
    origin: 'Atlanta Hub',
    originCity: 'Atlanta, GA',
    destination: 'Miami Port',
    destinationCity: 'Miami, FL',
    route: 'I-75 South / Florida Turnpike',
    distance: 662,
    status: 'in_transit',
    progress: 63,
    cargo: 'Refrigerated',
    weight: 12.8,
    temp: 36.7,
    departedHoursAgo: 6.2,
    etaHoursFromNow: 4.2,
    deliveredHoursAgo: null,
    pod: null,
    delayReason: null,
  },
  {
    order: '01431008',
    code: 'TRK-056',
    origin: 'Dallas Central',
    originCity: 'Dallas, TX',
    destination: 'Austin East',
    destinationCity: 'Austin, TX',
    route: 'I-35 S Metro Corridor',
    distance: 195,
    status: 'in_transit',
    progress: 86,
    cargo: 'Automotive Parts',
    weight: 9.4,
    temp: null,
    departedHoursAgo: 3.1,
    etaHoursFromNow: 1.2,
    deliveredHoursAgo: null,
    pod: null,
    delayReason: null,
  },
  {
    order: '01892114',
    code: 'TRK-112',
    origin: 'Seattle Port',
    originCity: 'Seattle, WA',
    destination: 'Portland Depot',
    destinationCity: 'Portland, OR',
    route: 'I-5 Southbound',
    distance: 174,
    status: 'delayed',
    progress: 41,
    cargo: 'Medical Supplies',
    weight: 6.2,
    temp: 35.8,
    departedHoursAgo: 5.5,
    etaHoursFromNow: 2.0,
    deliveredHoursAgo: null,
    pod: null,
    delayReason: 'Mechanical inspection · +1h 15m',
  },
  {
    order: '01554320',
    code: 'TRK-084',
    origin: 'Phoenix East',
    originCity: 'Phoenix, AZ',
    destination: 'Denver North',
    destinationCity: 'Denver, CO',
    route: 'US-60 to I-25 North',
    distance: 585,
    status: 'delivered',
    progress: 100,
    cargo: 'Industrial Equipment',
    weight: 18.6,
    temp: null,
    departedHoursAgo: 9.2,
    etaHoursFromNow: -3.4,
    deliveredHoursAgo: 3.6,
    pod: 'Alicia Monroe',
    delayReason: null,
  },
  {
    order: '01783941',
    code: 'TRK-108',
    origin: 'Boston AirCargo',
    originCity: 'Boston, MA',
    destination: 'JFK Terminal',
    destinationCity: 'New York, NY',
    route: 'I-95 South Express',
    distance: 215,
    status: 'in_transit',
    progress: 53,
    cargo: 'Electronics',
    weight: 7.1,
    temp: null,
    departedHoursAgo: 1.6,
    etaHoursFromNow: 2.9,
    deliveredHoursAgo: null,
    pod: null,
    delayReason: null,
  },
];

const ALERT_SEEDS = [
  { type: 'route_deviation', severity: 'critical', title: 'Route Deviation: TRK-092', message: 'Urgent alert for route deviation on vehicle active transit.', vehicle: 'TRK-092', minutesAgo: 2, status: 'active' },
  { type: 'fuel_theft', severity: 'critical', title: 'Fuel Theft Suspected: TRK-145', message: 'Rapid fuel drop detected during stationary interval.', vehicle: 'TRK-145', minutesAgo: 7, status: 'active' },
  { type: 'maintenance', severity: 'warning', title: 'Maintenance Due: TRK-011', message: 'Urgent service check required per 10k mile mark.', vehicle: 'TRK-011', minutesAgo: 16, status: 'active' },
  { type: 'maintenance', severity: 'warning', title: 'Maintenance Due: TRK-013', message: 'Brake inspection alert triggered by sensor diagnostics.', vehicle: 'TRK-013', minutesAgo: 24, status: 'active' },
  { type: 'harsh_braking', severity: 'warning', title: 'Harsh Braking Event: TRK-056', message: 'Three harsh braking events recorded within 12 minutes on I-35.', vehicle: 'TRK-056', minutesAgo: 33, status: 'active' },
  { type: 'geofence', severity: 'critical', title: 'Geofence Exit: TRK-112', message: 'Vehicle left the approved I-5 corridor near Tacoma, WA.', vehicle: 'TRK-112', minutesAgo: 46, status: 'active' },
  { type: 'idle_time', severity: 'warning', title: 'Extended Idle: TRK-084', message: 'Engine idling for 38 minutes at Phoenix East depot.', vehicle: 'TRK-084', minutesAgo: 58, status: 'active' },
  { type: 'temperature', severity: 'warning', title: 'Temperature Variance: TRK-145', message: 'Reefer unit fluctuated 3.2°F above the configured setpoint.', vehicle: 'TRK-145', minutesAgo: 74, status: 'acknowledged' },
  { type: 'tire_pressure', severity: 'warning', title: 'Tire Pressure Low: TRK-031', message: 'Rear axle pressure is 8 PSI below recommended range.', vehicle: 'TRK-031', minutesAgo: 91, status: 'active' },
  { type: 'route_assigned', severity: 'info', title: 'New Route Assigned: TRK-108', message: 'Boston AirCargo to JFK Terminal dispatch manifest approved.', vehicle: 'TRK-108', minutesAgo: 110, status: 'acknowledged' },
  { type: 'delivery', severity: 'info', title: 'Delivery Verified: TRK-092', message: 'POD signed by Robert Gallagher at Detroit Hub.', vehicle: 'TRK-092', minutesAgo: 132, status: 'resolved' },
  { type: 'shift', severity: 'info', title: 'Shift Handover Complete', message: 'Night dispatch handover completed with zero open incidents.', vehicle: null, minutesAgo: 168, status: 'resolved' },
];

function mulberry32(seed) {
  let value = seed;
  return function random() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function iso(date) {
  return date.toISOString();
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function deleteAllRows() {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const table of ['telemetry', 'shipment_events', 'shipments', 'alerts', 'daily_metrics', 'vehicles', 'drivers', 'users']) {
    db.exec(`DELETE FROM ${table};`);
  }
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('telemetry','shipment_events','shipments','alerts','daily_metrics','vehicles','drivers','users');");
  db.exec('PRAGMA foreign_keys = ON;');
}

export function seedDatabase({ force = false } = {}) {
  if (!force && !isDatabaseEmpty()) {
    return { seeded: false, reason: 'database already contains users' };
  }

  const random = mulberry32(0xf1ee7);
  const pick = (arr) => arr[Math.floor(random() * arr.length)];
  const between = (min, max) => min + random() * (max - min);
  const integer = (min, max) => Math.floor(between(min, max + 1));

  transaction(() => {
    if (force) deleteAllRows();

    const createdAt = iso(new Date());

    run(
      'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      'Sarah Chen',
      config.demoEmail,
      hashPassword(config.demoPassword),
      'admin',
      createdAt,
    );

    const usedNames = new Set(NAMED_DRIVERS.map((driver) => driver.name));
    let firstIndex = 0;
    let lastIndex = 0;
    const nextName = () => {
      while (true) {
        const candidate = `${FIRST_NAMES[firstIndex % FIRST_NAMES.length]} ${LAST_NAMES[lastIndex % LAST_NAMES.length]}`;
        lastIndex += 1;
        if (lastIndex % LAST_NAMES.length === 0) firstIndex += 1;
        if (!usedNames.has(candidate)) {
          usedNames.add(candidate);
          return candidate;
        }
      }
    };

    const namedByCode = new Map(NAMED_DRIVERS.map((driver) => [driver.code, driver]));
    const vehiclesByCode = new Map();
    const driverByCode = new Map();
    const maintenanceCodes = new Set(['TRK-149', 'TRK-150', 'TRK-151', 'TRK-152']);
    const idleCodes = new Set(Array.from({ length: 10 }, (_, index) => `TRK-${String(139 + index).padStart(3, '0')}`));

    for (let index = 1; index <= 152; index += 1) {
      const code = `TRK-${String(index).padStart(3, '0')}`;
      const named = namedByCode.get(code);
      const name = named?.name || nextName();
      const isMaintenance = maintenanceCodes.has(code);
      const isIdle = idleCodes.has(code);
      const status = isMaintenance || isIdle ? 'off_duty' : 'on_duty';
      const score = named?.score ?? Number(between(80.4, 91.4).toFixed(1));
      const mpg = named?.mpg ?? Number(between(6.7, 8.1).toFixed(1));
      const driverResult = run(
        `INSERT INTO drivers
          (name, initials, phone, email, license_no, status, safety_score, efficiency, total_miles,
           deliveries_completed, on_time_rate, rating, joined_at, avatar_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        name,
        initialsFor(name),
        `+1 (312) 555-${String(1000 + index).slice(-4)}`,
        `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@fleettrack.app`,
        `CDL-${String(480000 + index * 137).slice(0, 8)}`,
        status,
        score,
        mpg,
        named?.miles ?? integer(38200, 148000),
        named?.deliveries ?? integer(180, 600),
        named?.onTime ?? Number(between(93.2, 97.8).toFixed(1)),
        Number(between(4.35, 4.95).toFixed(2)),
        daysAgo(integer(160, 1600)),
        named?.color || pick(['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#ea580c', '#059669', '#4f46e5', '#0284c7']),
      );
      const driverId = Number(driverResult.lastInsertRowid);
      const vehicleModel = VEHICLE_MODELS[index % VEHICLE_MODELS.length];
      const homeCity = randomCity(null, random);
      const vehicleStatus = isMaintenance ? 'maintenance' : isIdle ? 'idle' : 'active';
      const odometer = integer(28000, 188000);
      const vehicleResult = run(
        `INSERT INTO vehicles
          (code, type, plate, make, model, year, driver_id, status, fuel_level, odometer, battery,
           engine_temp, last_service_at, next_service_miles, lat, lng, speed_mph, region, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        code,
        named ? 'Class 8 Heavy Rig' : vehicleModel.type,
        `${pick(PLATE_STATES)}-${integer(1000, 9899)}`,
        named ? (index % 2 === 0 ? 'Freightliner' : 'Volvo') : vehicleModel.make,
        named ? (index % 2 === 0 ? 'Cascadia' : 'VNL 860') : vehicleModel.model,
        integer(2021, 2026),
        driverId,
        vehicleStatus,
        Number(between(isMaintenance ? 18 : 42, isMaintenance ? 44 : 96).toFixed(1)),
        odometer,
        Number(between(84, 100).toFixed(1)),
        Number(between(184, 208).toFixed(1)),
        daysAgo(integer(12, 180)),
        odometer + integer(800, 8500),
        homeCity.lat + between(-0.45, 0.45),
        homeCity.lng + between(-0.45, 0.45),
        vehicleStatus === 'active' ? Number(between(0, 12).toFixed(1)) : 0,
        homeCity.region,
        iso(new Date()),
      );
      const vehicleId = Number(vehicleResult.lastInsertRowid);
      vehiclesByCode.set(code, {
        id: vehicleId,
        code,
        status: vehicleStatus,
        driverId,
        driverName: name,
      });
      driverByCode.set(code, { id: driverId, name });
    }

    const usedOrders = new Set(NAMED_SHIPMENTS.map((shipment) => shipment.order));
    const uniqueOrder = () => {
      let candidate = String(integer(20000000, 89999999));
      while (usedOrders.has(candidate)) candidate = String(integer(20000000, 89999999));
      usedOrders.add(candidate);
      return candidate;
    };

    const insertShipment = (shipment, createdStamp) => {
      const originCity = cityByName(shipment.originCity);
      const destinationCity = cityByName(shipment.destinationCity);
      const vehicle = vehiclesByCode.get(shipment.code);
      const distance = shipment.distance;
      const progress = shipment.progress;
      const distanceDone = Math.round(distance * (progress / 100));
      const departedAt = shipment.departedAt || hoursAgo(shipment.departedHoursAgo);
      const etaAt = shipment.etaAt || (shipment.etaHoursFromNow !== undefined ? hoursFromNow(shipment.etaHoursFromNow) : null);
      const deliveredAt = shipment.deliveredAt || (shipment.deliveredHoursAgo ? hoursAgo(shipment.deliveredHoursAgo) : null);
      const result = run(
        `INSERT INTO shipments
          (order_code, vehicle_id, driver_id, origin, origin_lat, origin_lng, destination,
           destination_lat, destination_lng, route, region, distance_total, distance_done, cargo,
           weight_tons, temp_f, status, progress, departed_at, eta_at, delivered_at, delay_reason,
           pod_signature, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        shipment.order,
        vehicle.id,
        vehicle.driverId,
        shipment.origin,
        originCity.lat,
        originCity.lng,
        shipment.destination,
        destinationCity.lat,
        destinationCity.lng,
        shipment.route,
        shipment.region || originCity.region,
        distance,
        distanceDone,
        shipment.cargo,
        shipment.weight,
        shipment.temp,
        shipment.status,
        progress,
        departedAt,
        etaAt,
        deliveredAt,
        shipment.delayReason,
        shipment.pod,
        createdStamp,
        createdStamp,
      );
      const shipmentId = Number(result.lastInsertRowid);
      const baseTime = new Date(departedAt).getTime();
      const eventTime = (hoursOffset) => iso(new Date(baseTime + hoursOffset * 3600 * 1000));

      run(
        'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
        shipmentId,
        `Depot departure · ${shipment.origin}`,
        `Manifest verified and container seal applied.`,
        departedAt,
        'departure',
      );
      if (shipment.status === 'delivered') {
        run(
          'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
          shipmentId,
          'Checkpoint cleared',
          'DOT inspection passed. Speed and load within range.',
          eventTime(2.1),
          'checkpoint',
        );
        run(
          'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
          shipmentId,
          `Signed & verified · ${shipment.destination}`,
          `Proof of delivery signed by ${shipment.pod || 'receiving manager'}.`,
          deliveredAt,
          'delivery',
        );
      } else if (progress > 45) {
        run(
          'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
          shipmentId,
          'En-route checkpoint',
          'Telematics ping healthy. Cargo conditions within tolerance.',
          eventTime(1.25),
          'checkpoint',
        );
      }
      if (shipment.status === 'delayed') {
        run(
          'INSERT INTO shipment_events (shipment_id, title, detail, occurred_at, kind) VALUES (?, ?, ?, ?, ?)',
          shipmentId,
          'Exception reported',
          shipment.delayReason || 'Delay reported by driver.',
          hoursAgo(0.8),
          'exception',
        );
      }

      if (shipment.status === 'in_transit' || shipment.status === 'delayed') {
        const point = interpolate(originCity, destinationCity, progress);
        run(
          'UPDATE vehicles SET lat = ?, lng = ?, speed_mph = ?, updated_at = ? WHERE id = ?',
          point.lat,
          point.lng,
          shipment.status === 'delayed' ? Number(between(0, 12).toFixed(1)) : Number(between(48, 66).toFixed(1)),
          iso(new Date()),
          vehicle.id,
        );
      } else if (shipment.status === 'delivered') {
        run(
          'UPDATE vehicles SET lat = ?, lng = ?, speed_mph = ?, updated_at = ? WHERE id = ?',
          destinationCity.lat + between(-0.12, 0.12),
          destinationCity.lng + between(-0.12, 0.12),
          0,
          iso(new Date()),
          vehicle.id,
        );
      }

      return { id: shipmentId, vehicleId: vehicle.id, vehicleCode: shipment.code };
    };

    // The six priority shipments appear at the top of the live table.
    NAMED_SHIPMENTS.forEach((shipment, index) => {
      insertShipment(
        { ...shipment, region: cityByName(shipment.originCity).region },
        new Date(Date.now() - index * 60_000).toISOString(),
      );
    });

    const activeVehicles = [...vehiclesByCode.values()].filter((vehicle) => vehicle.status === 'active');
    const namedCurrentVehicleIds = new Set(
      NAMED_SHIPMENTS.filter((shipment) => shipment.status !== 'delivered')
        .map((shipment) => vehiclesByCode.get(shipment.code).id),
    );
    const availableVehicles = activeVehicles.filter((vehicle) => !namedCurrentVehicleIds.has(vehicle.id));
    let vehicleCursor = 0;

    const genericShipment = (status, orderIndex) => {
      const useUniqueVehicle = status !== 'delivered';
      const vehicle = useUniqueVehicle
        ? availableVehicles[vehicleCursor++ % availableVehicles.length]
        : activeVehicles[Math.floor(random() * activeVehicles.length)];
      const originCity = randomCity(null, random);
      let destinationCity = randomCity(null, random);
      while (destinationCity.name === originCity.name) destinationCity = randomCity(null, random);
      const distance = roadDistance(originCity, destinationCity);
      const progress = status === 'delivered'
        ? 100
        : status === 'delayed'
          ? Number(between(24, 72).toFixed(1))
          : Number(between(8, 96).toFixed(1));
      const departedHours = status === 'delivered' ? between(4, 11) : between(1.2, 8.5);
      const departure = hoursAgo(departedHours);
      const delivered = status === 'delivered'
        ? new Date(new Date(departure).getTime() + between(1.8, 4.5) * 3600 * 1000).toISOString()
        : null;
      const etaHours = status === 'delivered'
        ? deliveredHoursAgoForSeed(delivered)
        : between(0.8, 7.5);
      const eta = status === 'delivered' ? delivered : hoursFromNow(etaHours);
      const cargo = pick(CARGO_TYPES);
      const originSuffix = pick(['DC', 'Hub', 'Port', 'Depot']);
      const destinationSuffix = pick(['Hub', 'Depot', 'Terminal', 'DC']);
      const createdAt = new Date(
        Date.now() - (20 + orderIndex * 0.7 + random() * 12) * 60_000,
      ).toISOString();
      return {
        order: uniqueOrder(),
        code: vehicle.code,
        origin: `${originCity.short} ${originSuffix}`,
        originCity: originCity.name,
        destination: `${destinationCity.short} ${destinationSuffix}`,
        destinationCity: destinationCity.name,
        route: routeName(originCity, destinationCity, random),
        region: regionForRoute(originCity, destinationCity),
        distance,
        status,
        progress,
        cargo,
        weight: Number(between(4.2, 21.5).toFixed(1)),
        temp: cargo === 'Refrigerated' || cargo === 'Medical Supplies' ? Number(between(34.2, 41.8).toFixed(1)) : null,
        departedAt: departure,
        etaAt: eta,
        deliveredAt: delivered,
        pod: status === 'delivered' ? pick(['Jordan Ellis', 'Priya Raman', 'Alex Morgan', 'Tina Wu', 'Samir Patel']) : null,
        delayReason: status === 'delayed'
          ? pick(['Weather bottleneck · +45m', 'Traffic incident · +28m', 'Mechanical inspection · +1h 05m', 'Route deviation · under review'])
          : null,
        created_at: createdAt,
      };
    };

    const deliveredNeeded = 248 - NAMED_SHIPMENTS.filter((shipment) => shipment.status === 'delivered').length;
    const transitNeeded = 86 - NAMED_SHIPMENTS.filter((shipment) => shipment.status === 'in_transit').length;
    const delayedNeeded = 8 - NAMED_SHIPMENTS.filter((shipment) => shipment.status === 'delayed').length;

    for (let index = 0; index < deliveredNeeded; index += 1) {
      const shipment = genericShipment('delivered', index);
      insertShipment(shipment, shipment.created_at);
    }
    for (let index = 0; index < transitNeeded; index += 1) {
      const shipment = genericShipment('in_transit', index);
      insertShipment(shipment, shipment.created_at);
    }
    for (let index = 0; index < delayedNeeded; index += 1) {
      const shipment = genericShipment('delayed', index);
      insertShipment(shipment, shipment.created_at);
    }

    // Idle and maintenance vehicles keep a sensible parked position.
    for (const vehicle of vehiclesByCode.values()) {
      if (vehicle.status === 'active') continue;
      const parked = randomCity(null, random);
      run(
        'UPDATE vehicles SET lat = ?, lng = ?, speed_mph = 0, updated_at = ? WHERE id = ?',
        parked.lat + between(-0.25, 0.25),
        parked.lng + between(-0.25, 0.25),
        iso(new Date()),
        vehicle.id,
      );
    }

    ALERT_SEEDS.forEach((alert) => {
      const timestamp = new Date(Date.now() - alert.minutesAgo * 60_000).toISOString();
      run(
        `INSERT INTO alerts
          (type, severity, title, message, vehicle_code, status, created_at, acknowledged_at,
           acknowledged_by, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        alert.type,
        alert.severity,
        alert.title,
        alert.message,
        alert.vehicle,
        alert.status,
        timestamp,
        alert.status === 'resolved' || alert.status === 'acknowledged' ? timestamp : null,
        alert.status === 'resolved' || alert.status === 'acknowledged' ? 'Sarah Chen' : null,
        alert.status === 'resolved' ? timestamp : null,
      );
    });

    // 90 days of fleet operating history for the analytics views.
    for (let offset = 89; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 86400 * 1000);
      const isToday = offset === 0;
      const miles = isToday ? 28460 : Math.round(between(18600, 26400));
      const fuel = Number((miles / between(7.9, 9.1)).toFixed(1));
      const deliveries = isToday ? 248 : integer(285, 368);
      const delayed = isToday ? 8 : integer(4, 14);
      const onTime = isToday ? 98.1 : Number(between(95.1, 99.3).toFixed(1));
      run(
        'INSERT INTO daily_metrics (day, miles, fuel_gallons, deliveries, on_time_rate, delayed) VALUES (?, ?, ?, ?, ?, ?)',
        todayKey(date),
        miles,
        fuel,
        deliveries,
        onTime,
        delayed,
      );
    }

    // The archive includes a recent working week right up to today.
    for (const vehicle of [...vehiclesByCode.values()].slice(0, 38)) {
      const point = CITIES[Math.floor(random() * CITIES.length)];
      run(
        'INSERT INTO telemetry (vehicle_id, lat, lng, speed_mph, fuel_level, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
        vehicle.id,
        point.lat,
        point.lng,
        integer(0, 64),
        Math.round(between(40, 100)),
        iso(new Date(Date.now() - integer(1, 90) * 60_000)),
      );
    }
  });

  const summary = {
    vehicles: get('SELECT COUNT(*) AS count FROM vehicles').count,
    drivers: get('SELECT COUNT(*) AS count FROM drivers').count,
    shipments: get('SELECT COUNT(*) AS count FROM shipments').count,
    alerts: get('SELECT COUNT(*) AS count FROM alerts').count,
  };
  return { seeded: true, ...summary };
}

function deliveredHoursAgoForSeed(deliveredIso) {
  return (Date.now() - new Date(deliveredIso).getTime()) / 3600000;
}

export function numericPasswordResetHint() {
  return {
    email: config.demoEmail,
    password: config.demoPassword,
  };
}
