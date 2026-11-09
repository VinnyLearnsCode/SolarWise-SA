const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const scriptPath = 'backend/scripts/seed-if-configured.js';

test('administrator bootstrap skips when no password is configured', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: '' }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /set ADMIN_PASSWORD/);
});

test('administrator bootstrap requires an email when a password is configured', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ADMIN_EMAIL: '', ADMIN_PASSWORD: 'a-secure-password-123' }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires ADMIN_EMAIL when ADMIN_PASSWORD is configured/);
});
