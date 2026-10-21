import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARGO_TYPES,
  CITIES,
  cityByName,
  distanceMiles,
  interpolate,
  metaForClient,
  roadDistance,
} from '../server/lib/geo.js';

test('cityByName returns a known city and falls back safely', () => {
  assert.equal(cityByName('Chicago, IL').short, 'Chicago');
  assert.equal(cityByName('Not a real city').name, CITIES[0].name);
});

test('roadDistance is longer than the straight-line distance and has a floor', () => {
  const chicago = cityByName('Chicago, IL');
  const detroit = cityByName('Detroit, MI');
  const straight = distanceMiles(chicago, detroit);
  const road = roadDistance(chicago, detroit);

  assert.ok(straight > 200 && straight < 300, `unexpected straight distance: ${straight}`);
  assert.ok(road > straight);
  assert.equal(road, Math.round(straight * 1.18));
  assert.ok(roadDistance(chicago, chicago) >= 36);
});

test('interpolate clamps progress and follows the endpoints', () => {
  const a = { lat: 41.8781, lng: -87.6298 };
  const b = { lat: 42.3314, lng: -83.0458 };

  assert.deepEqual(interpolate(a, b, -20), a);
  const end = interpolate(a, b, 140);
  assert.ok(Math.abs(end.lat - b.lat) < 1e-9);
  assert.ok(Math.abs(end.lng - b.lng) < 1e-9);

  const start = interpolate(a, b, 0);
  assert.equal(start.lat, a.lat);
  assert.equal(start.lng, a.lng);

  const halfway = interpolate(a, b, 50);
  assert.ok(Number.isFinite(halfway.lat) && Number.isFinite(halfway.lng));
  assert.notEqual(halfway.lat, (a.lat + b.lat) / 2);
  assert.ok(Math.abs(halfway.lng - (a.lng + b.lng) / 2) > 0.05);
});

test('client metadata exposes cities, regions and cargo types', () => {
  const meta = metaForClient();
  assert.ok(meta.cities.length >= 30);
  assert.deepEqual(meta.regions, ['North', 'East', 'South', 'West']);
  assert.deepEqual(meta.cargoTypes, CARGO_TYPES);
  assert.ok(meta.cities.every((city) => city.name && city.short && city.region));
});
