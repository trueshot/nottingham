#!/usr/bin/env node
// readme.js — nottingham gen-0, notes service gen-1 (2026-10-01)
// nottinghamListNotes billet interface

const args = process.argv.slice(2);

const FACETS = {
  '--facet-notes-api': ['(unverified) Notes service API — routes, auth, limits', `
NOTES SERVICE — /notes, mounted inside Reggi (prosser's prostanEntityAPI, Monkey:3005)
Replaces LISTHEAD/LISTTAIL/LISTNOTE DBFs. Owner: nottingham. Status: built + tested, NOT yet mounted.

  GET    /notes/health                         200 {ok, counts} | 503 if data dir missing
  GET    /notes/api/lists                      the dataset's lists (1003 TAGPROB, 1005 2020, ...)
  PUT    /notes/api/lists/:listId              {name, short, descr, color, active}
  GET    /notes/api/loads/:load/notes          notes on one load (the chip strip), max 500
  POST   /notes/api/loads/:load/notes          {list_id, body, item_no?, id_no?, client_key?}
  GET    /notes/api/notes?list_id&q&load_no&since&before_id&limit   newest first, max 200/page
  GET    /notes/api/notes/:id                  one note
  PUT    /notes/api/notes/:id                  {body?, list_id?, expect_updated_at?}  409 if stale
  DELETE /notes/api/notes/:id                  soft delete;  POST /notes/api/notes/:id/restore
  GET    /notes/api/notes/:id/history          create/edit/delete/import events
  POST   /notes/api/import                     legacy batch, max 500 notes (tools/import-dbf.js)

AUTH: oakley edge X-OAuth-* (dataset = X-OAuth-Dataset), else Bearer introspected at
localhost:3007/api/check-auth + X-Notes-Dataset. Edge dataset != asked dataset -> 403.
No tenant secret (George 2026-09-08).

RETRIES: send client_key on POST — a retry after a Reggi restart returns the same note.
BODY: one TEXT field, max 20000 chars (legacy NOTE1..NOTE10 = 2500).`],
  '--facet-notes-storage': ['(unverified) notes.db — where it lives, schema, legacy mapping', `
D:\\clients\\nottingham\\data\\notes.db on Monkey (better-sqlite3 WAL). ONE db, all datasets
(dataset column). Reggi is the ONLY writer. Registered with solitude 2026-10-01.
NOT per-load: the writer must be local to the file and Reggi runs on Monkey.

  lists       (dataset, list_id) PK — list_id = legacy LISTNO
  notes       id AUTOINCREMENT, dataset, load_no, list_id, item_no, id_no, body, deleted,
              source (app|import), client_key, legacy_listno, legacy_idx, created_/updated_ by/at
  note_events note_id, ts, actor, kind, body — full history

Legacy: LISTHEAD->lists; LISTTAIL+LISTNOTE->notes; NEXTIDX->AUTOINCREMENT.
NOTE1..10 join: a field filled to 250 runs on into the next; a short field ends a line.
Import is keyed on (legacy_listno, legacy_idx); never overwrites a note edited in the app.

LEGACY FACTS (willis, measured 2026-10-01): central dbf\\LISTNOTE.DBF = 10.6 MB holding
~122 KB of text — 4220 notes over 3707 loads. Lists 1003 TAGPROB (2523), 1005 "2020" (1679),
1000 (16) and 1001 (2) have no LISTHEAD row. Central IS the source of truth; per-lot
loads\\<d>\\<lot>\\list*.dbf are i_augload copies.`],
  '--facet-reggi-mount': ['(unverified) My tenancy in Reggi — mount line, conditions, deploy', `
Mount (prosser adds, in ProstanEntityAPI.js):
  try { const r = require('D:/clients/nottingham/monkey/reggi-notes.js'); app.use('/notes', r) }
  catch (err) { console.warn('  WARN: /notes not mounted:', err.message) }
Contract: node c:/clients/prosser/readme.js --facet-reggi-mount (all 9 honored; see monkey/reggi-notes.js).
Test: node c:/clients/nottingham/service/test.js   (spawns standalone server, 29 checks)
Dev:  node c:/clients/nottingham/service/server.js -> http://localhost:3520/notes/health
Self-update: deploy via gitgeorg, curl -X POST http://15.30.60.40:3005/restart, then verify /_meta + /notes/health.`]
};

if (args.includes('--help')) {
  console.log('Usage: node readme.js [--json] [--facets] [--facet-<name>] [--help]');
  process.exit(0);
}
if (args.includes('--facets')) {
  console.log('nottingham — Notes Domain Knowledge\n');
  for (const [k, v] of Object.entries(FACETS)) console.log(`  ${k.padEnd(24)} ${v[0]}`);
  process.exit(0);
}
const facet = args.find(a => FACETS[a]);
if (facet) { console.log(FACETS[facet][0] + '\n' + FACETS[facet][1]); process.exit(0); }

if (args.includes('--json')) {
  console.log(JSON.stringify({
    repo: 'nottingham',
    domain: 'Load notes — notes service (/notes in Reggi) replacing listhead/listTail/listnote DBFs',
    holder: 'nottingham',
    billet: 'nottinghamListNotes',
    island: 'core-nottingham',
    tools: ['service/server.js', 'service/test.js', 'tools/import-dbf.js'],
    facets: Object.keys(FACETS),
    status: 'built + tested; awaiting gitgeorg + Reggi mount'
  }, null, 2));
  process.exit(0);
}

console.log(`
# Nottingham — Load Notes

The coloured note chips on a load (TAGPROB, 2020, ...).

## Now (2026-10-01): notes service, replacing the DBFs
  /notes router mounted inside Reggi (Monkey:3005), data D:\\clients\\nottingham\\data\\notes.db
  node readme.js --facet-notes-api       routes + auth
  node readme.js --facet-notes-storage   schema, legacy mapping, measured facts
  node readme.js --facet-reggi-mount     mount line, conditions, deploy

  node service/test.js                   end-to-end test (29 checks)
  node tools/import-dbf.js --help        DBF -> notes service import (dry-run supported)

## Legacy (still live until the switch)
  Central:   <dataset>/dbf/LISTHEAD.DBF, LISTTAIL.DBF, LISTNOTE.DBF   (source of truth)
  Per-lot:   <dataset>/loads/{last digit}/{lot}/list*.dbf             (i_augload copies)
  Join: LISTNO (head<->tail), LISTNO+LISTNOIDX (tail<->note), INVCE_NO = load.

## Key contacts
  prosser   — Reggi host (mount line)      solitude — SQLite registry (info only)
  oakley    — edge routing + identity      eustis   — trues.js (chip strip)
  gitgeorg  — deploys                      palmbeach — PRG code reading the DBFs
`.trim());
