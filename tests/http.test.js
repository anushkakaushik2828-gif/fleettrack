import test from 'node:test';
import assert from 'node:assert/strict';
import { httpError, isSameOrigin } from '../server/http.js';

test('safe methods are always same-origin', () => {
  assert.equal(isSameOrigin({ method: 'GET', headers: {} }), true);
  assert.equal(isSameOrigin({ method: 'HEAD', headers: { origin: 'https://evil.example' } }), true);
  assert.equal(isSameOrigin({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), true);
});

test('mutations without an Origin header are allowed (same-origin forms)', () => {
  assert.equal(isSameOrigin({ method: 'POST', headers: {} }), true);
});

test('mutations with the current host are allowed', () => {
  assert.equal(isSameOrigin({
    method: 'PATCH',
    headers: { origin: 'https://fleettrack.example.com', host: 'fleettrack.example.com' },
  }), true);
});

test('mutations from another host are rejected', () => {
  assert.equal(isSameOrigin({
    method: 'POST',
    headers: { origin: 'https://evil.example', host: 'fleettrack.example.com' },
  }), false);
  assert.equal(isSameOrigin({
    method: 'POST',
    headers: { origin: 'not a url', host: 'fleettrack.example.com' },
  }), false);
});

test('httpError carries an integer status', () => {
  const error = httpError(409, 'Conflict');
  assert.equal(error.message, 'Conflict');
  assert.equal(error.status, 409);
});
