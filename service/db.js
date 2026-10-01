// db.js — SQLite store for ProduceFlow load notes (replaces LISTHEAD/LISTTAIL/LISTNOTE DBFs)
// Author: nottingham gen-1
//
// One database for every dataset (dataset column on every row), better-sqlite3
// WAL on Monkey: D:\clients\nottingham\data\notes.db. Reggi is the only writer.
// Per-connection pragmas are NOT persisted in the file and must be set on every
// open (solitude:--facet-monkey-sqlite).
//
// Legacy mapping:
//   LISTHEAD (LISTNO, LISTNAME, LISTSHORT, LISTDESC)  -> lists (list_id, name, short, descr)
//   LISTTAIL (LISTNO, LISTNOIDX, INVCE_NO, ITEM_NO, ID_NO) + LISTNOTE (NOTE1..NOTE10)
//                                                     -> notes (one row, body = NOTE1..10 joined)
//   NEXTIDX                                           -> AUTOINCREMENT
// (legacy_listno, legacy_idx) keep the DBF key so the import is re-runnable.

const fs = require('fs');
const path = require('path');
const { hostRequire } = require('./deps');

const DATA = process.env.NOTES_DATA_DIR || path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA, 'notes.db');

// Condition #8: nothing unbounded on Reggi's single thread.
const MAX_BODY = 20000;        // chars per note (legacy cap was 2500)
const MAX_PAGE = 200;          // rows per search page
const MAX_LOAD_NOTES = 500;    // rows returned for one load
const MAX_IMPORT = 500;        // notes per import request

let db = null;
let loadError = null;

function open() {
  if (db || loadError) return;
  if (!fs.existsSync(DATA)) {
    loadError = 'Notes data dir missing: ' + DATA + ' (create it, then restart)';
    return;
  }
  let Database;
  try { Database = hostRequire('better-sqlite3'); }
  catch (e) { loadError = 'better-sqlite3 not resolvable: ' + e.message; return; }
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    migrate();
  } catch (e) {
    loadError = 'SQLite open failed: ' + e.message;
    try { if (db) db.close(); } catch (e2) { /* ignore */ }
    db = null;
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      dataset    TEXT NOT NULL,
      list_id    INTEGER NOT NULL,          -- legacy LISTNO (1003 = TAGPROB)
      name       TEXT NOT NULL DEFAULT '',
      short      TEXT NOT NULL DEFAULT '',
      descr      TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '',  -- chip colour; '' = UI default palette
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (dataset, list_id)
    );
    CREATE TABLE IF NOT EXISTS notes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset       TEXT NOT NULL,
      load_no       TEXT NOT NULL,          -- legacy INVCE_NO
      list_id       INTEGER NOT NULL,
      item_no       TEXT NOT NULL DEFAULT '',
      id_no         TEXT NOT NULL DEFAULT '',
      body          TEXT NOT NULL DEFAULT '',
      deleted       INTEGER NOT NULL DEFAULT 0,
      source        TEXT NOT NULL DEFAULT 'app',   -- app | import (last writer)
      client_key    TEXT,                   -- idempotency key for POST (condition #9)
      legacy_listno INTEGER,
      legacy_idx    INTEGER,
      created_by    TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL,
      updated_by    TEXT NOT NULL DEFAULT '',
      updated_at    TEXT NOT NULL,
      FOREIGN KEY (dataset, list_id) REFERENCES lists (dataset, list_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notes_load ON notes (dataset, load_no);
    CREATE INDEX IF NOT EXISTS idx_notes_list ON notes (dataset, list_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_notes_client ON notes (dataset, client_key) WHERE client_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_notes_legacy ON notes (dataset, legacy_listno, legacy_idx) WHERE legacy_idx IS NOT NULL;
    CREATE TABLE IF NOT EXISTS note_events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      ts      TEXT NOT NULL,
      actor   TEXT NOT NULL DEFAULT '',
      kind    TEXT NOT NULL,                -- create | edit | delete | restore | import
      body    TEXT                          -- body as it was AFTER this event
    );
    CREATE INDEX IF NOT EXISTS idx_events_note ON note_events (note_id);
  `);
}

function close() {
  if (db) { try { db.close(); } catch (e) { /* already closed */ } db = null; }
}
if (!global.__nottinghamNotesShutdownHooked) {
  global.__nottinghamNotesShutdownHooked = true;
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  process.on('exit', close);
}

// ---------- helpers ----------

function now() { return new Date().toISOString(); }
function httpError(status, msg) { return Object.assign(new Error(msg), { status }); }
function get() {
  open();
  if (loadError) throw httpError(503, loadError);
  return db;
}
function tx(fn) { return get().transaction(fn)(); }

function str(v, max, label) {
  const s = v == null ? '' : String(v);
  if (s.length > max) throw httpError(400, `${label} longer than ${max} chars`);
  return s;
}
function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}
function cleanLoad(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(s)) throw httpError(400, 'bad load number');
  return s;
}
function event(noteId, actor, kind, body) {
  db.prepare(`INSERT INTO note_events (note_id, ts, actor, kind, body) VALUES (?, ?, ?, ?, ?)`)
    .run(noteId, now(), actor, kind, body == null ? null : body);
}

const NOTE_COLS = `n.id, n.dataset, n.load_no, n.list_id, l.short AS list_short, l.name AS list_name,
  l.color AS list_color, n.item_no, n.id_no, n.body, n.deleted, n.created_by, n.created_at,
  n.updated_by, n.updated_at, n.legacy_idx`;
const NOTE_FROM = `FROM notes n LEFT JOIN lists l ON l.dataset = n.dataset AND l.list_id = n.list_id`;

function noteById(dataset, id) {
  return get().prepare(`SELECT ${NOTE_COLS} ${NOTE_FROM} WHERE n.dataset = ? AND n.id = ?`).get(dataset, id);
}

// ---------- lists ----------

function listLists(dataset) {
  return get().prepare(`SELECT list_id, name, short, descr, color, active, updated_at FROM lists WHERE dataset = ? ORDER BY list_id`).all(dataset);
}

function upsertList(dataset, input) {
  const listId = intOrNull(input.list_id);
  if (!Number.isInteger(listId) || listId <= 0) throw httpError(400, 'list_id must be a positive integer');
  const ts = now();
  get().prepare(`
    INSERT INTO lists (dataset, list_id, name, short, descr, color, active, created_at, updated_at)
    VALUES (@dataset, @list_id, @name, @short, @descr, @color, @active, @ts, @ts)
    ON CONFLICT (dataset, list_id) DO UPDATE SET
      name = excluded.name, short = excluded.short, descr = excluded.descr,
      color = excluded.color, active = excluded.active, updated_at = excluded.updated_at
  `).run({
    dataset, list_id: listId, ts,
    name: str(input.name, 100, 'name').trim(),
    short: str(input.short, 20, 'short').trim(),
    descr: str(input.descr, 500, 'descr').trim(),
    color: str(input.color, 20, 'color').trim(),
    active: input.active === false || input.active === 0 ? 0 : 1
  });
  return get().prepare(`SELECT * FROM lists WHERE dataset = ? AND list_id = ?`).get(dataset, listId);
}

function requireList(dataset, listId) {
  const n = intOrNull(listId);
  if (!Number.isInteger(n)) throw httpError(400, 'list_id required');
  const row = get().prepare(`SELECT list_id, active FROM lists WHERE dataset = ? AND list_id = ?`).get(dataset, n);
  if (!row) throw httpError(400, `no list ${n} in dataset ${dataset}`);
  return n;
}

// ---------- notes ----------

function notesForLoad(dataset, load, opts) {
  const loadNo = cleanLoad(load);
  const withDeleted = opts && opts.includeDeleted;
  const rows = get().prepare(`
    SELECT ${NOTE_COLS} ${NOTE_FROM}
    WHERE n.dataset = ? AND n.load_no = ? ${withDeleted ? '' : 'AND n.deleted = 0'}
    ORDER BY n.id LIMIT ?
  `).all(dataset, loadNo, MAX_LOAD_NOTES + 1);
  const truncated = rows.length > MAX_LOAD_NOTES;
  return { dataset, load_no: loadNo, notes: truncated ? rows.slice(0, MAX_LOAD_NOTES) : rows, truncated };
}

// Keyset pagination, newest first: pass the last id you saw as before_id.
function searchNotes(dataset, q) {
  const where = ['n.dataset = ?', 'n.deleted = 0'];
  const args = [dataset];
  if (q.list_id != null && q.list_id !== '') {
    const l = intOrNull(q.list_id);
    if (!Number.isInteger(l)) throw httpError(400, 'bad list_id');
    where.push('n.list_id = ?'); args.push(l);
  }
  if (q.load_no) { where.push('n.load_no = ?'); args.push(cleanLoad(q.load_no)); }
  if (q.q) { where.push(`n.body LIKE ? ESCAPE '\\'`); args.push('%' + String(q.q).slice(0, 100).replace(/[\\%_]/g, m => '\\' + m) + '%'); }
  if (q.since) { where.push('n.updated_at >= ?'); args.push(String(q.since).slice(0, 30)); }
  if (q.before_id != null && q.before_id !== '') {
    const b = intOrNull(q.before_id);
    if (!Number.isInteger(b)) throw httpError(400, 'bad before_id');
    where.push('n.id < ?'); args.push(b);
  }
  let limit = intOrNull(q.limit);
  if (!Number.isInteger(limit) || limit <= 0) limit = 50;
  limit = Math.min(limit, MAX_PAGE);
  const rows = get().prepare(`SELECT ${NOTE_COLS} ${NOTE_FROM} WHERE ${where.join(' AND ')} ORDER BY n.id DESC LIMIT ?`).all(...args, limit);
  return { notes: rows, next_before_id: rows.length === limit ? rows[rows.length - 1].id : null };
}

// Idempotent when the caller sends client_key: a retry after a Reggi restart
// returns the note created the first time instead of a duplicate (condition #9).
function addNote(dataset, load, input, actor) {
  const loadNo = cleanLoad(load);
  const clientKey = input.client_key == null || input.client_key === '' ? null : str(input.client_key, 80, 'client_key');
  return tx(() => {
    if (clientKey) {
      const hit = db.prepare(`SELECT id FROM notes WHERE dataset = ? AND client_key = ?`).get(dataset, clientKey);
      if (hit) return { note: noteById(dataset, hit.id), replayed: true };
    }
    const listId = requireList(dataset, input.list_id);
    const body = str(input.body, MAX_BODY, 'body');
    const ts = now();
    const r = db.prepare(`
      INSERT INTO notes (dataset, load_no, list_id, item_no, id_no, body, source, client_key, created_by, created_at, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'app', ?, ?, ?, ?, ?)
    `).run(dataset, loadNo, listId, str(input.item_no, 30, 'item_no'), str(input.id_no, 30, 'id_no'), body, clientKey, actor, ts, actor, ts);
    const id = Number(r.lastInsertRowid);
    event(id, actor, 'create', body);
    return { note: noteById(dataset, id), replayed: false };
  });
}

// expect_updated_at (optional): reject if someone else changed the note since
// the caller read it — 409 instead of a silent overwrite.
function updateNote(dataset, id, input, actor) {
  return tx(() => {
    const cur = db.prepare(`SELECT * FROM notes WHERE dataset = ? AND id = ?`).get(dataset, id);
    if (!cur) throw httpError(404, 'no such note');
    if (input.expect_updated_at && input.expect_updated_at !== cur.updated_at) {
      throw Object.assign(httpError(409, 'note changed since you read it'), { current: noteById(dataset, id) });
    }
    const body = input.body === undefined ? cur.body : str(input.body, MAX_BODY, 'body');
    const listId = input.list_id === undefined ? cur.list_id : requireList(dataset, input.list_id);
    if (body === cur.body && listId === cur.list_id) return noteById(dataset, id);   // no-op retry
    db.prepare(`UPDATE notes SET body = ?, list_id = ?, source = 'app', updated_by = ?, updated_at = ? WHERE id = ?`)
      .run(body, listId, actor, now(), id);
    event(id, actor, 'edit', body);
    return noteById(dataset, id);
  });
}

function setDeleted(dataset, id, deleted, actor) {
  return tx(() => {
    const cur = db.prepare(`SELECT deleted FROM notes WHERE dataset = ? AND id = ?`).get(dataset, id);
    if (!cur) throw httpError(404, 'no such note');
    if (cur.deleted !== deleted) {
      db.prepare(`UPDATE notes SET deleted = ?, source = 'app', updated_by = ?, updated_at = ? WHERE id = ?`).run(deleted, actor, now(), id);
      event(id, actor, deleted ? 'delete' : 'restore', null);
    }
    return noteById(dataset, id);
  });
}

function getNote(dataset, id) {
  const n = noteById(dataset, id);
  if (!n) throw httpError(404, 'no such note');
  return n;
}

function history(dataset, id) {
  if (!get().prepare(`SELECT 1 FROM notes WHERE dataset = ? AND id = ?`).get(dataset, id)) throw httpError(404, 'no such note');
  return db.prepare(`SELECT ts, actor, kind, body FROM note_events WHERE note_id = ? ORDER BY id LIMIT 500`).all(id);
}

// ---------- legacy import (tools/import-dbf.js posts batches here) ----------
// Keyed by (legacy_listno, legacy_idx): re-running is safe. A note already edited
// in the new system (source = 'app') is never overwritten by a later import.
function importBatch(dataset, batch, actor) {
  const lists = Array.isArray(batch.lists) ? batch.lists : [];
  const notes = Array.isArray(batch.notes) ? batch.notes : [];
  if (notes.length > MAX_IMPORT) throw httpError(400, `max ${MAX_IMPORT} notes per import request`);
  const out = { lists: 0, inserted: 0, updated: 0, unchanged: 0, kept_app_edit: 0, errors: [] };
  tx(() => {
    for (const l of lists) {
      const exists = db.prepare(`SELECT 1 FROM lists WHERE dataset = ? AND list_id = ?`).get(dataset, intOrNull(l.list_id));
      if (!exists) { upsertList(dataset, l); out.lists++; }
    }
    for (const n of notes) {
      try {
        const listNo = intOrNull(n.legacy_listno), idx = intOrNull(n.legacy_idx);
        if (!Number.isInteger(listNo) || !Number.isInteger(idx)) throw new Error('legacy_listno/legacy_idx required');
        const loadNo = cleanLoad(n.load_no);
        const body = str(n.body, MAX_BODY, 'body');
        requireList(dataset, listNo);
        const cur = db.prepare(`SELECT id, body, load_no, source FROM notes WHERE dataset = ? AND legacy_listno = ? AND legacy_idx = ?`).get(dataset, listNo, idx);
        const ts = now();
        if (!cur) {
          const r = db.prepare(`
            INSERT INTO notes (dataset, load_no, list_id, item_no, id_no, body, source, legacy_listno, legacy_idx, created_by, created_at, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, ?, ?, ?)
          `).run(dataset, loadNo, listNo, str(n.item_no, 30, 'item_no'), str(n.id_no, 30, 'id_no'), body, listNo, idx, actor, ts, actor, ts);
          event(Number(r.lastInsertRowid), actor, 'import', body);
          out.inserted++;
        } else if (cur.source === 'app') {
          out.kept_app_edit++;
        } else if (cur.body === body && cur.load_no === loadNo) {
          out.unchanged++;
        } else {
          db.prepare(`UPDATE notes SET body = ?, load_no = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(body, loadNo, actor, ts, cur.id);
          event(cur.id, actor, 'import', body);
          out.updated++;
        }
      } catch (e) {
        out.errors.push({ legacy_listno: n.legacy_listno, legacy_idx: n.legacy_idx, error: e.message });
      }
    }
  });
  return out;
}

function status() {
  open();
  const st = { ok: !loadError, error: loadError || undefined, dataDir: DATA, dbPath: DB_PATH };
  // Cheap on every call (prosser 2026-10-01): MAX(id) is an index seek, not a scan.
  if (db) st.counts = db.prepare(`SELECT (SELECT MAX(id) FROM notes) AS max_note_id, (SELECT COUNT(*) FROM lists) AS lists`).get();
  return st;
}

module.exports = {
  DATA, DB_PATH, MAX_PAGE, MAX_IMPORT,
  open, close, get, status, httpError,
  listLists, upsertList, notesForLoad, searchNotes, getNote, addNote, updateNote, setDeleted, history, importBatch
};
