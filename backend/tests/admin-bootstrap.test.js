const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const scriptPath = 'backend/scripts/seed-if-configured.js';

test('administrator bootstrap skips when no bootstrap credentials are configured', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bootstrap skipped/);
});

test('administrator bootstrap fails when only one credential is configured', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: '' }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires both ADMIN_EMAIL and ADMIN_PASSWORD/);
});
