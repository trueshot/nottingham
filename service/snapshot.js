// snapshot.js — keep loads/<d>/<load>/notes.jsn on the prey current with notes.db
// Author: nottingham gen-1 — 2026-10-02
//
// Agreed with salem + palmbeach (George asked the three of us for one design):
//   - notes.db is the source of truth; nothing writes back to the DBFs.
//   - Every note change writes a FULL snapshot of that load's notes to
//     <datasetDir>\loads\<last char>\<load>\notes.jsn (tmp + rename), THEN drops
//     <datasetDir>\signals\<load>.sem (waco's sem spec: remote writers use the
//     bridge UNC). salem's checkLoad watches notes.jsn, so refreshLoad re-renders
//     and search picks the note up. Order matters: file BEFORE sem.
//   - No notes left -> write {notes:[]}. A file is authoritative even when empty;
//     only a MISSING file means "fall back to LISTNOTE".
//   - Backfill queues snapshots WITHOUT sems (imported text already matches LISTNOTE).
//
// Durable queue (prosser #9): the change and its queue row commit in the same
// transaction, so a Reggi restart mid-write loses nothing. A worker drains the
// queue off the request path with async fs only (#8), a few rows per tick.

const fs = require('fs');
const path = require('path');

const BRIDGE = process.env.NOTES_BRIDGE || '\\\\15.30.60.44';
const DATASETS_URL = process.env.NOTES_DATASETS_URL || 'http://15.30.60.40:3800/datasets/';
const ENABLED = process.env.NOTES_SNAPSHOTS !== '0';
const TICK_MS = 2000;
const PER_TICK = 25;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

let db = null;          // better-sqlite3 handle, set by attach()
let timer = null;
let busy = false;
const dirCache = new Map(); // dataset -> {dir, until}
const stats = { written: 0, sems: 0, failed: 0, lastError: '', lastErrorAt: '', lastWriteAt: '' };

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS snapshot_queue (
      dataset   TEXT NOT NULL,
      load_no   TEXT NOT NULL,
      sem       INTEGER NOT NULL DEFAULT 1,
      queued_at TEXT NOT NULL,
      attempts  INTEGER NOT NULL DEFAULT 0,
      next_at   TEXT NOT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (dataset, load_no)
    );
    CREATE INDEX IF NOT EXISTS idx_snapq_prio ON snapshot_queue (sem, next_at);
  `);
}

// Call inside the same transaction as the note change. A newer change resets
// attempts and keeps sem=1 if either request wanted one.
function enqueue(d, dataset, loadNo, sem) {
  const ts = new Date().toISOString();
  d.prepare(`
    INSERT INTO snapshot_queue (dataset, load_no, sem, queued_at, attempts, next_at, last_error)
    VALUES (?, ?, ?, ?, 0, ?, '')
    ON CONFLICT (dataset, load_no) DO UPDATE SET
      sem = MAX(sem, excluded.sem), queued_at = excluded.queued_at, attempts = 0,
      next_at = excluded.next_at, last_error = ''
  `).run(dataset, loadNo, sem ? 1 : 0, ts, ts);
}

async function datasetDir(dataset) {
  const hit = dirCache.get(dataset);
  if (hit && hit.until > Date.now()) return hit.dir;
  const r = await fetch(DATASETS_URL + encodeURIComponent(dataset.toLowerCase()), { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`dataset lookup ${dataset}: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.server || !j.drive || !j.directory) throw new Error(`dataset lookup ${dataset}: incomplete ${JSON.stringify(j)}`);
  const rel = String(j.directory).replace(/^[\\/]+|[\\/]+$/g, '').split(/[\\/]+/).join('\\');
  const dir = `${BRIDGE}\\${String(j.server).toLowerCase()}\\${String(j.drive).toLowerCase()}\\${rel}`;
  dirCache.set(dataset, { dir, until: Date.now() + 10 * 60 * 1000 });
  return dir;
}

function snapshotRows(dataset, loadNo) {
  return db.prepare(`
    SELECT n.id, n.list_id, l.short AS list_short, l.name AS list_name, l.color AS list_color,
           n.item_no, n.id_no, n.body, n.source, n.legacy_listno, n.legacy_idx,
           n.created_by, n.created_at, n.updated_by, n.updated_at
    FROM notes n LEFT JOIN lists l ON l.dataset = n.dataset AND l.list_id = n.list_id
    WHERE n.dataset = ? AND n.load_no = ? AND n.deleted = 0
    ORDER BY n.id
  `).all(dataset, loadNo);
}

async function writeOne(row) {
  const base = await datasetDir(row.dataset);
  const loadDir = path.win32.join(base, 'loads', row.load_no.slice(-1), row.load_no);
  try { await fs.promises.access(loadDir); }
  catch (e) { throw new Error('no load folder ' + loadDir); }
  const doc = {
    format: 'nottingham-notes/1',
    dataset: row.dataset,
    load_no: row.load_no,
    generated_at: new Date().toISOString(),
    notes: snapshotRows(row.dataset, row.load_no)
  };
  const file = path.win32.join(loadDir, 'notes.jsn');
  const tmp = file + '.tmp' + process.pid;
  await fs.promises.writeFile(tmp, JSON.stringify(doc, null, 1));
  await fs.promises.rename(tmp, file);
  stats.written++;
  stats.lastWriteAt = doc.generated_at;
  if (row.sem) {
    // file BEFORE sem, always (salem): a render triggered by the sem must see the new snapshot
    await fs.promises.writeFile(path.win32.join(base, 'signals', row.load_no + '.sem'), '');
    stats.sems++;
  }
}

async function tick() {
  if (busy || !db) return;
  busy = true;
  try {
    const now = new Date().toISOString();
    const rows = db.prepare(`SELECT * FROM snapshot_queue WHERE next_at <= ? ORDER BY sem DESC, next_at LIMIT ?   -- real saves (sem=1) before backfill`).all(now, PER_TICK);
    for (const row of rows) {
      try {
        await writeOne(row);
        // Done — unless a newer change re-queued this load while we were writing.
        db.prepare(`DELETE FROM snapshot_queue WHERE dataset = ? AND load_no = ? AND queued_at = ?`).run(row.dataset, row.load_no, row.queued_at);
      } catch (e) {
        stats.failed++;
        stats.lastError = `${row.dataset} ${row.load_no}: ${e.message}`;
        stats.lastErrorAt = new Date().toISOString();
        // An old load whose folder is gone (archived) will never succeed: give up after
        // a few tries instead of retrying every 10 minutes forever.
        if (/^no load folder/.test(e.message) && row.attempts >= 4) {
          stats.noFolder = (stats.noFolder || 0) + 1;
          db.prepare(`DELETE FROM snapshot_queue WHERE dataset = ? AND load_no = ? AND queued_at = ?`).run(row.dataset, row.load_no, row.queued_at);
          continue;
        }
        const wait = Math.min(MAX_BACKOFF_MS, 15000 * Math.pow(2, row.attempts));
        db.prepare(`UPDATE snapshot_queue SET attempts = attempts + 1, last_error = ?, next_at = ? WHERE dataset = ? AND load_no = ? AND queued_at = ?`)
          .run(String(e.message).slice(0, 300), new Date(Date.now() + wait).toISOString(), row.dataset, row.load_no, row.queued_at);
      }
    }
  } catch (e) {
    stats.lastError = 'tick: ' + e.message;
    stats.lastErrorAt = new Date().toISOString();
  } finally {
    busy = false;
  }
}

function attach(handle) {
  db = handle;
  migrate(db);
  if (ENABLED && !timer) {
    timer = setInterval(() => { tick(); }, TICK_MS);
    if (timer.unref) timer.unref();
  }
}
function detach() {
  if (timer) { clearInterval(timer); timer = null; }
  db = null;
}

function status() {
  const out = Object.assign({ enabled: ENABLED }, stats);
  if (db) Object.assign(out, db.prepare(`SELECT COUNT(*) AS queued, SUM(attempts > 0) AS retrying FROM snapshot_queue`).get());
  return out;
}

module.exports = { attach, detach, enqueue, status, tick, datasetDir };
