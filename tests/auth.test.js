import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createToken,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifyToken,
} from '../server/auth.js';

test('passwords are hashed with scrypt and verified safely', () => {
  const stored = hashPassword('Fleet123!');
  assert.match(stored, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(verifyPassword('Fleet123!', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
  assert.equal(verifyPassword('Fleet123!', 'not-a-hash'), false);
  assert.notEqual(hashPassword('Fleet123!'), stored);
});

test('JWT sessions round-trip and reject tampering', () => {
  const user = { id: 7, name: 'Sarah Chen', email: 'admin@fleettrack.app', role: 'admin' };
  const token = createToken(user);
  const payload = verifyToken(token);

  assert.equal(payload.sub, '7');
  assert.equal(payload.name, 'Sarah Chen');
  assert.equal(payload.iss, 'fleettrack');
  assert.equal(verifyToken(`${token}tampered`), null);
  assert.equal(verifyToken('not-a-token'), null);
});

test('cookie parsing decodes names and values', () => {
  assert.deepEqual(parseCookies('fleettrack_session=abc123; theme=light'), {
    fleettrack_session: 'abc123',
    theme: 'light',
  });
  assert.deepEqual(parseCookies('greeting=hello%20world'), { greeting: 'hello world' });
  assert.deepEqual(parseCookies(''), {});
});
