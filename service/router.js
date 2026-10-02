// router.js — the ProduceFlow notes service as one express.Router
// Author: nottingham gen-1
//
// Mounted at /notes inside Reggi (prostanEntityAPI, Monkey:3005) — contract:
// node c:/clients/prosser/readme.js --facet-reggi-mount. Everything here is
// router-scoped (#2); every handler runs through safe() (#1); a notes bug must
// never take down the host.
//
// API (all JSON; all /api routes need a signed-in user + dataset):
//   GET    /health                          -> 200 {ok, counts}  (503 body if data dir missing)
//   GET    /api/whoami
//   GET    /api/lists                       -> the dataset's lists (TAGPROB, 2020, ...)
//   PUT    /api/lists/:listId               {name, short, descr, color, active}
//   GET    /api/loads/:load/notes           -> notes on one load (the chip strip)
//   POST   /api/loads/:load/notes           {list_id, body, item_no?, id_no?, client_key?}
//   GET    /api/notes?list_id&q&load_no&since&before_id&limit   (paged, max 200)
//   GET    /api/notes/:id
//   PUT    /api/notes/:id                   {body?, list_id?, expect_updated_at?}
//   DELETE /api/notes/:id                   soft delete;  POST /api/notes/:id/restore
//   GET    /api/notes/:id/history
//   POST   /api/snapshots/backfill        queue notes.jsn for every load of the dataset (no sems)
//   POST   /api/import                      {lists[], notes[]}  (legacy DBF import, max 500/batch)

const { hostRequire } = require('./deps');
const express = hostRequire('express');
const db = require('./db');
const auth = require('./auth');

const router = express.Router();

// safe(): sync throw or rejected promise -> JSON error, never an unhandled rejection.
function safe(handler) {
  return (req, res) => {
    Promise.resolve()
      .then(() => { const st = db.status(); if (!st.ok) { res.status(503).json({ error: st.error }); return; } return handler(req, res); })
      .catch(e => { if (!res.headersSent) res.status(e.status || 500).json(Object.assign({ error: e.message }, e.current ? { current: e.current } : {})); });
  };
}
function noteId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw db.httpError(400, 'bad note id');
  return id;
}

router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Notes-Dataset');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
router.use(express.json({ limit: '2mb' }));

router.get('/health', (req, res) => {
  let st;
  try { st = db.status(); } catch (e) { st = { ok: false, error: e.message }; }
  res.status(st.ok ? 200 : 503).json({ service: 'nottingham-notes', version: 1, ok: st.ok, error: st.error, dataDir: st.dataDir, counts: st.counts, snapshots: st.snapshots, dev: auth.DEV });
});

router.get('/api/whoami', safe(async (req, res) => {
  const w = await auth.attach(req);
  res.json({ user: w.user, dataset: w.dataset, via: w.via, mismatch: w.mismatch });
}));

router.use('/api', auth.requireUser);

router.get('/api/lists', safe((req, res) => res.json({ lists: db.listLists(req.notes.dataset) })));
router.put('/api/lists/:listId', safe((req, res) => {
  res.json({ list: db.upsertList(req.notes.dataset, Object.assign({}, req.body, { list_id: req.params.listId })) });
}));

router.get('/api/loads/:load/notes', safe((req, res) => {
  res.json(db.notesForLoad(req.notes.dataset, req.params.load, { includeDeleted: req.query.deleted === '1' }));
}));
router.post('/api/loads/:load/notes', safe((req, res) => {
  const r = db.addNote(req.notes.dataset, req.params.load, req.body || {}, auth.actor(req));
  res.status(r.replayed ? 200 : 201).json(r);
}));

router.get('/api/notes', safe((req, res) => res.json(db.searchNotes(req.notes.dataset, req.query))));
router.get('/api/notes/:id', safe((req, res) => res.json({ note: db.getNote(req.notes.dataset, noteId(req)) })));
router.put('/api/notes/:id', safe((req, res) => res.json({ note: db.updateNote(req.notes.dataset, noteId(req), req.body || {}, auth.actor(req)) })));
router.delete('/api/notes/:id', safe((req, res) => res.json({ note: db.setDeleted(req.notes.dataset, noteId(req), 1, auth.actor(req)) })));
router.post('/api/notes/:id/restore', safe((req, res) => res.json({ note: db.setDeleted(req.notes.dataset, noteId(req), 0, auth.actor(req)) })));
router.get('/api/notes/:id/history', safe((req, res) => res.json({ events: db.history(req.notes.dataset, noteId(req)) })));

router.post('/api/snapshots/backfill', safe((req, res) => res.json(db.backfillSnapshots(req.notes.dataset))));

router.post('/api/import', safe((req, res) => res.json(db.importBatch(req.notes.dataset, req.body || {}, 'import:' + auth.actor(req)))));

router.use((req, res) => res.status(404).json({ error: 'not found: ' + req.method + ' ' + req.path }));
// Router-level backstop (#1): anything that escaped safe().
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => { if (!res.headersSent) res.status(err.status || 500).json({ error: err.message }); });

module.exports = router;
