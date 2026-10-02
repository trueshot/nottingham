#!/usr/bin/env node
// test.js — end-to-end test of the notes service over HTTP
// Author: nottingham gen-1
//
//   node service/test.js
//
// Spawns server.js on a free port with a throwaway data dir, then walks lists,
// notes, idempotency, conflicts, paging, dataset isolation and the legacy import
// (seeded with the real lot 60000 notes). Exit 0 = every assertion passed.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-'));
const port = 3600 + Math.floor(Math.random() * 300);
const base = `http://localhost:${port}/notes`;
let failures = 0, passes = 0;

function check(cond, label, extra) {
  if (cond) { passes++; console.log('  ok   ' + label); }
  else { failures++; console.log('  FAIL ' + label + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
async function api(method, url, body, headers) {
  const r = await fetch(base + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = { _text: text }; }
  return { status: r.status, body: json };
}
const W = { 'X-Notes-Dev-User': 'will', 'X-Notes-Dataset': 'WILLIS' };

// Fake prey share for notes.jsn snapshots: <bridge>/hawk/d/CLIENTS/WILLIS/{loads,signals}
const http = require('http');
const bridge = path.join(dataDir, 'bridge');
const dsDir = path.join(bridge, 'hawk', 'd', 'CLIENTS', 'WILLIS');
const loadDir = n => path.join(dsDir, 'loads', String(n).slice(-1), String(n));
fs.mkdirSync(path.join(dsDir, 'signals'), { recursive: true });
for (const n of [60000, 60001, 60009]) fs.mkdirSync(loadDir(n), { recursive: true });
const dsPort = port + 1;
const dsServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ shortName: 'willis', server: 'hawk', drive: 'D', directory: '/CLIENTS/WILLIS/' }));
}).listen(dsPort);
const snapEnv = { NOTES_BRIDGE: bridge, NOTES_DATASETS_URL: 'http://localhost:' + dsPort + '/datasets/' };
const readSnap = n => { try { return JSON.parse(fs.readFileSync(path.join(loadDir(n), 'notes.jsn'), 'utf8')); } catch (e) { return null; } };
const semExists = n => fs.existsSync(path.join(dsDir, 'signals', n + '.sem'));
async function until(fn, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 200)); }
  return false;
}
const OTHER = { 'X-Notes-Dev-User': 'sam', 'X-Notes-Dataset': 'HARTEE' };

function startServer(env) {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { NOTES_DATA_DIR: dataDir, NOTES_PORT: String(port), NOTES_DEV: '1' }, snapEnv, env || {}),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.out = '';
  child.stdout.on('data', d => { child.out += d; });
  child.stderr.on('data', d => { child.out += d; });
  return child;
}
async function waitUp(child) {
  for (let i = 0; i < 200; i++) {   // 20s: cold start (native module + AV scan of temp dir) once took >6s
    try { const r = await fetch(base + '/health'); if (r.status) return; } catch (e) { /* not yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start:\n' + child.out);
}
function stop(child) { return new Promise(r => { child.on('exit', r); child.kill(); }); }

(async () => {
  let child = startServer();
  await waitUp(child);

  console.log('health + auth gates');
  let r = await api('GET', '/health');
  check(r.status === 200 && r.body.ok === true && 'max_note_id' in r.body.counts, 'health 200 ok', r.body);
  r = await api('GET', '/api/lists');
  check(r.status === 401, 'no identity -> 401', r.status);
  r = await api('GET', '/api/lists', null, { 'X-Notes-Dev-User': 'will' });
  check(r.status === 400, 'no dataset -> 400', r.status);

  console.log('legacy import (lot 60000, real DBF content)');
  const batch = {
    lists: [{ list_id: 1003, name: 'Tag Problems', short: 'TAGPROB' }, { list_id: 1005, name: '2020', short: '2020' }],
    notes: [
      { legacy_listno: 1003, legacy_idx: 1496, load_no: '60000', body: '' },
      { legacy_listno: 1005, legacy_idx: 1, load_no: '60000', body: 'test\ntest2' },
      { legacy_listno: 1005, legacy_idx: 832, load_no: '60000', body: 'test add' },
      { legacy_listno: 1003, legacy_idx: 1841, load_no: '60000', body: 'testing add two' }
    ]
  };
  r = await api('POST', '/api/import', batch, W);
  check(r.status === 200 && r.body.inserted === 4 && r.body.lists === 2, 'import inserts 4 notes + 2 lists', r.body);
  r = await api('POST', '/api/import', batch, W);
  check(r.body.inserted === 0 && r.body.unchanged === 4, 're-import is a no-op', r.body);
  r = await api('GET', '/api/loads/60000/notes', null, W);
  check(r.status === 200 && r.body.notes.length === 4, 'load 60000 has 4 notes', r.body);
  check(r.body.notes.map(n => n.list_short).join(',') === 'TAGPROB,2020,2020,TAGPROB', 'chip order + list shorts match the DBF', r.body.notes.map(n => n.list_short));

  console.log('add / idempotent retry / edit / conflict / delete');
  r = await api('POST', '/api/loads/60000/notes', { list_id: 1003, body: 'pallet 7 tag unreadable', client_key: 'k-1' }, W);
  check(r.status === 201 && r.body.note.created_by === 'will', 'add note -> 201', r.body);
  const id = r.body.note.id, stamp = r.body.note.updated_at;
  r = await api('POST', '/api/loads/60000/notes', { list_id: 1003, body: 'pallet 7 tag unreadable', client_key: 'k-1' }, W);
  check(r.status === 200 && r.body.replayed === true && r.body.note.id === id, 'retry with same client_key returns same note', r.body);
  r = await api('POST', '/api/loads/60000/notes', { list_id: 9999, body: 'x' }, W);
  check(r.status === 400, 'unknown list -> 400', r.body);
  r = await api('POST', '/api/loads/60000/notes', { list_id: 1003, body: 'x'.repeat(20001) }, W);
  check(r.status === 400, 'oversize body -> 400', r.status);
  r = await api('POST', '/api/loads/..%2F..%2Fx/notes', { list_id: 1003, body: 'x' }, W);
  check(r.status === 400, 'bad load number -> 400', r.status);
  await new Promise(res => setTimeout(res, 5));
  r = await api('PUT', '/api/notes/' + id, { body: 'pallet 7 tag reprinted', expect_updated_at: stamp }, W);
  check(r.status === 200 && r.body.note.body === 'pallet 7 tag reprinted', 'edit with matching stamp', r.body);
  r = await api('PUT', '/api/notes/' + id, { body: 'stale write', expect_updated_at: stamp }, W);
  check(r.status === 409 && r.body.current.body === 'pallet 7 tag reprinted', 'stale edit -> 409 with current', r.body);
  r = await api('DELETE', '/api/notes/' + id, null, W);
  check(r.body.note.deleted === 1, 'soft delete', r.body);
  r = await api('GET', '/api/loads/60000/notes', null, W);
  check(r.body.notes.length === 4, 'deleted note hidden from load', r.body.notes.length);
  r = await api('GET', '/api/notes/' + id + '/history', null, W);
  check(r.body.events.map(e => e.kind).join(',') === 'create,edit,delete', 'history create,edit,delete', r.body);

  console.log('import never overwrites an app edit');
  const legacy = (await api('GET', '/api/loads/60000/notes', null, W)).body.notes.find(n => n.legacy_idx === 832);
  await api('PUT', '/api/notes/' + legacy.id, { body: 'test add (edited in new UI)' }, W);
  r = await api('POST', '/api/import', batch, W);
  check(r.body.kept_app_edit === 1, 'import keeps the app edit', r.body);

  console.log('dataset isolation');
  r = await api('GET', '/api/loads/60000/notes', null, OTHER);
  check(r.status === 200 && r.body.notes.length === 0, 'HARTEE sees none of WILLIS notes', r.body);
  r = await api('GET', '/api/notes/' + legacy.id, null, OTHER);
  check(r.status === 404, 'HARTEE cannot fetch a WILLIS note by id', r.status);
  r = await api('GET', '/api/lists', null, { 'X-OAuth-Validated': 'true', 'X-OAuth-User': 'will', 'X-OAuth-Dataset': 'WILLIS', 'X-Notes-Dataset': 'HARTEE' });
  check(r.status === 403, 'edge session for WILLIS asking for HARTEE -> 403', r.body);

  console.log('paging + search');
  for (let i = 0; i < 7; i++) await api('POST', '/api/loads/6000' + i + '/notes', { list_id: 1005, body: 'bulk ' + i }, W);
  r = await api('GET', '/api/notes?list_id=1005&limit=3', null, W);
  check(r.body.notes.length === 3 && r.body.next_before_id, 'page 1 of 3', r.body);
  const r2 = await api('GET', '/api/notes?list_id=1005&limit=3&before_id=' + r.body.next_before_id, null, W);
  check(r2.body.notes.length === 3 && r2.body.notes[0].id < r.body.notes[2].id, 'page 2 continues', r2.body);
  r = await api('GET', '/api/notes?limit=100000', null, W);
  check(r.body.notes.length <= 200, 'limit capped at 200', r.body.notes.length);
  r = await api('GET', '/api/notes?q=bulk%203', null, W);
  check(r.body.notes.length === 1, 'text search', r.body);
  r = await api('GET', '/api/notes?q=%25', null, W);
  check(r.body.notes.length === 0, 'LIKE wildcard escaped', r.body.notes.length);

  console.log('notes.jsn snapshots on the prey share');
  let ok = await until(() => semExists(60000) && readSnap(60000));
  let snap = readSnap(60000);
  const live60000 = (await api('GET', '/api/loads/60000/notes', null, W)).body.notes.length;
  check(ok && snap.format === 'nottingham-notes/1' && snap.notes.length === live60000, 'load 60000: notes.jsn matches the API + sem', [snap && snap.notes.length, live60000]);
  check(snap && snap.notes.every(n => 'source' in n && 'legacy_idx' in n), 'snapshot carries source + legacy key', snap && snap.notes[0]);
  const bulk1 = (await api('GET', '/api/loads/60001/notes', null, W)).body.notes[0];
  ok = await until(() => readSnap(60001) && readSnap(60001).notes.length === 1);
  check(ok, 'load 60001 snapshot has its 1 note', readSnap(60001));
  await until(() => semExists(60001));
  fs.unlinkSync(path.join(dsDir, 'signals', '60001.sem'));
  await api('DELETE', '/api/notes/' + bulk1.id, null, W);
  ok = await until(() => semExists(60001) && readSnap(60001) && readSnap(60001).notes.length === 0);
  check(ok, 'last note deleted -> {notes:[]} written (not removed) + sem', readSnap(60001));
  await api('POST', '/api/import', { notes: [{ legacy_listno: 1005, legacy_idx: 9001, load_no: '60009', body: 'old dbf note' }] }, W);
  r = await api('POST', '/api/snapshots/backfill', null, W);
  check(r.status === 200 && r.body.queued >= 1, 'backfill queues loads', r.body);
  ok = await until(() => readSnap(60009));
  check(ok && readSnap(60009).notes[0].body === 'old dbf note', 'backfill writes notes.jsn', readSnap(60009));
  check(!semExists(60009), 'backfill drops NO sem', semExists(60009));
  r = await api('GET', '/health');
  check(r.body.snapshots && r.body.snapshots.written >= 3 && r.body.snapshots.retrying >= 1, 'health: snapshot stats, missing load folders retrying', r.body.snapshots);

  console.log('restart survival');
  await stop(child);
  child = startServer();
  await waitUp(child);
  r = await api('POST', '/api/loads/60000/notes', { list_id: 1003, body: 'pallet 7 tag unreadable', client_key: 'k-1' }, W);
  check(r.body.replayed === true && r.body.note.id === id, 'client_key replay survives restart', r.body);
  await stop(child);

  console.log('missing data dir -> 503');
  child = startServer({ NOTES_DATA_DIR: path.join(dataDir, 'nope') });
  await waitUp(child);
  r = await api('GET', '/health');
  check(r.status === 503 && /missing/.test(r.body.error), 'health 503 when data dir missing', r.body);
  r = await api('GET', '/api/lists', null, W);
  check(r.status === 503, 'api 503 when data dir missing', r.status);
  await stop(child);

  dsServer.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* WAL handle on Windows */ }
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
