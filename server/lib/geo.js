export const CITIES = [
  { name: 'Chicago, IL', short: 'Chicago', region: 'North', lat: 41.8781, lng: -87.6298 },
  { name: 'Detroit, MI', short: 'Detroit', region: 'North', lat: 42.3314, lng: -83.0458 },
  { name: 'Cleveland, OH', short: 'Cleveland', region: 'North', lat: 41.4993, lng: -81.6944 },
  { name: 'Columbus, OH', short: 'Columbus', region: 'North', lat: 39.9612, lng: -82.9988 },
  { name: 'Indianapolis, IN', short: 'Indianapolis', region: 'North', lat: 39.7684, lng: -86.1581 },
  { name: 'Milwaukee, WI', short: 'Milwaukee', region: 'North', lat: 43.0389, lng: -87.9065 },
  { name: 'Minneapolis, MN', short: 'Minneapolis', region: 'North', lat: 44.9778, lng: -93.265 },
  { name: 'St. Louis, MO', short: 'St. Louis', region: 'North', lat: 38.627, lng: -90.1994 },
  { name: 'Boston, MA', short: 'Boston', region: 'East', lat: 42.3601, lng: -71.0589 },
  { name: 'New York, NY', short: 'New York', region: 'East', lat: 40.7128, lng: -74.006 },
  { name: 'Philadelphia, PA', short: 'Philadelphia', region: 'East', lat: 39.9526, lng: -75.1652 },
  { name: 'Baltimore, MD', short: 'Baltimore', region: 'East', lat: 39.2904, lng: -76.6122 },
  { name: 'Washington, DC', short: 'Washington', region: 'East', lat: 38.9072, lng: -77.0369 },
  { name: 'Richmond, VA', short: 'Richmond', region: 'East', lat: 37.5407, lng: -77.436 },
  { name: 'Pittsburgh, PA', short: 'Pittsburgh', region: 'East', lat: 40.4406, lng: -79.9959 },
  { name: 'Buffalo, NY', short: 'Buffalo', region: 'East', lat: 42.8864, lng: -78.8784 },
  { name: 'Atlanta, GA', short: 'Atlanta', region: 'South', lat: 33.749, lng: -84.388 },
  { name: 'Miami, FL', short: 'Miami', region: 'South', lat: 25.7617, lng: -80.1918 },
  { name: 'Orlando, FL', short: 'Orlando', region: 'South', lat: 28.5383, lng: -81.3792 },
  { name: 'Charlotte, NC', short: 'Charlotte', region: 'South', lat: 35.2271, lng: -80.8431 },
  { name: 'Nashville, TN', short: 'Nashville', region: 'South', lat: 36.1627, lng: -86.7816 },
  { name: 'Memphis, TN', short: 'Memphis', region: 'South', lat: 35.1495, lng: -90.049 },
  { name: 'New Orleans, LA', short: 'New Orleans', region: 'South', lat: 29.9511, lng: -90.0715 },
  { name: 'Jacksonville, FL', short: 'Jacksonville', region: 'South', lat: 30.3322, lng: -81.6557 },
  { name: 'Dallas, TX', short: 'Dallas', region: 'South', lat: 32.7767, lng: -96.797 },
  { name: 'Austin, TX', short: 'Austin', region: 'South', lat: 30.2672, lng: -97.7431 },
  { name: 'Houston, TX', short: 'Houston', region: 'South', lat: 29.7604, lng: -95.3698 },
  { name: 'San Antonio, TX', short: 'San Antonio', region: 'South', lat: 29.4241, lng: -98.4936 },
  { name: 'Seattle, WA', short: 'Seattle', region: 'West', lat: 47.6062, lng: -122.3321 },
  { name: 'Portland, OR', short: 'Portland', region: 'West', lat: 45.5152, lng: -122.6784 },
  { name: 'San Francisco, CA', short: 'San Francisco', region: 'West', lat: 37.7749, lng: -122.4194 },
  { name: 'Los Angeles, CA', short: 'Los Angeles', region: 'West', lat: 34.0522, lng: -118.2437 },
  { name: 'San Diego, CA', short: 'San Diego', region: 'West', lat: 32.7157, lng: -117.1611 },
  { name: 'Phoenix, AZ', short: 'Phoenix', region: 'West', lat: 33.4484, lng: -112.074 },
  { name: 'Denver, CO', short: 'Denver', region: 'West', lat: 39.7392, lng: -104.9903 },
  { name: 'Salt Lake City, UT', short: 'Salt Lake City', region: 'West', lat: 40.7608, lng: -111.891 },
  { name: 'Las Vegas, NV', short: 'Las Vegas', region: 'West', lat: 36.1699, lng: -115.1398 },
  { name: 'Boise, ID', short: 'Boise', region: 'West', lat: 43.615, lng: -116.2023 },
  { name: 'Sacramento, CA', short: 'Sacramento', region: 'West', lat: 38.5816, lng: -121.4944 },
  { name: 'Albuquerque, NM', short: 'Albuquerque', region: 'West', lat: 35.0844, lng: -106.6504 },
];

export const REGIONS = ['North', 'East', 'South', 'West'];
export const CARGO_TYPES = ['General Freight', 'Refrigerated', 'Electronics', 'Automotive Parts', 'Medical Supplies', 'Consumer Goods', 'Industrial Equipment', 'Food & Beverage'];

export function cityByName(name) {
  return CITIES.find((city) => city.name === name) || CITIES[0];
}

export function distanceMiles(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function roadDistance(a, b) {
  return Math.max(36, Math.round(distanceMiles(a, b) * 1.18));
}

export function interpolate(a, b, progress) {
  const t = Math.max(0, Math.min(1, progress / 100));
  // A small arc keeps the point from sitting unnaturally on a perfectly straight line.
  const arc = Math.sin(t * Math.PI) * 0.35;
  const midpointOffset = arc * (a.lng > b.lng ? -1 : 1);
  return {
    lat: a.lat + (b.lat - a.lat) * t + midpointOffset * 0.7,
    lng: a.lng + (b.lng - a.lng) * t + midpointOffset,
  };
}

export function regionForRoute(origin, destination) {
  if (origin.region === destination.region) return origin.region;
  return origin.region;
}

export function randomCity(region = null, random = Math.random) {
  const pool = region ? CITIES.filter((city) => city.region === region) : CITIES;
  return pool[Math.floor(random() * pool.length)];
}

export function routeName(origin, destination, random = Math.random) {
  const corridors = [
    `I-${[10, 20, 35, 40, 70, 75, 80, 90, 94, 95][Math.floor(random() * 10)]}`,
    `US-${[41, 60, 61, 66, 101][Math.floor(random() * 5)]}`,
    `State Route ${Math.floor(random() * 80) + 10}`,
  ];
  return `${corridors[Math.floor(random() * corridors.length)]} · ${origin.short} → ${destination.short}`;
}

export function metaForClient() {
  return {
    cities: CITIES.map(({ name, region, short }) => ({ name, region, short })),
    regions: REGIONS,
    cargoTypes: CARGO_TYPES,
  };
}
