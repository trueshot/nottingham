#!/usr/bin/env node
// readme.js — nottingham gen-0, notes service gen-1 (2026-10-01)
// nottinghamListNotes billet interface

const args = process.argv.slice(2);

const FACETS = {
  '--facet-notes-api': ['(unverified) Notes service API — routes, auth, limits', `
NOTES SERVICE — /notes, mounted inside Reggi (prosser's prostanEntityAPI, Monkey:3005)
Replaces LISTHEAD/LISTTAIL/LISTNOTE DBFs. Owner: nottingham.
STATUS (2026-10-02): LIVE. Mounted by prosser 2026-10-01 (cot 642b598); edge rule by oakley
(8734f96) on willis, willdev, farmwey, wey — NOT ics (ALB Rule 48 bypasses oakley).
Browser URL: https://<dataset>.produceflow.com/notes/api/...  Monitor: http://15.30.60.40:3005/notes/health

  GET    /notes/health                         200 {ok, counts} | 503 if data dir missing
  GET    /notes/api/lists                      the dataset's lists (1003 TAGPROB, 1005 2020, ...)
  PUT    /notes/api/lists/:listId              {name, short, descr, color, active}
  GET    /notes/api/loads/:load/notes          notes on one load (the chip strip), max 500
  POST   /notes/api/loads/:load/notes          {body, client_key?}  -> 201 {note}, 200 replayed; 404 if the load
                                               has no folder on the prey (fails OPEN if the share is unreachable).
                                               NO list (George 2026-10-02): list_id optional, omit it; new notes = null.
  GET    /notes/api/notes?list_id&q&load_no&since&before_id&limit   newest first, max 200/page
  GET    /notes/api/notes/:id                  one note
  PUT    /notes/api/notes/:id                  {body?, list_id?, expect_updated_at?}  409 if stale
  DELETE /notes/api/notes/:id                  soft delete;  POST /notes/api/notes/:id/restore
  GET    /notes/api/notes/:id/history          create/edit/delete/import events
  POST   /notes/api/import                     legacy batch, max 500 notes (tools/import-dbf.js)

AUTH: oakley edge X-OAuth-* (dataset = X-OAuth-Dataset), else Bearer introspected at
localhost:3007/api/check-auth + X-Notes-Dataset. Edge dataset != asked dataset -> 403.
No tenant secret (George 2026-09-08).

Edge: unauthenticated -> 401 JSON (no login redirect). check-auth returns NO dataset, so a
direct Bearer caller names it via X-Notes-Dataset (open gap: any valid token can name any dataset
on the direct :3005 path; the edge path is safe).

RETRIES: send client_key on POST — a retry after a Reggi restart returns the same note.
BODY: one TEXT field, max 20000 chars (legacy NOTE1..NOTE10 = 2500).`],
  '--facet-notes-storage': ['(unverified) notes.db — where it lives, schema, legacy mapping', `
D:\\clients\\nottingham\\data\\notes.db on Monkey (better-sqlite3 WAL). ONE db, all datasets
(dataset column). Reggi is the ONLY writer. Registered with solitude 2026-10-01.
Save path: browser -> oakley edge -> Reggi :3005 -> one transaction (notes row + note_events row)
-> notes.db-wal (fsync before 200) -> checkpointed into notes.db by SQLite.
NOTHING is written to the loads folder or the DBFs. NO BACKUP YET (Monkey D: not in nightly).
NOT per-load: the writer must be local to the file and Reggi runs on Monkey.

  lists       (dataset, list_id) PK — list_id = legacy LISTNO. LEGACY ONLY: new notes have no list.
  notes       id AUTOINCREMENT, dataset, load_no, list_id (NULLable since 2026-10-02), item_no, id_no, body, deleted,
              source (app|import), client_key, legacy_listno, legacy_idx, created_/updated_ by/at
  note_events note_id, ts, actor, kind, body — full history

Legacy: LISTHEAD->lists; LISTTAIL+LISTNOTE->notes; NEXTIDX->AUTOINCREMENT.
NOTE1..10 join: a field filled to 250 runs on into the next; a short field ends a line.
Import is keyed on (legacy_listno, legacy_idx); never overwrites a note edited in the app.
IMPORTED 2026-10-01 (as import:george): WILLIS 4220 notes, WILLDEV 3154. Other datasets: not yet.
notes.jsn per load (loads/<d>/<load>/notes.jsn) written on every change + .sem; backfilled for all
imported loads 2026-10-02. salem search reads it; palmbeach i_ldld splices it into all.jsn as NOTES.
List colours stored in lists.color: 1003 TAGPROB #d32f2f, 1005 2020 #1976d2 (WILLIS, WILLDEV).

LEGACY FACTS (willis, measured 2026-10-01): central dbf\\LISTNOTE.DBF = 10.6 MB holding
~122 KB of text — 4220 notes over 3707 loads. Lists 1003 TAGPROB (2523), 1005 "2020" (1679),
1000 (16) and 1001 (2) have no LISTHEAD row. Central IS the source of truth; per-lot
loads\\<d>\\<lot>\\list*.dbf are i_augload copies.`],
  '--facet-notes-ui': ['(unverified) Load-screen notes strip — what the user sees, where the code lives', `
LIVE on willis (and the willdev tip ring: putnal, ics) since 2026-10-01: willdev 0c5ba0f3,
true1.html trues.js?v=20261002f. Source of truth: c:/clients/nottingham/ui/notes-strip.js, pasted
into willdev/javascripts/trues.js as the block '// --- Load notes: chips + Add / Edit' ...
'// --- end load notes' (it replaced the old chip block). trues.js is eustis's file; this block is mine.

WHAT THE USER SEES (#theListDiv, under the load header):
  chips    '4 notes  [TAGPROB testing add two] [2020 test add] ...'  colour = lists.color
  click    a chip opens inline: full text, 'who, date', and an Edit button
  + Note   (header button in salesgrid.js -> createListNote()) opens a MODAL: textarea only (no list
           picker, George 2026-10-02), Save / Cancel, Ctrl+Enter / Esc. Backdrop click does NOT close.
  chips    legacy notes show their list label; new notes show just the text (grey dot).
  Edit     same modal, prefilled. Stale edit -> 'Changed by X ... Save again to replace it'.
  Delete   in the Edit modal: two clicks (Delete -> 'Click again to delete'), soft delete, audit-logged.
  createnote.prg / listnote.prg popups are RETIRED from this screen (George 2026-10-01).

DATA FLOW: renderNoteList() sees a new _app.theCurrentLoad -> ntgFetch():
  GET /notes/api/loads/<load>/notes + /notes/api/lists (same-origin fetch, session cookie).
  Save -> POST (with client_key) or PUT (with expect_updated_at), then re-fetch.
  /notes unreachable (ics: not routed through oakley) -> chips fall back to the legacy DBF data
  (_app.theCurrentNoteList) read-only; Save shows the error in the modal.
KEY FUNCTIONS: ntgFetch, ntgRefresh, ntgNotesData, renderNoteList, ntgModalOpen, ntgSave, ntgEdit,
  createListNote.   STATE: _app.ntg {load, live, ready, notes, lists}; _app.ntgEdit (open modal).
STILL LOADED, NO LONGER SHOWN WHEN LIVE: _app.i_notes / theCurrentNoteList (DBF data via i_ldld.prg).`],
  '--facet-notes-transition': ['(unverified) DBF -> notes.db switchover: what moved, what still reads the DBFs', `
AS OF 2026-10-02.
MOVED: load-screen chips + add + edit (trues.js) -> /notes. WILLIS + WILLDEV notes imported.
A note added in the modal exists ONLY in notes.db on Monkey: not in the DBFs, not in the loads folder.

STILL READ THE DBFs (will NOT see notes added via the modal until moved):
  i_ldld.prg          builds the per-load JSON (LIST: LISTHEAD/TAIL/NOTE) -> _app.i_notes, all.jsn
  searchResearch.js + nodejs/searchResearch.js   join LISTNOTE into output.fields.notes -> SEARCH (salem)
  i_smkldvw.prg       reads per-load listnote
  rb3prg/list1.prg, thelots.prg, thesrs.prg       reports / search screens
  nodejs/checkload.js expects LISTNOTE/LISTTAIL files per load
STILL WRITE THE DBFs (no longer reachable from the load screen):
  rb3prg/createnote.prg; rb3prg/listnote.prg + fstlist.prg (per-lot edit -> central)
  i_augload.prg       copies central list*.dbf into each load folder

OPEN DECISIONS (George):
  - also write a per-load copy (loads/<d>/<load>/notes.db via detroit's hawk route)? NOT built
  - search: salem reads notes from /notes (or a per-load copy) instead of LISTNOTE
  - backup of Monkey D:/clients/nottingham/data (eaglepass) — NONE yet
  - other datasets: import + edge routing (ics needs an albion/ALB change)
  - retire the PRG readers or point them at the API
Import is re-runnable: node c:/clients/nottingham/tools/import-dbf.js --dataset X --dir <dbf dir>`],
  '--facet-reggi-mount': ['(unverified) My tenancy in Reggi — mount line, conditions, deploy', `
Mount (prosser adds, in ProstanEntityAPI.js):
  try { const r = require('D:/clients/nottingham/monkey/reggi-notes.js'); app.use('/notes', r) }
  catch (err) { console.warn('  WARN: /notes not mounted:', err.message) }
Contract: node c:/clients/prosser/readme.js --facet-reggi-mount (all 9 honored; see monkey/reggi-notes.js).
Test: node c:/clients/nottingham/service/test.js   (spawns standalone server, 29 checks)
Dev:  node c:/clients/nottingham/service/server.js -> http://localhost:3520/notes/health
LIVE since 2026-10-01 12:49 (prosser cot 642b598).
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
    tools: ['service/server.js', 'service/test.js', 'tools/import-dbf.js', 'ui/notes-strip.js'],
    facets: Object.keys(FACETS),
    status: 'LIVE on willis load screen (2026-10-01); DBF readers not yet migrated'
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
