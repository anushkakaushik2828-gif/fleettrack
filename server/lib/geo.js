export const CITIES = [
  { name: 'Delhi, DL', short: 'Delhi', region: 'North', lat: 28.6139, lng: 77.2090 },
  { name: 'Mumbai, MH', short: 'Mumbai', region: 'West', lat: 19.0760, lng: 72.8777 },
  { name: 'Bengaluru, KA', short: 'Bengaluru', region: 'South', lat: 12.9716, lng: 77.5946 },
  { name: 'Chennai, TN', short: 'Chennai', region: 'South', lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata, WB', short: 'Kolkata', region: 'East', lat: 22.5726, lng: 88.3639 },
  { name: 'Hyderabad, TS', short: 'Hyderabad', region: 'South', lat: 17.3850, lng: 78.4867 },
  { name: 'Pune, MH', short: 'Pune', region: 'West', lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad, GJ', short: 'Ahmedabad', region: 'West', lat: 23.0225, lng: 72.5714 },
  { name: 'Jaipur, RJ', short: 'Jaipur', region: 'North', lat: 26.9124, lng: 75.7873 },
  { name: 'Lucknow, UP', short: 'Lucknow', region: 'North', lat: 26.8467, lng: 80.9462 },
  { name: 'Kochi, KL', short: 'Kochi', region: 'South', lat: 9.9312, lng: 76.2673 },
  { name: 'Bhubaneswar, OD', short: 'Bhubaneswar', region: 'East', lat: 20.2961, lng: 85.8245 },
  { name: 'Guwahati, AS', short: 'Guwahati', region: 'East', lat: 26.1445, lng: 91.7362 },
  { name: 'Chandigarh, CH', short: 'Chandigarh', region: 'North', lat: 30.7333, lng: 76.7794 },
  { name: 'Indore, MP', short: 'Indore', region: 'Central', lat: 22.7196, lng: 75.8577 },
  { name: 'Bhopal, MP', short: 'Bhopal', region: 'Central', lat: 23.2599, lng: 77.4126 },
  { name: 'Nagpur, MH', short: 'Nagpur', region: 'Central', lat: 21.1458, lng: 79.0882 },
  { name: 'Coimbatore, TN', short: 'Coimbatore', region: 'South', lat: 11.0168, lng: 76.9556 },
  { name: 'Visakhapatnam, AP', short: 'Visakhapatnam', region: 'South', lat: 17.6868, lng: 83.2185 },
  { name: 'Thiruvananthapuram, KL', short: 'Trivandrum', region: 'South', lat: 8.5241, lng: 76.9366 },
  { name: 'Patna, BR', short: 'Patna', region: 'East', lat: 25.5941, lng: 85.1376 },
  { name: 'Ranchi, JH', short: 'Ranchi', region: 'East', lat: 23.3441, lng: 85.3096 },
  { name: 'Raipur, CG', short: 'Raipur', region: 'Central', lat: 21.2514, lng: 81.6296 },
  { name: 'Jammu, JK', short: 'Jammu', region: 'North', lat: 32.7266, lng: 74.8570 },
  { name: 'Shillong, ML', short: 'Shillong', region: 'East', lat: 25.5788, lng: 91.8933 },
  { name: 'Mangalore, KA', short: 'Mangalore', region: 'South', lat: 12.9141, lng: 74.8560 },
  { name: 'Vijayawada, AP', short: 'Vijayawada', region: 'South', lat: 16.5062, lng: 80.6480 },
  { name: 'Nashik, MH', short: 'Nashik', region: 'West', lat: 19.9975, lng: 73.7898 },
  { name: 'Udaipur, RJ', short: 'Udaipur', region: 'North', lat: 24.5854, lng: 73.7125 },
  { name: 'Gwalior, MP', short: 'Gwalior', region: 'Central', lat: 26.2183, lng: 78.1828 },
];

export const REGIONS = ['North', 'South', 'East', 'West', 'Central'];
export const CARGO_TYPES = ['General Freight', 'Refrigerated', 'Electronics', 'Automotive Parts', 'Medical Supplies', 'Consumer Goods', 'Industrial Equipment', 'Food & Beverage'];
export const INDIAN_HIGHWAYS = ['NH-44', 'NH-48', 'NH-27', 'NH-16', 'NH-19', 'NH-66', 'NH-52', 'NH-7', 'NH-8', 'NH-9'];

export function cityByName(name) {
  return CITIES.find((city) => city.name === name) || CITIES[0];
}

export function distanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth radius in kilometers
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function roadDistance(a, b) {
  return Math.max(60, Math.round(distanceKm(a, b) * 1.18));
}

export function interpolate(a, b, progress) {
  const t = Math.max(0, Math.min(1, progress / 100));
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
  const highway = INDIAN_HIGHWAYS[Math.floor(random() * INDIAN_HIGHWAYS.length)];
  return `${highway} · ${origin.short} → ${destination.short}`;
}

export function metaForClient() {
  return {
    cities: CITIES.map(({ name, region, short }) => ({ name, region, short })),
    regions: REGIONS,
    cargoTypes: CARGO_TYPES,
  };
}
