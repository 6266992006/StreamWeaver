/**
 * End-to-end test: sign up → create import job → stream a CSV with live
 * progress → history → failed rows → export → error report → permissions.
 *
 * It drives the REAL backend over HTTP/WebSocket in the same order the UI does,
 * so a green run means the whole product works, not just each piece.
 *
 *   1. start MongoDB and the backend (cd ../StreamWeaver-backend && npm start)
 *   2. npm run test:e2e            (from StreamWeaver-frontend)
 *
 * Optional env:
 *   E2E_API_URL      backend address            (default http://localhost:5000)
 *   E2E_ADMIN_EMAIL  an email listed in the backend's ADMIN_EMAILS — enables the
 *                    admin checks (the account is created if it doesn't exist)
 *   E2E_ADMIN_PASSWORD  that account's password, if it already exists
 *                    (default: the throw-away password this test signs up with)
 *   E2E_ROWS         rows to import             (default 20000)
 *
 * If the backend isn't running, the tests are skipped with a clear message
 * instead of failing in a confusing way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.E2E_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const WS_URL = API.replace(/^http/, 'ws') + '/ws/progress';
const ROWS = Number(process.env.E2E_ROWS) || 20000;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-password-1';
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const PASSWORD = 'e2e-password-1';
const ERROR_LOG_CAP = 1000; // backend keeps at most this many failed rows per import

const call = async (path, { method = 'GET', token, json, body, raw } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: json ? JSON.stringify(json) : body });
  if (raw) return res;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, data };
};

// ROWS data rows. Every 100th row has a bad email, every 250th a missing name.
const buildCsv = () => {
  const lines = ['\uFEFFid,name,email,age'];
  for (let i = 1; i <= ROWS; i++) {
    const name = i % 250 === 0 ? '' : `user ${i}`;
    const email = i % 100 === 0 ? 'not-an-email' : `user${i}@example.com`;
    lines.push(`${i},${name},${email},${20 + (i % 50)}`);
  }
  return lines.join('\n') + '\n';
};
const expectedBad = (() => {
  let n = 0;
  for (let i = 1; i <= ROWS; i++) if (i % 250 === 0 || i % 100 === 0) n++;
  return n;
})();

const mapping = {
  id: { source: 'id', type: 'number', required: true },
  fullName: { source: 'name', required: true },
  email: { source: 'email', type: 'email' },
  age: { source: 'age', type: 'number' },
};
const fieldTransforms = { name: 'String(value).toUpperCase()' };

const signUp = async (label, email) => {
  const res = await call('/api/auth/signup', {
    method: 'POST',
    json: { name: `E2E ${label}`, email: email || `e2e-${label}-${RUN}@example.com`, password: PASSWORD },
  });
  assert.equal(res.status, 201, `signup failed: ${JSON.stringify(res.data)}`);
  return res.data;
};

let backendUp = false;
try {
  const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
  backendUp = res.ok;
} catch {
  /* not running */
}
const t = backendUp ? test : test.skip;
if (!backendUp) console.warn(`\n⚠ E2E skipped: no backend at ${API}. Start MongoDB + the backend, then re-run.\n`);

const state = {};

t('backend is healthy and connected to MongoDB', async () => {
  const { data } = await call('/api/health');
  assert.equal(data.db, 'connected', 'MongoDB is not connected — check MONGO_URI in the backend .env');
  for (const r of ['/api/jobs', '/api/export', '/ws/progress']) assert.ok(data.routes.includes(r), `${r} is not mounted`);
});

t('sign up, sign in and read the profile (role included)', async () => {
  const signedUp = await signUp('owner');
  assert.ok(signedUp.token);
  assert.equal(signedUp.user.role, 'analyst');

  const login = await call('/api/auth/login', {
    method: 'POST',
    json: { email: signedUp.user.email, password: PASSWORD },
  });
  assert.equal(login.status, 200);
  state.token = login.data.token;

  const me = await call('/api/auth/me', { token: state.token });
  assert.equal(me.data.user.email, signedUp.user.email);
  assert.equal(me.data.user.role, 'analyst');
});

t('protected routes reject a request without a token', async () => {
  assert.equal((await call('/api/jobs')).status, 401);
});

t('a bad mapping or a transform that does not compile is refused up front', async () => {
  const bad = await call('/api/jobs', {
    method: 'POST',
    token: state.token,
    json: { fileName: 'x.csv', mapping: { 'a.b': { source: 'a' } } },
  });
  assert.equal(bad.status, 400);

  const syntax = await call('/api/jobs', {
    method: 'POST',
    token: state.token,
    json: { fileName: 'x.csv', fieldTransforms: { name: 'value.(' } },
  });
  assert.equal(syntax.status, 400);
  assert.match(syntax.data.message, /compile/i);
});

t('creates a job, then streams the CSV with live WebSocket progress', async () => {
  const csv = buildCsv();
  const create = await call('/api/jobs', {
    method: 'POST',
    token: state.token,
    json: { fileName: `people-${RUN}.csv`, sizeBytes: csv.length, estimatedRows: ROWS, mapping, fieldTransforms },
  });
  assert.equal(create.status, 201, JSON.stringify(create.data));
  state.jobId = create.data.jobId;
  state.datasetId = create.data.datasetId;

  // Subscribe BEFORE the upload starts, exactly like the UI.
  const frames = [];
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(state.token)}`);
  const finalFrame = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no final progress frame within 60s')), 60000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', jobId: state.jobId }));
    ws.onerror = () => reject(new Error('WebSocket error'));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'progress') return;
      frames.push(msg);
      if (msg.status === 'done' || msg.status === 'failed') {
        clearTimeout(timer);
        resolve(msg);
      }
    };
  });
  await new Promise((r) => (ws.readyState === 1 ? r() : ws.addEventListener('open', r, { once: true })));

  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), `people-${RUN}.csv`);
  const upload = await call(`/api/jobs/${state.jobId}/file`, { method: 'POST', token: state.token, body: form });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  assert.equal(upload.data.status, 'done');
  assert.equal(upload.data.totalRows, ROWS);
  assert.equal(upload.data.rowsFailed, expectedBad);
  assert.equal(upload.data.rowsProcessed, ROWS - expectedBad);

  const last = await finalFrame;
  ws.close();
  assert.equal(last.status, 'done');
  assert.equal(last.percent, 100);
  assert.equal(last.rowsProcessed, ROWS - expectedBad);
  assert.ok(frames.length >= 1, 'expected at least one progress frame');
});

t('the same job cannot be started twice', async () => {
  const form = new FormData();
  form.append('file', new Blob(['id\n1\n'], { type: 'text/csv' }), 'again.csv');
  const again = await call(`/api/jobs/${state.jobId}/file`, { method: 'POST', token: state.token, body: form });
  assert.equal(again.status, 409);
});

t('history lists the import with its counters', async () => {
  const { data } = await call('/api/jobs', { token: state.token });
  const item = data.jobs.find((j) => j.jobId === state.jobId);
  assert.ok(item, 'job missing from history');
  assert.equal(item.status, 'done');
  assert.equal(item.rowsFailed, expectedBad);
  assert.equal(item.id, state.datasetId);
});

t('failed rows come back with correct row numbers and reasons', async () => {
  const { data } = await call(`/api/jobs/${state.jobId}/errors`, { token: state.token });
  assert.equal(data.rowsFailed, expectedBad);
  const byRow = new Map(data.errors.map((e) => [e.row, e.reason]));
  // Row numbers count from the first row after the header.
  assert.match(byRow.get(100), /email must be a valid email/);
  assert.match(byRow.get(250), /fullName is required/);
  assert.match(byRow.get(500), /fullName is required.*email must be a valid email|email must be a valid email.*fullName is required/);
});

t('exports the cleaned data as CSV and JSON (transforms + renamed columns applied)', async () => {
  const csv = await (await call(`/api/export/${state.datasetId}?format=csv`, { token: state.token, raw: true })).text();
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'id,fullName,email,age');
  assert.equal(lines.length - 1, ROWS - expectedBad);
  assert.equal(lines[1], '1,USER 1,user1@example.com,21'); // uppercased by the sandbox transform

  const json = await (await call(`/api/export/${state.datasetId}?format=json`, { token: state.token, raw: true })).json();
  assert.equal(json.length, ROWS - expectedBad);
  assert.equal(json[0].fullName, 'USER 1');
  assert.equal(typeof json[0].id, 'number'); // cast to a number by the mapping
});

t('downloads the error report as CSV and JSON', async () => {
  const csvRes = await call(`/api/export/job/${state.jobId}/errors?format=csv`, { token: state.token, raw: true });
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-disposition'), /errors\.csv/);
  const csv = await csvRes.text();
  assert.ok(csv.startsWith('row,type,reason'));
  // The server keeps at most 1,000 failed rows per import (rowsFailed is the true total).
  assert.equal(csv.trim().split('\r\n').length - 1, Math.min(expectedBad, ERROR_LOG_CAP));

  const json = await (await call(`/api/export/job/${state.jobId}/errors?format=json`, { token: state.token, raw: true })).json();
  assert.equal(json.rowsFailed, expectedBad);
  assert.equal(json.truncated, expectedBad > ERROR_LOG_CAP);
});

t("another analyst can't see, read or download this import", async () => {
  const other = (await signUp('other')).token;
  assert.equal((await call(`/api/jobs/${state.jobId}/errors`, { token: other })).status, 404);
  assert.equal((await call(`/api/export/${state.datasetId}`, { token: other })).status, 404);
  assert.equal((await call(`/api/export/job/${state.jobId}/errors`, { token: other })).status, 404);
  const history = await call('/api/jobs', { token: other });
  assert.equal(history.data.jobs.length, 0);
  assert.equal((await call('/api/jobs?scope=all', { token: other })).status, 403);
});

const ta = ADMIN_EMAIL ? test : test.skip;
ta('an admin can list and download everyone’s imports', async () => {
  let admin;
  const attempt = await call('/api/auth/signup', {
    method: 'POST',
    json: { name: 'E2E Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (attempt.status === 201) admin = attempt.data.token;
  else {
    const login = await call('/api/auth/login', { method: 'POST', json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    assert.equal(login.status, 200, 'that admin account already exists with a different password — set E2E_ADMIN_PASSWORD');
    admin = login.data.token;
  }
  const me = await call('/api/auth/me', { token: admin });
  assert.equal(me.data.user.role, 'admin', 'is E2E_ADMIN_EMAIL listed in the backend ADMIN_EMAILS?');

  const all = await call('/api/jobs?scope=all', { token: admin });
  assert.equal(all.status, 200);
  const item = all.data.jobs.find((j) => j.jobId === state.jobId);
  assert.ok(item?.owner?.email, 'admin view should show who owns each import');
  assert.equal((await call(`/api/export/${state.datasetId}?format=csv`, { token: admin, raw: true })).status, 200);
});
